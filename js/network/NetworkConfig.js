const DEFAULT_CONFIG = Object.freeze({
    iceServers: Object.freeze([
        Object.freeze({ urls: "stun:stun.l.google.com:19302" })
    ]),
    iceGatheringTimeoutMs: 12_000,
    connectionTimeoutMs: 30_000,
    requestTimeoutMs: 10_000,
    source: "DEFAULT",
    warning: "通信設定APIを利用できないため、既定のSTUN設定を使用しています。"
});

function assertConfig(config) {
    if (
        !Array.isArray(config?.iceServers) ||
        config.iceServers.length === 0 ||
        !Number.isFinite(config.iceGatheringTimeoutMs) ||
        !Number.isFinite(config.connectionTimeoutMs) ||
        !Number.isFinite(config.requestTimeoutMs)
    ) {
        throw new Error("通信設定APIの応答形式が正しくありません。");
    }
}

export async function loadNetworkConfig({
    endpoint = "/api/network-config",
    fetchImpl = (...args) => fetch(...args),
    timeoutMs = 5000
} = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(endpoint, {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(
                payload.error?.message ??
                `通信設定APIに接続できませんでした (${response.status})`
            );
        }
        assertConfig(payload);
        return { ...payload, source: "SERVER", warning: "" };
    } catch (error) {
        return {
            ...DEFAULT_CONFIG,
            warning: error.name === "AbortError"
                ? "通信設定APIがタイムアウトしたため、既定のSTUN設定を使用しています。"
                : `${DEFAULT_CONFIG.warning} (${error.message})`
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

export { DEFAULT_CONFIG };
