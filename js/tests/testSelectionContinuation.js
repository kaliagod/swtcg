import assert from "node:assert/strict";

import GameEngine from "../engines/GameEngine.js";
import ZoneManager from "../services/ZoneManager.js";
import TransactionManager from "../services/TransactionManager.js";
import SelectionManager from "../services/SelectionManager.js";
import ActionLog from "../services/ActionLog.js";
import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import CardDefinition from "../models/CardDefinition.js";
import Card from "../models/Card.js";
import AbilityTypes from "../constants/AbilityTypes.js";
import CardTypes from "../constants/CardTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

let nextId = 1;
function card(definition, zone) {
    const result = new Card(definition, `CONTINUATION_${nextId++}`);
    result.zone = zone;
    return result;
}

function createContext(player, phase = GamePhaseTypes.MAIN) {
    const gameState = new GameState();
    gameState.addPlayer(player);
    gameState.prepared = true;
    gameState.started = true;
    gameState.status = GameStatusTypes.IN_PROGRESS;
    gameState.phase = phase;
    const actionLog = new ActionLog();
    const transaction = new TransactionManager();
    const selectionManager = new SelectionManager(gameState, actionLog);
    const gameEngine = new GameEngine({
        effectResolver: { execute() { return {}; } },
        zoneManager: new ZoneManager()
    });
    return { gameState, actionLog, transaction, selectionManager, gameEngine };
}

const filler = new CardDefinition({
    id: "CONTINUATION_FILLER",
    name: "支払用",
    type: CardTypes.ITEM
});
const eventDefinition = new CardDefinition({
    id: "CONTINUATION_EVENT",
    name: "選択イベント",
    type: CardTypes.EVENT,
    cost: 2,
    resolutionZone: ZoneTypes.GRAVEYARD
});
const eventCard = card(eventDefinition, ZoneTypes.HAND);
const resources = Array.from(
    { length: 3 },
    () => card(filler, ZoneTypes.RESOURCE)
);
const paymentPlayer = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: [card(filler, ZoneTypes.DECK)],
        hand: [eventCard],
        resource: resources
    }),
    adventurer: new AdventurerState()
});
const paymentContext = createContext(paymentPlayer);
const paymentRequest = paymentContext.gameEngine.playCard({
    gameContext: paymentContext,
    player: paymentPlayer,
    card: eventCard
}).selectionRequest;
const paymentResult = paymentContext.gameEngine.resolvePendingSelection({
    gameContext: paymentContext,
    requestId: paymentRequest.id,
    player: paymentPlayer,
    selectedIds: resources.slice(0, 2).map(resource => resource.instanceId)
});
assert.equal(paymentResult.success, true);
assert.equal(paymentPlayer.zones.graveyard.contains(eventCard), true);
assert.equal(paymentContext.gameState.hasPendingSelection(), false);

const accessoryDefinition = new CardDefinition({
    id: "CONTINUATION_ACCESSORY",
    name: "超過候補",
    type: CardTypes.ACCESSORY
});
const overflowCards = Array.from({ length: 3 }, () => {
    const result = card(accessoryDefinition, ZoneTypes.FIELD);
    result.controllerId = 1;
    return result;
});
const overflowPlayer = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: [card(filler, ZoneTypes.DECK)],
        field: overflowCards
    }),
    adventurer: new AdventurerState({
        baseStats: { [AbilityTypes.VITALITY]: 1 },
        accessoryLimit: 3
    })
});
const overflowContext = createContext(overflowPlayer);
const overflowRequest = overflowContext.gameEngine.dealDamage({
    gameContext: overflowContext,
    player: overflowPlayer,
    amount: 3
}).overflowResult.selectionRequest;
const overflowResult = overflowContext.gameEngine.resolvePendingSelection({
    gameContext: overflowContext,
    requestId: overflowRequest.id,
    player: overflowPlayer,
    selectedIds: overflowCards.slice(0, 2).map(item => item.instanceId)
});
assert.equal(overflowResult.success, true);
assert.equal(overflowPlayer.adventurer.damage, 1);
assert.equal(overflowPlayer.zones.graveyard.size(), 2);

const limitCards = Array.from({ length: 2 }, () => {
    const result = card(accessoryDefinition, ZoneTypes.FIELD);
    result.controllerId = 1;
    return result;
});
const limitPlayer = new PlayerState({
    id: 1,
    zones: new PlayerZones({ field: limitCards }),
    adventurer: new AdventurerState({ accessoryLimit: 1 })
});
const limitContext = createContext(limitPlayer);
const limitRequest = limitContext.gameEngine.resolveStateBasedActions({
    gameContext: limitContext
}).selectionRequest;
const limitResult = limitContext.gameEngine.resolvePendingSelection({
    gameContext: limitContext,
    requestId: limitRequest.id,
    player: limitPlayer,
    selectedIds: [limitCards[0].instanceId]
});
assert.equal(limitResult.success, true);
assert.equal(limitPlayer.zones.field.contains(limitCards[0]), true);
assert.equal(limitPlayer.zones.resource.contains(limitCards[1]), true);

console.log("Selection continuation tests: OK");
