import assert from "node:assert/strict";

class FakeChannel extends EventTarget {
    constructor() {
        super();
        this.readyState = "connecting";
    }

    close() {
        this.readyState = "closed";
    }

    send() {}
}

class FakePeerConnection extends EventTarget {
    constructor(config) {
        super();
        this.config = config;
        this.iceGatheringState = "complete";
        this.iceConnectionState = "new";
        this.connectionState = "new";
        this.localDescription = null;
    }

    createDataChannel() {
        this.channel = new FakeChannel();
        return this.channel;
    }

    async createOffer() {
        return { type: "offer", sdp: "offer" };
    }

    async setLocalDescription(description) {
        this.localDescription = description;
    }

    close() {
        this.connectionState = "closed";
    }
}

globalThis.RTCPeerConnection = FakePeerConnection;
const { default: WebRtcPeerSession } = await import(
    "../network/WebRtcPeerSession.js"
);

const statuses = [];
const session = new WebRtcPeerSession({
    role: "HOST",
    iceServers: [{ urls: "turn:turn.example.test" }],
    onStatus: status => statuses.push(status),
    connectionTimeoutMs: 50
});
const offer = await session.createOffer();
assert.equal(offer.kind, "OFFER");
assert.equal(
    session.peerConnection.config.iceServers[0].urls,
    "turn:turn.example.test"
);

const connected = session.waitForConnection();
session.channel.readyState = "open";
session.channel.dispatchEvent(new Event("open"));
await connected;
assert.ok(statuses.includes("CHANNEL_OPEN"));
session.close();

const timingOut = new WebRtcPeerSession({
    role: "HOST",
    connectionTimeoutMs: 5
});
await assert.rejects(
    timingOut.waitForConnection(),
    error => error.code === "CONNECTION_TIMEOUT"
);
timingOut.cancel();

console.log("WebRTC connection lifecycle tests: OK");
