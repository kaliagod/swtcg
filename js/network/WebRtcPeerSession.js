const SIGNAL_VERSION = 1;
const DEFAULT_ICE_SERVERS = Object.freeze([
    { urls: "stun:stun.l.google.com:19302" }
]);

class WebRtcConnectionError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = "WebRtcConnectionError";
        this.code = code;
        this.details = details;
    }
}

function createSessionId() {
    return crypto.randomUUID?.() ??
        `P2P_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function waitForIceGathering(peerConnection, timeoutMs, signal) {
    if (peerConnection.iceGatheringState === "complete") {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const finish = (error = null) => {
            clearTimeout(timeoutId);
            peerConnection.removeEventListener(
                "icegatheringstatechange",
                onChange
            );
            signal?.removeEventListener("abort", onAbort);
            error ? reject(error) : resolve();
        };
        const onChange = () => {
            if (peerConnection.iceGatheringState === "complete") {
                finish();
            }
        };
        const onAbort = () => finish(new WebRtcConnectionError(
            "接続処理をキャンセルしました。",
            "CONNECTION_CANCELLED"
        ));
        const timeoutId = setTimeout(() => finish(
            new WebRtcConnectionError(
                "接続候補の収集がタイムアウトしました。TURN/STUN設定を確認してください。",
                "ICE_GATHERING_TIMEOUT"
            )
        ), timeoutMs);
        peerConnection.addEventListener(
            "icegatheringstatechange",
            onChange
        );
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

export default class WebRtcPeerSession {
    constructor({
        role,
        onMessage = () => {},
        onStatus = () => {},
        onDiagnostic = () => {},
        iceServers = DEFAULT_ICE_SERVERS,
        iceTransportPolicy = "all",
        iceGatheringTimeoutMs = 12_000,
        connectionTimeoutMs = 30_000
    }) {
        if (!["HOST", "GUEST"].includes(role)) {
            throw new Error("P2Pの役割はHOSTまたはGUESTです。");
        }
        this.role = role;
        this.onMessage = onMessage;
        this.onStatus = onStatus;
        this.onDiagnostic = onDiagnostic;
        this.iceGatheringTimeoutMs = iceGatheringTimeoutMs;
        this.connectionTimeoutMs = connectionTimeoutMs;
        this.sessionId = role === "HOST" ? createSessionId() : null;
        this.peerConnection = new RTCPeerConnection({
            iceServers,
            iceTransportPolicy
        });
        this.channel = null;
        this.closed = false;
        this.abortController = new AbortController();
        this.connectionWaiters = new Set();
        this._bindPeerConnection();
        if (role === "HOST") {
            this._bindChannel(
                this.peerConnection.createDataChannel("adventure-tcg", {
                    ordered: true
                })
            );
        } else {
            this.peerConnection.addEventListener("datachannel", event => {
                this._bindChannel(event.channel);
            });
        }
    }

    async createOffer() {
        this._assertOpen();
        if (this.role !== "HOST") {
            throw new Error("ホストだけが接続募集を作成できます。");
        }
        await this.peerConnection.setLocalDescription(
            await this.peerConnection.createOffer()
        );
        await this._waitForIceGathering();
        return {
            version: SIGNAL_VERSION,
            kind: "OFFER",
            sessionId: this.sessionId,
            description: this.peerConnection.localDescription
        };
    }

    async acceptOffer(signal) {
        this._assertOpen();
        if (this.role !== "GUEST") {
            throw new Error("参加者だけが接続募集を受け取れます。");
        }
        this._assertSignal(signal, "OFFER");
        this.sessionId = signal.sessionId;
        await this.peerConnection.setRemoteDescription(signal.description);
        await this.peerConnection.setLocalDescription(
            await this.peerConnection.createAnswer()
        );
        await this._waitForIceGathering();
        return {
            version: SIGNAL_VERSION,
            kind: "ANSWER",
            sessionId: this.sessionId,
            description: this.peerConnection.localDescription
        };
    }

    async acceptAnswer(signal) {
        this._assertOpen();
        if (this.role !== "HOST") {
            throw new Error("ホストだけが接続応答を受け取れます。");
        }
        this._assertSignal(signal, "ANSWER");
        if (signal.sessionId !== this.sessionId) {
            throw new WebRtcConnectionError(
                "別の対戦募集から作成された参加情報です。",
                "SESSION_MISMATCH"
            );
        }
        await this.peerConnection.setRemoteDescription(signal.description);
        this.onStatus("CONNECTING");
    }

    waitForConnection({ timeoutMs = this.connectionTimeoutMs } = {}) {
        if (this.channel?.readyState === "open") {
            return Promise.resolve();
        }
        this._assertOpen();
        return new Promise((resolve, reject) => {
            const waiter = {
                resolve: () => {
                    clearTimeout(waiter.timeoutId);
                    this.connectionWaiters.delete(waiter);
                    resolve();
                },
                reject: error => {
                    clearTimeout(waiter.timeoutId);
                    this.connectionWaiters.delete(waiter);
                    reject(error);
                },
                timeoutId: null
            };
            waiter.timeoutId = setTimeout(() => waiter.reject(
                new WebRtcConnectionError(
                    "対戦相手との接続がタイムアウトしました。TURN設定や回線を確認してください。",
                    "CONNECTION_TIMEOUT"
                )
            ), timeoutMs);
            this.connectionWaiters.add(waiter);
        });
    }

    send(message) {
        if (this.channel?.readyState !== "open") {
            throw new WebRtcConnectionError(
                "対戦相手との通信が接続されていません。",
                "CHANNEL_NOT_OPEN"
            );
        }
        this.channel.send(JSON.stringify({
            protocolVersion: 1,
            sessionId: this.sessionId,
            ...message
        }));
    }

    cancel() {
        this._close("CANCELLED");
    }

    close() {
        this._close("CLOSED");
    }

    _close(status) {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.abortController.abort();
        this._rejectConnectionWaiters(new WebRtcConnectionError(
            status === "CANCELLED"
                ? "接続処理をキャンセルしました。"
                : "P2P接続を終了しました。",
            status === "CANCELLED"
                ? "CONNECTION_CANCELLED"
                : "CONNECTION_CLOSED"
        ));
        this.channel?.close();
        this.peerConnection.close();
        this.onStatus(status);
    }

    _assertOpen() {
        if (this.closed) {
            throw new WebRtcConnectionError(
                "この接続処理は既に終了しています。",
                "CONNECTION_CLOSED"
            );
        }
    }

    _assertSignal(signal, expectedKind) {
        if (
            signal?.version !== SIGNAL_VERSION ||
            signal.kind !== expectedKind ||
            typeof signal.sessionId !== "string" ||
            !signal.description
        ) {
            throw new WebRtcConnectionError(
                "接続情報の形式または種類が正しくありません。",
                "INVALID_SIGNAL"
            );
        }
    }

    async _waitForIceGathering() {
        try {
            await waitForIceGathering(
                this.peerConnection,
                this.iceGatheringTimeoutMs,
                this.abortController.signal
            );
        } catch (error) {
            if (error.code !== "ICE_GATHERING_TIMEOUT") {
                throw error;
            }
            // 収集済み候補で接続を続行し、最終的な成否は接続待ちで判定する。
            this.onDiagnostic(error);
        }
    }

    _bindPeerConnection() {
        this.peerConnection.addEventListener(
            "connectionstatechange",
            () => {
                const state = this.peerConnection.connectionState;
                if (state === "connected") {
                    this.onStatus("CONNECTED");
                } else if (state === "disconnected") {
                    this.onStatus("DISCONNECTED");
                } else if (state === "failed") {
                    const error = new WebRtcConnectionError(
                        "WebRTC接続に失敗しました。TURN設定やファイアウォールを確認してください。",
                        "CONNECTION_FAILED"
                    );
                    this._rejectConnectionWaiters(error);
                    this.onDiagnostic(error);
                    this.onStatus("ERROR");
                } else if (state === "closed" && !this.closed) {
                    this.onStatus("CLOSED");
                }
            }
        );
        this.peerConnection.addEventListener(
            "iceconnectionstatechange",
            () => {
                const state = this.peerConnection.iceConnectionState;
                if (state === "checking") {
                    this.onStatus("ICE_CHECKING");
                } else if (state === "failed") {
                    const error = new WebRtcConnectionError(
                        "利用可能な通信経路を確立できませんでした。TURNサーバー設定を確認してください。",
                        "ICE_FAILED"
                    );
                    this._rejectConnectionWaiters(error);
                    this.onDiagnostic(error);
                    this.onStatus("ERROR");
                }
            }
        );
        this.peerConnection.addEventListener("icecandidateerror", event => {
            this.onDiagnostic(new WebRtcConnectionError(
                "ICEサーバーへの問い合わせに失敗しました。",
                "ICE_CANDIDATE_ERROR",
                {
                    url: event.url ?? "",
                    errorCode: event.errorCode ?? null,
                    errorText: event.errorText ?? ""
                }
            ));
        });
    }

    _bindChannel(channel) {
        this.channel = channel;
        channel.addEventListener("open", () => {
            for (const waiter of [...this.connectionWaiters]) {
                waiter.resolve();
            }
            this.onStatus("CHANNEL_OPEN");
        });
        channel.addEventListener("close", () => {
            if (!this.closed) {
                this.onStatus("DISCONNECTED");
            }
        });
        channel.addEventListener("error", () => {
            const error = new WebRtcConnectionError(
                "データ通信チャネルでエラーが発生しました。",
                "DATA_CHANNEL_ERROR"
            );
            this._rejectConnectionWaiters(error);
            this.onDiagnostic(error);
            this.onStatus("ERROR");
        });
        channel.addEventListener("message", event => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch {
                this.onStatus("INVALID_MESSAGE");
                return;
            }
            if (
                message?.protocolVersion !== 1 ||
                message.sessionId !== this.sessionId
            ) {
                this.onStatus("INVALID_MESSAGE");
                return;
            }
            this.onMessage(message);
        });
    }

    _rejectConnectionWaiters(error) {
        for (const waiter of [...this.connectionWaiters]) {
            waiter.reject(error);
        }
    }
}

export {
    DEFAULT_ICE_SERVERS,
    SIGNAL_VERSION,
    WebRtcConnectionError
};
