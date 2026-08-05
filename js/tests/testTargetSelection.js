import assert from "node:assert/strict";

import GameEngine from "../engines/GameEngine.js";
import ConditionEngine from "../engines/ConditionEngine.js";
import TargetEngine from "../engines/TargetEngine.js";
import CostEngine from "../engines/CostEngine.js";
import CommandExecutor from "../engines/CommandExecutor.js";
import EffectResolver from "../engines/EffectResolver.js";
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
import TargetDefinition from "../models/TargetDefinition.js";
import CardTypes from "../constants/CardTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import ConditionTypes from "../constants/ConditionTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import TargetTypes from "../constants/TargetTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

let nextId = 1;

assert.throws(() => new TargetDefinition({
    type: TargetTypes.TARGET_CARD,
    filter: { controller: "UNKNOWN" }
}));
assert.throws(() => new TargetDefinition({
    type: TargetTypes.TARGET_CARD,
    filter: { zones: ["UNKNOWN_ZONE"] }
}));
function card(definition, zone) {
    const result = new Card(definition, `TARGET_TEST_${nextId++}`);
    result.zone = zone;
    return result;
}

function createContext(
    effectCard,
    opponentField = [],
    resourceCards = []
) {
    const sentinelDefinition = new CardDefinition({
        id: `TARGET_SENTINEL_${nextId}`,
        name: "山札維持",
        type: CardTypes.EVENT
    });
    const first = new PlayerState({
        id: 1,
        name: "使用者",
        zones: new PlayerZones({
            deck: [card(sentinelDefinition, ZoneTypes.DECK)],
            hand: [effectCard],
            resource: resourceCards
        }),
        adventurer: new AdventurerState({
            baseStats: { SPIRIT: 5 }
        })
    });
    const second = new PlayerState({
        id: 2,
        name: "相手",
        zones: new PlayerZones({ field: opponentField }),
        adventurer: new AdventurerState({
            baseStats: { SPIRIT: 5 }
        })
    });
    const gameState = new GameState();
    gameState.addPlayer(first);
    gameState.addPlayer(second);
    gameState.prepared = true;
    gameState.started = true;
    gameState.status = GameStatusTypes.IN_PROGRESS;
    gameState.phase = GamePhaseTypes.MAIN;
    const transaction = new TransactionManager();
    const zoneManager = new ZoneManager();
    const actionLog = new ActionLog();
    const selectionManager = new SelectionManager(gameState, actionLog);
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
    const gameEngine = new GameEngine({ effectResolver, zoneManager });
    const context = {
        gameState,
        transaction,
        actionLog,
        selectionManager,
        gameEngine
    };
    return { context, gameEngine, first, second };
}

const twoTargetEffects = new CardDefinition({
    id: "TWO_TARGET_EFFECTS",
    name: "二段指示",
    type: CardTypes.EVENT,
    resolutionZone: ZoneTypes.GRAVEYARD,
    effects: [0, 1].map(() => ({
        trigger: TriggerTypes.PLAY,
        condition: { type: ConditionTypes.ALWAYS },
        target: { type: TargetTypes.PLAYER, amount: 1 },
        commands: [{ type: CommandTypes.LOSE_MP, amount: 1 }]
    }))
});
const effectCard = card(twoTargetEffects, ZoneTypes.HAND);
const playerTarget = createContext(effectCard);
const firstRequestResult = playerTarget.gameEngine.playCard({
    gameContext: playerTarget.context,
    player: playerTarget.first,
    card: effectCard
});
assert.equal(firstRequestResult.reason, "TARGET_SELECTION_REQUIRED");
assert.deepEqual(
    firstRequestResult.selectionRequest.candidates.map(item => item.id),
    [1, 2]
);
assert.equal(playerTarget.first.zones.hand.contains(effectCard), true);
assert.equal(playerTarget.first.adventurer.mpSpent, 0);
assert.equal(playerTarget.second.adventurer.mpSpent, 0);

const firstResolution =
    playerTarget.gameEngine.resolvePendingSelection({
        gameContext: playerTarget.context,
        requestId: firstRequestResult.selectionRequest.id,
        player: playerTarget.first,
        selectedIds: [2]
    });
assert.equal(
    firstResolution.actionResult.reason,
    "TARGET_SELECTION_REQUIRED"
);
const secondRequest =
    playerTarget.context.gameState.pendingSelections[0];
assert.equal(secondRequest.context.effectIndex, 1);

const secondResolution =
    playerTarget.gameEngine.resolvePendingSelection({
        gameContext: playerTarget.context,
        requestId: secondRequest.id,
        player: playerTarget.first,
        selectedIds: [1]
    });
assert.equal(secondResolution.success, true);
assert.equal(playerTarget.first.adventurer.mpSpent, 1);
assert.equal(playerTarget.second.adventurer.mpSpent, 1);
assert.equal(playerTarget.first.zones.graveyard.contains(effectCard), true);
assert.equal(playerTarget.context.gameState.hasPendingSelection(), false);

const itemDefinition = new CardDefinition({
    id: "TARGETABLE_ITEM",
    name: "対象用アイテム",
    type: CardTypes.ITEM
});
const opponentItem = card(itemDefinition, ZoneTypes.FIELD);
opponentItem.controllerId = 2;
const cardTargetDefinition = new CardDefinition({
    id: "CARD_TARGET_EFFECT",
    name: "物品指定",
    type: CardTypes.EVENT,
    resolutionZone: ZoneTypes.GRAVEYARD,
    effects: [{
        trigger: TriggerTypes.PLAY,
        target: {
            type: TargetTypes.TARGET_CARD,
            amount: 1,
            filter: {
                zones: [ZoneTypes.FIELD],
                controller: "OPPONENT",
                cardTypes: [CardTypes.ITEM]
            }
        },
        commands: []
    }]
});
const cardTargetEffect = card(cardTargetDefinition, ZoneTypes.HAND);
const cardTarget = createContext(cardTargetEffect, [opponentItem]);
const cardRequestResult = cardTarget.gameEngine.playCard({
    gameContext: cardTarget.context,
    player: cardTarget.first,
    card: cardTargetEffect
});
assert.equal(cardRequestResult.selectionRequest.candidates[0].name,
    "対象用アイテム");
const cardResolution = cardTarget.gameEngine.resolvePendingSelection({
    gameContext: cardTarget.context,
    requestId: cardRequestResult.selectionRequest.id,
    player: cardTarget.first,
    selectedIds: [opponentItem.instanceId]
});
assert.equal(cardResolution.success, true);
assert.equal(
    cardResolution.actionResult.effectResults[0].targets[0],
    opponentItem
);

const noTargetEffect = card(cardTargetDefinition, ZoneTypes.HAND);
const noTarget = createContext(noTargetEffect);
const noTargetResult = noTarget.gameEngine.playCard({
    gameContext: noTarget.context,
    player: noTarget.first,
    card: noTargetEffect
});
assert.equal(noTargetResult.reason, "NO_VALID_TARGETS");
assert.equal(noTarget.context.gameState.hasPendingSelection(), false);

const paidTargetDefinition = new CardDefinition({
    id: "PAID_TARGET_EFFECT",
    name: "有償指示",
    type: CardTypes.EVENT,
    cost: 1,
    resolutionZone: ZoneTypes.GRAVEYARD,
    effects: [{
        trigger: TriggerTypes.PLAY,
        target: { type: TargetTypes.OPPONENT, amount: 1 },
        commands: [{ type: CommandTypes.LOSE_MP, amount: 1 }]
    }]
});
const paymentDefinition = new CardDefinition({
    id: "TARGET_PAYMENT",
    name: "対象効果用リソース",
    type: CardTypes.EVENT
});
const paidTargetCard = card(paidTargetDefinition, ZoneTypes.HAND);
const paymentCard = card(paymentDefinition, ZoneTypes.RESOURCE);
const paidTarget = createContext(
    paidTargetCard,
    [],
    [paymentCard]
);
const paymentRequestResult = paidTarget.gameEngine.playCard({
    gameContext: paidTarget.context,
    player: paidTarget.first,
    card: paidTargetCard
});
assert.equal(paymentRequestResult.reason, "RESOURCE_SELECTION_REQUIRED");
const paymentContinuation =
    paidTarget.gameEngine.resolvePendingSelection({
        gameContext: paidTarget.context,
        requestId: paymentRequestResult.selectionRequest.id,
        player: paidTarget.first,
        selectedIds: [paymentCard.instanceId]
    });
assert.equal(paymentContinuation.success, true);
assert.equal(
    paidTarget.context.gameState.pendingSelections[0].type,
    "TARGET"
);
assert.equal(paidTarget.first.zones.resource.contains(paymentCard), true);
const paidTargetRequest =
    paidTarget.context.gameState.pendingSelections[0];
assert.equal(paidTarget.gameEngine.resolvePendingSelection({
    gameContext: paidTarget.context,
    requestId: paidTargetRequest.id,
    player: paidTarget.first,
    selectedIds: [2]
}).success, true);
assert.equal(paidTarget.first.zones.graveyard.contains(paymentCard), true);
assert.equal(paidTarget.second.adventurer.mpSpent, 1);

console.log("Target selection tests: OK");
