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
import CardTypes from "../constants/CardTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

function quest(instanceId, name) {
    const card = new Card(new CardDefinition({
        id: instanceId,
        name,
        type: CardTypes.QUEST
    }), instanceId);
    card.zone = ZoneTypes.FIELD;
    card.controllerId = 1;
    card.enteredFieldTurn = 1;
    return card;
}

const firstQuest = quest("SEQUENCE_QUEST_1", "第一依頼");
const secondQuest = quest("SEQUENCE_QUEST_2", "第二依頼");
const owner = new PlayerState({
    id: 1,
    zones: new PlayerZones({ field: [firstQuest, secondQuest] }),
    adventurer: new AdventurerState()
});
const other = new PlayerState({
    id: 2,
    adventurer: new AdventurerState()
});
const gameState = new GameState();
gameState.addPlayer(owner);
gameState.addPlayer(other);
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
const selectionManager = new SelectionManager(gameState, new ActionLog());
const gameEngine = new GameEngine({
    effectResolver: { execute() {} },
    zoneManager: new ZoneManager()
});
const context = {
    gameState,
    transaction,
    selectionManager,
    actionLog: new ActionLog()
};

assert.equal(gameEngine.startQuestPreparation({
    gameContext: context,
    player: owner,
    questCard: firstQuest
}).reason, "QUEST_NOT_RESOLVABLE");
assert.equal(gameEngine.advancePhase({
    gameContext: context
}).reason, "QUEST_PARTICIPATION_REQUIRED");

const participation = gameEngine.completeQuestParticipation({
    gameContext: context,
    player: owner
});
assert.deepEqual(participation.resolvableQuestInstanceIds, [
    firstQuest.instanceId,
    secondQuest.instanceId
]);
assert.equal(gameEngine.declareQuestParticipation({
    gameContext: context,
    player: owner,
    questCard: secondQuest
}).reason, "CANNOT_DECLARE_QUEST_PARTICIPATION");

const firstStart = gameEngine.startQuestPreparation({
    gameContext: context,
    player: owner,
    questCard: firstQuest
});
assert.equal(firstStart.success, true);
assert.equal(gameEngine.startQuestPreparation({
    gameContext: context,
    player: owner,
    questCard: secondQuest
}).reason, "QUEST_PREPARATION_IN_PROGRESS");
for (const playerId of firstStart.playerOrder) {
    gameEngine.passQuestPreparation({
        gameContext: context,
        player: gameState.getPlayer(playerId)
    });
}
assert.equal(gameEngine.resolveQuest({
    gameContext: context,
    player: owner,
    questCard: secondQuest
}).reason, "QUEST_NOT_SELECTED_FOR_RESOLUTION");
assert.equal(gameEngine.resolveQuest({
    gameContext: context,
    player: owner,
    questCard: firstQuest
}).success, true);
assert.equal(gameState.questPhase.stage, "SELECT_QUEST");

const secondStart = gameEngine.startQuestPreparation({
    gameContext: context,
    player: owner,
    questCard: secondQuest
});
for (const playerId of secondStart.playerOrder) {
    gameEngine.passQuestPreparation({
        gameContext: context,
        player: gameState.getPlayer(playerId)
    });
}
assert.equal(gameEngine.resolveQuest({
    gameContext: context,
    player: owner,
    questCard: secondQuest
}).success, true);
assert.equal(gameEngine.advancePhase({
    gameContext: context
}).phase, GamePhaseTypes.TURN_END);

console.log("Quest phase sequence tests: OK");
