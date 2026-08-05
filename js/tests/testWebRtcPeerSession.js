import assert from "node:assert/strict";

import {
    decodeSignal,
    encodeSignal
} from "../network/signaling/ManualSignalingProvider.js";

const signal = {
    version: 1,
    kind: "OFFER",
    sessionId: "SESSION_TEST",
    description: {
        type: "offer",
        sdp: "v=0\r\na=ice-ufrag:テスト\r\n"
    }
};

assert.deepEqual(decodeSignal(encodeSignal(signal)), signal);
assert.throws(
    () => decodeSignal("not-a-connection-code"),
    /接続コードを読み取れません/
);

console.log("Manual signaling provider tests: OK");
