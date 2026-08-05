import assert from "node:assert/strict";

import GameEngine from "../engines/GameEngine.js";
import ZoneManager from "../services/ZoneManager.js";
import TransactionManager from "../services/TransactionManager.js";
import SelectionManager from "../services/SelectionManager.js";
import ActionLog from "../services/ActionLog.js";
import GameStateSerializer from "../services/GameStateSerializer.js";
import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import CardDefinition from "../models/CardDefinition.js";
import Card from "../models/Card.js";

import CardTypes from "../constants/CardTypes.js";
import ItemUseTypes from "../constants/ItemUseTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

let nextId = 1;
function card(definition) {
    return new Card(definition, `PREPARATION_TEST_${nextId++}`);
}

const questDefinition = new CardDefinition({
    id: "PREPARATION_QUEST",
    name: "準備テスト依頼",
    type: CardTypes.QUEST
});
const graveItemDefinition = new CardDefinition({
    id: "PREPARATION_GRAVE_ITEM",
    name: "使い切り道具",
    type: CardTypes.ITEM,
    itemUse: ItemUseTypes.GRAVEYARD
});
const cooldownItemDefinition = new CardDefinition({
    id: "PREPARATION_COOLDOWN_ITEM",
    name: "再使用道具",
    type: CardTypes.ITEM,
    itemUse: ItemUseTypes.COOLDOWN
});

const quest = card(questDefinition);
const graveItem = card(graveItemDefinition);
const ownerCooldownItem = card(cooldownItemDefinition);
const opponentCooldownItem = card(cooldownItemDefinition);

function putOnField(cardToPlace, controllerId, enteredFieldTurn = 1) {
    cardToPlace.zone = ZoneTypes.FIELD;
    cardToPlace.controllerId = controllerId;
    cardToPlace.enteredFieldTurn = enteredFieldTurn;
}

putOnField(quest, 1);
putOnField(graveItem, 1);
putOnField(ownerCooldownItem, 1);
putOnField(opponentCooldownItem, 2);

const owner = new PlayerState({
    id: 1,
    name: "発注者",
    zones: new PlayerZones({
        field: [quest, graveItem, ownerCooldownItem]
    }),
    adventurer: new AdventurerState()
});
const opponent = new PlayerState({
    id: 2,
    name: "参加者",
    zones: new PlayerZones({ field: [opponentCooldownItem] }),
    adventurer: new AdventurerState()
});
const thirdPlayer = new PlayerState({
    id: 3,
    name: "第三者",
    adventurer: new AdventurerState()
});

const gameState = new GameState();
gameState.addPlayer(owner);
gameState.addPlayer(opponent);
gameState.addPlayer(thirdPlayer);
gameState.prepared = true;
gameState.started = true;
gameState.status = GameStatusTypes.IN_PROGRESS;
gameState.phase = GamePhaseTypes.QUEST;
gameState.turn = 2;
gameState.questPhase = {
    stage: "PARTICIPATION",
    activeQuestInstanceId: null,
    resolvableQuestInstanceIds: []
};

const transaction = new TransactionManager();
const actionLog = new ActionLog();
const selectionManager = new SelectionManager(gameState, actionLog);
const gameEngine = new GameEngine({
    effectResolver: { execute() {} },
    zoneManager: new ZoneManager()
});
const context = {
    gameState,
    transaction,
    actionLog,
    selectionManager,
    gameEngine
};

assert.equal(gameEngine.completeQuestParticipation({
    gameContext: context,
    player: owner
}).success, true);

assert.equal(gameEngine.resolveQuest({
    gameContext: context,
    player: owner,
    questCard: quest
}).reason, "QUEST_NOT_SELECTED_FOR_RESOLUTION");

const start = gameEngine.startQuestPreparation({
    gameContext: context,
    player: owner,
    questCard: quest
});
assert.equal(start.success, true);
assert.deepEqual(start.playerOrder, [1, 2, 3]);
assert.equal(gameEngine.advancePhase({
    gameContext: context
}).reason, "QUEST_PREPARATION_IN_PROGRESS");
assert.equal(gameEngine.declareQuestParticipation({
    gameContext: context,
    player: owner,
    questCard: quest
}).reason, "CANNOT_DECLARE_QUEST_PARTICIPATION");
assert.equal(gameEngine.passQuestPreparation({
    gameContext: context,
    player: opponent
}).reason, "NOT_QUEST_PREPARATION_PLAYER");

const serialized = new GameStateSerializer().serialize(gameState, {
    viewerPlayerId: 1
});
assert.deepEqual(serialized.questPreparation.playerOrder, [1, 2, 3]);

assert.equal(gameEngine.activateCard({
    gameContext: context,
    player: owner,
    card: graveItem
}).success, true);
assert.equal(owner.zones.deck.contains(graveItem), true);
assert.equal(owner.deckRefreshCount, 1);
assert.equal(gameEngine.activateCard({
    gameContext: context,
    player: owner,
    card: ownerCooldownItem
}).success, true);
assert.equal(ownerCooldownItem.faceUp, false);

assert.equal(gameEngine.passQuestPreparation({
    gameContext: context,
    player: owner
}).nextPlayerId, 2);
assert.equal(gameEngine.activateCard({
    gameContext: context,
    player: owner,
    card: ownerCooldownItem
}).reason, "NOT_MAIN_PHASE");

assert.equal(gameEngine.activateCard({
    gameContext: context,
    player: opponent,
    card: opponentCooldownItem
}).success, true);
assert.equal(gameEngine.passQuestPreparation({
    gameContext: context,
    player: opponent
}).nextPlayerId, 3);
const finalPass = gameEngine.passQuestPreparation({
    gameContext: context,
    player: thirdPlayer
});
assert.equal(finalPass.completed, true);
assert.equal(gameState.questPreparation, null);
assert.equal(quest.questPreparationComplete, true);

const result = gameEngine.resolveQuest({
    gameContext: context,
    player: owner,
    questCard: quest
});
assert.equal(result.success, true);
assert.equal(result.outcome, "FAILURE");
assert.equal(owner.zones.graveyard.contains(quest), true);

console.log("Quest preparation tests: OK");
