import assert from "node:assert/strict";

import MemoryRoomStore from 
    "../../server/signaling/MemoryRoomStore.js";
import RoomSignalingService from 
    "../../server/signaling/RoomSignalingService.js";
import { executeSignalingAction } from 
    "../../server/signaling/signalingHttp.js";

let now = 1_000_000;
const store = new MemoryRoomStore({ now: () => now });
const service = new RoomSignalingService({
    store,
    secret: "test-signaling-secret-that-is-at-least-32-characters",
    ttlSeconds: 60,
    now: () => now
});
const offer = {
    version: 1,
    kind: "OFFER",
    sessionId: "SESSION_ROOM_TEST",
    description: { type: "offer", sdp: "v=0\r\no=offer" }
};
const answer = {
    version: 1,
    kind: "ANSWER",
    sessionId: "SESSION_ROOM_TEST",
    description: { type: "answer", sdp: "v=0\r\no=answer" }
};

const created = await executeSignalingAction(service, {
    action: "CREATE",
    offer
});
assert.match(created.roomId, /^[A-HJ-NP-Z2-9]{10}$/);
assert.equal(typeof created.hostToken, "string");
assert.equal(created.expiresAt, now + 60_000);

const joined = await executeSignalingAction(service, {
    action: "JOIN",
    roomId: created.roomId.toLowerCase()
});
assert.deepEqual(joined.offer, offer);
assert.equal(joined.roomId, created.roomId);
assert.equal(typeof joined.guestToken, "string");

await assert.rejects(
    service.joinRoom(created.roomId),
    error => error.statusCode === 409 &&
        error.code === "ROOM_ALREADY_JOINED"
);

assert.deepEqual(await executeSignalingAction(service, {
    action: "STATUS",
    roomId: created.roomId,
    hostToken: created.hostToken
}), {
    roomId: created.roomId,
    status: "PENDING"
});

await assert.rejects(
    executeSignalingAction(service, {
        action: "ANSWER",
        roomId: created.roomId,
        guestToken: "invalid",
        answer
    }),
    error => error.statusCode === 403 &&
        error.code === "INVALID_GUEST_TOKEN"
);

assert.deepEqual(await executeSignalingAction(service, {
    action: "ANSWER",
    roomId: created.roomId,
    guestToken: joined.guestToken,
    answer
}), {
    roomId: created.roomId,
    accepted: true
});

await assert.rejects(
    executeSignalingAction(service, {
        action: "ANSWER",
        roomId: created.roomId,
        guestToken: joined.guestToken,
        answer
    }),
    error => error.statusCode === 409 &&
        error.code === "GUEST_TOKEN_ALREADY_USED"
);

const ready = await executeSignalingAction(service, {
    action: "STATUS",
    roomId: created.roomId,
    hostToken: created.hostToken
});
assert.equal(ready.status, "READY");
assert.deepEqual(ready.answer, answer);

await assert.rejects(
    executeSignalingAction(service, {
        action: "STATUS",
        roomId: created.roomId,
        hostToken: created.hostToken
    }),
    error => error.statusCode === 404 &&
        error.code === "ROOM_NOT_FOUND"
);

now += 61_000;
await assert.rejects(
    service.joinRoom(created.roomId),
    error => error.statusCode === 404 &&
        error.code === "ROOM_NOT_FOUND"
);

console.log("Room signaling service tests: OK");
