import assert from "node:assert/strict";

import UpstashRoomStore from
    "../../server/signaling/UpstashRoomStore.js";
import { UpstashRestError } from
    "../../server/signaling/signalingErrors.js";

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

const networkFailureStore = new UpstashRoomStore({
    url: "https://redis.example.test",
    token: "DO_NOT_LOG_NETWORK_TOKEN",
    fetchImpl: async () => {
        throw new TypeError("fetch failed");
    }
});
await assert.rejects(
    networkFailureStore.getRoom(roomId),
    error => error instanceof UpstashRestError &&
        error.code === "UPSTASH_REST_ERROR" &&
        error.statusCode === 503 &&
        error.failureStage === "room-load" &&
        error.upstashHttpStatus === null &&
        error.upstashErrorType === "TypeError"
);

const httpFailureStore = new UpstashRoomStore({
    url: "https://redis.example.test",
    token: "DO_NOT_LOG_HTTP_TOKEN",
    fetchImpl: async () => ({
        ok: false,
        status: 401,
        async json() {
            return { error: "WRONGPASS invalid credentials" };
        }
    })
});
await assert.rejects(
    httpFailureStore.createRoom(roomId, {}, 600),
    error => error instanceof UpstashRestError &&
        error.failureStage === "room-save" &&
        error.upstashHttpStatus === 401 &&
        error.upstashErrorType === "WRONGPASS" &&
        error.upstashResponseSummary.hasError === true &&
        !JSON.stringify(error.upstashResponseSummary).includes("credentials")
);

const invalidResponseStore = new UpstashRoomStore({
    url: "https://redis.example.test",
    token: "DO_NOT_LOG_INVALID_RESPONSE_TOKEN",
    fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
            throw new SyntaxError("invalid JSON");
        }
    })
});
await assert.rejects(
    invalidResponseStore.incrementRateLimit("create:client", 60),
    error => error instanceof UpstashRestError &&
        error.failureStage === "rate-limit" &&
        error.upstashHttpStatus === 200 &&
        error.upstashErrorType === "INVALID_JSON_RESPONSE"
);

console.log("Upstash room store tests: OK");
