import assert from "node:assert/strict";

import DeckLoader from "../loaders/DeckLoader.js";
import installFileFetch from "./helpers/installFileFetch.js";

const restoreFetch = installFileFetch();
try {
    const deck = await new DeckLoader().load(
        "./data/decks/starterDeck.json"
    );

    assert.equal(deck.length, 40);
    assert.equal(deck[0], "EVT001");
    assert.equal(deck.at(-1), "EVT008");
} finally {
    restoreFetch();
}
