import {
    createHmac,
    randomBytes,
    timingSafeEqual
} from "node:crypto";
import { annotateFailureStage } from "./signalingErrors.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_ID_LENGTH = 10;
const DEFAULT_TTL_SECONDS = 10 * 60;
const MAX_SDP_LENGTH = 64 * 1024;

function createHttpError(statusCode, message, code) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

function createRoomId() {
    const bytes = randomBytes(ROOM_ID_LENGTH);
    return Array.from(bytes, byte =>
        ROOM_ALPHABET[byte % ROOM_ALPHABET.length]
    ).join("");
}

function createToken() {
    try {
        return randomBytes(32).toString("base64url");
    } catch (error) {
        throw annotateFailureStage(error, "token-sign");
    }
}

function hashToken(token, secret) {
    try {
        return createHmac("sha256", secret)
            .update(String(token ?? ""))
            .digest("hex");
    } catch (error) {
        throw annotateFailureStage(error, "token-sign");
    }
}

function equalText(left, right) {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));
    return leftBuffer.length === rightBuffer.length &&
        timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeRoomId(value) {
    const roomId = String(value ?? "").trim().toUpperCase();
    const pattern = new RegExp(
        `^[${ROOM_ALPHABET}]{${ROOM_ID_LENGTH}}$`
    );
    if (!pattern.test(roomId)) {
        throw createHttpError(
            400,
            `ルームIDは${ROOM_ID_LENGTH}文字で入力してください。`,
            "INVALID_ROOM_ID"
        );
    }
    return roomId;
}

function assertSignal(signal, kind) {
    if (
        signal?.version !== 1 ||
        signal.kind !== kind ||
        typeof signal.sessionId !== "string" ||
        signal.sessionId.length > 128 ||
        signal.description?.type !== kind.toLowerCase() ||
        typeof signal.description.sdp !== "string" ||
        signal.description.sdp.length === 0 ||
        signal.description.sdp.length > MAX_SDP_LENGTH
    ) {
        throw createHttpError(
            400,
            `${kind}接続情報の形式が正しくありません。`,
            "INVALID_SIGNAL"
        );
    }
}

export default class RoomSignalingService {
    constructor({
        store,
        secret,
        ttlSeconds = DEFAULT_TTL_SECONDS,
        now = () => Date.now()
    }) {
        if (!store) {
            throw new Error("シグナリングStoreを指定してください。");
        }
        if (typeof secret !== "string" || secret.length < 32) {
            throw new Error(
                "SIGNALING_SECRETは32文字以上で設定してください。"
            );
        }
        this.store = store;
        this.secret = secret;
        this.ttlSeconds = ttlSeconds;
        this.now = now;
    }

    async createRoom(offer) {
        assertSignal(offer, "OFFER");
        const hostToken = createToken();
        const expiresAt = this.now() + this.ttlSeconds * 1000;
        for (let attempt = 0; attempt < 8; attempt++) {
            const roomId = createRoomId();
            const created = await this.store.createRoom(roomId, {
                offer,
                hostTokenHash: hashToken(hostToken, this.secret),
                expiresAt
            }, this.ttlSeconds);
            if (created) {
                return { roomId, hostToken, expiresAt };
            }
        }
        throw createHttpError(
            503,
            "ルームIDを作成できませんでした。しばらく待って再試行してください。",
            "ROOM_ID_EXHAUSTED"
        );
    }

    async joinRoom(roomIdValue) {
        const roomId = normalizeRoomId(roomIdValue);
        const room = await this._getRoom(roomId);
        const guestToken = createToken();
        const remainingSeconds = this._remainingSeconds(room);
        const reservation = await this.store.reserveGuestToken(
            roomId,
            hashToken(guestToken, this.secret),
            remainingSeconds
        );
        if (reservation === "ROOM_MISSING") {
            throw createHttpError(
                404,
                "ルームが見つからないか、有効期限が切れています。",
                "ROOM_NOT_FOUND"
            );
        }
        if (reservation !== "OK") {
            throw createHttpError(
                409,
                "このルームには既に参加処理中のプレイヤーがいます。",
                "ROOM_ALREADY_JOINED"
            );
        }
        return {
            roomId,
            offer: room.offer,
            guestToken,
            expiresAt: room.expiresAt
        };
    }

    async submitAnswer(roomIdValue, guestToken, answer) {
        const roomId = normalizeRoomId(roomIdValue);
        const room = await this._getRoom(roomId);
        assertSignal(answer, "ANSWER");
        if (answer.sessionId !== room.offer.sessionId) {
            throw createHttpError(
                400,
                "募集と応答のセッションが一致しません。",
                "SESSION_MISMATCH"
            );
        }
        const result = await this.store.setAnswerWithGuestToken(
            roomId,
            hashToken(guestToken, this.secret),
            answer,
            this._remainingSeconds(room)
        );
        if (result === "INVALID_TOKEN") {
            throw createHttpError(
                403,
                "参加トークンが正しくありません。",
                "INVALID_GUEST_TOKEN"
            );
        }
        if (result === "TOKEN_MISSING") {
            throw createHttpError(
                409,
                "参加トークンは使用済みか、有効期限が切れています。",
                "GUEST_TOKEN_ALREADY_USED"
            );
        }
        if (result === "ANSWER_EXISTS") {
            throw createHttpError(
                409,
                "このルームには既に応答が登録されています。",
                "ANSWER_ALREADY_EXISTS"
            );
        }
        if (result !== "OK") {
            throw createHttpError(
                503,
                "参加処理を完了できませんでした。再試行してください。",
                "SIGNALING_STORE_ERROR"
            );
        }
        return { roomId, accepted: true };
    }

    async getAnswer(roomIdValue, hostToken) {
        const roomId = normalizeRoomId(roomIdValue);
        const room = await this._getRoom(roomId);
        if (!equalText(
            hashToken(hostToken, this.secret),
            room.hostTokenHash
        )) {
            throw createHttpError(
                403,
                "ホストトークンが正しくありません。",
                "INVALID_HOST_TOKEN"
            );
        }
        const answer = await this.store.getAnswer(roomId);
        if (!answer) {
            return { roomId, status: "PENDING" };
        }
        const consumed = await this.store.consumeAnswer(roomId);
        if (!consumed) {
            throw createHttpError(
                409,
                "この接続情報は既に取得されています。",
                "HOST_TOKEN_ALREADY_USED"
            );
        }
        return { roomId, status: "READY", answer: consumed };
    }

    async closeRoom(roomIdValue, hostToken) {
        const roomId = normalizeRoomId(roomIdValue);
        const room = await this._getRoom(roomId);
        if (!equalText(
            hashToken(hostToken, this.secret),
            room.hostTokenHash
        )) {
            throw createHttpError(
                403,
                "ホストトークンが正しくありません。",
                "INVALID_HOST_TOKEN"
            );
        }
        await this.store.deleteRoom(roomId);
        return { roomId, closed: true };
    }

    async _getRoom(roomId) {
        const room = await this.store.getRoom(roomId);
        if (!room || room.expiresAt <= this.now()) {
            throw createHttpError(
                404,
                "ルームが見つからないか、有効期限が切れています。",
                "ROOM_NOT_FOUND"
            );
        }
        return room;
    }

    _remainingSeconds(room) {
        return Math.max(
            1,
            Math.ceil((room.expiresAt - this.now()) / 1000)
        );
    }
}

export { DEFAULT_TTL_SECONDS, ROOM_ID_LENGTH };
