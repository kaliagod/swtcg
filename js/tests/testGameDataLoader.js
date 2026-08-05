import assert from "node:assert/strict";

import GameDataLoader from "../loaders/GameDataLoader.js";
import installFileFetch from "./helpers/installFileFetch.js";

const restoreFetch = installFileFetch();
try {
    const gameData = await new GameDataLoader().load();

    assert.equal(gameData.cardDefinitions.length, 29);
    assert.equal(gameData.starterDeck.length, 40);
    assert.equal(gameData.starterAdventureDeck.length, 15);
    assert.equal(gameData.cardDefinitions[0].name, "旅支度");
} finally {
    restoreFetch();
}
