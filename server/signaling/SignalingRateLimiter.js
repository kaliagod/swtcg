import { createHash } from "node:crypto";

const DEFAULT_LIMITS = Object.freeze({
    CREATE: Object.freeze({ limit: 6, windowSeconds: 60 }),
    JOIN: Object.freeze({ limit: 30, windowSeconds: 60 })
});

function createRateLimitError(windowSeconds) {
    const error = new Error(
        `操作回数が多すぎます。${windowSeconds}秒ほど待って再試行してください。`
    );
    error.statusCode = 429;
    error.code = "RATE_LIMITED";
    error.retryAfterSeconds = windowSeconds;
    return error;
}

export default class SignalingRateLimiter {
    constructor({ store, limits = DEFAULT_LIMITS }) {
        if (!store?.incrementRateLimit) {
            throw new Error(
                "レート制限に対応したシグナリングStoreが必要です。"
            );
        }
        this.store = store;
        this.limits = limits;
    }

    async assertAllowed(action, clientKey = "unknown") {
        const rule = this.limits[action];
        if (!rule) {
            return;
        }
        const hashedClientKey = createHash("sha256")
            .update(String(clientKey || "unknown"))
            .digest("hex");
        const count = await this.store.incrementRateLimit(
            `${action.toLowerCase()}:${hashedClientKey}`,
            rule.windowSeconds
        );
        if (count > rule.limit) {
            throw createRateLimitError(rule.windowSeconds);
        }
    }
}

export { DEFAULT_LIMITS };
