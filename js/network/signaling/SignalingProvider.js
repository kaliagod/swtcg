export default class SignalingProvider {
    constructor(mode) {
        if (!mode) {
            throw new Error("シグナリング方式を指定してください。");
        }
        this.mode = mode;
    }

    async publishOffer() {
        throw new Error("接続募集の公開処理が実装されていません。");
    }

    async resolveOffer() {
        throw new Error("接続募集の取得処理が実装されていません。");
    }

    async publishAnswer() {
        throw new Error("接続応答の公開処理が実装されていません。");
    }

    async resolveAnswer() {
        throw new Error("接続応答の取得処理が実装されていません。");
    }

    close() {}
}
