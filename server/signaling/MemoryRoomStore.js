export default class MemoryRoomStore {
    constructor({ now = () => Date.now() } = {}) {
        this.now = now;
        this.rooms = new Map();
        this.answers = new Map();
        this.guestTokens = new Map();
        this.rateLimits = new Map();
    }

    async createRoom(roomId, room, ttlSeconds) {
        this._removeExpired(roomId);
        if (this.rooms.has(roomId)) {
            return false;
        }
        this.rooms.set(roomId, {
            value: room,
            expiresAt: this.now() + ttlSeconds * 1000
        });
        return true;
    }

    async getRoom(roomId) {
        this._removeExpired(roomId);
        return this.rooms.get(roomId)?.value ?? null;
    }

    async setAnswer(roomId, answer, ttlSeconds) {
        this._removeExpired(roomId);
        if (!this.rooms.has(roomId) || this.answers.has(roomId)) {
            return false;
        }
        this.answers.set(roomId, {
            value: answer,
            expiresAt: this.now() + ttlSeconds * 1000
        });
        return true;
    }

    async reserveGuestToken(roomId, tokenHash, ttlSeconds) {
        this._removeExpired(roomId);
        if (
            !this.rooms.has(roomId)
        ) {
            return "ROOM_MISSING";
        }
        if (this.answers.has(roomId) || this.guestTokens.has(roomId)) {
            return "ALREADY_RESERVED";
        }
        this.guestTokens.set(roomId, {
            value: tokenHash,
            expiresAt: this.now() + ttlSeconds * 1000
        });
        return "OK";
    }

    async setAnswerWithGuestToken(
        roomId,
        tokenHash,
        answer,
        ttlSeconds
    ) {
        this._removeExpired(roomId);
        const reserved = this.guestTokens.get(roomId)?.value ?? null;
        if (reserved === null) {
            return "TOKEN_MISSING";
        }
        if (reserved !== tokenHash) {
            return "INVALID_TOKEN";
        }
        if (this.answers.has(roomId)) {
            return "ANSWER_EXISTS";
        }
        this.answers.set(roomId, {
            value: answer,
            expiresAt: this.now() + ttlSeconds * 1000
        });
        this.guestTokens.delete(roomId);
        return "OK";
    }

    async getAnswer(roomId) {
        this._removeExpired(roomId);
        return this.answers.get(roomId)?.value ?? null;
    }

    async consumeAnswer(roomId) {
        this._removeExpired(roomId);
        const answer = this.answers.get(roomId)?.value ?? null;
        if (answer === null) {
            return null;
        }
        await this.deleteRoom(roomId);
        return answer;
    }

    async incrementRateLimit(key, windowSeconds) {
        const existing = this.rateLimits.get(key);
        if (!existing || existing.expiresAt <= this.now()) {
            this.rateLimits.set(key, {
                count: 1,
                expiresAt: this.now() + windowSeconds * 1000
            });
            return 1;
        }
        existing.count++;
        return existing.count;
    }

    async deleteRoom(roomId) {
        this.rooms.delete(roomId);
        this.answers.delete(roomId);
        this.guestTokens.delete(roomId);
    }

    _removeExpired(roomId) {
        const now = this.now();
        if ((this.rooms.get(roomId)?.expiresAt ?? Infinity) <= now) {
            this.rooms.delete(roomId);
            this.answers.delete(roomId);
            this.guestTokens.delete(roomId);
            return;
        }
        if ((this.answers.get(roomId)?.expiresAt ?? Infinity) <= now) {
            this.answers.delete(roomId);
        }
        if ((this.guestTokens.get(roomId)?.expiresAt ?? Infinity) <= now) {
            this.guestTokens.delete(roomId);
        }
    }
}
