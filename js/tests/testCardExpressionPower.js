import assert from "node:assert/strict";

import AbilityTypes from "../constants/AbilityTypes.js";
import AdventureAbilityTypes from "../constants/AdventureAbilityTypes.js";
import CardTypes from "../constants/CardTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import ConditionTypes from "../constants/ConditionTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import QuestPhaseStages from "../constants/QuestPhaseStages.js";
import SelectionTypes from "../constants/SelectionTypes.js";
import StatusDurations from "../constants/StatusDurations.js";
import TargetTypes from "../constants/TargetTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

import AdventurerState from "../models/AdventurerState.js";
import Card from "../models/Card.js";
import CardDefinition from "../models/CardDefinition.js";
import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";

import CommandExecutor from "../engines/CommandExecutor.js";
import ConditionEngine from "../engines/ConditionEngine.js";
import CostEngine from "../engines/CostEngine.js";
import EffectContext from "../engines/EffectContext.js";
import EffectResolver from "../engines/EffectResolver.js";
import GameEngine from "../engines/GameEngine.js";
import TargetEngine from "../engines/TargetEngine.js";

import ActionLog from "../services/ActionLog.js";
import SelectionManager from "../services/SelectionManager.js";
import TransactionManager from "../services/TransactionManager.js";
import ZoneManager from "../services/ZoneManager.js";

let nextInstanceId = 1;
function makeCard(definition, ownerId = 1, zone = ZoneTypes.FIELD) {
    const card = new Card(
        definition,
        `EXPRESSION_${nextInstanceId++}`
    );
    card.ownerId = ownerId;
    card.controllerId = zone === ZoneTypes.FIELD ? ownerId : null;
    card.zone = zone;
    return card;
}

function statusCommand(name) {
    return {
        type: CommandTypes.ADD_STATUS,
        status: name,
        params: { duration: StatusDurations.PERMANENT }
    };
}

const conditionSource = makeCard(new CardDefinition({
    id: "CONDITION_SOURCE",
    name: "Condition source",
    type: CardTypes.TRAIT,
    effects: [{
        trigger: TriggerTypes.ACTIVATE,
        condition: {
            type: ConditionTypes.ALL,
            params: {
                conditions: [
                    {
                        type: ConditionTypes.PLAYER_LEVEL,
                        operator: ">=",
                        value: 3
                    },
                    {
                        type: ConditionTypes.PLAYER_STAT,
                        operator: ">=",
                        value: 5,
                        params: {
                            ability: AbilityTypes.STRENGTH,
                            quest: false
                        }
                    },
                    {
                        type: ConditionTypes.PLAYER_TAG,
                        value: "HERO"
                    },
                    {
                        type: ConditionTypes.SOURCE_COUNTER,
                        operator: ">=",
                        value: 2,
                        params: { counter: "CHARGE" }
                    },
                    {
                        type: ConditionTypes.QUEST_TAG,
                        value: "DANGER"
                    },
                    {
                        type: ConditionTypes.NOT,
                        params: {
                            condition: {
                                type: ConditionTypes.PLAYER_STATUS,
                                value: "SEALED"
                            }
                        }
                    }
                ]
            }
        },
        target: { type: TargetTypes.SELF },
        commands: [statusCommand("CONDITION_PASSED")]
    }]
}));
conditionSource.counters.CHARGE = 2;

const activeQuest = makeCard(new CardDefinition({
    id: "CONDITION_QUEST",
    name: "Condition quest",
    type: CardTypes.QUEST,
    tags: ["DANGER"]
}));
const conditionPlayer = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        field: [conditionSource, activeQuest]
    }),
    adventurer: new AdventurerState({
        level: 3,
        baseStats: {
            [AbilityTypes.STRENGTH]: 5,
            [AbilityTypes.DEXTERITY]: 5,
            [AbilityTypes.INTELLIGENCE]: 3
        },
        grantedTags: ["HERO"]
    })
});
const conditionOpponent = new PlayerState({
    id: 2,
    adventurer: new AdventurerState()
});
const conditionState = new GameState();
conditionState.addPlayer(conditionPlayer);
conditionState.addPlayer(conditionOpponent);
conditionState.questPhase = {
    stage: QuestPhaseStages.RESOLUTION,
    activeQuestInstanceId: activeQuest.instanceId,
    resolvableQuestInstanceIds: []
};
const conditionEffect = conditionSource.definition.effects[0];
const conditionContext = new EffectContext({
    gameContext: { gameState: conditionState },
    player: conditionPlayer,
    sourceCard: conditionSource,
    effect: conditionEffect
});
const conditionEngine = new ConditionEngine();
assert.equal(conditionEngine.evaluate(conditionContext), true);
conditionSource.counters.CHARGE = 1;
assert.equal(conditionEngine.evaluate(conditionContext), false);
conditionSource.counters.CHARGE = 2;

const scaleTransaction = new TransactionManager();
const scaleExecutor = new CommandExecutor(
    new ZoneManager(),
    scaleTransaction
);
const scaleContext = {
    player: conditionPlayer,
    targets: [conditionPlayer],
    sourceCard: conditionSource,
    gameContext: { gameState: conditionState },
    options: {}
};
const doubled = scaleExecutor.execute({
    type: CommandTypes.DOUBLE_STAT,
    params: {
        abilities: [AbilityTypes.STRENGTH],
        duration: "QUEST"
    }
}, scaleContext);
assert.equal(doubled.factor, 2);
assert.equal(
    conditionPlayer.adventurer.getQuestStat(AbilityTypes.STRENGTH),
    10
);
scaleExecutor.execute({
    type: CommandTypes.HALVE_STAT,
    params: {
        abilities: [AbilityTypes.DEXTERITY],
        duration: "QUEST"
    }
}, scaleContext);
assert.equal(
    conditionPlayer.adventurer.getQuestStat(AbilityTypes.DEXTERITY),
    3
);
scaleExecutor.execute({
    type: CommandTypes.DOUBLE_STAT,
    params: {
        abilities: [AbilityTypes.INTELLIGENCE],
        duration: "PERMANENT"
    }
}, scaleContext);
assert.equal(
    conditionPlayer.adventurer.getCurrentStat(AbilityTypes.INTELLIGENCE),
    6
);

function createFullContext(players) {
    const gameState = new GameState();
    for (const player of players) {
        gameState.addPlayer(player);
    }
    gameState.prepared = true;
    gameState.started = true;
    gameState.status = GameStatusTypes.IN_PROGRESS;
    gameState.phase = GamePhaseTypes.QUEST;
    gameState.turn = 2;

    const transaction = new TransactionManager();
    const zoneManager = new ZoneManager();
    const actionLog = new ActionLog();
    const selectionManager =
        new SelectionManager(gameState, actionLog);
    const commandExecutor =
        new CommandExecutor(zoneManager, transaction);
    const effectResolver = new EffectResolver({
        conditionEngine: new ConditionEngine(),
        targetEngine: new TargetEngine(),
        costEngine: new CostEngine(),
        commandExecutor,
        transactionManager: transaction
    });
    const gameEngine = new GameEngine({
        effectResolver,
        zoneManager
    });
    const gameContext = {
        gameState,
        transaction,
        actionLog,
        selectionManager,
        gameEngine
    };
    return gameContext;
}

const questOutcomeDefinition = new CardDefinition({
    id: "OUTCOME_QUEST",
    name: "Outcome quest",
    type: CardTypes.QUEST,
    tags: ["DANGER"],
    questRequirements: {
        [AbilityTypes.STRENGTH]: 1
    },
    effects: [
        {
            trigger: TriggerTypes.QUEST_SUCCESS,
            condition: {
                type: ConditionTypes.ALL,
                params: {
                    conditions: [
                        {
                            type: ConditionTypes.PLAYER_LEVEL,
                            operator: ">=",
                            value: 2
                        },
                        {
                            type: ConditionTypes.PLAYER_TAG,
                            value: "HERO"
                        },
                        {
                            type: ConditionTypes.QUEST_TAG,
                            value: "DANGER"
                        }
                    ]
                }
            },
            target: { type: TargetTypes.SELF },
            commands: [statusCommand("SUCCESS_CONDITIONAL")]
        },
        {
            trigger: TriggerTypes.QUEST_SUCCESS,
            condition: { type: ConditionTypes.ALWAYS },
            target: { type: TargetTypes.SELF },
            commands: [statusCommand("SUCCESS_SECOND")]
        },
        {
            trigger: TriggerTypes.QUEST_FAILURE,
            condition: { type: ConditionTypes.ALWAYS },
            target: { type: TargetTypes.SELF },
            commands: [statusCommand("FAILURE_ONLY")]
        }
    ]
});
const outcomeQuest = makeCard(questOutcomeDefinition);
outcomeQuest.enteredFieldTurn = 1;
outcomeQuest.questParticipantIds = [1];
outcomeQuest.questPreparationComplete = true;
const heroTrait = makeCard(new CardDefinition({
    id: "OUTCOME_HERO_TRAIT",
    name: "Hero trait",
    type: CardTypes.TRAIT,
    adventureAbilityType: AdventureAbilityTypes.PASSIVE,
    grantedTags: ["HERO"]
}));

const fillerDefinition = new CardDefinition({
    id: "EXPRESSION_FILLER",
    name: "Expression filler",
    type: CardTypes.EVENT
});
const outcomeOwner = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: [makeCard(fillerDefinition, 1, ZoneTypes.DECK)],
        field: [outcomeQuest, heroTrait]
    }),
    adventurer: new AdventurerState({
        level: 2,
        baseStats: {
            [AbilityTypes.STRENGTH]: 2,
            [AbilityTypes.VITALITY]: 5
        }
    })
});
const outcomeOpponent = new PlayerState({
    id: 2,
    adventurer: new AdventurerState()
});
const outcomeContext = createFullContext([
    outcomeOwner,
    outcomeOpponent
]);
outcomeContext.gameState.questPhase = {
    stage: QuestPhaseStages.RESOLUTION,
    activeQuestInstanceId: outcomeQuest.instanceId,
    resolvableQuestInstanceIds: []
};

const outcomeStart = outcomeContext.gameEngine.resolveQuest({
    gameContext: outcomeContext,
    player: outcomeOwner,
    questCard: outcomeQuest
});
assert.equal(outcomeStart.success, false);
assert.equal(
    outcomeStart.reason,
    "QUEST_TRIGGER_SELECTION_REQUIRED"
);
assert.equal(
    outcomeStart.triggerResolution.selectionRequest.type,
    SelectionTypes.EFFECT_ORDER
);
assert.equal(outcomeOwner.adventurer.statuses.length, 0);

const outcomeOrder =
    outcomeStart.triggerResolution.selectionRequest.candidates
        .toReversed()
        .map(candidate => candidate.id);
const outcomeResolution =
    outcomeContext.gameEngine.resolvePendingSelection({
        gameContext: outcomeContext,
        requestId:
            outcomeStart.triggerResolution.selectionRequest.id,
        player: outcomeOwner,
        selectedIds: outcomeOrder
    });
assert.equal(outcomeResolution.success, true);
assert.equal(outcomeResolution.actionResult.outcome, "SUCCESS");
assert.deepEqual(
    outcomeOwner.adventurer.statuses.map(status => status.name),
    ["SUCCESS_SECOND", "SUCCESS_CONDITIONAL"]
);
assert.equal(
    outcomeOwner.adventurer.statuses.some(
        status => status.name === "FAILURE_ONLY"
    ),
    false
);
assert.equal(outcomeOwner.zones.field.contains(outcomeQuest), false);
assert.equal(outcomeQuest.questResolution.stage, "COMPLETE");

const failedQuest = makeCard(questOutcomeDefinition);
failedQuest.enteredFieldTurn = 1;
failedQuest.questParticipantIds = [1];
failedQuest.questPreparationComplete = true;
failedQuest.questOverrides.requirements = {
    [AbilityTypes.STRENGTH]: 99
};
const failureOwner = new PlayerState({
    id: 1,
    zones: new PlayerZones({ field: [failedQuest] }),
    adventurer: new AdventurerState({
        baseStats: {
            [AbilityTypes.STRENGTH]: 2,
            [AbilityTypes.VITALITY]: 5
        }
    })
});
const failureOpponent = new PlayerState({
    id: 2,
    adventurer: new AdventurerState()
});
const failureContext = createFullContext([
    failureOwner,
    failureOpponent
]);
failureContext.gameState.questPhase = {
    stage: QuestPhaseStages.RESOLUTION,
    activeQuestInstanceId: failedQuest.instanceId,
    resolvableQuestInstanceIds: []
};
const failureResult = failureContext.gameEngine.resolveQuest({
    gameContext: failureContext,
    player: failureOwner,
    questCard: failedQuest
});
assert.equal(failureResult.success, true);
assert.equal(failureResult.outcome, "FAILURE");
assert.deepEqual(
    failureOwner.adventurer.statuses.map(status => status.name),
    ["FAILURE_ONLY"]
);

console.log("Card expression power tests: OK");
