/**
 * ゲーム状態変更の巻き戻し処理を管理する。
 */

export default class TransactionManager {

    constructor() {
        this.active = false;
        this.operations = [];
    }

    begin() {
        if (this.active) {
            throw new Error(
                "TransactionManager.begin(): トランザクションは既に開始されています。"
            );
        }

        this.active = true;
        this.operations = [];
    }

    addOperation(rollbackFunction) {
        if (!this.active) {
            throw new Error(
                "TransactionManager.addOperation(): 有効なトランザクションがありません。"
            );
        }

        if (typeof rollbackFunction !== "function") {
            throw new Error(
                "TransactionManager.addOperation(): rollbackFunctionには関数を指定してください。"
            );
        }

        this.operations.push(rollbackFunction);
    }

    commit() {
        if (!this.active) {
            throw new Error(
                "TransactionManager.commit(): 有効なトランザクションがありません。"
            );
        }

        this.operations = [];
        this.active = false;
    }

    rollback() {
        if (!this.active) {
            throw new Error(
                "TransactionManager.rollback(): 有効なトランザクションがありません。"
            );
        }

        const rollbackErrors = [];

        try {
            for (let index = this.operations.length - 1; index >= 0; index--) {
                try {
                    this.operations[index]();
                } catch (error) {
                    rollbackErrors.push(error);
                }
            }
        } finally {
            this.operations = [];
            this.active = false;
        }

        if (rollbackErrors.length > 0) {
            throw new AggregateError(
                rollbackErrors,
                "TransactionManager.rollback(): 一部の巻き戻し処理に失敗しました。"
            );
        }
    }

    isActive() {
        return this.active;
    }

}
