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
import GameStateSerializer from "../services/GameStateSerializer.js";

import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import CardDefinition from "../models/CardDefinition.js";
import Card from "../models/Card.js";

import AbilityTypes from "../constants/AbilityTypes.js";
import CardTypes from "../constants/CardTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import ConditionTypes from "../constants/ConditionTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import ItemUseTypes from "../constants/ItemUseTypes.js";
import SelectionTypes from "../constants/SelectionTypes.js";
import StatusDurations from "../constants/StatusDurations.js";
import TargetTypes from "../constants/TargetTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

let nextId = 1;
function makeCard(definition, zone, ownerId = 1) {
    const card = new Card(definition, `TRIGGER_${nextId++}`);
    card.ownerId = ownerId;
    card.controllerId = zone === ZoneTypes.FIELD ? ownerId : null;
    card.zone = zone;
    return card;
}

function effect(trigger, target, commands) {
    return {
        trigger,
        condition: { type: ConditionTypes.ALWAYS },
        target,
        commands
    };
}

const triggeredItem = makeCard(new CardDefinition({
    id: "TRIGGERED_ITEM",
    name: "誘発試験具",
    type: CardTypes.ITEM,
    itemUse: ItemUseTypes.GRAVEYARD,
    effects: [
        effect(
            TriggerTypes.ENTER,
            { type: TargetTypes.PLAYER, amount: 1 },
            [{
                type: CommandTypes.ADD_STATUS,
                status: "MARKED",
                params: { duration: StatusDurations.PERMANENT }
            }]
        ),
        effect(
            TriggerTypes.LEAVE,
            { type: TargetTypes.SELF },
            [{
                type: CommandTypes.ADD_STATUS,
                status: "ITEM_LEFT",
                params: { duration: StatusDurations.PERMANENT }
            }]
        )
    ]
}), ZoneTypes.HAND);

const turnCard = makeCard(new CardDefinition({
    id: "TURN_TRIGGER",
    name: "ターン誘発",
    type: CardTypes.TRAIT,
    effects: [
        effect(
            TriggerTypes.TURN_START,
            { type: TargetTypes.SELF },
            [{
                type: CommandTypes.ADD_STATUS,
                status: "THIS_TURN",
                params: { duration: StatusDurations.TURN }
            }]
        ),
        effect(
            TriggerTypes.TURN_END,
            { type: TargetTypes.SELF_CARD },
            [{
                type: CommandTypes.ADD_COUNTER,
                amount: 1,
                params: { counter: "END_COUNT" }
            }]
        )
    ]
}), ZoneTypes.FIELD);

const player1 = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        hand: [triggeredItem],
        field: [turnCard]
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
    adventurer: new AdventurerState({
        baseStats: {
            [AbilityTypes.SPIRIT]: 5,
            [AbilityTypes.VITALITY]: 5
        }
    })
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
const selectionManager = new SelectionManager(gameState);
const commandExecutor = new CommandExecutor(zoneManager, transaction);
const effectResolver = new EffectResolver({
    conditionEngine: new ConditionEngine(),
    targetEngine: new TargetEngine(),
    costEngine: new CostEngine(),
    commandExecutor,
    transactionManager: transaction
});
const gameEngine = new GameEngine({ effectResolver, zoneManager });
const gameContext = {
    gameState,
    transaction,
    selectionManager,
    gameEngine
};

const playResult = gameEngine.playCard({
    gameContext,
    player: player1,
    card: triggeredItem,
    resourceCardIds: []
});
assert.equal(playResult.success, true);
assert.equal(playResult.triggerResolution.completed, false);
assert.equal(
    playResult.triggerResolution.selectionRequest.type,
    SelectionTypes.TARGET
);
const enterResolution = gameEngine.resolvePendingSelection({
    gameContext,
    requestId: playResult.triggerResolution.selectionRequest.id,
    player: player1,
    selectedIds: [player2.id]
});
assert.equal(enterResolution.success, true);
assert.deepEqual(
    player2.adventurer.statuses.map(status => status.name),
    ["MARKED"]
);
const serialized = new GameStateSerializer().serialize(
    gameState,
    { viewerPlayerId: player2.id }
);
assert.deepEqual(
    serialized.players.find(player => player.id === player2.id)
        .adventurer.statuses.map(status => status.name),
    ["MARKED"]
);

const leaveResult = gameEngine.activateCard({
    gameContext,
    player: player1,
    card: triggeredItem
});
assert.equal(leaveResult.success, true);
assert.equal(leaveResult.triggerResolution.completed, true);
assert.equal(
    player1.adventurer.statuses.some(
        status => status.name === "ITEM_LEFT"
    ),
    true
);

gameState.phase = GamePhaseTypes.TURN_START;
const startResult = gameEngine.advancePhase({ gameContext });
assert.equal(startResult.success, true);
assert.equal(gameState.phase, GamePhaseTypes.DRAW);
assert.equal(
    player1.adventurer.statuses.some(
        status => status.name === "THIS_TURN"
    ),
    true
);

gameState.phase = GamePhaseTypes.TURN_END;
const endResult = gameEngine.advancePhase({ gameContext });
assert.equal(endResult.success, true);
assert.equal(turnCard.counters.END_COUNT, 1);
assert.equal(
    player1.adventurer.statuses.some(
        status => status.name === "THIS_TURN"
    ),
    false
);
assert.equal(gameState.getCurrentPlayer(), player2);
assert.equal(gameState.phase, GamePhaseTypes.TURN_START);

gameState.questPhase = {
    stage: "RESOLUTION",
    activeQuestInstanceId: "QUEST_FOR_STATUS",
    resolvableQuestInstanceIds: []
};
const questStatusResult = commandExecutor.execute({
    type: CommandTypes.ADD_STATUS,
    status: "QUEST_ONLY"
}, {
    player: player2,
    targets: [player2],
    sourceCard: turnCard,
    gameContext
});
assert.equal(questStatusResult.amount, 1);
assert.equal(
    player2.adventurer.statuses.at(-1).duration,
    StatusDurations.QUEST
);
gameEngine._expireQuestStatuses(gameContext, "QUEST_FOR_STATUS");
assert.equal(
    player2.adventurer.statuses.some(
        status => status.name === "QUEST_ONLY"
    ),
    false
);

const removeResult = commandExecutor.execute({
    type: CommandTypes.REMOVE_STATUS,
    status: "MARKED"
}, {
    player: player2,
    targets: [player2],
    sourceCard: turnCard,
    gameContext
});
assert.equal(removeResult.amount, 1);
assert.equal(player2.adventurer.statuses.length, 0);

function makeOrderedTriggerCard(ownerId, prefix) {
    return makeCard(new CardDefinition({
        id: `${prefix}_ORDER_TRIGGER`,
        name: `${prefix} order trigger`,
        type: CardTypes.TRAIT,
        effects: [
            effect(
                TriggerTypes.TURN_START,
                { type: TargetTypes.ALL_PLAYERS },
                [{
                    type: CommandTypes.ADD_STATUS,
                    status: `${prefix}_FIRST`,
                    params: { duration: StatusDurations.PERMANENT }
                }]
            ),
            effect(
                TriggerTypes.TURN_START,
                { type: TargetTypes.ALL_PLAYERS },
                [{
                    type: CommandTypes.ADD_STATUS,
                    status: `${prefix}_SECOND`,
                    params: { duration: StatusDurations.PERMANENT }
                }]
            )
        ]
    }), ZoneTypes.FIELD, ownerId);
}

const player1OrderCard = makeOrderedTriggerCard(1, "P1");
const player2OrderCard = makeOrderedTriggerCard(2, "P2");
player1.zones.field.add(player1OrderCard);
player2.zones.field.add(player2OrderCard);
gameState.currentPlayerIndex = 0;

const simultaneousBatchId =
    `TRIGGER_BATCH_${gameState.nextTriggerBatchId++}`;
gameEngine._enqueueCardTrigger({
    gameContext,
    card: player2OrderCard,
    controllerId: player2.id,
    trigger: TriggerTypes.TURN_START,
    batchId: simultaneousBatchId,
    turnPlayerId: player1.id
});
gameEngine._enqueueCardTrigger({
    gameContext,
    card: player1OrderCard,
    controllerId: player1.id,
    trigger: TriggerTypes.TURN_START,
    batchId: simultaneousBatchId,
    turnPlayerId: player1.id
});

const simultaneousStart = gameEngine._flushTriggeredEffects(gameContext);
assert.equal(simultaneousStart.completed, false);
assert.equal(
    simultaneousStart.selectionRequest.type,
    SelectionTypes.EFFECT_ORDER
);
assert.equal(simultaneousStart.selectionRequest.playerId, player1.id);

const player1OrderResolution = gameEngine.resolvePendingSelection({
    gameContext,
    requestId: simultaneousStart.selectionRequest.id,
    player: player1,
    selectedIds: simultaneousStart.selectionRequest.candidates
        .toReversed()
        .map(candidate => candidate.id)
});
assert.equal(player1OrderResolution.success, true);
assert.equal(
    player1OrderResolution.actionResult.selectionRequest.playerId,
    player2.id
);

const player2OrderRequest =
    player1OrderResolution.actionResult.selectionRequest;
const player2OrderResolution = gameEngine.resolvePendingSelection({
    gameContext,
    requestId: player2OrderRequest.id,
    player: player2,
    selectedIds: player2OrderRequest.candidates
        .toReversed()
        .map(candidate => candidate.id)
});
assert.equal(player2OrderResolution.success, true);
assert.equal(player2OrderResolution.actionResult.completed, true);
assert.deepEqual(
    player1.adventurer.statuses.slice(-4).map(status => status.name),
    ["P1_SECOND", "P1_FIRST", "P2_SECOND", "P2_FIRST"]
);
assert.deepEqual(
    player2.adventurer.statuses.slice(-4).map(status => status.name),
    ["P1_SECOND", "P1_FIRST", "P2_SECOND", "P2_FIRST"]
);

const refreshingTurnCard = makeCard(new CardDefinition({
    id: "REFRESH_AFTER_TRIGGER",
    name: "Refresh after trigger",
    type: CardTypes.SKILL,
    effects: [
        effect(
            TriggerTypes.TURN_START,
            { type: TargetTypes.SELF },
            [{
                type: CommandTypes.ADD_STATUS,
                status: "REFRESHED_CARD_TRIGGERED",
                params: { duration: StatusDurations.PERMANENT }
            }]
        )
    ]
}), ZoneTypes.FIELD, player1.id);
refreshingTurnCard.faceUp = false;
refreshingTurnCard.refreshAtOwnerTurnStart = true;
player1.zones.field.add(refreshingTurnCard);
player1.adventurer.addDamage(5);
player1.adventurer.spendMp(3);
gameState.currentPlayerIndex = 0;
gameState.phase = GamePhaseTypes.TURN_START;

const orderedTurnStart = gameEngine.advancePhase({ gameContext });
assert.equal(orderedTurnStart.success, true);
assert.equal(gameState.phase, GamePhaseTypes.TURN_START);
assert.equal(
    orderedTurnStart.triggerResolution.selectionRequest.type,
    SelectionTypes.EFFECT_ORDER
);
assert.equal(player1.adventurer.damage, 5);
assert.equal(player1.adventurer.mpSpent, 3);
assert.equal(refreshingTurnCard.faceUp, false);

const orderedTurnStartResolution =
    gameEngine.resolvePendingSelection({
        gameContext,
        requestId:
            orderedTurnStart.triggerResolution.selectionRequest.id,
        player: player1,
        selectedIds:
            orderedTurnStart.triggerResolution.selectionRequest
                .candidates.map(candidate => candidate.id)
    });
assert.equal(orderedTurnStartResolution.success, true);
assert.equal(
    orderedTurnStartResolution.actionResult.completed,
    true
);
assert.equal(gameState.phase, GamePhaseTypes.DRAW);
assert.equal(player1.adventurer.damage, 2);
assert.equal(player1.adventurer.mpSpent, 0);
assert.equal(refreshingTurnCard.faceUp, true);
assert.equal(refreshingTurnCard.refreshAtOwnerTurnStart, false);
assert.equal(
    player1.adventurer.statuses.some(
        status => status.name === "REFRESHED_CARD_TRIGGERED"
    ),
    false
);

console.log("Trigger and status effect tests: OK");
