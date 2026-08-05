import assert from "node:assert/strict";

import GameEngine from "../engines/GameEngine.js";
import ZoneManager from "../services/ZoneManager.js";
import TransactionManager from "../services/TransactionManager.js";
import SelectionManager from "../services/SelectionManager.js";
import ActionLog from "../services/ActionLog.js";
import AdventurerRequirementEvaluator from "../services/AdventurerRequirementEvaluator.js";
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

assert.throws(() => new CardDefinition({
    id: "INVALID_REQUIREMENT_KEY",
    name: "不正条件",
    type: CardTypes.EVENT,
    useRequirements: { unknown: 1 }
}));
assert.throws(() => new CardDefinition({
    id: "CONFLICTING_TAGS",
    name: "矛盾タグ",
    type: CardTypes.EVENT,
    useRequirements: {
        requiredTags: ["HERO"],
        forbiddenTags: ["HERO"]
    }
}));
assert.throws(() => new CardDefinition({
    id: "NON_QUEST_PARTICIPATION",
    name: "依頼以外",
    type: CardTypes.EVENT,
    participationRequirements: { minLevel: 2 }
}));

const evaluator = new AdventurerRequirementEvaluator();
const adventurer = new AdventurerState({
    level: 3,
    baseStats: { [AbilityTypes.STRENGTH]: 2 },
    questModifiers: { [AbilityTypes.STRENGTH]: 2 },
    grantedTags: ["HERO"]
});
const evaluatorPlayer = new PlayerState({ id: 1, adventurer });
const requirements = {
    minLevel: 3,
    minStats: { [AbilityTypes.STRENGTH]: 4 },
    requiredTags: ["HERO"],
    forbiddenTags: ["UNDEAD"]
};
assert.equal(evaluator.evaluate(
    evaluatorPlayer,
    requirements
).met, false);
assert.equal(evaluator.evaluate(
    evaluatorPlayer,
    requirements,
    { useQuestStats: true }
).met, true);

const eventDefinition = new CardDefinition({
    id: "RESTRICTED_EVENT",
    name: "熟練者の計画",
    type: CardTypes.EVENT,
    resolutionZone: ZoneTypes.GRAVEYARD,
    useRequirements: {
        minLevel: 2,
        minStats: { [AbilityTypes.INTELLIGENCE]: 3 },
        requiredTags: ["SCOUT"],
        forbiddenTags: ["CONFUSED"]
    }
});
const restrictedEvent = new Card(eventDefinition, "RESTRICTED_EVENT_1");
restrictedEvent.zone = ZoneTypes.HAND;
const player = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: [new Card(eventDefinition, "DECK_SENTINEL")],
        hand: [restrictedEvent]
    }),
    adventurer: new AdventurerState({
        level: 1,
        baseStats: { [AbilityTypes.INTELLIGENCE]: 3 }
    })
});
const gameState = new GameState();
gameState.addPlayer(player);
gameState.prepared = true;
gameState.started = true;
gameState.status = GameStatusTypes.IN_PROGRESS;
gameState.phase = GamePhaseTypes.MAIN;
const transaction = new TransactionManager();
const actionLog = new ActionLog();
const selectionManager = new SelectionManager(gameState, actionLog);
const gameEngine = new GameEngine({
    effectResolver: { execute() { return {}; } },
    zoneManager: new ZoneManager()
});
const context = {
    gameState,
    transaction,
    actionLog,
    selectionManager,
    gameEngine
};

const rejectedUse = gameEngine.playCard({
    gameContext: context,
    player,
    card: restrictedEvent
});
assert.equal(rejectedUse.reason, "CARD_USE_REQUIREMENTS_NOT_MET");
assert.deepEqual(
    rejectedUse.requirementResult.failures.map(item => item.type),
    ["LEVEL_TOO_LOW", "REQUIRED_TAG_MISSING"]
);
assert.equal(player.zones.hand.contains(restrictedEvent), true);

player.adventurer.setLevel(2);
player.adventurer.setGrantedTags(["SCOUT"]);
assert.equal(gameEngine.playCard({
    gameContext: context,
    player,
    card: restrictedEvent
}).success, true);

const questDefinition = new CardDefinition({
    id: "RESTRICTED_QUEST",
    name: "英雄限定依頼",
    type: CardTypes.QUEST,
    participationRequirements: requirements
});
const restrictedQuest = new Card(
    questDefinition,
    "RESTRICTED_QUEST_1"
);
restrictedQuest.zone = ZoneTypes.FIELD;
restrictedQuest.controllerId = 2;
restrictedQuest.enteredFieldTurn = 1;
const questOwner = new PlayerState({
    id: 2,
    zones: new PlayerZones({ field: [restrictedQuest] }),
    adventurer: new AdventurerState()
});
const questState = new GameState();
questState.addPlayer(evaluatorPlayer);
questState.addPlayer(questOwner);
questState.prepared = true;
questState.started = true;
questState.status = GameStatusTypes.IN_PROGRESS;
questState.phase = GamePhaseTypes.QUEST;
questState.turn = 2;
questState.questPhase = {
    stage: "PARTICIPATION",
    activeQuestInstanceId: null,
    resolvableQuestInstanceIds: []
};
const questActionLog = new ActionLog();
const questContext = {
    gameState: questState,
    transaction: new TransactionManager(),
    actionLog: questActionLog,
    selectionManager: new SelectionManager(
        questState,
        questActionLog
    )
};
const questEngine = new GameEngine({
    effectResolver: { execute() {} },
    zoneManager: new ZoneManager()
});
questContext.gameEngine = questEngine;
assert.equal(questEngine.declareQuestParticipation({
    gameContext: questContext,
    player: evaluatorPlayer,
    questCard: restrictedQuest
}).success, true);

restrictedQuest.questParticipantIds = [];
evaluatorPlayer.adventurer.setGrantedTags(["HERO", "UNDEAD"]);
const rejectedParticipation = questEngine.declareQuestParticipation({
    gameContext: questContext,
    player: evaluatorPlayer,
    questCard: restrictedQuest
});
assert.equal(
    rejectedParticipation.reason,
    "QUEST_PARTICIPATION_REQUIREMENTS_NOT_MET"
);
assert.equal(
    rejectedParticipation.requirementResult.failures[0].type,
    "FORBIDDEN_TAG_PRESENT"
);

console.log("Card requirement tests: OK");
