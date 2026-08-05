import RoomSignalingService from
    "../server/signaling/RoomSignalingService.js";
import SignalingRateLimiter from
    "../server/signaling/SignalingRateLimiter.js";
import UpstashRoomStore from
    "../server/signaling/UpstashRoomStore.js";
import {
    createErrorResponse,
    executeSignalingAction
} from "../server/signaling/signalingHttp.js";

const MAX_BODY_BYTES = 128 * 1024;
let runtime = null;

function applyCors(request, response) {
    const origin = request.headers.origin;
    const allowedOrigins = String(
        process.env.SIGNALING_ALLOWED_ORIGINS ?? ""
    ).split(",").map(value => value.trim()).filter(Boolean);
    if (origin && allowedOrigins.includes(origin)) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.setHeader("Vary", "Origin");
    }
}

function getPositiveInteger(name, fallback, { min = 1, max = 3600 } = {}) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= min && value <= max
        ? value
        : fallback;
}

function getRuntime() {
    if (runtime) {
        return runtime;
    }
    const store = new UpstashRoomStore({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
    runtime = {
        service: new RoomSignalingService({
            store,
            secret: process.env.SIGNALING_SECRET,
            ttlSeconds: getPositiveInteger(
                "SIGNALING_ROOM_TTL_SECONDS",
                600,
                { min: 60, max: 3600 }
            )
        }),
        rateLimiter: new SignalingRateLimiter({
            store,
            limits: {
                CREATE: {
                    limit: getPositiveInteger("SIGNALING_CREATE_LIMIT", 6),
                    windowSeconds: getPositiveInteger(
                        "SIGNALING_CREATE_WINDOW_SECONDS",
                        60
                    )
                },
                JOIN: {
                    limit: getPositiveInteger("SIGNALING_JOIN_LIMIT", 30),
                    windowSeconds: getPositiveInteger(
                        "SIGNALING_JOIN_WINDOW_SECONDS",
                        60
                    )
                }
            }
        })
    };
    return runtime;
}

function getClientKey(request) {
    const forwarded = request.headers["x-vercel-forwarded-for"] ??
        request.headers["x-forwarded-for"];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return String(first ?? request.socket?.remoteAddress ?? "unknown")
        .split(",")[0]
        .trim();
}

async function readBody(request) {
    if (
        request.body &&
        typeof request.body === "object" &&
        !Buffer.isBuffer(request.body)
    ) {
        return request.body;
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
        length += chunk.length;
        if (length > MAX_BODY_BYTES) {
            const error = new Error("リクエストが大きすぎます。");
            error.statusCode = 413;
            error.code = "REQUEST_TOO_LARGE";
            throw error;
        }
        chunks.push(chunk);
    }
    const source = Buffer.concat(chunks).toString("utf8");
    return source ? JSON.parse(source) : {};
}

export default async function handler(request, response) {
    applyCors(request, response);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (request.method === "OPTIONS") {
        response.status(204).end();
        return;
    }
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        response.status(405).json({
            error: {
                code: "METHOD_NOT_ALLOWED",
                message: "POSTメソッドを使用してください。"
            }
        });
        return;
    }
    try {
        const { service, rateLimiter } = getRuntime();
        const result = await executeSignalingAction(
            service,
            await readBody(request),
            { rateLimiter, clientKey: getClientKey(request) }
        );
        response.status(200).json(result);
    } catch (error) {
        if (error instanceof SyntaxError) {
            error.statusCode = 400;
            error.code = "INVALID_JSON";
            error.message = "JSONを読み取れませんでした。";
        }
        const failure = createErrorResponse(error);
        if (failure.body.retryAfterSeconds) {
            response.setHeader(
                "Retry-After",
                String(failure.body.retryAfterSeconds)
            );
        }
        response.status(failure.statusCode).json(failure.body);
    }
}
