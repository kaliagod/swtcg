const DEFAULT_ICE_SERVERS = Object.freeze([
    Object.freeze({ urls: "stun:stun.l.google.com:19302" })
]);
const DEFAULT_ICE_TRANSPORT_POLICY = "all";
const ICE_TRANSPORT_POLICIES = new Set(["all", "relay"]);

function parseInteger(value, fallback, min, max) {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max
        ? number
        : fallback;
}

function parseIceTransportPolicy(value) {
    if (value === undefined) {
        return DEFAULT_ICE_TRANSPORT_POLICY;
    }
    if (!ICE_TRANSPORT_POLICIES.has(value)) {
        throw new Error(
            "WEBRTC_ICE_TRANSPORT_POLICYはallまたはrelayを指定してください。"
        );
    }
    return value;
}

function normalizeUrls(value) {
    const urls = Array.isArray(value) ? value : [value];
    if (
        urls.length === 0 ||
        urls.some(url =>
            typeof url !== "string" ||
            !/^(stun|stuns|turn|turns):/i.test(url)
        )
    ) {
        throw new Error("ICEサーバーのURLが正しくありません。");
    }
    return Array.isArray(value) ? urls : urls[0];
}

function parseIceServers(source) {
    if (!source) {
        return DEFAULT_ICE_SERVERS;
    }
    let parsed;
    try {
        parsed = JSON.parse(source);
    } catch {
        throw new Error("WEBRTC_ICE_SERVERS_JSONがJSONではありません。");
    }
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 12) {
        throw new Error("ICEサーバーは1～12件の配列で指定してください。");
    }
    return parsed.map(server => {
        if (!server || typeof server !== "object" || !("urls" in server)) {
            throw new Error("ICEサーバー設定の形式が正しくありません。");
        }
        const normalized = { urls: normalizeUrls(server.urls) };
        for (const field of ["username", "credential"]) {
            if (server[field] !== undefined) {
                if (
                    typeof server[field] !== "string" ||
                    server[field].length > 1024
                ) {
                    throw new Error(`ICEサーバーの${field}が正しくありません。`);
                }
                normalized[field] = server[field];
            }
        }
        return normalized;
    });
}

export function createPublicNetworkConfig(environment = process.env) {
    return {
        iceServers: parseIceServers(environment.WEBRTC_ICE_SERVERS_JSON),
        iceTransportPolicy: parseIceTransportPolicy(
            environment.WEBRTC_ICE_TRANSPORT_POLICY
        ),
        iceGatheringTimeoutMs: parseInteger(
            environment.WEBRTC_ICE_GATHER_TIMEOUT_MS,
            12_000,
            1_000,
            60_000
        ),
        connectionTimeoutMs: parseInteger(
            environment.WEBRTC_CONNECTION_TIMEOUT_MS,
            30_000,
            5_000,
            120_000
        ),
        requestTimeoutMs: parseInteger(
            environment.SIGNALING_REQUEST_TIMEOUT_MS,
            10_000,
            1_000,
            30_000
        )
    };
}

export {
    DEFAULT_ICE_SERVERS,
    DEFAULT_ICE_TRANSPORT_POLICY
};
