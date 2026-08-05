/**
 * ZoneManager.js
 * ゾーン間のカード移動・検索・検証を担当する。
 */

import Zone from "../models/Zone.js";
import DeckZone from "../models/DeckZone.js";

export default class ZoneManager {

    /**
     * カードをゾーン間で移動する。
     *
     * @param {Object} parameters
     * @param {Zone} parameters.from
     * @param {Zone} parameters.to
     * @param {*} parameters.card
     *
     * @returns {{
     *   success: boolean,
     *   card: *|null,
     *   from: Zone,
     *   to: Zone,
     *   reason: string|null
     * }}
     */

/**
 * 山札の一番上のカードを別のゾーンへ移動する。
 *
 * @param {Object} parameters
 * @param {DeckZone} parameters.from
 * @param {Zone} parameters.to
 *
 * @returns {{
 *   success: boolean,
 *   card: *|null,
 *   from: DeckZone,
 *   to: Zone,
 *   reason: string|null
 * }}
 */
moveTop({
    from,
    to
}) {

    if (!(from instanceof DeckZone)) {
        throw new Error(
            "ZoneManager.moveTop(): fromにはDeckZoneを指定してください。"
        );
    }

    this._validateZone(
        to,
        "to"
    );

    const card =
        from.peekTop();

    if (card === null) {

        return {
            success: false,
            card: null,
            from,
            to,
            reason: "SOURCE_EMPTY"
        };

    }

    /*
     * 実際の移動処理はmove()へ集約する。
     */
    return this.move({

        from,

        to,

        card

    });

}


/**
 * 山札から手札へ指定枚数のカードを移動する。
 *
 * 山札が途中で空になった場合は、
 * その時点までに移動できたカードだけを返す。
 *
 * @param {Object} parameters
 * @param {DeckZone} parameters.deck
 * @param {Zone} parameters.hand
 * @param {number} parameters.amount
 *
 * @returns {{
 *   success: boolean,
 *   cards: Array,
 *   requestedAmount: number,
 *   movedAmount: number,
 *   reason: string|null
 * }}
 */
draw({
    deck,
    hand,
    amount = 1
}) {

    if (!(deck instanceof DeckZone)) {
        throw new Error(
            "ZoneManager.draw(): deckにはDeckZoneを指定してください。"
        );
    }

    this._validateZone(
        hand,
        "hand"
    );

    this._validateAmount(
        amount,
        "ZoneManager.draw()"
    );

    const cards = [];

    for (
        let count = 0;
        count < amount;
        count++
    ) {

        const result =
            this.moveTop({

                from: deck,

                to: hand

            });

        if (!result.success) {

            return {
                success: false,
                cards,
                requestedAmount: amount,
                movedAmount: cards.length,
                reason: result.reason
            };

        }

        cards.push(
            result.card
        );

    }

    return {
        success: true,
        cards,
        requestedAmount: amount,
        movedAmount: cards.length,
        reason: null
    };

}


/**
 * 手札のカードを墓地へ移動する。
 *
 * @param {Object} parameters
 * @param {Zone} parameters.hand
 * @param {Zone} parameters.graveyard
 * @param {*} parameters.card
 *
 * @returns {{
 *   success: boolean,
 *   card: *|null,
 *   from: Zone,
 *   to: Zone,
 *   reason: string|null
 * }}
 */
discard({
    hand,
    graveyard,
    card
}) {

    return this.move({

        from: hand,

        to: graveyard,

        card

    });

}


/**
 * 山札の上から指定枚数を墓地へ移動する。
 *
 * 山札が途中で空になった場合は、
 * その時点までに移動できたカードだけを返す。
 *
 * @param {Object} parameters
 * @param {DeckZone} parameters.deck
 * @param {Zone} parameters.graveyard
 * @param {number} parameters.amount
 *
 * @returns {{
 *   success: boolean,
 *   cards: Array,
 *   requestedAmount: number,
 *   movedAmount: number,
 *   reason: string|null
 * }}
 */
mill({
    deck,
    graveyard,
    amount = 1
}) {

    if (!(deck instanceof DeckZone)) {
        throw new Error(
            "ZoneManager.mill(): deckにはDeckZoneを指定してください。"
        );
    }

    this._validateZone(
        graveyard,
        "graveyard"
    );

    this._validateAmount(
        amount,
        "ZoneManager.mill()"
    );

    const cards = [];

    for (
        let count = 0;
        count < amount;
        count++
    ) {

        const result =
            this.moveTop({

                from: deck,

                to: graveyard

            });

        if (!result.success) {

            return {
                success: false,
                cards,
                requestedAmount: amount,
                movedAmount: cards.length,
                reason: result.reason
            };

        }

        cards.push(
            result.card
        );

    }

    return {
        success: true,
        cards,
        requestedAmount: amount,
        movedAmount: cards.length,
        reason: null
    };

}


/**
 * 枚数指定を検証する。
 *
 * 0枚の操作も有効とする。
 *
 * @param {*} amount
 * @param {string} methodName
 * @private
 */
_validateAmount(
    amount,
    methodName
) {

    if (
        !Number.isInteger(amount) ||
        amount < 0
    ) {
        throw new Error(
            `${methodName}: amountには0以上の整数を指定してください。`
        );
    }     

        }

    move({
        from,
        to,
        card,
        position = "TOP"
    }) {

        this._validateZone(
            from,
            "from"
        );

        this._validateZone(
            to,
            "to"
        );

        if (card === null || card === undefined) {
            throw new Error(
                "ZoneManager.move(): cardを指定してください。"
            );
        }

        if (from === to) {

            return {
                success: false,
                card: null,
                from,
                to,
                reason: "SAME_ZONE"
            };

        }

        if (!from.contains(card)) {

            return {
                success: false,
                card: null,
                from,
                to,
                reason: "CARD_NOT_FOUND"
            };

        }

        const removedCard =
            from.remove(card);

        /*
         * contains()確認後なので通常nullにはならないが、
         * 不整合を検出するため確認する。
         */
        if (removedCard === null) {
            throw new Error(
                "ZoneManager.move(): 移動元からカードを取り除けませんでした。"
            );
        }

        try {

            if (
                to instanceof DeckZone &&
                position === "BOTTOM"
            ) {
                to.addBottom(removedCard);
            } else {
                to.add(removedCard);
            }

            if (
                typeof removedCard === "object" &&
                removedCard !== null
            ) {
                removedCard.zone = to.type;
            }

        } catch (error) {

            /*
             * 移動先への追加に失敗した場合、
             * 元のゾーンへ戻す。
             */
            from.add(removedCard);

            if (
                typeof removedCard === "object" &&
                removedCard !== null
            ) {
                removedCard.zone = from.type;
            }

            throw error;

        }

        return {
            success: true,
            card: removedCard,
            from,
            to,
            reason: null
        };

    }

    /**
     * 指定ゾーンにカードが存在するか確認する。
     *
     * @param {Object} parameters
     * @param {Zone} parameters.zone
     * @param {*} parameters.card
     *
     * @returns {boolean}
     */
    contains({
        zone,
        card
    }) {

        this._validateZone(
            zone,
            "zone"
        );

        return zone.contains(card);

    }

    /**
     * 複数ゾーンからカードの存在するゾーンを探す。
     *
     * @param {Object} parameters
     * @param {*} parameters.card
     * @param {Zone[]} parameters.zones
     *
     * @returns {Zone|null}
     */
    findCard({
        card,
        zones
    }) {

        if (!Array.isArray(zones)) {
            throw new Error(
                "ZoneManager.findCard(): zonesには配列を指定してください。"
            );
        }

        for (const zone of zones) {

            this._validateZone(
                zone,
                "zones内の要素"
            );

            if (zone.contains(card)) {
                return zone;
            }

        }

        return null;

    }

    /**
     * Zoneであることを検証する。
     *
     * @param {*} zone
     * @param {string} parameterName
     * @private
     */
    _validateZone(
        zone,
        parameterName
    ) {

        if (!(zone instanceof Zone)) {
            throw new Error(
                `ZoneManager: ${parameterName}にはZoneを指定してください。`
            );
        }

    }

}
