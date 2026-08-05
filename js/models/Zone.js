/**
 * Zone.js
 * カードを保持する汎用ゾーン。
 */

export default class Zone {

    /**
     * @param {string} type
     * @param {Array} cards
     */
    constructor(
        type,
        cards = []
    ) {

        if (
            typeof type !== "string" ||
            type.length === 0
        ) {
            throw new Error(
                "Zone: typeを指定してください。"
            );
        }

        if (!Array.isArray(cards)) {
            throw new Error(
                "Zone: cardsには配列を指定してください。"
            );
        }

        this.type = type;

        /*
         * 外部から渡された配列をそのまま保持すると、
         * 外部操作によって内容を書き換えられるためコピーする。
         */
        this._cards = [...cards];

    }

    /**
     * カード一覧のコピーを返す。
     *
     * @returns {Array}
     */
    get cards() {

        return [...this._cards];

    }

    /**
     * カードを追加する。
     *
     * @param {*} card
     * @returns {*}
     */
    add(card) {

        if (card === null || card === undefined) {
            throw new Error(
                "Zone.add(): cardを指定してください。"
            );
        }

        this._cards.push(card);

        return card;

    }

    /**
     * カードを取り除く。
     *
     * @param {*} card
     * @returns {*|null}
     */
    remove(card) {

        const index =
            this._cards.indexOf(card);

        if (index === -1) {
            return null;
        }

        const removedCards =
            this._cards.splice(index, 1);

        return removedCards[0];

    }

    /**
     * カードが存在するか確認する。
     *
     * @param {*} card
     * @returns {boolean}
     */
    contains(card) {

        return this._cards.includes(card);

    }

    /**
     * 指定位置のカードを取得する。
     * ゾーンの内容は変更しない。
     *
     * @param {number} index
     * @returns {*|null}
     */
    getAt(index) {

        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= this._cards.length
        ) {
            return null;
        }

        return this._cards[index];

    }

    /**
     * ゾーン内のカード枚数を返す。
     *
     * @returns {number}
     */
    size() {

        return this._cards.length;

    }

    /**
     * ゾーンが空か確認する。
     *
     * @returns {boolean}
     */
    isEmpty() {

        return this._cards.length === 0;

    }

    /**
     * 全カードを取り除き、取り除いたカードを返す。
     *
     * @returns {Array}
     */
    clear() {

        const removedCards =
            [...this._cards];

        this._cards.length = 0;

        return removedCards;

    }

}