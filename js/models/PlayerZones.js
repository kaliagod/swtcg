/**
 * PlayerZones.js
 * プレイヤーが所有する全てのゾーンを保持する。
 */

import Zone from "./Zone.js";
import DeckZone from "./DeckZone.js";
import ZoneTypes from "../constants/ZoneTypes.js";

export default class PlayerZones {

    constructor({

        deck = [],

        adventureDeck = [],

        hand = [],

        field = [],

        graveyard = [],

        banished = [],

        resource = []

    } = {}) {

        this.deck = new DeckZone(deck);

        this.adventureDeck = new Zone(
            ZoneTypes.ADVENTURE_DECK,
            adventureDeck
        );

        this.hand = new Zone(
            ZoneTypes.HAND,
            hand
        );

        this.field = new Zone(
            ZoneTypes.FIELD,
            field
        );

        this.graveyard = new Zone(
            ZoneTypes.GRAVEYARD,
            graveyard
        );

        this.banished = new Zone(
            ZoneTypes.BANISHED,
            banished
        );

        this.resource = new Zone(
            ZoneTypes.RESOURCE,
            resource
        );

    }

    /**
     * 全てのゾーンを配列で返す。
     *
     * @returns {Zone[]}
     */
    getAllZones() {

        return [

            this.deck,

            this.adventureDeck,

            this.hand,

            this.field,

            this.graveyard,

            this.banished,

            this.resource

        ];

    }

    /**
     * 種別に対応するゾーンを返す。
     *
     * @param {string} type
     * @returns {Zone|null}
     */
    getZone(type) {

        return this.getAllZones().find(
            zone => zone.type === type
        ) ?? null;

    }

}
