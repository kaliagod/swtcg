/**
 * CardDatabase.js
 * CardDefinitionを管理するデータベース
 */

import CardDefinition from "../models/CardDefinition.js";

export default class CardDatabase {

    constructor() {

        this.cards = new Map();

    }

    /**
     * 登録
     */
    register(definition) {

        if (!(definition instanceof CardDefinition)) {
            throw new Error("CardDefinitionを指定してください。");
        }

        if (this.cards.has(definition.id)) {
            throw new Error(
                `カードID '${definition.id}' は既に登録されています。`
            );
        }

        this.cards.set(definition.id, definition);

    }

    /**
     * 取得
     */
    get(id) {

        return this.cards.get(id) ?? null;

    }

    /**
     * 存在確認
     */
    has(id) {

        return this.cards.has(id);

    }

    /**
     * 全取得
     */
    getAll() {

        return [...this.cards.values()];

    }

    /**
     * 件数
     */
    size() {

        return this.cards.size;

    }

    /**
     * 全削除
     */
    clear() {

        this.cards.clear();

    }

}