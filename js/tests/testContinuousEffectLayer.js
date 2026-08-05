import assert from "node:assert/strict";

import AdventureAbilityManager from "../services/AdventureAbilityManager.js";
import QuestManager from "../services/QuestManager.js";
import ZoneManager from "../services/ZoneManager.js";
import TransactionManager from "../services/TransactionManager.js";
import SelectionManager from "../services/SelectionManager.js";
import CommandExecutor from "../engines/CommandExecutor.js";
import GameEngine from "../engines/GameEngine.js";
import TargetEngine from "../engines/TargetEngine.js";
import ConditionEngine from "../engines/ConditionEngine.js";
import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import CardDefinition from "../models/CardDefinition.js";
import Card from "../models/Card.js";

import AbilityTypes from "../constants/AbilityTypes.js";
import AdventureAbilityTypes from "../constants/AdventureAbilityTypes.js";
import CardTypes from "../constants/CardTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import ConditionTypes from "../constants/ConditionTypes.js";
import CostTypes from "../constants/CostTypes.js";
import MpReplacementChoices from "../constants/MpReplacementChoices.js";
import SelectionTypes from "../constants/SelectionTypes.js";
import TargetTypes from "../constants/TargetTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

let nextId = 1;
function card(definition, zone = ZoneTypes.FIELD) {
    const result = new Card(definition, `CONTINUOUS_${nextId++}`);
    result.ownerId = 1;
    result.controllerId = 1;
    result.zone = zone;
    result.faceUp = true;
    return result;
}

function passiveDefinition(id, replacementCounter = "CHARGE") {
    return new CardDefinition({
        id,
        name: id,
        type: CardTypes.TRAIT,
        adventureAbilityType: AdventureAbilityTypes.PASSIVE,
        effects: [{
            trigger: TriggerTypes.CONTINUOUS,
            condition: { type: ConditionTypes.ALWAYS },
            target: { type: TargetTypes.SELF },
            commands: [
                {
                    type: CommandTypes.MODIFY_STAT,
                    params: {
                        modifiers: { [AbilityTypes.DEXTERITY]: 1 },
                        duration: "PASSIVE"
                    }
                },
                {
                    type: CommandTypes.MODIFY_STAT,
                    params: {
                        modifiers: { [AbilityTypes.STRENGTH]: 2 },
                        questTags: ["DANGER"],
                        duration: "PASSIVE"
                    }
                },
                { type: CommandTypes.REDUCE_DAMAGE, amount: 1 },
                {
                    type: CommandTypes.PREVENT_QUEST_DAMAGE,
                    params: { questTags: ["SAFE"] }
                },
                { type: CommandTypes.MODIFY_RESOURCE_GAIN, amount: 1 },
                {
                    type: CommandTypes.REPLACE_MP_WITH_COUNTER,
                    params: {
                        counter: replacementCounter,
                        counterPerMp: 1,
                        maxCounters: 10
                    }
                }
            ]
        }]
    });
}

const passiveA = card(passiveDefinition("PASSIVE_A"));
const quest = card(new CardDefinition({
    id: "DANGER_QUEST",
    name: "危険な依頼",
    type: CardTypes.QUEST,
    tags: ["DANGER"],
    questRequirements: { [AbilityTypes.STRENGTH]: 5 }
}));
quest.questParticipantIds = [1];
const deckCards = [1, 2, 3].map(index => {
    const result = card(new CardDefinition({
        id: `RESOURCE_${index}`,
        name: `資源${index}`,
        type: CardTypes.EVENT
    }), ZoneTypes.DECK);
    return result;
});

const player = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: deckCards,
        field: [passiveA, quest]
    }),
    adventurer: new AdventurerState({
        baseStats: {
            [AbilityTypes.STRENGTH]: 3,
            [AbilityTypes.DEXTERITY]: 2,
            [AbilityTypes.VITALITY]: 5,
            [AbilityTypes.SPIRIT]: 5
        }
    })
});
const gameState = new GameState();
gameState.addPlayer(player);
const transaction = new TransactionManager();
const selectionManager = new SelectionManager(gameState);
const zoneManager = new ZoneManager();
const abilityManager = new AdventureAbilityManager();
const questManager = new QuestManager(undefined, abilityManager);
const effectResolver = {
    execute() { return { success: true }; },
    targetEngine: new TargetEngine(),
    conditionEngine: new ConditionEngine()
};
const gameEngine = new GameEngine({
    effectResolver,
    zoneManager,
    adventureAbilityManager: abilityManager,
    questManager
});
const gameContext = {
    gameState,
    transaction,
    selectionManager,
    adventureAbilityManager: abilityManager,
    gameEngine
};

abilityManager.refreshPassiveState(player);
assert.equal(player.adventurer.getCurrentStat(AbilityTypes.DEXTERITY), 3);

const evaluation = questManager.evaluate(gameState, quest);
assert.equal(evaluation.success, true);
assert.equal(evaluation.totals[AbilityTypes.STRENGTH], 5);

let damage = gameEngine.dealDamage({
    gameContext,
    player,
    amount: 3,
    duringQuest: true,
    questCard: quest
});
assert.equal(damage.amount, 2);
assert.equal(damage.prevented, 1);

damage = abilityManager.applyDamageEffects({
    player,
    amount: 3,
    questTags: ["SAFE"],
    duringQuest: true
});
assert.equal(damage.amount, 0);

damage = abilityManager.applyDamageEffects({
    player,
    amount: 3,
    questTags: ["SAFE"],
    duringQuest: true,
    unpreventable: true
});
assert.equal(damage.amount, 3);

const commandExecutor = new CommandExecutor(zoneManager, transaction);
let result = commandExecutor.execute({
    type: CommandTypes.MOVE_TOP_CARDS,
    amount: 1,
    params: { destination: ZoneTypes.RESOURCE }
}, {
    player,
    targets: [player],
    gameContext
});
assert.equal(result.resourceBonus, 1);
assert.equal(result.movedAmount, 2);

assert.throws(
    () => commandExecutor.execute({
        type: CommandTypes.LOSE_MP,
        amount: 2,
        params: { requireFullPayment: true }
    }, {
        player,
        targets: [player],
        options: {},
        gameContext
    }),
    error => error.reason === "MP_REPLACEMENT_SELECTION_REQUIRED"
);
result = commandExecutor.execute({
    type: CommandTypes.LOSE_MP,
    amount: 2,
    params: { requireFullPayment: true }
}, {
    player,
    targets: [player],
    options: {
        mpReplacementIdsByPlayer: {
            [player.id]: passiveA.instanceId
        }
    },
    gameContext
});
assert.equal(result.replaced, true);
assert.equal(result.countersPlaced, 2);
assert.equal(passiveA.counters.CHARGE, 2);
assert.equal(player.adventurer.mpSpent, 0);

result = commandExecutor.execute({
    type: CommandTypes.LOSE_MP,
    amount: 1,
    params: { requireFullPayment: true }
}, {
    player,
    targets: [player],
    options: {
        mpReplacementIdsByPlayer: {
            [player.id]: MpReplacementChoices.DECLINE
        }
    },
    gameContext
});
assert.equal(result.replaced, false);
assert.equal(player.adventurer.mpSpent, 1);
assert.equal(passiveA.counters.CHARGE, 2);
player.adventurer.recoverMp(1);

const magic = card(new CardDefinition({
    id: "MP_MAGIC",
    name: "置換選択魔法",
    type: CardTypes.MAGIC,
    effects: [{
        trigger: TriggerTypes.ACTIVATE,
        condition: { type: ConditionTypes.ALWAYS },
        cost: { type: CostTypes.MP, amount: 1 },
        target: { type: TargetTypes.SELF },
        commands: []
    }]
}));
player.zones.field.add(magic);

const singlePreparation = gameEngine._prepareEffectTargetSelections({
    gameContext,
    player,
    card: magic,
    trigger: TriggerTypes.ACTIVATE,
    continuationAction: "ACTIVATE_ADVENTURE_CARD"
});
assert.equal(singlePreparation.success, false);
assert.equal(
    singlePreparation.reason,
    "MP_REPLACEMENT_SELECTION_REQUIRED"
);
assert.equal(singlePreparation.selectionRequest.candidates.length, 2);
assert.equal(
    singlePreparation.selectionRequest.candidates[0].id,
    MpReplacementChoices.DECLINE
);
selectionManager.resolve({
    requestId: singlePreparation.selectionRequest.id,
    playerId: player.id,
    selectedIds: [MpReplacementChoices.DECLINE]
});

const passiveB = card(passiveDefinition("PASSIVE_B", "FOCUS"));
player.zones.field.add(passiveB);
const preparation = gameEngine._prepareEffectTargetSelections({
    gameContext,
    player,
    card: magic,
    trigger: TriggerTypes.ACTIVATE,
    continuationAction: "ACTIVATE_ADVENTURE_CARD"
});
assert.equal(preparation.success, false);
assert.equal(preparation.reason, "MP_REPLACEMENT_SELECTION_REQUIRED");
assert.equal(preparation.selectionRequest.type, SelectionTypes.MP_REPLACEMENT);
assert.equal(preparation.selectionRequest.candidates.length, 3);
selectionManager.resolve({
    requestId: preparation.selectionRequest.id,
    playerId: player.id,
    selectedIds: [passiveA.instanceId]
});

const opponentPassiveA = card(passiveDefinition("OPPONENT_PASSIVE_A"));
const opponentPassiveB = card(passiveDefinition("OPPONENT_PASSIVE_B"));
for (const passive of [opponentPassiveA, opponentPassiveB]) {
    passive.ownerId = 2;
    passive.controllerId = 2;
}
const opponent = new PlayerState({
    id: 2,
    zones: new PlayerZones({
        field: [opponentPassiveA, opponentPassiveB]
    }),
    adventurer: new AdventurerState({
        baseStats: { [AbilityTypes.SPIRIT]: 3 }
    })
});
gameState.addPlayer(opponent);
const hostileEffect = card(new CardDefinition({
    id: "HOSTILE_MP_EVENT",
    name: "精神攪乱",
    type: CardTypes.EVENT,
    effects: [{
        trigger: TriggerTypes.PLAY,
        condition: { type: ConditionTypes.ALWAYS },
        target: { type: TargetTypes.OPPONENT, amount: 1 },
        commands: [{ type: CommandTypes.LOSE_MP, amount: 1 }]
    }]
}), ZoneTypes.HAND);
player.zones.hand.add(hostileEffect);
const opponentPreparation = gameEngine._prepareEffectTargetSelections({
    gameContext,
    player,
    card: hostileEffect,
    trigger: TriggerTypes.PLAY,
    selectedTargetIdsByEffect: { 0: [opponent.id] },
    continuationAction: "PLAY_CARD"
});
assert.equal(
    opponentPreparation.reason,
    "MP_REPLACEMENT_SELECTION_REQUIRED"
);
assert.equal(opponentPreparation.selectionRequest.playerId, opponent.id);
assert.equal(opponentPreparation.selectionRequest.candidates.length, 3);
assert.equal(
    opponentPreparation.selectionRequest.context.actorPlayerId,
    player.id
);

passiveA.faceUp = false;
abilityManager.refreshPassiveState(player);
assert.equal(player.adventurer.getCurrentStat(AbilityTypes.DEXTERITY), 3);
passiveB.faceUp = false;
abilityManager.refreshPassiveState(player);
assert.equal(player.adventurer.getCurrentStat(AbilityTypes.DEXTERITY), 2);

console.log("Continuous Effect Layer Test: OK");
