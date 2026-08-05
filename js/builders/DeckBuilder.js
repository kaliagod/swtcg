/**
 * DeckBuilder.js
 * カードID一覧からDeckを生成する
 */

import DeckZone from "../models/DeckZone.js";

export default class DeckBuilder {

    constructor(cardFactory) {

        this.cardFactory = cardFactory;

    }

    /**
     * デッキ生成
     */
    build(cardIds) {

        if (!Array.isArray(cardIds)) {
            throw new Error("カードID配列を指定してください。");
        }

        const deck = new DeckZone();

        for (const cardId of cardIds) {

            deck.add(
                this.cardFactory.create(cardId)
            );

        }

        return deck;

    }

}
