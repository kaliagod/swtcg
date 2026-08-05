import SignalingProvider from "./SignalingProvider.js";

function encodeSignal(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function decodeSignal(code) {
    try {
        const binary = atob(String(code).trim());
        const bytes = Uint8Array.from(binary, character =>
            character.charCodeAt(0)
        );
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new Error("接続コードを読み取れませんでした。");
    }
}

function assertSignal(signal, expectedKind) {
    if (
        signal?.kind !== expectedKind ||
        typeof signal.sessionId !== "string" ||
        !signal.description
    ) {
        throw new Error("接続コードの形式または種類が正しくありません。");
    }
    return signal;
}

export default class ManualSignalingProvider extends SignalingProvider {
    constructor() {
        super("MANUAL");
    }

    async publishOffer(offer) {
        return encodeSignal(assertSignal(offer, "OFFER"));
    }

    async resolveOffer(code) {
        return assertSignal(decodeSignal(code), "OFFER");
    }

    async publishAnswer(answer) {
        return encodeSignal(assertSignal(answer, "ANSWER"));
    }

    async resolveAnswer(code) {
        return assertSignal(decodeSignal(code), "ANSWER");
    }
}

export { decodeSignal, encodeSignal };
