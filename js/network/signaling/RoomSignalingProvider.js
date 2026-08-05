import SignalingProvider from "./SignalingProvider.js";

const DEFAULT_POLL_INTERVAL_MS = 800;
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;

const ERROR_MESSAGES = Object.freeze({
    ROOM_NOT_FOUND: "ルームが見つからないか、有効期限が切れています。",
    ROOM_ALREADY_JOINED: "このルームには既に別の参加者が接続中です。",
    RATE_LIMITED: "操作回数が多すぎます。少し待って再試行してください。",
    SIGNALING_STORE_UNAVAILABLE: "ルームサーバーを利用できません。しばらく待って再試行してください。",
    REQUEST_TIMEOUT: "ルームサーバーへの接続がタイムアウトしました。",
    NETWORK_ERROR: "ルームサーバーへ接続できません。回線またはサーバー状態を確認してください。",
    POLL_TIMEOUT: "参加者からの応答待ちがタイムアウトしました。",
    CONNECTION_CANCELLED: "接続処理をキャンセルしました。"
});

class SignalingError extends Error {
    constructor(message, {
        code = "SIGNALING_ERROR",
        status = 0,
        retryAfterSeconds = null,
        retryable = false,
        cause = null
    } = {}) {
        super(message);
        this.name = "SignalingError";
        this.code = code;
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
        this.retryable = retryable;
        this.cause = cause;
    }
}

function wait(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timeoutId);
            reject(new SignalingError(
                ERROR_MESSAGES.CONNECTION_CANCELLED,
                { code: "CONNECTION_CANCELLED" }
            ));
        };
        const timeoutId = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, milliseconds);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

export default class RoomSignalingProvider extends SignalingProvider {
    constructor({
        endpoint = "/api/signaling",
        fetchImpl = (...args) => fetch(...args),
        pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        requestTimeoutMs = 10_000,
        maxStatusRetries = 2,
        retryDelayMs = 400
    } = {}) {
        super("ROOM");
        this.endpoint = endpoint;
        this.fetchImpl = fetchImpl;
        this.pollIntervalMs = pollIntervalMs;
        this.timeoutMs = timeoutMs;
        this.requestTimeoutMs = requestTimeoutMs;
        this.maxStatusRetries = maxStatusRetries;
        this.retryDelayMs = retryDelayMs;
        this.roomId = null;
        this.hostToken = null;
        this.guestToken = null;
        this.closed = false;
        this.abortController = new AbortController();
        this.requestControllers = new Set();
    }

    async publishOffer(offer) {
        this._assertOpen();
        const result = await this._request({ action: "CREATE", offer });
        this.roomId = result.roomId;
        this.hostToken = result.hostToken;
        return result.roomId;
    }

    async resolveOffer(roomId) {
        this._assertOpen();
        const result = await this._request({
            action: "JOIN",
            roomId: this._normalizeRoomId(roomId)
        });
        this.roomId = result.roomId;
        this.guestToken = result.guestToken;
        return result.offer;
    }

    async publishAnswer(answer, { invitationReference } = {}) {
        this._assertOpen();
        const roomId = this.roomId ?? this._normalizeRoomId(
            invitationReference
        );
        await this._request({
            action: "ANSWER",
            roomId,
            guestToken: this.guestToken,
            answer
        });
        return roomId;
    }

    async resolveAnswer(roomIdValue) {
        this._assertOpen();
        const roomId = this.roomId ?? this._normalizeRoomId(roomIdValue);
        if (!this.hostToken) {
            throw new SignalingError(
                "ホスト用のルーム情報がありません。",
                { code: "HOST_TOKEN_MISSING" }
            );
        }
        const deadline = Date.now() + this.timeoutMs;
        while (!this.closed && Date.now() < deadline) {
            const result = await this._request({
                action: "STATUS",
                roomId,
                hostToken: this.hostToken
            }, { retryable: true });
            if (result.status === "READY") {
                return result.answer;
            }
            await wait(this.pollIntervalMs, this.abortController.signal);
        }
        if (this.closed) {
            throw new SignalingError(
                ERROR_MESSAGES.CONNECTION_CANCELLED,
                { code: "CONNECTION_CANCELLED" }
            );
        }
        throw new SignalingError(ERROR_MESSAGES.POLL_TIMEOUT, {
            code: "POLL_TIMEOUT",
            retryable: true
        });
    }

    cancel() {
        this._finish(true);
    }

    close() {
        const roomId = this.roomId;
        const hostToken = this.hostToken;
        this._finish(false);
        if (!roomId || !hostToken) {
            return;
        }
        this._request({
            action: "CLOSE",
            roomId,
            hostToken
        }, { keepalive: true, allowClosed: true }).catch(() => {});
    }

    _finish(cancelled) {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.abortController.abort();
        for (const controller of this.requestControllers) {
            controller.abort();
        }
        if (cancelled) {
            this.hostToken = null;
            this.guestToken = null;
        }
    }

    async _request(body, {
        keepalive = false,
        retryable = false,
        allowClosed = false
    } = {}) {
        if (!allowClosed) {
            this._assertOpen();
        }
        const attempts = retryable ? this.maxStatusRetries + 1 : 1;
        let lastError;
        for (let attempt = 0; attempt < attempts; attempt++) {
            try {
                return await this._requestOnce(body, { keepalive });
            } catch (error) {
                lastError = error;
                if (
                    attempt + 1 >= attempts ||
                    !error.retryable ||
                    this.closed
                ) {
                    throw error;
                }
                const delay = error.retryAfterSeconds
                    ? error.retryAfterSeconds * 1000
                    : this.retryDelayMs * (attempt + 1);
                await wait(delay, this.abortController.signal);
            }
        }
        throw lastError;
    }

    async _requestOnce(body, { keepalive }) {
        const controller = new AbortController();
        this.requestControllers.add(controller);
        const onCancel = () => controller.abort();
        this.abortController.signal.addEventListener(
            "abort",
            onCancel,
            { once: true }
        );
        const timeoutId = setTimeout(
            () => controller.abort("timeout"),
            this.requestTimeoutMs
        );
        try {
            const response = await this.fetchImpl(this.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                cache: "no-store",
                keepalive,
                signal: controller.signal
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw this._createHttpError(response, payload);
            }
            return payload;
        } catch (error) {
            if (error instanceof SignalingError) {
                throw error;
            }
            if (controller.signal.aborted) {
                const cancelled = this.closed;
                const code = cancelled
                    ? "CONNECTION_CANCELLED"
                    : "REQUEST_TIMEOUT";
                throw new SignalingError(ERROR_MESSAGES[code], {
                    code,
                    retryable: !cancelled,
                    cause: error
                });
            }
            throw new SignalingError(ERROR_MESSAGES.NETWORK_ERROR, {
                code: "NETWORK_ERROR",
                retryable: true,
                cause: error
            });
        } finally {
            clearTimeout(timeoutId);
            this.abortController.signal.removeEventListener(
                "abort",
                onCancel
            );
            this.requestControllers.delete(controller);
        }
    }

    _createHttpError(response, payload) {
        const code = payload.error?.code ?? "SIGNALING_HTTP_ERROR";
        const retryAfterHeader = Number(response.headers?.get?.("Retry-After"));
        const retryAfterSeconds = Number.isFinite(retryAfterHeader)
            ? retryAfterHeader
            : payload.retryAfterSeconds ?? null;
        const status = response.status ?? 0;
        return new SignalingError(
            ERROR_MESSAGES[code] ?? payload.error?.message ??
                `ルームサーバーへの接続に失敗しました (${status})`,
            {
                code,
                status,
                retryAfterSeconds,
                retryable: status === 429 || status >= 500
            }
        );
    }

    _assertOpen() {
        if (this.closed) {
            throw new SignalingError(
                ERROR_MESSAGES.CONNECTION_CANCELLED,
                { code: "CONNECTION_CANCELLED" }
            );
        }
    }

    _normalizeRoomId(value) {
        return String(value ?? "").trim().toUpperCase();
    }
}

export { SignalingError };
