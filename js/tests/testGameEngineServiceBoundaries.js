import assert from "node:assert/strict";

import GameEngine from "../engines/GameEngine.js";
import AdventureAbilityManager from 
    "../services/AdventureAbilityManager.js";
import AdventurerRequirementEvaluator from
    "../services/AdventurerRequirementEvaluator.js";
import CardActionManager from "../services/CardActionManager.js";
import DamageOverflowManager from "../services/DamageOverflowManager.js";
import DeckRefreshManager from "../services/DeckRefreshManager.js";
import DeckValidator from "../services/DeckValidator.js";
import GameSetupManager from "../services/GameSetupManager.js";
import EffectExecutionManager from
    "../services/EffectExecutionManager.js";
import EquipmentManager from "../services/EquipmentManager.js";
import PhaseFlowManager from "../services/PhaseFlowManager.js";
import PlayerStateResolutionManager from
    "../services/PlayerStateResolutionManager.js";
import QuestFlowManager from "../services/QuestFlowManager.js";
import QuestManager from "../services/QuestManager.js";
import SelectionContinuationManager from
    "../services/SelectionContinuationManager.js";
import StateBasedActionManager from 
    "../services/StateBasedActionManager.js";
import StatusManager from "../services/StatusManager.js";
import TriggerFlowManager from "../services/TriggerFlowManager.js";
import TransactionalZoneMover from
    "../services/TransactionalZoneMover.js";
import ZoneManager from "../services/ZoneManager.js";

const zoneManager = new ZoneManager();
const gameSetupManager = new GameSetupManager({
    zoneManager,
    deckValidator: new DeckValidator()
});
const stateBasedActionManager = new StateBasedActionManager({
    deckRefreshManager: new DeckRefreshManager(zoneManager),
    adventureAbilityManager: new AdventureAbilityManager()
});
const phaseFlowManager = new PhaseFlowManager({
    questManager: new QuestManager(),
    statusManager: new StatusManager()
});
const questFlowManager = new QuestFlowManager({
    questManager: new QuestManager(),
    damageOverflowManager: new DamageOverflowManager(),
    adventureAbilityManager: new AdventureAbilityManager()
});
const triggerFlowManager = new TriggerFlowManager();
const selectionContinuationManager = new SelectionContinuationManager();
const actionAdventureAbilityManager = new AdventureAbilityManager();
const effectExecutionManager = new EffectExecutionManager({
    effectResolver: { execute() {} },
    adventureAbilityManager: actionAdventureAbilityManager
});
const cardActionManager = new CardActionManager({
    equipmentManager: new EquipmentManager(),
    adventureAbilityManager: actionAdventureAbilityManager,
    requirementEvaluator: new AdventurerRequirementEvaluator()
});
const playerStateResolutionManager = new PlayerStateResolutionManager({
    adventureAbilityManager: new AdventureAbilityManager(),
    damageOverflowManager: new DamageOverflowManager(),
    equipmentManager: new EquipmentManager()
});
const transactionalZoneMover = new TransactionalZoneMover({ zoneManager });
const actionCalls = [];
const stateCalls = [];
const calls = [];
gameSetupManager.prepareGame = parameters => {
    calls.push(["prepareGame", parameters]);
    return { boundary: "PREPARE" };
};
gameSetupManager.mulliganInitialHand = parameters => {
    calls.push(["mulliganInitialHand", parameters]);
    return { boundary: "MULLIGAN" };
};
gameSetupManager.beginFirstTurn = parameters => {
    calls.push(["beginFirstTurn", parameters]);
    return { boundary: "BEGIN" };
};
phaseFlowManager.advancePhase = parameters => {
    calls.push(["advancePhase", parameters]);
    assert.equal(typeof parameters.drawCards, "function");
    assert.equal(typeof parameters.resolveStateBasedActions, "function");
    assert.equal(typeof parameters.enqueueTurnTriggers, "function");
    assert.equal(typeof parameters.flushTriggeredEffects, "function");
    return { boundary: "PHASE" };
};
stateBasedActionManager.checkVictory = parameters => {
    calls.push(["checkVictory", parameters]);
    return { boundary: "VICTORY" };
};
stateBasedActionManager.refreshDeck = parameters => {
    calls.push(["refreshDeck", parameters]);
    return { boundary: "REFRESH" };
};
stateBasedActionManager.resolve = parameters => {
    calls.push(["resolveStateBasedActions", parameters]);
    assert.equal(typeof parameters.checkEquipmentState, "function");
    assert.equal(typeof parameters.resolveDamageOverflow, "function");
    return { boundary: "STATE_BASED_ACTIONS" };
};
questFlowManager.declareParticipation = parameters => {
    calls.push(["declareParticipation", parameters]);
    return { boundary: "DECLARE_PARTICIPATION" };
};
questFlowManager.completeParticipation = parameters => {
    calls.push(["completeParticipation", parameters]);
    return { boundary: "COMPLETE_PARTICIPATION" };
};
questFlowManager.startPreparation = parameters => {
    calls.push(["startPreparation", parameters]);
    return { boundary: "START_PREPARATION" };
};
questFlowManager.passPreparation = parameters => {
    calls.push(["passPreparation", parameters]);
    return { boundary: "PASS_PREPARATION" };
};
questFlowManager.resolveQuest = parameters => {
    calls.push(["resolveQuest", parameters]);
    assert.equal(typeof parameters.resolveDamageOverflow, "function");
    assert.equal(typeof parameters.dealDamage, "function");
    assert.equal(typeof parameters.moveCardTransactional, "function");
    assert.equal(typeof parameters.expireQuestStatuses, "function");
    assert.equal(typeof parameters.resolveStateBasedActions, "function");
    assert.equal(typeof parameters.enqueueQuestOutcomeTriggers, "function");
    assert.equal(typeof parameters.flushTriggeredEffects, "function");
    assert.equal(typeof parameters.createPostProcessingResult, "function");
    return { boundary: "RESOLVE_QUEST" };
};
triggerFlowManager.recordZoneTransition = parameters => {
    calls.push(["recordZoneTransition", parameters]);
    return { boundary: "ZONE_TRIGGER" };
};
triggerFlowManager.discardQueuedTriggers = (gameState, entries) => {
    calls.push(["discardQueuedTriggers", { gameState, entries }]);
    return { boundary: "DISCARD_TRIGGERS" };
};
triggerFlowManager.enqueueCardTrigger = parameters => {
    calls.push(["enqueueCardTrigger", parameters]);
    return { boundary: "CARD_TRIGGER" };
};
triggerFlowManager.enqueueTurnTriggers = (...parameters) => {
    calls.push(["enqueueTurnTriggers", parameters]);
    return { boundary: "TURN_TRIGGERS" };
};
triggerFlowManager.enqueueQuestOutcomeTriggers = (...parameters) => {
    calls.push(["enqueueQuestOutcomeTriggers", parameters]);
    return { boundary: "QUEST_TRIGGERS" };
};
triggerFlowManager.applyTriggerOrder = parameters => {
    calls.push(["applyTriggerOrder", parameters]);
    return { boundary: "TRIGGER_ORDER" };
};
triggerFlowManager.flushTriggeredEffects = (
    context,
    selections,
    dependencies
) => {
    calls.push(["flushTriggeredEffects", { context, selections }]);
    assert.equal(
        typeof dependencies.prepareEffectTargetSelections,
        "function"
    );
    assert.equal(typeof dependencies.resolveEffectsByTrigger, "function");
    return { boundary: "FLUSH_TRIGGERS" };
};
triggerFlowManager.completeTriggeredResolution = parameters => {
    calls.push(["completeTriggeredResolution", parameters]);
    assert.equal(typeof parameters.resolveQuest, "function");
    assert.equal(
        typeof parameters.completePendingPhaseTransition,
        "function"
    );
    return { boundary: "COMPLETE_TRIGGER" };
};
selectionContinuationManager.resolve = parameters => {
    calls.push(["resolvePendingSelection", parameters]);
    for (const callbackName of [
        "applyTriggerOrder",
        "flushTriggeredEffects",
        "completeTriggeredResolution",
        "normalizeMpReplacementSelection",
        "playCard",
        "playGrowthCard",
        "activateCard",
        "activateAdventureCard",
        "resolveDamageOverflow",
        "resolveQuest",
        "checkEquipmentState",
        "resolveStateBasedActions"
    ]) {
        assert.equal(typeof parameters[callbackName], "function");
    }
    return { boundary: "PENDING_SELECTION" };
};
for (const methodName of [
    "playCard",
    "playGrowthCard",
    "activateCard",
    "activateAdventureCard"
]) {
    cardActionManager[methodName] = parameters => {
        actionCalls.push([methodName, parameters]);
        assert.equal(
            typeof parameters.operations.prepareEffectTargetSelections,
            "function"
        );
        assert.equal(
            typeof parameters.operations.resolveEffectsByTrigger,
            "function"
        );
        assert.equal(
            typeof parameters.operations.moveCardTransactional,
            "function"
        );
        return { boundary: methodName };
    };
}
effectExecutionManager.prepareTargetSelections = parameters => {
    actionCalls.push(["prepareTargetSelections", parameters]);
    return { boundary: "PREPARE_EFFECT" };
};
effectExecutionManager.resolveEffectsByTrigger = parameters => {
    actionCalls.push(["resolveEffectsByTrigger", parameters]);
    assert.equal(typeof parameters.resolveStateBasedActions, "function");
    return { boundary: "RESOLVE_EFFECTS" };
};
effectExecutionManager.normalizeMpReplacementSelection = (...parameters) => {
    actionCalls.push(["normalizeMpReplacementSelection", parameters]);
    return { boundary: "NORMALIZE_MP" };
};
effectExecutionManager.resolveEffect = parameters => {
    actionCalls.push(["resolveEffect", parameters]);
    assert.equal(typeof parameters.resolveStateBasedActions, "function");
    return { boundary: "RESOLVE_EFFECT" };
};
for (const methodName of [
    "dealDamage",
    "resolveDamageOverflow",
    "checkEquipmentState"
]) {
    playerStateResolutionManager[methodName] = parameters => {
        stateCalls.push([methodName, parameters]);
        assert.equal(typeof parameters.operations.recordAction, "function");
        assert.equal(
            typeof parameters.operations.resolveStateBasedActions,
            "function"
        );
        assert.equal(
            typeof parameters.operations.moveCardTransactional,
            "function"
        );
        return { boundary: methodName };
    };
}
transactionalZoneMover.move = parameters => {
    stateCalls.push(["move", parameters]);
    assert.equal(typeof parameters.recordZoneTransition, "function");
    assert.equal(typeof parameters.discardQueuedTriggers, "function");
    return { boundary: "TRANSACTIONAL_MOVE" };
};

const engine = new GameEngine({
    effectResolver: { execute() {} },
    zoneManager,
    gameSetupManager,
    stateBasedActionManager,
    phaseFlowManager,
    questFlowManager,
    triggerFlowManager,
    selectionContinuationManager,
    effectExecutionManager,
    cardActionManager,
    playerStateResolutionManager,
    transactionalZoneMover
});
const gameContext = { marker: "CONTEXT" };
const player = { marker: "PLAYER" };
const questCard = { marker: "QUEST_CARD" };
const card = { marker: "CARD", faceUp: true, controllerId: 1 };
const from = { marker: "FROM" };
const to = { marker: "TO" };

assert.deepEqual(engine.prepareGame({
    gameContext,
    initialHandSize: 7,
    initialResourceSize: 4
}), { boundary: "PREPARE" });
assert.deepEqual(engine.mulliganInitialHand({
    gameContext,
    player
}), { boundary: "MULLIGAN" });
assert.deepEqual(engine.beginFirstTurn({ gameContext }), {
    boundary: "BEGIN"
});
assert.deepEqual(engine.advancePhase({ gameContext }), {
    boundary: "PHASE"
});
assert.deepEqual(engine.checkVictory({ gameContext }), {
    boundary: "VICTORY"
});
assert.deepEqual(engine.refreshDeck({ gameContext, player }), {
    boundary: "REFRESH"
});
assert.deepEqual(engine.resolveStateBasedActions({ gameContext }), {
    boundary: "STATE_BASED_ACTIONS"
});
assert.deepEqual(engine.declareQuestParticipation({
    gameContext,
    player,
    questCard
}), { boundary: "DECLARE_PARTICIPATION" });
assert.deepEqual(engine.completeQuestParticipation({
    gameContext,
    player
}), { boundary: "COMPLETE_PARTICIPATION" });
assert.deepEqual(engine.startQuestPreparation({
    gameContext,
    player,
    questCard
}), { boundary: "START_PREPARATION" });
assert.deepEqual(engine.passQuestPreparation({
    gameContext,
    player
}), { boundary: "PASS_PREPARATION" });
assert.deepEqual(engine.resolveQuest({
    gameContext,
    player,
    questCard
}), { boundary: "RESOLVE_QUEST" });
assert.deepEqual(engine.recordZoneTransition({
    gameContext,
    from,
    to,
    card,
    previousFaceUp: true,
    previousControllerId: 1
}), { boundary: "ZONE_TRIGGER" });
assert.deepEqual(engine.discardQueuedTriggers(gameContext, [card]), {
    boundary: "DISCARD_TRIGGERS"
});
assert.deepEqual(engine._enqueueCardTrigger({
    gameContext,
    card,
    controllerId: 1,
    trigger: "ENTER"
}), { boundary: "CARD_TRIGGER" });
assert.deepEqual(engine._enqueueTurnTriggers(
    gameContext,
    player,
    "TURN_START"
), { boundary: "TURN_TRIGGERS" });
assert.deepEqual(engine._enqueueQuestOutcomeTriggers(
    gameContext,
    "QUEST_SUCCESS"
), { boundary: "QUEST_TRIGGERS" });
assert.deepEqual(engine._applyTriggerOrder({
    gameContext,
    batchId: "BATCH",
    controllerId: 1,
    orderedEntryIds: ["ENTRY"]
}), { boundary: "TRIGGER_ORDER" });
assert.deepEqual(engine._flushTriggeredEffects(gameContext), {
    boundary: "FLUSH_TRIGGERS"
});
assert.deepEqual(engine._completeTriggeredResolution(
    gameContext,
    { completed: true }
), { boundary: "COMPLETE_TRIGGER" });
assert.deepEqual(engine.resolvePendingSelection({
    gameContext,
    requestId: "SELECTION",
    player,
    selectedIds: ["CARD"]
}), { boundary: "PENDING_SELECTION" });
assert.deepEqual(engine.playCard({ gameContext, player, card }), {
    boundary: "playCard"
});
assert.deepEqual(engine.playGrowthCard({ gameContext, player, card }), {
    boundary: "playGrowthCard"
});
assert.deepEqual(engine.activateCard({ gameContext, player, card }), {
    boundary: "activateCard"
});
assert.deepEqual(engine.activateAdventureCard({
    gameContext,
    player,
    card
}), { boundary: "activateAdventureCard" });
assert.deepEqual(engine._prepareEffectTargetSelections({ marker: "PREP" }), {
    boundary: "PREPARE_EFFECT"
});
assert.deepEqual(engine._resolveEffectsByTrigger({ marker: "EFFECTS" }), {
    boundary: "RESOLVE_EFFECTS"
});
assert.deepEqual(engine._normalizeMpReplacementSelection(null, 1), {
    boundary: "NORMALIZE_MP"
});
assert.deepEqual(engine.resolveEffect({
    gameContext,
    player,
    effect: { marker: "EFFECT" }
}), { boundary: "RESOLVE_EFFECT" });
assert.deepEqual(engine.dealDamage({ gameContext, player, amount: 1 }), {
    boundary: "dealDamage"
});
assert.deepEqual(engine.resolveDamageOverflow({ gameContext, player }), {
    boundary: "resolveDamageOverflow"
});
assert.deepEqual(engine.checkEquipmentState({ gameContext, player }), {
    boundary: "checkEquipmentState"
});
assert.deepEqual(engine._moveCardTransactional({
    gameContext,
    transactionManager: { marker: "TRANSACTION" },
    from,
    to,
    card
}), { boundary: "TRANSACTIONAL_MOVE" });

assert.deepEqual(calls.slice(0, 6).map(([name, parameters]) =>
    name === "advancePhase"
        ? [name, { gameContext: parameters.gameContext }]
        : [name, parameters]
), [
    [
        "prepareGame",
        { gameContext, initialHandSize: 7, initialResourceSize: 4 }
    ],
    ["mulliganInitialHand", { gameContext, player }],
    ["beginFirstTurn", { gameContext }],
    ["advancePhase", { gameContext }],
    ["checkVictory", { gameContext }],
    ["refreshDeck", { gameContext, player }]
]);
assert.equal(calls[6][0], "resolveStateBasedActions");
assert.equal(calls[6][1].gameContext, gameContext);
assert.deepEqual(calls.slice(7, 12).map(([name, parameters]) => [
    name,
    {
        gameContext: parameters.gameContext,
        player: parameters.player,
        ...(parameters.questCard ? { questCard: parameters.questCard } : {})
    }
]), [
    ["declareParticipation", { gameContext, player, questCard }],
    ["completeParticipation", { gameContext, player }],
    ["startPreparation", { gameContext, player, questCard }],
    ["passPreparation", { gameContext, player }],
    ["resolveQuest", { gameContext, player, questCard }]
]);
assert.deepEqual(calls.slice(12, 20).map(([name]) => name), [
    "recordZoneTransition",
    "discardQueuedTriggers",
    "enqueueCardTrigger",
    "enqueueTurnTriggers",
    "enqueueQuestOutcomeTriggers",
    "applyTriggerOrder",
    "flushTriggeredEffects",
    "completeTriggeredResolution"
]);
assert.equal(calls[20][0], "resolvePendingSelection");
assert.equal(calls[20][1].gameContext, gameContext);
assert.equal(calls[20][1].requestId, "SELECTION");
assert.deepEqual(actionCalls.map(([name]) => name), [
    "playCard",
    "playGrowthCard",
    "activateCard",
    "activateAdventureCard",
    "prepareTargetSelections",
    "resolveEffectsByTrigger",
    "normalizeMpReplacementSelection",
    "resolveEffect"
]);
assert.deepEqual(stateCalls.map(([name]) => name), [
    "dealDamage",
    "resolveDamageOverflow",
    "checkEquipmentState",
    "move"
]);

assert.throws(
    () => new GameSetupManager({
        zoneManager: {},
        deckValidator: new DeckValidator()
    }),
    /zoneManager/
);
assert.throws(
    () => new StateBasedActionManager({
        deckRefreshManager: {},
        adventureAbilityManager: new AdventureAbilityManager()
    }),
    /deckRefreshManager/
);
assert.throws(
    () => new PhaseFlowManager({
        questManager: {},
        statusManager: new StatusManager()
    }),
    /questManager/
);
assert.throws(
    () => new GameEngine({
        effectResolver: { execute() {} },
        zoneManager,
        triggerFlowManager: {}
    }),
    /triggerFlowManager/
);
assert.throws(
    () => new GameEngine({
        effectResolver: { execute() {} },
        zoneManager,
        selectionContinuationManager: {}
    }),
    /selectionContinuationManager/
);
assert.throws(
    () => new GameEngine({
        effectResolver: { execute() {} },
        zoneManager,
        effectExecutionManager: {}
    }),
    /effectExecutionManager/
);
assert.throws(
    () => new GameEngine({
        effectResolver: { execute() {} },
        zoneManager,
        cardActionManager: {}
    }),
    /cardActionManager/
);
assert.throws(
    () => new GameEngine({
        effectResolver: { execute() {} },
        zoneManager,
        playerStateResolutionManager: {}
    }),
    /playerStateResolutionManager/
);
assert.throws(
    () => new GameEngine({
        effectResolver: { execute() {} },
        zoneManager,
        transactionalZoneMover: {}
    }),
    /transactionalZoneMover/
);
assert.throws(
    () => new QuestFlowManager({
        questManager: {},
        damageOverflowManager: new DamageOverflowManager(),
        adventureAbilityManager: new AdventureAbilityManager()
    }),
    /questManager/
);

console.log("Game engine service boundary tests: OK");
