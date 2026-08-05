import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { convertCardWorkbook } from "./server/cardWorkbookConverter.js";
import { createPublicNetworkConfig } from
    "./server/network/createPublicNetworkConfig.js";
import MemoryRoomStore from "./server/signaling/MemoryRoomStore.js";
import RoomSignalingService from "./server/signaling/RoomSignalingService.js";
import SignalingRateLimiter from "./server/signaling/SignalingRateLimiter.js";
import {
    createErrorResponse,
    executeSignalingAction
} from "./server/signaling/signalingHttp.js";

const root = path.dirname(
    fileURLToPath(import.meta.url)
);

const port = Number(
    process.env.PORT ?? 8080
);

const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SIGNALING_BYTES = 128 * 1024;
const signalingStore = new MemoryRoomStore();
const signalingService = new RoomSignalingService({
    store: signalingStore,
    secret: process.env.SIGNALING_SECRET ?? randomBytes(32).toString("hex")
});
const signalingRateLimiter = new SignalingRateLimiter({
    store: signalingStore
});

function getSignalingCorsHeaders(request) {
    const origin = request.headers.origin;
    const allowedOrigins = String(
        process.env.SIGNALING_ALLOWED_ORIGINS ?? ""
    ).split(",").map(value => value.trim()).filter(Boolean);
    return origin && allowedOrigins.includes(origin)
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            Vary: "Origin"
        }
        : {};
}

async function readRequestBody(request, maxBytes = MAX_UPLOAD_BYTES) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBytes) {
            const error = new Error("リクエストが大きすぎます。");
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

const server = http.createServer(
    async (request, response) => {

        try {
            const url = new URL(
                request.url,
                `http://${request.headers.host}`
            );

            if (request.method === "OPTIONS" && url.pathname === "/api/signaling") {
                response.writeHead(204, getSignalingCorsHeaders(request));
                response.end();
                return;
            }

            if (request.method === "GET" && url.pathname === "/api/network-config") {
                const config = createPublicNetworkConfig();
                response.writeHead(200, {
                    "Content-Type": "application/json; charset=utf-8",
                    "Cache-Control": "no-store"
                });
                response.end(JSON.stringify(config));
                return;
            }

            if (request.method === "POST" && url.pathname === "/api/card-tool/convert") {
                const body = await readRequestBody(request);
                const result = await convertCardWorkbook(
                    body,
                    request.headers["x-file-name"] ?? "workbook.xlsx"
                );
                response.writeHead(200, {
                    "Content-Type": "application/json; charset=utf-8",
                    "Cache-Control": "no-store"
                });
                response.end(JSON.stringify(result));
                return;
            }

            if (request.method === "POST" && url.pathname === "/api/signaling") {
                try {
                    const source = await readRequestBody(
                        request,
                        MAX_SIGNALING_BYTES
                    );
                    const result = await executeSignalingAction(
                        signalingService,
                        JSON.parse(source.toString("utf8") || "{}"),
                        {
                            rateLimiter: signalingRateLimiter,
                            clientKey: request.socket.remoteAddress ?? "unknown"
                        }
                    );
                    response.writeHead(200, {
                        "Content-Type": "application/json; charset=utf-8",
                        "Cache-Control": "no-store",
                        ...getSignalingCorsHeaders(request)
                    });
                    response.end(JSON.stringify(result));
                } catch (error) {
                    if (error instanceof SyntaxError) {
                        error.statusCode = 400;
                        error.code = "INVALID_JSON";
                        error.message = "JSONを読み取れませんでした。";
                    }
                    const failure = createErrorResponse(error);
                    const retryHeaders = failure.body.retryAfterSeconds
                        ? {
                            "Retry-After": String(
                                failure.body.retryAfterSeconds
                            )
                        }
                        : {};
                    response.writeHead(failure.statusCode, {
                        "Content-Type": "application/json; charset=utf-8",
                        "Cache-Control": "no-store",
                        ...retryHeaders,
                        ...getSignalingCorsHeaders(request)
                    });
                    response.end(JSON.stringify(failure.body));
                }
                return;
            }

            if (request.method !== "GET" && request.method !== "HEAD") {
                response.writeHead(405, { Allow: "GET, HEAD, POST" });
                response.end("Method Not Allowed");
                return;
            }

            const requestedPath =
                url.pathname === "/"
                    ? "/index.html"
                    : url.pathname;

            const filePath = path.resolve(
                root,
                `.${decodeURIComponent(requestedPath)}`
            );

            if (
                filePath !== root &&
                !filePath.startsWith(`${root}${path.sep}`)
            ) {
                response.writeHead(403);
                response.end("Forbidden");
                return;
            }

            const content = await readFile(filePath);

            response.writeHead(200, {
                "Content-Type":
                    mimeTypes[path.extname(filePath)] ??
                    "application/octet-stream",
                "Cache-Control": "no-store"
            });

            response.end(content);

        } catch (error) {
            response.writeHead(
                error.statusCode ?? (error.code === "ENOENT" ? 404 : 500),
                { "Content-Type": "application/json; charset=utf-8" }
            );
            response.end(JSON.stringify({
                error: error.code === "ENOENT"
                    ? "Not Found"
                    : error.message || "Internal Server Error"
            }));
        }

    }
);

server.listen(port, "127.0.0.1", () => {
    console.log(
        `Adventure TCG test table: http://127.0.0.1:${port}`
    );
});
