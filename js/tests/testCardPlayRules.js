import assert from "node:assert/strict";

import GameEngine from "../engines/GameEngine.js";
import EffectResolver from "../engines/EffectResolver.js";
import ConditionEngine from "../engines/ConditionEngine.js";
import TargetEngine from "../engines/TargetEngine.js";
import CostEngine from "../engines/CostEngine.js";
import CommandExecutor from "../engines/CommandExecutor.js";
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

import GameStatusTypes from "../constants/GameStatusTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import CardTypes from "../constants/CardTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ConditionTypes from "../constants/ConditionTypes.js";
import TargetTypes from "../constants/TargetTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import CostTypes from "../constants/CostTypes.js";
import ItemUseTypes from "../constants/ItemUseTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";
import EquipmentSlotTypes from "../constants/EquipmentSlotTypes.js";

let nextInstanceId = 1;
function card(definition) {
    return new Card(
        definition,
        `PLAY_TEST_${nextInstanceId++}`
    );
}

function simpleDefinition(id, type, values = {}) {
    return new CardDefinition({
        id,
        name: id,
        type,
        ...values
    });
}

const resourceDefinition = simpleDefinition(
    "RESOURCE_CARD",
    CardTypes.EVENT
);
const drawDefinition = simpleDefinition(
    "DRAW_CARD",
    CardTypes.EVENT
);
const paidEventDefinition = simpleDefinition(
    "PAID_EVENT",
    CardTypes.EVENT,
    { cost: 2, resolutionZone: ZoneTypes.GRAVEYARD }
);
const unaffordableDefinition = simpleDefinition(
    "UNAFFORDABLE",
    CardTypes.EVENT,
    { cost: 4, resolutionZone: ZoneTypes.GRAVEYARD }
);
const questDefinition = simpleDefinition(
    "QUEST",
    CardTypes.QUEST
);
const equipmentDefinition = simpleDefinition(
    "EQUIPMENT",
    CardTypes.EQUIPMENT,
    { equipmentSlot: EquipmentSlotTypes.WEAPON }
);
const accessoryDefinition = simpleDefinition(
    "ACCESSORY",
    CardTypes.ACCESSORY
);
const discardItemDefinition = simpleDefinition(
    "DISCARD_ITEM",
    CardTypes.ITEM,
    {
        itemUse: ItemUseTypes.GRAVEYARD,
        effects: [{
            trigger: TriggerTypes.ACTIVATE,
            condition: { type: ConditionTypes.ALWAYS },
            target: { type: TargetTypes.SELF },
            commands: [{ type: CommandTypes.DRAW, amount: 1 }]
        }]
    }
);
const cooldownItemDefinition = simpleDefinition(
    "COOLDOWN_ITEM",
    CardTypes.ITEM,
    { itemUse: ItemUseTypes.COOLDOWN }
);
const expensiveEffectDefinition = simpleDefinition(
    "EXPENSIVE_EFFECT",
    CardTypes.EVENT,
    {
        cost: 1,
        resolutionZone: ZoneTypes.GRAVEYARD,
        effects: [{
            trigger: TriggerTypes.PLAY,
            cost: { type: CostTypes.MP, amount: 10 },
            commands: []
        }]
    }
);

const paidEvent = card(paidEventDefinition);
const unaffordable = card(unaffordableDefinition);
const quest = card(questDefinition);
const equipment = card(equipmentDefinition);
const accessory = card(accessoryDefinition);
const discardItem = card(discardItemDefinition);
const cooldownItem = card(cooldownItemDefinition);
const expensiveEffect = card(expensiveEffectDefinition);
const resources = Array.from(
    { length: 5 },
    () => card(resourceDefinition)
);

const player1 = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: [card(drawDefinition), card(drawDefinition)],
        hand: [
            paidEvent,
            unaffordable,
            quest,
            equipment,
            accessory,
            discardItem,
            cooldownItem,
            expensiveEffect
        ],
        resource: resources
    }),
    adventurer: new AdventurerState({
        baseStats: {
            [AbilityTypes.SPIRIT]: 5,
            [AbilityTypes.VITALITY]: 5
        }
    })
});
const player2 = new PlayerState({
    id: 2,
    adventurer: new AdventurerState()
});
const gameState = new GameState();
gameState.addPlayer(player1);
gameState.addPlayer(player2);
gameState.prepared = true;
gameState.started = true;
gameState.status = GameStatusTypes.IN_PROGRESS;
gameState.phase = GamePhaseTypes.MAIN;

const transaction = new TransactionManager();
const zoneManager = new ZoneManager();
const actionLog = new ActionLog();
const selectionManager = new SelectionManager(
    gameState,
    actionLog
);
const commandExecutor = new CommandExecutor(
    zoneManager,
    transaction
);
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
    selectionManager,
    actionLog
};

const selectionResult = gameEngine.playCard({
    gameContext,
    player: player1,
    card: paidEvent
});
assert.equal(selectionResult.success, false);
assert.equal(
    selectionResult.reason,
    "RESOURCE_SELECTION_REQUIRED"
);
assert.equal(selectionResult.selectionRequest.min, 2);

const selectedResourceIds = resources
    .slice(0, 2)
    .map(resource => resource.instanceId);
selectionManager.resolve({
    requestId: selectionResult.selectionRequest.id,
    playerId: player1.id,
    selectedIds: selectedResourceIds
});

const paidEventResult = gameEngine.playCard({
    gameContext,
    player: player1,
    card: paidEvent,
    resourceCardIds: selectedResourceIds
});
assert.equal(paidEventResult.success, true);
assert.equal(player1.zones.resource.size(), 3);
assert.equal(player1.zones.graveyard.size(), 3);
assert.equal(player1.zones.graveyard.contains(paidEvent), true);

const cannotPayResult = gameEngine.playCard({
    gameContext,
    player: player1,
    card: unaffordable
});
assert.equal(cannotPayResult.reason, "CANNOT_PAY_RESOURCE");

for (const installedCard of [quest, equipment, accessory]) {
    const result = gameEngine.playCard({
        gameContext,
        player: player1,
        card: installedCard
    });
    assert.equal(result.success, true);
    assert.equal(result.destination, ZoneTypes.FIELD);
    assert.equal(player1.zones.field.contains(installedCard), true);
    assert.equal(installedCard.enteredFieldTurn, gameState.turn);
}

assert.equal(gameEngine.playCard({
    gameContext,
    player: player1,
    card: discardItem
}).success, true);
const handSizeBeforeActivation = player1.zones.hand.size();
const discardActivation = gameEngine.activateCard({
    gameContext,
    player: player1,
    card: discardItem
});
assert.equal(discardActivation.success, true);
assert.equal(player1.zones.graveyard.contains(discardItem), true);
assert.equal(player1.zones.hand.size(), handSizeBeforeActivation + 1);

assert.equal(gameEngine.playCard({
    gameContext,
    player: player1,
    card: cooldownItem
}).success, true);
const cooldownActivation = gameEngine.activateCard({
    gameContext,
    player: player1,
    card: cooldownItem
});
assert.equal(cooldownActivation.success, true);
assert.equal(cooldownItem.faceUp, false);
assert.equal(cooldownItem.refreshAtOwnerTurnStart, true);
assert.equal(gameEngine.activateCard({
    gameContext,
    player: player1,
    card: cooldownItem
}).reason, "ITEM_NOT_READY");

gameState.phase = GamePhaseTypes.TURN_START;
gameEngine.advancePhase({ gameContext });
assert.equal(cooldownItem.faceUp, true);
assert.equal(cooldownItem.refreshAtOwnerTurnStart, false);

gameState.phase = GamePhaseTypes.MAIN;
const remainingResourceId = player1.zones.resource.cards[0].instanceId;
const resourceCountBeforeRollback = player1.zones.resource.size();
const graveyardCountBeforeRollback = player1.zones.graveyard.size();
const rollbackResult = gameEngine.playCard({
    gameContext,
    player: player1,
    card: expensiveEffect,
    resourceCardIds: [remainingResourceId]
});
assert.equal(rollbackResult.reason, "CANNOT_PAY_COST");
assert.equal(
    player1.zones.resource.size(),
    resourceCountBeforeRollback
);
assert.equal(
    player1.zones.graveyard.size(),
    graveyardCountBeforeRollback
);
assert.equal(player1.zones.hand.contains(expensiveEffect), true);
assert.equal(player1.adventurer.mpSpent, 0);

console.log("Card play rules tests: OK");
