/**
 * EventBus.js
 * シンプルなイベント管理クラス
 */

export default class EventBus {

    constructor() {
        this.listeners = new Map();
    }

    /**
     * イベント登録
     */
    on(eventName, callback) {

        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }

        this.listeners.get(eventName).push(callback);
    }

    /**
     * 一度だけ実行
     */
    once(eventName, callback) {

        const wrapper = (payload) => {

            this.off(eventName, wrapper);

            callback(payload);

        };

        this.on(eventName, wrapper);
    }

    /**
     * イベント解除
     */
    off(eventName, callback) {

        if (!this.listeners.has(eventName)) {
            return;
        }

        const list = this.listeners.get(eventName);

        const index = list.indexOf(callback);

        if (index >= 0) {
            list.splice(index, 1);
        }

    }

    /**
     * イベント送信
     */
    emit(eventName, payload = {}) {

        if (!this.listeners.has(eventName)) {
            return;
        }

        for (const callback of [...this.listeners.get(eventName)]) {
            callback(payload);
        }

    }

    /**
     * 指定イベント削除
     */
    clear(eventName) {

        this.listeners.delete(eventName);

    }

    /**
     * 全イベント削除
     */
    clearAll() {

        this.listeners.clear();

    }

}