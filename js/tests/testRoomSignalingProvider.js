import assert from "node:assert/strict";

import RoomSignalingProvider from 
    "../network/signaling/RoomSignalingProvider.js";

const requests = [];
let statusRequests = 0;
const offer = {
    version: 1,
    kind: "OFFER",
    sessionId: "SESSION_PROVIDER_TEST",
    description: { type: "offer", sdp: "offer" }
};
const answer = {
    version: 1,
    kind: "ANSWER",
    sessionId: "SESSION_PROVIDER_TEST",
    description: { type: "answer", sdp: "answer" }
};
const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    let payload;
    if (body.action === "CREATE") {
        payload = {
            roomId: "ABCD2345",
            hostToken: "HOST_TOKEN"
        };
    } else if (body.action === "JOIN") {
        payload = {
            roomId: "ABCD2345",
            guestToken: "GUEST_TOKEN",
            offer
        };
    } else if (body.action === "ANSWER") {
        payload = { accepted: true };
    } else if (body.action === "STATUS") {
        statusRequests++;
        payload = statusRequests === 1
            ? { status: "PENDING" }
            : { status: "READY", answer };
    } else {
        payload = { closed: true };
    }
    return {
        ok: true,
        async json() {
            return payload;
        }
    };
};

const host = new RoomSignalingProvider({
    fetchImpl,
    pollIntervalMs: 1,
    timeoutMs: 100
});
assert.equal(await host.publishOffer(offer), "ABCD2345");
assert.deepEqual(await host.resolveAnswer("ABCD2345"), answer);

const guest = new RoomSignalingProvider({ fetchImpl });
assert.deepEqual(await guest.resolveOffer("abcd2345"), offer);
assert.equal(
    await guest.publishAnswer(answer, {
        invitationReference: "ABCD2345"
    }),
    "ABCD2345"
);

assert.deepEqual(requests.slice(0, 5), [
    { action: "CREATE", offer },
    {
        action: "STATUS",
        roomId: "ABCD2345",
        hostToken: "HOST_TOKEN"
    },
    {
        action: "STATUS",
        roomId: "ABCD2345",
        hostToken: "HOST_TOKEN"
    },
    { action: "JOIN", roomId: "ABCD2345" },
    {
        action: "ANSWER",
        roomId: "ABCD2345",
        guestToken: "GUEST_TOKEN",
        answer
    }
]);

console.log("Room signaling provider tests: OK");

let retryRequests = 0;
const retryingProvider = new RoomSignalingProvider({
    pollIntervalMs: 1,
    timeoutMs: 100,
    retryDelayMs: 1,
    fetchImpl: async () => {
        retryRequests++;
        if (retryRequests === 1) {
            return {
                ok: false,
                status: 503,
                headers: { get: () => null },
                async json() {
                    return {
                        error: {
                            code: "SIGNALING_STORE_UNAVAILABLE",
                            message: "unavailable"
                        }
                    };
                }
            };
        }
        return {
            ok: true,
            status: 200,
            async json() {
                return { status: "READY", answer };
            }
        };
    }
});
retryingProvider.roomId = "ABCD234567";
retryingProvider.hostToken = "HOST_TOKEN";
assert.deepEqual(
    await retryingProvider.resolveAnswer("ABCD234567"),
    answer
);
assert.equal(retryRequests, 2);

const limitedProvider = new RoomSignalingProvider({
    fetchImpl: async () => ({
        ok: false,
        status: 429,
        headers: { get: () => "60" },
        async json() {
            return {
                error: { code: "RATE_LIMITED", message: "limited" },
                retryAfterSeconds: 60
            };
        }
    })
});
await assert.rejects(
    limitedProvider.publishOffer(offer),
    error => error.code === "RATE_LIMITED" &&
        error.status === 429 &&
        error.retryAfterSeconds === 60
);

const expiredProvider = new RoomSignalingProvider({
    fetchImpl: async () => ({
        ok: false,
        status: 404,
        headers: { get: () => null },
        async json() {
            return {
                error: {
                    code: "ROOM_NOT_FOUND",
                    message: "server message"
                }
            };
        }
    })
});
await assert.rejects(
    expiredProvider.resolveOffer("ABCD234567"),
    error => error.code === "ROOM_NOT_FOUND" &&
        /有効期限/.test(error.message)
);

console.log("Room signaling provider diagnostics tests: OK");
