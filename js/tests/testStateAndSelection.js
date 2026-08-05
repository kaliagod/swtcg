import assert from "node:assert/strict";

import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import CardDefinition from "../models/CardDefinition.js";
import Card from "../models/Card.js";
import ActionLog from "../services/ActionLog.js";
import SelectionManager from "../services/SelectionManager.js";
import GameStateSerializer from "../services/GameStateSerializer.js";

import CardTypes from "../constants/CardTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import SelectionTypes from "../constants/SelectionTypes.js";

const definition = new CardDefinition({
    id: "ITEM_SECRET",
    name: "秘密の道具",
    nameKey: "ITEM_SECRET",
    type: CardTypes.ITEM
});

function createCard(instanceId, ownerId, faceUp = true) {
    const card = new Card(definition, instanceId);
    card.ownerId = ownerId;
    card.faceUp = faceUp;
    return card;
}

function createPlayer(id) {
    return new PlayerState({
        id,
        name: `プレイヤー${id}`,
        zones: new PlayerZones({
            deck: [createCard(`P${id}_DECK`, id)],
            hand: [createCard(`P${id}_HAND`, id)],
            resource: [createCard(`P${id}_RESOURCE`, id, false)],
            field: [createCard(`P${id}_FIELD`, id, false)],
            graveyard: [createCard(`P${id}_GRAVE`, id)]
        }),
        adventurer: new AdventurerState({
            card: {
                id: `ADV_${id}`,
                name: `冒険者${id}`
            }
        })
    });
}

const gameState = new GameState();
gameState.addPlayer(createPlayer(1));
gameState.addPlayer(createPlayer(2));
gameState.markPrepared();

assert.equal(gameState.status, GameStatusTypes.PREPARING);

const actionLog = new ActionLog();
const selectionManager = new SelectionManager(
    gameState,
    actionLog
);
const serializer = new GameStateSerializer();

const request = selectionManager.request({
    type: SelectionTypes.RESOURCE_PAYMENT,
    playerId: 1,
    prompt: "支払うリソースを選択してください。",
    candidates: [
        {
            id: "P1_RESOURCE",
            label: "リソース1"
        }
    ],
    min: 1,
    max: 1,
    context: {
        cost: 1
    }
});

assert.equal(gameState.hasPendingSelection(), true);
assert.throws(() => gameState.start(), /未解決/);
assert.throws(() => selectionManager.resolve({
    requestId: request.id,
    playerId: 2,
    selectedIds: ["P1_RESOURCE"]
}), /プレイヤー/);

const player1View = serializer.serialize(gameState, {
    viewerPlayerId: 1
});
const player2View = serializer.serialize(gameState, {
    viewerPlayerId: 2
});

const player1InOwnView = player1View.players[0];
const player1InOpponentView = player2View.players[0];

assert.equal(player1InOwnView.zones.hand.cards.length, 1);
assert.equal(player1InOwnView.zones.resource.cards.length, 1);
assert.equal("cards" in player1InOpponentView.zones.hand, false);
assert.equal("cards" in player1InOpponentView.zones.resource, false);
assert.equal("cards" in player1InOpponentView.zones.deck, false);
assert.equal(
    player1InOpponentView.zones.field.cards[0].hidden,
    true
);
assert.equal(
    player1InOpponentView.zones.graveyard.cards[0].id,
    definition.id
);
assert.equal(player1View.pendingSelections[0].candidates.length, 1);
assert.equal("candidates" in player2View.pendingSelections[0], false);
assert.doesNotThrow(() => JSON.stringify(player1View));

const resolution = selectionManager.resolve({
    requestId: request.id,
    playerId: 1,
    selectedIds: ["P1_RESOURCE"]
});

assert.deepEqual(resolution.selectedIds, ["P1_RESOURCE"]);
assert.equal(gameState.hasPendingSelection(), false);

gameState.start();
assert.equal(gameState.status, GameStatusTypes.IN_PROGRESS);
assert.equal(gameState.canAcceptGameAction(), true);

gameState.finish({
    winnerIds: [1],
    reason: "LEVEL_REACHED"
});

assert.equal(gameState.status, GameStatusTypes.ENDED);
assert.equal(gameState.canAcceptGameAction(), false);
assert.deepEqual(gameState.winnerIds, [1]);
assert.equal(actionLog.getRecords().length, 2);
assert.equal(Object.isFrozen(actionLog.getRecords()[0]), true);
assert.deepEqual(
    actionLog.getRecords().map(record => record.sequence),
    [1, 2]
);
assert.doesNotThrow(
    () => JSON.stringify(actionLog.getRecords())
);
assert.throws(() => actionLog.append({
    type: "INVALID_SERIALIZATION",
    payload: {
        callback() {}
    }
}), /JSON/);

console.log("State and selection tests: OK");
