import assert from "node:assert/strict";

import MemoryRoomStore from
    "../../server/signaling/MemoryRoomStore.js";
import SignalingRateLimiter from
    "../../server/signaling/SignalingRateLimiter.js";

let now = 1_000_000;
const limiter = new SignalingRateLimiter({
    store: new MemoryRoomStore({ now: () => now }),
    limits: {
        CREATE: { limit: 2, windowSeconds: 10 }
    }
});

await limiter.assertAllowed("CREATE", "203.0.113.10");
await limiter.assertAllowed("CREATE", "203.0.113.10");
await assert.rejects(
    limiter.assertAllowed("CREATE", "203.0.113.10"),
    error => error.statusCode === 429 &&
        error.code === "RATE_LIMITED" &&
        error.retryAfterSeconds === 10
);
await limiter.assertAllowed("CREATE", "203.0.113.11");
await limiter.assertAllowed("STATUS", "203.0.113.10");

now += 10_001;
await limiter.assertAllowed("CREATE", "203.0.113.10");

console.log("Signaling rate limiter tests: OK");
