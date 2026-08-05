/**
 * DeckZone.js
 * 山札を表す特殊なZone。
 */

import Zone from "./Zone.js";
import ZoneTypes from "../constants/ZoneTypes.js";

export default class DeckZone extends Zone {

    /**
     * @param {Array} cards
     */
    constructor(cards = []) {

        super(
            ZoneTypes.DECK,
            cards
        );

    }

    /**
     * 山札の一番上を取得する。
     * 山札からは取り除かない。
     *
     * 配列の末尾を山札の一番上として扱う。
     *
     * @returns {*|null}
     */
    peekTop() {

        if (this.isEmpty()) {
            return null;
        }

        return this._cards[
            this._cards.length - 1
        ];

    }

    /**
     * 山札の一番上を取り除いて返す。
     *
     * @returns {*|null}
     */
    drawTop() {

        return this._cards.pop() ?? null;

    }

    /** 山札の一番下へカードを置く。 */
    addBottom(card) {
        if (card === null || card === undefined) {
            throw new Error(
                "DeckZone.addBottom(): cardを指定してください。"
            );
        }
        this._cards.unshift(card);
        return card;
    }

    /** シャッフル等の巻き戻し用に、山札の並びを置き換える。 */
    replaceCards(cards) {
        if (!Array.isArray(cards)) {
            throw new Error(
                "DeckZone.replaceCards(): cardsには配列を指定してください。"
            );
        }
        this._cards = [...cards];
        return this.cards;
    }

    /**
     * 山札をシャッフルする。
     *
     * RandomServiceが指定されている場合は、
     * RandomService.shuffle()を使用する。
     *
     * @param {RandomService|null} randomService
     * @returns {DeckZone}
     */
    shuffle(randomService = null) {

        if (
            randomService &&
            typeof randomService.shuffle === "function"
        ) {

            const shuffled =
                randomService.shuffle(this._cards);

            if (!Array.isArray(shuffled)) {
                throw new Error(
                    "DeckZone.shuffle(): RandomService.shuffle()は配列を返す必要があります。"
                );
            }

            this._cards =
                [...shuffled];

            return this;

        }

        /*
         * RandomServiceがない場合の標準シャッフル。
         * Fisher-Yates法。
         */
        for (
            let index = this._cards.length - 1;
            index > 0;
            index--
        ) {

            const randomIndex =
                Math.floor(
                    Math.random() * (index + 1)
                );

            [
                this._cards[index],
                this._cards[randomIndex]
            ] = [
                this._cards[randomIndex],
                this._cards[index]
            ];

        }

        return this;

    }

}
