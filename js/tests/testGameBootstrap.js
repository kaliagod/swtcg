import assert from "node:assert/strict";

import GameBootstrap from "../bootstrap/GameBootstrap.js";
import installFileFetch from "./helpers/installFileFetch.js";

const restoreFetch = installFileFetch();
try {
    const context = await new GameBootstrap().createGame();

    assert.equal(context.prepareResult.success, true);
    assert.equal(context.gameState.prepared, true);
    assert.equal(context.gameState.started, false);
    assert.equal(context.gameState.playerCount(), 2);
    assert.ok([1, 2].includes(context.prepareResult.firstPlayerId));

    const engine = context.gameEngine;
    assert.equal(engine.zoneManager, context.zoneManager);
    assert.equal(engine.deckValidator, context.deckValidator);
    assert.equal(engine.equipmentManager, context.equipmentManager);
    assert.equal(
        engine.damageOverflowManager,
        context.damageOverflowManager
    );
    assert.equal(
        engine.adventureAbilityManager,
        context.adventureAbilityManager
    );
    assert.equal(engine.questManager, context.questManager);
    assert.equal(
        engine.effectExecutionManager.effectResolver,
        engine.effectResolver
    );
    assert.equal(
        engine.cardActionManager.equipmentManager,
        engine.equipmentManager
    );
    assert.equal(
        engine.playerStateResolutionManager.damageOverflowManager,
        engine.damageOverflowManager
    );
    assert.equal(
        engine.transactionalZoneMover.zoneManager,
        engine.zoneManager
    );
    assert.equal(
        engine.effectResolver.commandExecutor.statusManager,
        engine.statusManager
    );

    for (const player of context.gameState.players) {
        assert.equal(player.zones.deck.size(), 32);
        assert.equal(player.zones.hand.size(), 5);
        assert.equal(player.zones.resource.size(), 3);
        assert.equal(player.zones.adventureDeck.size(), 14);
    }
} finally {
    restoreFetch();
}
