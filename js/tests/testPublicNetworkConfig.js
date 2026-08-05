import assert from "node:assert/strict";

import { createPublicNetworkConfig } from
    "../../server/network/createPublicNetworkConfig.js";
import { loadNetworkConfig } from "../network/NetworkConfig.js";

const turnConfig = createPublicNetworkConfig({
    WEBRTC_ICE_SERVERS_JSON: JSON.stringify([
        { urls: "stun:stun.example.test:3478" },
        {
            urls: [
                "turn:turn.example.test:3478?transport=udp",
                "turns:turn.example.test:5349?transport=tcp"
            ],
            username: "user",
            credential: "secret"
        }
    ]),
    WEBRTC_ICE_GATHER_TIMEOUT_MS: "15000",
    WEBRTC_CONNECTION_TIMEOUT_MS: "45000",
    SIGNALING_REQUEST_TIMEOUT_MS: "9000"
});
assert.equal(turnConfig.iceServers.length, 2);
assert.equal(turnConfig.iceServers[1].username, "user");
assert.equal(turnConfig.connectionTimeoutMs, 45_000);

assert.throws(
    () => createPublicNetworkConfig({
        WEBRTC_ICE_SERVERS_JSON: "not-json"
    }),
    /JSON/
);
assert.throws(
    () => createPublicNetworkConfig({
        WEBRTC_ICE_SERVERS_JSON: JSON.stringify([
            { urls: "https://not-an-ice-server.test" }
        ])
    }),
    /URL/
);

const loaded = await loadNetworkConfig({
    fetchImpl: async () => ({
        ok: true,
        async json() {
            return turnConfig;
        }
    })
});
assert.equal(loaded.source, "SERVER");
assert.equal(loaded.warning, "");

const fallback = await loadNetworkConfig({
    fetchImpl: async () => {
        throw new Error("offline");
    }
});
assert.equal(fallback.source, "DEFAULT");
assert.match(fallback.warning, /既定のSTUN設定/);

console.log("Public network config tests: OK");
