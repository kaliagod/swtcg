import { annotateFailureStage } from "./signalingErrors.js";

const ACTIONS = Object.freeze({
    CREATE: (service, body) => service.createRoom(body.offer),
    JOIN: (service, body) => service.joinRoom(body.roomId),
    ANSWER: (service, body) => service.submitAnswer(
        body.roomId,
        body.guestToken,
        body.answer
    ),
    STATUS: (service, body) => service.getAnswer(
        body.roomId,
        body.hostToken
    ),
    CLOSE: (service, body) => service.closeRoom(
        body.roomId,
        body.hostToken
    )
});

const ACTION_FAILURE_STAGES = Object.freeze({
    CREATE: "room-save",
    JOIN: "room-load",
    ANSWER: "room-save",
    STATUS: "room-load",
    CLOSE: "room-save"
});

export function getSignalingAction(body) {
    const action = String(body?.action ?? "").toUpperCase();
    return Object.hasOwn(ACTIONS, action) ? action : "UNKNOWN";
}

export async function executeSignalingAction(
    service,
    body,
    { rateLimiter = null, clientKey = "unknown" } = {}
) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        const error = new Error("JSONオブジェクトを送信してください。");
        error.statusCode = 400;
        error.code = "INVALID_REQUEST";
        throw annotateFailureStage(error, "request-validation");
    }
    const action = String(body.action ?? "").toUpperCase();
    const execute = ACTIONS[action];
    if (!execute) {
        const error = new Error("未対応のシグナリング操作です。");
        error.statusCode = 400;
        error.code = "UNKNOWN_ACTION";
        throw annotateFailureStage(error, "action-validation");
    }
    try {
        await rateLimiter?.assertAllowed(action, clientKey);
    } catch (error) {
        throw annotateFailureStage(error, "rate-limit");
    }
    try {
        return await execute(service, body);
    } catch (error) {
        throw annotateFailureStage(
            error,
            ACTION_FAILURE_STAGES[action] ?? "action-execution"
        );
    }
}

export function createErrorResponse(error) {
    const statusCode = error.statusCode ?? 500;
    const isInternal = statusCode >= 500;
    return {
        statusCode: isInternal ? 500 : statusCode,
        body: {
            error: {
                code: isInternal
                    ? "INTERNAL_ERROR"
                    : error.code ?? "INTERNAL_ERROR",
                message: !isInternal
                    ? error.message
                    : "シグナリング処理に失敗しました。"
            },
            ...(error.retryAfterSeconds
                ? { retryAfterSeconds: error.retryAfterSeconds }
                : {})
        }
    };
}
