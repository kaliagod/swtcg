import assert from "node:assert/strict";

import UpstashRoomStore from
    "../../server/signaling/UpstashRoomStore.js";

const commands = [];
const results = [
    "OK",
    JSON.stringify({ offer: "OFFER" }),
    "OK",
    "OK",
    JSON.stringify({ answer: "ANSWER" }),
    2,
    3
];
const store = new UpstashRoomStore({
    url: "https://redis.example.test/",
    token: "TEST_TOKEN",
    fetchImpl: async (url, options) => {
        assert.equal(url, "https://redis.example.test");
        assert.equal(options.headers.Authorization, "Bearer TEST_TOKEN");
        commands.push(JSON.parse(options.body));
        return {
            ok: true,
            async json() {
                return { result: results.shift() };
            }
        };
    }
});

const roomId = "ABCD234567";
assert.equal(await store.createRoom(roomId, { offer: "OFFER" }, 600), true);
assert.deepEqual(await store.getRoom(roomId), { offer: "OFFER" });
assert.equal(await store.reserveGuestToken(roomId, "TOKEN_HASH", 500), "OK");
assert.equal(await store.setAnswerWithGuestToken(
    roomId,
    "TOKEN_HASH",
    { answer: "ANSWER" },
    500
), "OK");
assert.deepEqual(await store.consumeAnswer(roomId), { answer: "ANSWER" });
assert.equal(await store.incrementRateLimit("create:client", 60), 2);
await store.deleteRoom(roomId);

assert.deepEqual(commands[0], [
    "SET",
    `adventure-tcg:signal:room:${roomId}`,
    JSON.stringify({ offer: "OFFER" }),
    "NX",
    "EX",
    600
]);
assert.deepEqual(commands[1], [
    "GET",
    `adventure-tcg:signal:room:${roomId}`
]);
assert.equal(commands[2][0], "EVAL");
assert.equal(commands[2][2], "3");
assert.deepEqual(commands[2].slice(3), [
    `adventure-tcg:signal:room:${roomId}`,
    `adventure-tcg:signal:guest-token:${roomId}`,
    `adventure-tcg:signal:answer:${roomId}`,
    "TOKEN_HASH",
    "500"
]);
assert.equal(commands[3][0], "EVAL");
assert.equal(commands[3][2], "2");
assert.deepEqual(commands[3].slice(3), [
    `adventure-tcg:signal:guest-token:${roomId}`,
    `adventure-tcg:signal:answer:${roomId}`,
    "TOKEN_HASH",
    JSON.stringify({ answer: "ANSWER" }),
    "500"
]);
assert.equal(commands[4][0], "EVAL");
assert.equal(commands[4][2], "3");
assert.equal(commands[5][0], "EVAL");
assert.equal(
    commands[5][3],
    "adventure-tcg:signal:rate:create:client"
);
assert.deepEqual(commands[6], [
    "DEL",
    `adventure-tcg:signal:room:${roomId}`,
    `adventure-tcg:signal:answer:${roomId}`,
    `adventure-tcg:signal:guest-token:${roomId}`
]);

console.log("Upstash room store tests: OK");
