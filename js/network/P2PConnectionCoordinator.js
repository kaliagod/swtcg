const SIGNALING_METHODS = Object.freeze([
    "publishOffer",
    "resolveOffer",
    "publishAnswer",
    "resolveAnswer"
]);

function assertSignalingProvider(provider) {
    if (!provider || SIGNALING_METHODS.some(
        method => typeof provider[method] !== "function"
    )) {
        throw new Error("シグナリングProviderの実装が不完全です。");
    }
}

export default class P2PConnectionCoordinator {
    constructor({ peerSession, signalingProvider }) {
        if (!peerSession) {
            throw new Error("WebRTCセッションを指定してください。");
        }
        assertSignalingProvider(signalingProvider);
        this.peerSession = peerSession;
        this.signalingProvider = signalingProvider;
    }

    get channel() {
        return this.peerSession.channel;
    }

    get signalingMode() {
        return this.signalingProvider.mode;
    }

    async createInvitation() {
        const offer = await this.peerSession.createOffer();
        return this.signalingProvider.publishOffer(offer);
    }

    async createResponse(invitationReference) {
        const offer = await this.signalingProvider.resolveOffer(
            invitationReference
        );
        const answer = await this.peerSession.acceptOffer(offer);
        return this.signalingProvider.publishAnswer(answer, {
            invitationReference
        });
    }

    async acceptResponse(responseReference) {
        const answer = await this.signalingProvider.resolveAnswer(
            responseReference
        );
        return this.peerSession.acceptAnswer(answer);
    }

    waitForConnection(options) {
        return this.peerSession.waitForConnection(options);
    }

    send(message) {
        return this.peerSession.send(message);
    }

    close() {
        this.signalingProvider.close?.();
        this.peerSession.close();
    }

    cancel() {
        this.signalingProvider.close?.();
        this.peerSession.cancel?.();
    }
}
