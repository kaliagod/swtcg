import assert from "node:assert/strict";

import resolveUpstashConnection from
    "../../server/signaling/resolveUpstashConnection.js";

assert.deepEqual(resolveUpstashConnection({
    UPSTASH_REDIS_REST_URL: "https://upstash-primary.test",
    UPSTASH_REDIS_REST_TOKEN: "PRIMARY_TOKEN",
    KV_REST_API_URL: "https://vercel-fallback.test",
    KV_REST_API_TOKEN: "FALLBACK_TOKEN"
}), {
    url: "https://upstash-primary.test",
    token: "PRIMARY_TOKEN"
});

assert.deepEqual(resolveUpstashConnection({
    KV_REST_API_URL: "https://vercel-marketplace.test",
    KV_REST_API_TOKEN: "MARKETPLACE_TOKEN"
}), {
    url: "https://vercel-marketplace.test",
    token: "MARKETPLACE_TOKEN"
});

assert.deepEqual(resolveUpstashConnection({
    UPSTASH_REDIS_REST_URL: " ",
    UPSTASH_REDIS_REST_TOKEN: "",
    KV_REST_API_URL: "https://fallback-for-empty.test",
    KV_REST_API_TOKEN: "FALLBACK_FOR_EMPTY_TOKEN"
}), {
    url: "https://fallback-for-empty.test",
    token: "FALLBACK_FOR_EMPTY_TOKEN"
});

assert.deepEqual(resolveUpstashConnection({
    UPSTASH_REDIS_REST_URL: "https://mixed-primary.test",
    KV_REST_API_TOKEN: "MIXED_FALLBACK_TOKEN",
    KV_REST_API_READ_ONLY_TOKEN: "READ_ONLY_TOKEN"
}), {
    url: "https://mixed-primary.test",
    token: "MIXED_FALLBACK_TOKEN"
});

assert.deepEqual(resolveUpstashConnection({
    KV_REST_API_READ_ONLY_TOKEN: "READ_ONLY_TOKEN",
    KV_URL: "redis://not-used",
    REDIS_URL: "redis://also-not-used"
}), {
    url: undefined,
    token: undefined
});

console.log("Upstash environment resolution tests: OK");
