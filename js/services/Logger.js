/**
 * Logger.js
 * ゲームログ管理サービス
 */

export default class Logger {

    constructor() {

        this.logs = [];

    }

    /**
     * 共通ログ追加
     */
    add(level, source, category, event, message, payload = {}) {

        const log = {

            timestamp: new Date().toISOString(),

         level,

            source,

         category,

         event,

         message,

        payload

        };

        this.logs.push(log);

        console.log(log);

    }

    info(source, category, event, message, payload = {}) {

        this.add("INFO", source, category, event, message, payload);

    }

    warn(source, category, event, message, payload = {}) {

        this.add("WARN", source, category, event, message, payload);

    }

    error(source, category, event, message, payload = {}) {

     this.add("ERROR", source, category, event, message, payload);

    }

    debug(source, category, event, message, payload = {}) {

     this.add("DEBUG", source, category, event, message, payload);

    }

    /**
     * ログ取得
     */
    getLogs() {

        return [...this.logs];

    }

    /**
     * ログ削除
     */
    clear() {

        this.logs = [];

    }

}