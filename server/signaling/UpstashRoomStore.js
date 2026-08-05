import {
    UpstashRestError,
    extractUpstashErrorType,
    summarizeUpstashPayload
} from "./signalingErrors.js";

export default class UpstashRoomStore {
    constructor({
        url,
        token,
        fetchImpl = (...args) => fetch(...args)
    }) {
        if (!url || !token) {
            throw new Error(
                "Upstash RedisのURLとトークンを設定してください。"
            );
        }
        this.url = url.replace(/\/$/, "");
        this.token = token;
        this.fetchImpl = fetchImpl;
    }

    async createRoom(roomId, room, ttlSeconds) {
        const result = await this._command([
            "SET",
            this._roomKey(roomId),
            JSON.stringify(room),
            "NX",
            "EX",
            ttlSeconds
        ], "room-save");
        return result === "OK";
    }

    async getRoom(roomId) {
        return this._getJson(this._roomKey(roomId), "room-load");
    }

    async setAnswer(roomId, answer, ttlSeconds) {
        const result = await this._command([
            "SET",
            this._answerKey(roomId),
            JSON.stringify(answer),
            "NX",
            "EX",
            ttlSeconds
        ], "room-save");
        return result === "OK";
    }

    async reserveGuestToken(roomId, tokenHash, ttlSeconds) {
        const script = [
            "if redis.call('EXISTS', KEYS[1]) == 0 then return 'ROOM_MISSING' end",
            "if redis.call('EXISTS', KEYS[2]) == 1 then return 'ALREADY_RESERVED' end",
            "if redis.call('EXISTS', KEYS[3]) == 1 then return 'ALREADY_RESERVED' end",
            "redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])",
            "return 'OK'"
        ].join("\n");
        return this._command([
            "EVAL",
            script,
            "3",
            this._roomKey(roomId),
            this._guestTokenKey(roomId),
            this._answerKey(roomId),
            tokenHash,
            String(ttlSeconds)
        ], "room-save");
    }

    async setAnswerWithGuestToken(roomId, tokenHash, answer, ttlSeconds) {
        const script = [
            "local token = redis.call('GET', KEYS[1])",
            "if not token then return 'TOKEN_MISSING' end",
            "if token ~= ARGV[1] then return 'INVALID_TOKEN' end",
            "if redis.call('EXISTS', KEYS[2]) == 1 then return 'ANSWER_EXISTS' end",
            "redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])",
            "redis.call('DEL', KEYS[1])",
            "return 'OK'"
        ].join("\n");
        return this._command([
            "EVAL",
            script,
            "2",
            this._guestTokenKey(roomId),
            this._answerKey(roomId),
            tokenHash,
            JSON.stringify(answer),
            String(ttlSeconds)
        ], "room-save");
    }

    async getAnswer(roomId) {
        return this._getJson(this._answerKey(roomId), "room-load");
    }

    async consumeAnswer(roomId) {
        const script = [
            "local answer = redis.call('GET', KEYS[2])",
            "if not answer then return nil end",
            "redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])",
            "return answer"
        ].join("\n");
        const value = await this._command([
            "EVAL",
            script,
            "3",
            this._roomKey(roomId),
            this._answerKey(roomId),
            this._guestTokenKey(roomId)
        ], "room-save");
        return value === null ? null : JSON.parse(value);
    }

    async incrementRateLimit(key, windowSeconds) {
        const script = [
            "local count = redis.call('INCR', KEYS[1])",
            "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
            "return count"
        ].join("\n");
        return this._command([
            "EVAL",
            script,
            "1",
            this._rateLimitKey(key),
            String(windowSeconds)
        ], "rate-limit");
    }

    async deleteRoom(roomId) {
        await this._command([
            "DEL",
            this._roomKey(roomId),
            this._answerKey(roomId),
            this._guestTokenKey(roomId)
        ], "room-save");
    }

    async _getJson(key, failureStage) {
        const value = await this._command(["GET", key], failureStage);
        return value === null ? null : JSON.parse(value);
    }

    async _command(command, failureStage) {
        let response;
        try {
            response = await this.fetchImpl(this.url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(command)
            });
        } catch (cause) {
            throw this._createUnavailableError({
                cause,
                failureStage,
                errorType: extractUpstashErrorType(cause)
            });
        }
        let payload;
        try {
            payload = await response.json();
        } catch (cause) {
            throw this._createUnavailableError({
                cause,
                failureStage,
                httpStatus: response.status,
                errorType: "INVALID_JSON_RESPONSE",
                responseSummary: {
                    payloadType: "unreadable",
                    hasError: false,
                    hasResult: false,
                    errorFields: []
                }
            });
        }
        if (!response.ok || payload.error) {
            throw this._createUnavailableError({
                failureStage,
                httpStatus: response.status,
                errorType: extractUpstashErrorType(payload.error),
                responseSummary: summarizeUpstashPayload(payload)
            });
        }
        if (!payload || typeof payload !== "object" ||
            !Object.hasOwn(payload, "result")) {
            throw this._createUnavailableError({
                failureStage,
                httpStatus: response.status,
                errorType: "INVALID_RESPONSE_SHAPE",
                responseSummary: summarizeUpstashPayload(payload)
            });
        }
        return payload.result;
    }

    _createUnavailableError(details) {
        return new UpstashRestError(details);
    }

    _roomKey(roomId) {
        return `adventure-tcg:signal:room:${roomId}`;
    }

    _answerKey(roomId) {
        return `adventure-tcg:signal:answer:${roomId}`;
    }

    _guestTokenKey(roomId) {
        return `adventure-tcg:signal:guest-token:${roomId}`;
    }

    _rateLimitKey(key) {
        return `adventure-tcg:signal:rate:${key}`;
    }
}
