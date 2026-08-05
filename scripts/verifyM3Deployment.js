import assert from "node:assert/strict";

const baseUrl = String(process.env.M3_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
if (!baseUrl) {
    throw new Error(
        "M3_BASE_URLにVercel PreviewのURLを設定してください。"
    );
}

const sessionId = `M3_${Date.now()}`;
const offer = {
    version: 1,
    kind: "OFFER",
    sessionId,
    description: { type: "offer", sdp: "v=0\r\no=m3-offer" }
};
const answer = {
    version: 1,
    kind: "ANSWER",
    sessionId,
    description: { type: "answer", sdp: "v=0\r\no=m3-answer" }
};

async function signaling(body, expectedStatus = 200) {
    const response = await fetch(`${baseUrl}/api/signaling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    assert.equal(
        response.status,
        expectedStatus,
        `${body.action}: ${response.status} ${JSON.stringify(payload)}`
    );
    return { payload, response };
}

const configResponse = await fetch(`${baseUrl}/api/network-config`, {
    cache: "no-store"
});
assert.equal(configResponse.status, 200);
const config = await configResponse.json();
assert.ok(Array.isArray(config.iceServers));
assert.ok(config.iceServers.length > 0);
if (process.env.M3_REQUIRE_TURN !== "0") {
    assert.ok(
        config.iceServers.some(server => {
            const urls = Array.isArray(server.urls)
                ? server.urls
                : [server.urls];
            return urls.some(url => /^turns?:/i.test(url));
        }),
        "公開ICE設定にTURNサーバーがありません。"
    );
}

const { payload: created } = await signaling({
    action: "CREATE",
    offer
});
assert.match(created.roomId, /^[A-HJ-NP-Z2-9]{10}$/);
assert.equal(typeof created.hostToken, "string");

try {
    const { payload: joined } = await signaling({
        action: "JOIN",
        roomId: created.roomId
    });
    assert.equal(typeof joined.guestToken, "string");
    assert.deepEqual(joined.offer, offer);

    const duplicateJoin = await signaling({
        action: "JOIN",
        roomId: created.roomId
    }, 409);
    assert.equal(duplicateJoin.payload.error.code, "ROOM_ALREADY_JOINED");

    const invalidAnswer = await signaling({
        action: "ANSWER",
        roomId: created.roomId,
        guestToken: "invalid-token",
        answer
    }, 403);
    assert.equal(invalidAnswer.payload.error.code, "INVALID_GUEST_TOKEN");

    await signaling({
        action: "ANSWER",
        roomId: created.roomId,
        guestToken: joined.guestToken,
        answer
    });

    const reusedGuestToken = await signaling({
        action: "ANSWER",
        roomId: created.roomId,
        guestToken: joined.guestToken,
        answer
    }, 409);
    assert.equal(
        reusedGuestToken.payload.error.code,
        "GUEST_TOKEN_ALREADY_USED"
    );

    const { payload: ready } = await signaling({
        action: "STATUS",
        roomId: created.roomId,
        hostToken: created.hostToken
    });
    assert.equal(ready.status, "READY");
    assert.deepEqual(ready.answer, answer);

    const reusedHostToken = await signaling({
        action: "STATUS",
        roomId: created.roomId,
        hostToken: created.hostToken
    }, 404);
    assert.equal(reusedHostToken.payload.error.code, "ROOM_NOT_FOUND");
} finally {
    await signaling({
        action: "CLOSE",
        roomId: created.roomId,
        hostToken: created.hostToken
    }).catch(() => {});
}

console.log("M3 Preview / Upstash integration: OK");
