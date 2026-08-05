import assert from "node:assert/strict";
import installFileFetch from "./helpers/installFileFetch.js";
import AbilityTypes from "../constants/AbilityTypes.js";

const restoreFetch = installFileFetch();

const { default: GameBootstrap } =
    await import("../bootstrap/GameBootstrap.js");

const context =
    await new GameBootstrap().createGame();

assert.equal(context.prepareResult.success, true);
assert.equal(context.gameState.playerCount(), 2);
assert.equal(context.gameState.prepared, true);

for (const player of context.gameState.players) {
    assert.equal(player.zones.hand.size(), 5);
    assert.equal(player.zones.resource.size(), 3);
    assert.equal(player.zones.deck.size(), 32);
    assert.equal(player.zones.adventureDeck.size(), 14);
    assert.equal(
        player.adventurer.card.definition.type,
        "ADVENTURER"
    );
    for (const ability of Object.values(AbilityTypes)) {
        assert.equal(player.adventurer.getRawStat(ability), 3);
        assert.equal(
            player.adventurer.baseStats[ability],
            player.adventurer.card.definition.baseStats[ability]
        );
    }
}

const ownerView = context.gameStateSerializer.serialize(
    context.gameState,
    { viewerPlayerId: 1 }
);
const player1View = ownerView.players.find(
    player => player.id === 1
);
const player2View = ownerView.players.find(
    player => player.id === 2
);
assert.equal(player1View.zones.adventureDeck.cards.length, 14);
assert.equal("cards" in player2View.zones.adventureDeck, false);
assert.equal(player2View.adventurer.card.type, "ADVENTURER");

restoreFetch();

console.log("Bootstrap integration test: OK");
