import assert from "node:assert/strict";

import GameEngine from "../engines/GameEngine.js";
import ZoneManager from "../services/ZoneManager.js";
import TransactionManager from "../services/TransactionManager.js";
import ActionLog from "../services/ActionLog.js";
import SelectionManager from "../services/SelectionManager.js";
import EquipmentManager from "../services/EquipmentManager.js";
import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import CardDefinition from "../models/CardDefinition.js";
import Card from "../models/Card.js";

import CardTypes from "../constants/CardTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";
import EquipmentSlotTypes from "../constants/EquipmentSlotTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import TargetTypes from "../constants/TargetTypes.js";

let nextId = 1;
function equipmentCard({
    id,
    type = CardTypes.EQUIPMENT,
    slot = null,
    requirements = {},
    modifiers = {}
}) {
    return new Card(
        new CardDefinition({
            id,
            name: id,
            type,
            equipmentSlot:
                type === CardTypes.EQUIPMENT
                    ? slot
                    : undefined,
            equipRequirements: requirements,
            statModifiers: modifiers
        }),
        `EQUIP_TEST_${nextId++}`
    );
}

const weaponA = equipmentCard({
    id: "WEAPON_A",
    slot: EquipmentSlotTypes.WEAPON,
    modifiers: { [AbilityTypes.STRENGTH]: 1 }
});
const weaponB = equipmentCard({
    id: "WEAPON_B",
    slot: EquipmentSlotTypes.WEAPON,
    modifiers: { [AbilityTypes.STRENGTH]: 2 }
});
const impossibleArmor = equipmentCard({
    id: "IMPOSSIBLE_ARMOR",
    slot: EquipmentSlotTypes.ARMOR,
    requirements: { [AbilityTypes.STRENGTH]: 10 }
});
const conditionedAccessory = equipmentCard({
    id: "CONDITIONED_ACCESSORY",
    type: CardTypes.ACCESSORY,
    requirements: { [AbilityTypes.STRENGTH]: 3 },
    modifiers: { [AbilityTypes.AGILITY]: 1 }
});
const accessory2 = equipmentCard({
    id: "ACCESSORY_2",
    type: CardTypes.ACCESSORY,
    modifiers: { [AbilityTypes.AGILITY]: 1 }
});
const accessory3 = equipmentCard({
    id: "ACCESSORY_3",
    type: CardTypes.ACCESSORY,
    modifiers: { [AbilityTypes.AGILITY]: 1 }
});
const accessory4 = equipmentCard({
    id: "ACCESSORY_4",
    type: CardTypes.ACCESSORY,
    modifiers: { [AbilityTypes.AGILITY]: 1 }
});

const player = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        hand: [
            weaponA,
            weaponB,
            impossibleArmor,
            conditionedAccessory,
            accessory2,
            accessory3,
            accessory4
        ]
    }),
    adventurer: new AdventurerState({
        baseStats: {
            [AbilityTypes.STRENGTH]: 3,
            [AbilityTypes.AGILITY]: 2
        }
    })
});
const opponent = new PlayerState({
    id: 2,
    adventurer: new AdventurerState()
});
const gameState = new GameState();
gameState.addPlayer(player);
gameState.addPlayer(opponent);
gameState.prepared = true;
gameState.started = true;
gameState.status = GameStatusTypes.IN_PROGRESS;
gameState.phase = GamePhaseTypes.MAIN;

const transaction = new TransactionManager();
const actionLog = new ActionLog();
const gameContext = {
    gameState,
    transaction,
    actionLog,
    selectionManager: new SelectionManager(gameState, actionLog)
};
const gameEngine = new GameEngine({
    effectResolver: { execute() {} },
    zoneManager: new ZoneManager()
});

assert.equal(gameEngine.playCard({
    gameContext,
    player,
    card: weaponA
}).success, true);
assert.equal(
    player.adventurer.getCurrentStat(AbilityTypes.STRENGTH),
    3
);
assert.equal(
    player.adventurer.getQuestStat(AbilityTypes.STRENGTH),
    4
);

const replacementResult = gameEngine.playCard({
    gameContext,
    player,
    card: weaponB
});
assert.equal(replacementResult.success, true);
assert.equal(replacementResult.replacedCard, weaponA);
assert.equal(player.zones.field.contains(weaponA), false);
assert.equal(player.zones.resource.contains(weaponA), true);
assert.equal(player.zones.graveyard.contains(weaponA), false);
assert.equal(weaponA.faceUp, false);
assert.equal(weaponA.zone, ZoneTypes.RESOURCE);
assert.equal(
    player.adventurer.getCurrentStat(AbilityTypes.STRENGTH),
    3
);
assert.equal(
    player.adventurer.getQuestStat(AbilityTypes.STRENGTH),
    5
);

const conditionRejected = gameEngine.playCard({
    gameContext,
    player,
    card: impossibleArmor
});
assert.equal(
    conditionRejected.reason,
    "EQUIP_CONDITION_NOT_MET"
);
assert.equal(player.zones.hand.contains(impossibleArmor), true);

for (const accessory of [
    conditionedAccessory,
    accessory2,
    accessory3
]) {
    assert.equal(gameEngine.playCard({
        gameContext,
        player,
        card: accessory
    }).success, true);
}
assert.equal(
    player.adventurer.getCurrentStat(AbilityTypes.AGILITY),
    5
);

const accessoryLimitResult = gameEngine.playCard({
    gameContext,
    player,
    card: accessory4
});
assert.equal(
    accessoryLimitResult.success,
    true
);
const accessorySelection = gameState.pendingSelections[0];
assert.equal(accessorySelection.type, "EQUIPMENT_LIMIT");
const accessoryResolution = gameEngine.resolvePendingSelection({
    gameContext,
    requestId: accessorySelection.id,
    player,
    selectedIds: [
        conditionedAccessory.instanceId,
        accessory2.instanceId,
        accessory4.instanceId
    ]
});
assert.equal(accessoryResolution.success, true);
assert.equal(player.zones.field.contains(accessory4), true);
assert.equal(player.zones.resource.contains(accessory3), true);

player.adventurer.addModifier(AbilityTypes.STRENGTH, -1);
const stateResult = gameEngine.checkEquipmentState({
    gameContext,
    player
});
assert.deepEqual(stateResult.movedCards, [conditionedAccessory]);
assert.equal(
    player.zones.resource.contains(conditionedAccessory),
    true
);
assert.equal(conditionedAccessory.faceUp, false);
assert.equal(
    player.adventurer.getCurrentStat(AbilityTypes.AGILITY),
    4
);

const expandedSlotTrait = new Card(
    new CardDefinition({
        id: "EXPANDED_SLOT_TRAIT",
        name: "Expanded slot trait",
        type: CardTypes.TRAIT,
        effects: [{
            trigger: TriggerTypes.CONTINUOUS,
            target: { type: TargetTypes.SELF },
            commands: [{
                type: CommandTypes.MODIFY_EQUIPMENT_SLOTS,
                params: {
                    slots: {
                        [EquipmentSlotTypes.WEAPON]: 1
                    },
                    accessoryLimit: 1
                }
            }]
        }]
    }),
    `EQUIP_TEST_${nextId++}`
);
const expandedPlayer = new PlayerState({
    id: 3,
    zones: new PlayerZones({ field: [expandedSlotTrait] }),
    adventurer: new AdventurerState()
});
const equipmentManager = new EquipmentManager();
equipmentManager.refreshContinuousModifiers(expandedPlayer);
assert.equal(
    expandedPlayer.adventurer.getEquipmentSlotLimit(
        EquipmentSlotTypes.WEAPON
    ),
    2
);
assert.equal(expandedPlayer.adventurer.getAccessoryLimit(), 4);
expandedSlotTrait.faceUp = false;
equipmentManager.refreshContinuousModifiers(expandedPlayer);
assert.equal(
    expandedPlayer.adventurer.getEquipmentSlotLimit(
        EquipmentSlotTypes.WEAPON
    ),
    1
);
assert.equal(expandedPlayer.adventurer.getAccessoryLimit(), 3);

const oldWeapon = equipmentCard({
    id: "OLD_WEAPON",
    slot: EquipmentSlotTypes.WEAPON
});
const oldShield = equipmentCard({
    id: "OLD_SHIELD",
    slot: EquipmentSlotTypes.SHIELD
});
const weaponAndShield = new Card(
    new CardDefinition({
        id: "WEAPON_AND_SHIELD",
        name: "Weapon and shield",
        type: CardTypes.EQUIPMENT,
        equipmentSlots: {
            [EquipmentSlotTypes.WEAPON]: 1,
            [EquipmentSlotTypes.SHIELD]: 1
        }
    }),
    `EQUIP_TEST_${nextId++}`
);
const multiSlotPlayer = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        hand: [weaponAndShield],
        field: [oldWeapon, oldShield]
    }),
    adventurer: new AdventurerState()
});
const multiSlotOpponent = new PlayerState({
    id: 2,
    adventurer: new AdventurerState()
});
const multiSlotState = new GameState();
multiSlotState.addPlayer(multiSlotPlayer);
multiSlotState.addPlayer(multiSlotOpponent);
multiSlotState.prepared = true;
multiSlotState.started = true;
multiSlotState.status = GameStatusTypes.IN_PROGRESS;
multiSlotState.phase = GamePhaseTypes.MAIN;
const multiSlotContext = {
    gameState: multiSlotState,
    transaction: new TransactionManager(),
    actionLog: new ActionLog()
};
multiSlotContext.selectionManager = new SelectionManager(
    multiSlotState,
    multiSlotContext.actionLog
);
const multiSlotResult = gameEngine.playCard({
    gameContext: multiSlotContext,
    player: multiSlotPlayer,
    card: weaponAndShield
});
assert.equal(multiSlotResult.success, true);
assert.deepEqual(
    new Set(multiSlotResult.replacedCards),
    new Set([oldWeapon, oldShield])
);
assert.equal(multiSlotPlayer.zones.field.contains(weaponAndShield), true);
assert.equal(multiSlotPlayer.zones.resource.contains(oldWeapon), true);
assert.equal(multiSlotPlayer.zones.resource.contains(oldShield), true);

console.log("Equipment rules tests: OK");
