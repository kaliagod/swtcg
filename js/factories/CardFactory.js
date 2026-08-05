/**
 * CardFactory.js
 * Card生成専用クラス
 */

import Card from "../models/Card.js";

export default class CardFactory {

    constructor(cardDatabase) {

        this.cardDatabase = cardDatabase;

        this.nextInstanceId = 1;

    }

    /**
     * カード生成
     */
    create(cardId) {

        const definition = this.cardDatabase.get(cardId);

        if (!definition) {

            throw new Error(
                `カードID '${cardId}' は存在しません。`
            );

        }

        return new Card(
            definition,
            `CARD_${this.nextInstanceId++}`
        );

    }

}
