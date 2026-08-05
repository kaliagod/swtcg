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

export async function executeSignalingAction(
    service,
    body,
    { rateLimiter = null, clientKey = "unknown" } = {}
) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        const error = new Error("JSONオブジェクトを送信してください。");
        error.statusCode = 400;
        error.code = "INVALID_REQUEST";
        throw error;
    }
    const action = String(body.action ?? "").toUpperCase();
    const execute = ACTIONS[action];
    if (!execute) {
        const error = new Error("未対応のシグナリング操作です。");
        error.statusCode = 400;
        error.code = "UNKNOWN_ACTION";
        throw error;
    }
    await rateLimiter?.assertAllowed(action, clientKey);
    return execute(service, body);
}

export function createErrorResponse(error) {
    return {
        statusCode: error.statusCode ?? 500,
        body: {
            error: {
                code: error.code ?? "INTERNAL_ERROR",
                message: error.statusCode
                    ? error.message
                    : "シグナリング処理に失敗しました。"
            },
            ...(error.retryAfterSeconds
                ? { retryAfterSeconds: error.retryAfterSeconds }
                : {})
        }
    };
}
