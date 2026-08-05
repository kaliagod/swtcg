import RoomSignalingService from
    "../server/signaling/RoomSignalingService.js";
import SignalingRateLimiter from
    "../server/signaling/SignalingRateLimiter.js";
import UpstashRoomStore from
    "../server/signaling/UpstashRoomStore.js";
import resolveUpstashConnection from
    "../server/signaling/resolveUpstashConnection.js";
import {
    createErrorResponse,
    executeSignalingAction,
    getSignalingAction
} from "../server/signaling/signalingHttp.js";
import {
    annotateFailureStage,
    logSignalingFailure
} from "../server/signaling/signalingErrors.js";

const MAX_BODY_BYTES = 128 * 1024;
let runtime = null;

const SENSITIVE_ENVIRONMENT_NAME =
    /(TOKEN|SECRET|CREDENTIAL|PASSWORD|AUTHORIZATION)/i;

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
    try {
        const connection = resolveUpstashConnection(process.env);
        if (!connection.url || !connection.token) {
            const error = new Error(
                "Upstash REST API environment variables are incomplete"
            );
            error.name = "SignalingConfigurationError";
            error.code = "UPSTASH_ENVIRONMENT_MISSING";
            throw error;
        }
        if (typeof process.env.SIGNALING_SECRET !== "string" ||
            process.env.SIGNALING_SECRET.length < 32) {
            const error = new Error(
                "SIGNALING_SECRET must contain at least 32 characters"
            );
            error.name = "SignalingConfigurationError";
            error.code = "SIGNALING_SECRET_INVALID";
            throw error;
        }
        const store = new UpstashRoomStore(connection);
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
                        limit: getPositiveInteger(
                            "SIGNALING_CREATE_LIMIT",
                            6
                        ),
                        windowSeconds: getPositiveInteger(
                            "SIGNALING_CREATE_WINDOW_SECONDS",
                            60
                        )
                    },
                    JOIN: {
                        limit: getPositiveInteger(
                            "SIGNALING_JOIN_LIMIT",
                            30
                        ),
                        windowSeconds: getPositiveInteger(
                            "SIGNALING_JOIN_WINDOW_SECONDS",
                            60
                        )
                    }
                }
            })
        };
        return runtime;
    } catch (error) {
        throw annotateFailureStage(error, "environment-validation");
    }
}

function getSensitiveLogValues(body) {
    const environmentValues = Object.entries(process.env)
        .filter(([name]) => SENSITIVE_ENVIRONMENT_NAME.test(name))
        .map(([, value]) => value);
    return [
        ...environmentValues,
        body?.hostToken,
        body?.guestToken,
        body?.sessionToken
    ].filter(value => typeof value === "string" && value.length >= 4);
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
    let body = null;
    let action = "UNKNOWN";
    let failureStage = "request-parse";
    let result;
    try {
        body = await readBody(request);
        action = getSignalingAction(body);
        failureStage = "environment-validation";
        const { service, rateLimiter } = getRuntime();
        failureStage = "action-execution";
        result = await executeSignalingAction(
            service,
            body,
            { rateLimiter, clientKey: getClientKey(request) }
        );
    } catch (error) {
        if (error instanceof SyntaxError) {
            error.statusCode = 400;
            error.code = "INVALID_JSON";
            error.message = "JSONを読み取れませんでした。";
        }
        const failureError = annotateFailureStage(error, failureStage);
        logSignalingFailure(failureError, {
            action,
            failureStage,
            sensitiveValues: getSensitiveLogValues(body)
        });
        const failure = createErrorResponse(failureError);
        if (failure.body.retryAfterSeconds) {
            response.setHeader(
                "Retry-After",
                String(failure.body.retryAfterSeconds)
            );
        }
        try {
            response.status(failure.statusCode).json(failure.body);
        } catch (responseError) {
            const responseFailure = annotateFailureStage(
                responseError,
                "response-build"
            );
            logSignalingFailure(responseFailure, {
                action,
                failureStage: "response-build",
                sensitiveValues: getSensitiveLogValues(body)
            });
            throw responseFailure;
        }
        return;
    }
    try {
        response.status(200).json(result);
    } catch (error) {
        const failureError = annotateFailureStage(error, "response-build");
        logSignalingFailure(failureError, {
            action,
            failureStage: "response-build",
            sensitiveValues: getSensitiveLogValues(body)
        });
        throw failureError;
    }
}
