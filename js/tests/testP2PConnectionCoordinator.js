import assert from "node:assert/strict";

import P2PConnectionCoordinator from 
    "../network/P2PConnectionCoordinator.js";

const offer = {
    version: 1,
    kind: "OFFER",
    sessionId: "SESSION_TEST",
    description: { type: "offer", sdp: "offer" }
};
const answer = {
    version: 1,
    kind: "ANSWER",
    sessionId: "SESSION_TEST",
    description: { type: "answer", sdp: "answer" }
};
const calls = [];
const peerSession = {
    channel: { readyState: "open" },
    async createOffer() {
        calls.push("peer:createOffer");
        return offer;
    },
    async acceptOffer(receivedOffer) {
        calls.push(["peer:acceptOffer", receivedOffer]);
        return answer;
    },
    async acceptAnswer(receivedAnswer) {
        calls.push(["peer:acceptAnswer", receivedAnswer]);
    },
    send(message) {
        calls.push(["peer:send", message]);
    },
    close() {
        calls.push("peer:close");
    }
};
const signalingProvider = {
    mode: "TEST_ROOM",
    async publishOffer(receivedOffer) {
        calls.push(["signal:publishOffer", receivedOffer]);
        return "ROOM-1234";
    },
    async resolveOffer(reference) {
        calls.push(["signal:resolveOffer", reference]);
        return offer;
    },
    async publishAnswer(receivedAnswer, context) {
        calls.push(["signal:publishAnswer", receivedAnswer, context]);
        return "ANSWER-1234";
    },
    async resolveAnswer(reference) {
        calls.push(["signal:resolveAnswer", reference]);
        return answer;
    },
    close() {
        calls.push("signal:close");
    }
};

const connection = new P2PConnectionCoordinator({
    peerSession,
    signalingProvider
});

assert.equal(connection.signalingMode, "TEST_ROOM");
assert.equal(connection.channel.readyState, "open");
assert.equal(await connection.createInvitation(), "ROOM-1234");
assert.equal(
    await connection.createResponse("ROOM-1234"),
    "ANSWER-1234"
);
await connection.acceptResponse("ANSWER-1234");
connection.send({ type: "PING" });
connection.close();

assert.deepEqual(calls, [
    "peer:createOffer",
    ["signal:publishOffer", offer],
    ["signal:resolveOffer", "ROOM-1234"],
    ["peer:acceptOffer", offer],
    [
        "signal:publishAnswer",
        answer,
        { invitationReference: "ROOM-1234" }
    ],
    ["signal:resolveAnswer", "ANSWER-1234"],
    ["peer:acceptAnswer", answer],
    ["peer:send", { type: "PING" }],
    "signal:close",
    "peer:close"
]);

assert.throws(
    () => new P2PConnectionCoordinator({
        peerSession,
        signalingProvider: {}
    }),
    /実装が不完全/
);

console.log("P2P connection coordinator tests: OK");
