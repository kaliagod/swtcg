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
import AbilityTypes from "../constants/AbilityTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

let nextId = 1;
function makeCard(definition, zone, faceUp = true) {
    const result = new Card(
        definition,
        `STATE_TEST_${nextId++}`
    );
    result.zone = zone;
    result.faceUp = faceUp;
    return result;
}

function definition(id, type, extra = {}) {
    return new CardDefinition({
        id,
        name: id,
        type,
        ...extra
    });
}

function createContext(player) {
    const gameState = new GameState();
    gameState.addPlayer(player);
    gameState.addPlayer(new PlayerState({
        id: 2,
        adventurer: new AdventurerState()
    }));
    const transaction = new TransactionManager();
    const actionLog = new ActionLog();
    const selectionManager = new SelectionManager(
        gameState,
        actionLog
    );
    const gameEngine = new GameEngine({
        effectResolver: { execute() {} },
        zoneManager: new ZoneManager()
    });
    return {
        gameState,
        transaction,
        actionLog,
        selectionManager,
        gameEngine
    };
}

const resourceDefinition = definition(
    "RESOURCE",
    CardTypes.EVENT
);

// 超過3に対して候補が1枚なら、その1枚だけを墓地へ送って5へ固定する。
const loneResource = makeCard(
    resourceDefinition,
    ZoneTypes.RESOURCE,
    false
);
const shortagePlayer = new PlayerState({
    id: 1,
    zones: new PlayerZones({ resource: [loneResource] }),
    adventurer: new AdventurerState({
        baseStats: { [AbilityTypes.VITALITY]: 5 }
    })
});
const shortageContext = createContext(shortagePlayer);
const shortageDamage = shortageContext.gameEngine.dealDamage({
    gameContext: shortageContext,
    player: shortagePlayer,
    amount: 8
});
assert.equal(shortageDamage.success, true);
assert.equal(shortageDamage.overflowResult.stable, true);
assert.equal(shortagePlayer.adventurer.damage, 5);
assert.equal(shortagePlayer.zones.resource.size(), 0);
assert.equal(shortagePlayer.zones.deck.contains(loneResource), true);
assert.equal(shortagePlayer.deckRefreshCount, 1);

// ダメージが生命と同値なら超過量は0で、カードを送らない。
const equalResource = makeCard(
    resourceDefinition,
    ZoneTypes.RESOURCE,
    false
);
const equalPlayer = new PlayerState({
    id: 1,
    zones: new PlayerZones({ resource: [equalResource] }),
    adventurer: new AdventurerState({
        baseStats: { [AbilityTypes.VITALITY]: 5 }
    })
});
const equalContext = createContext(equalPlayer);
equalContext.gameEngine.dealDamage({
    gameContext: equalContext,
    player: equalPlayer,
    amount: 5
});
assert.equal(equalPlayer.adventurer.damage, 5);
assert.equal(equalPlayer.zones.resource.contains(equalResource), true);

// 生命+2装飾品を墓地へ送ったことで生命が7から5へ下がり、超過処理を再確認する。
const vitalityEquipmentDefinition = definition(
    "VITALITY_ARMOR",
    CardTypes.ACCESSORY,
    {
        statModifiers: { [AbilityTypes.VITALITY]: 2 }
    }
);
const vitalityEquipment = makeCard(
    vitalityEquipmentDefinition,
    ZoneTypes.FIELD
);
const chainResources = Array.from(
    { length: 2 },
    () => makeCard(
        resourceDefinition,
        ZoneTypes.RESOURCE,
        false
    )
);
const chainPlayer = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        field: [vitalityEquipment],
        resource: chainResources
    }),
    adventurer: new AdventurerState({
        baseStats: { [AbilityTypes.VITALITY]: 5 }
    })
});
const chainContext = createContext(chainPlayer);
chainContext.gameEngine.equipmentManager
    .refreshContinuousModifiers(chainPlayer);
const chainDamage = chainContext.gameEngine.dealDamage({
    gameContext: chainContext,
    player: chainPlayer,
    amount: 9
});
assert.equal(
    chainDamage.overflowResult.reason,
    "OVERFLOW_SELECTION_REQUIRED"
);
const overflowRequest =
    chainDamage.overflowResult.selectionRequest;
const firstSelection = [
    vitalityEquipment.instanceId,
    chainResources[0].instanceId
];
const prematureOverflowResolution =
    chainContext.gameEngine.resolveDamageOverflow({
        gameContext: chainContext,
        player: chainPlayer,
        selectedIds: firstSelection
    });
assert.equal(
    prematureOverflowResolution.reason,
    "PENDING_SELECTION"
);
assert.equal(chainPlayer.zones.graveyard.size(), 0);
chainContext.selectionManager.resolve({
    requestId: overflowRequest.id,
    playerId: chainPlayer.id,
    selectedIds: firstSelection
});
const chainResult =
    chainContext.gameEngine.resolveDamageOverflow({
        gameContext: chainContext,
        player: chainPlayer,
        selectedIds: firstSelection
    });
assert.equal(chainResult.stable, true);
assert.equal(chainResult.steps.length, 2);
assert.equal(chainPlayer.adventurer.damage, 5);
assert.equal(chainPlayer.zones.resource.size(), 0);
assert.equal(chainPlayer.zones.graveyard.size(), 0);
assert.equal(chainPlayer.zones.deck.size(), 3);
assert.equal(chainPlayer.deckRefreshCount, 1);
assert.equal(
    chainPlayer.adventurer.getCurrentStat(AbilityTypes.VITALITY),
    5
);

// 装飾品上限が3から1へ減った場合、所有者が残す1枚を選択する。
const accessoryDefinition = definition(
    "ACCESSORY",
    CardTypes.ACCESSORY,
    { statModifiers: { [AbilityTypes.AGILITY]: 1 } }
);
const accessories = Array.from(
    { length: 3 },
    () => makeCard(accessoryDefinition, ZoneTypes.FIELD)
);
const limitPlayer = new PlayerState({
    id: 1,
    zones: new PlayerZones({ field: accessories }),
    adventurer: new AdventurerState({
        baseStats: { [AbilityTypes.AGILITY]: 2 }
    })
});
const limitContext = createContext(limitPlayer);
limitContext.gameEngine.equipmentManager
    .refreshContinuousModifiers(limitPlayer);
limitPlayer.adventurer.setAccessoryLimit(1);
const limitCheck = limitContext.gameEngine.checkEquipmentState({
    gameContext: limitContext,
    player: limitPlayer
});
assert.equal(
    limitCheck.reason,
    "EQUIPMENT_LIMIT_SELECTION_REQUIRED"
);
assert.equal(limitCheck.selectionRequest.min, 1);
const keepIds = [accessories[1].instanceId];
assert.equal(limitContext.gameEngine.checkEquipmentState({
    gameContext: limitContext,
    player: limitPlayer,
    selectedKeepIds: keepIds
}).reason, "PENDING_SELECTION");
limitContext.selectionManager.resolve({
    requestId: limitCheck.selectionRequest.id,
    playerId: limitPlayer.id,
    selectedIds: keepIds
});
const limitResolution =
    limitContext.gameEngine.checkEquipmentState({
        gameContext: limitContext,
        player: limitPlayer,
        selectedKeepIds: keepIds
    });
assert.equal(limitResolution.success, true);
assert.equal(limitResolution.stable, true);
assert.deepEqual(limitPlayer.zones.field.cards, [accessories[1]]);
assert.equal(limitPlayer.zones.resource.size(), 2);
assert.equal(
    limitPlayer.zones.resource.cards.every(card =>
        card.faceUp === false
    ),
    true
);
assert.equal(
    limitPlayer.adventurer.getCurrentStat(AbilityTypes.AGILITY),
    3
);

console.log("State-based action tests: OK");
