/**
 * GameDataLoader.js
 * ゲーム全体のデータを読み込む
 */

import CardDefinitionLoader from "./CardDefinitionLoader.js";
import DeckLoader from "./DeckLoader.js";

export default class GameDataLoader {

    constructor() {

        this.cardLoader = new CardDefinitionLoader();
        this.deckLoader = new DeckLoader();

    }

    /**
     * ゲームデータ読込
     */
    async load() {

        const cardDefinitions =
            await this.cardLoader.load(
            "./data/cards/starter.json"
        );

        const starterDeck =
         await this.deckLoader.load(
            "./data/decks/starterDeck.json"
        );

        const starterAdventureDeck =
            await this.deckLoader.load(
                "./data/decks/starterAdventureDeck.json"
            );

        return {

            cardDefinitions,

            starterDeck,

            starterAdventureDeck

        };

    }

}
