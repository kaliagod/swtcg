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
import EquipmentSlotTypes from "../constants/EquipmentSlotTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

let nextId = 1;
function card(definition) {
    return new Card(definition, `QUEST_TEST_${nextId++}`);
}

const fillerDefinition = new CardDefinition({
    id: "QUEST_FILLER",
    name: "補充カード",
    type: CardTypes.EVENT
});
const questDefinition = new CardDefinition({
    id: "COOP_QUEST",
    name: "協力依頼",
    type: CardTypes.QUEST,
    questRequirements: {
        [AbilityTypes.DEXTERITY]: 5
    },
    questDamage: 2,
    questRewardResources: 5
});
const questWeaponDefinition = new CardDefinition({
    id: "QUEST_WEAPON",
    name: "依頼用工具",
    type: CardTypes.EQUIPMENT,
    equipmentSlot: EquipmentSlotTypes.WEAPON,
    statModifiers: {
        [AbilityTypes.DEXTERITY]: 2
    }
});

function makeDeck(size) {
    return Array.from({ length: size }, () => card(fillerDefinition));
}

function createEngineContext(player1, player2) {
    const gameState = new GameState();
    gameState.addPlayer(player1);
    gameState.addPlayer(player2);
    gameState.prepared = true;
    gameState.started = true;
    gameState.status = GameStatusTypes.IN_PROGRESS;
    gameState.phase = GamePhaseTypes.MAIN;
    gameState.turn = 1;

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

function completeQuestPreparation(context, owner, questCard) {
    if (context.gameState.questPhase?.stage !== "SELECT_QUEST") {
        context.gameState.questPhase = {
            stage: "PARTICIPATION",
            activeQuestInstanceId: null,
            resolvableQuestInstanceIds: []
        };
        assert.equal(context.gameEngine.completeQuestParticipation({
            gameContext: context,
            player: owner
        }).success, true);
    }
    const start = context.gameEngine.startQuestPreparation({
        gameContext: context,
        player: owner,
        questCard
    });
    assert.equal(start.success, true);
    for (const playerId of start.playerOrder) {
        assert.equal(
            context.gameEngine.passQuestPreparation({
                gameContext: context,
                player: context.gameState.getPlayer(playerId)
            }).success,
            true
        );
    }
    assert.equal(questCard.questPreparationComplete, true);
}

const questCard = card(questDefinition);
const questWeapon = card(questWeaponDefinition);
questWeapon.zone = ZoneTypes.FIELD;
questWeapon.controllerId = 1;

const issuer = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: makeDeck(10),
        hand: [questCard],
        field: [questWeapon]
    }),
    adventurer: new AdventurerState({
        baseStats: {
            [AbilityTypes.DEXTERITY]: 2,
            [AbilityTypes.VITALITY]: 5
        }
    })
});
const participant = new PlayerState({
    id: 2,
    zones: new PlayerZones({ deck: makeDeck(10) }),
    adventurer: new AdventurerState({
        baseStats: {
            [AbilityTypes.DEXTERITY]: 1,
            [AbilityTypes.VITALITY]: 5
        }
    })
});
const context = createEngineContext(issuer, participant);
context.gameEngine.equipmentManager
    .refreshContinuousModifiers(issuer);

assert.equal(
    issuer.adventurer.getCurrentStat(AbilityTypes.DEXTERITY),
    2
);
assert.equal(
    issuer.adventurer.getQuestStat(AbilityTypes.DEXTERITY),
    4
);

assert.equal(context.gameEngine.playCard({
    gameContext: context,
    player: issuer,
    card: questCard
}).success, true);
assert.deepEqual(questCard.questParticipantIds, []);

context.gameState.phase = GamePhaseTypes.QUEST;
context.gameState.questPhase = {
    stage: "PARTICIPATION",
    activeQuestInstanceId: null,
    resolvableQuestInstanceIds: []
};
assert.equal(context.gameEngine.declareQuestParticipation({
    gameContext: context,
    player: issuer,
    questCard
}).reason, "CANNOT_DECLARE_QUEST_PARTICIPATION");

context.gameState.currentPlayerIndex = 1;
context.gameState.turn = 2;
context.gameState.questPhase.stage = "PARTICIPATION";
const otherParticipation =
    context.gameEngine.declareQuestParticipation({
        gameContext: context,
        player: participant,
        questCard
    });
assert.equal(otherParticipation.success, true);
assert.deepEqual(questCard.questParticipantIds, [2]);
assert.equal(context.gameEngine.declareQuestParticipation({
    gameContext: context,
    player: participant,
    questCard
}).reason, "CANNOT_DECLARE_QUEST_PARTICIPATION");

context.gameState.currentPlayerIndex = 0;
context.gameState.turn = 3;
context.gameState.questPhase.stage = "PARTICIPATION";
const issuerParticipation =
    context.gameEngine.declareQuestParticipation({
        gameContext: context,
        player: issuer,
        questCard
    });
assert.equal(issuerParticipation.success, true);
assert.deepEqual(questCard.questParticipantIds, [2, 1]);

completeQuestPreparation(context, issuer, questCard);

assert.equal(context.gameEngine.advancePhase({
    gameContext: context
}).reason, "QUEST_PROCESS_IN_PROGRESS");

const result = context.gameEngine.resolveQuest({
    gameContext: context,
    player: issuer,
    questCard
});
assert.equal(result.success, true);
assert.equal(result.outcome, "SUCCESS");
assert.equal(result.totals[AbilityTypes.DEXTERITY], 5);
assert.equal(result.rewardPerParticipant, 3);
assert.deepEqual(result.participantIds, [2, 1]);
assert.equal(issuer.adventurer.damage, 2);
assert.equal(participant.adventurer.damage, 2);
assert.equal(issuer.zones.resource.size(), 3);
assert.equal(participant.zones.resource.size(), 3);
assert.equal(issuer.zones.hand.size(), 1);
assert.equal(issuer.zones.deck.size(), 6);
assert.equal(participant.zones.deck.size(), 7);
assert.equal(issuer.zones.graveyard.contains(questCard), true);

// 発注者が参加しなければ自動参加せず、参加者0人の依頼は失敗する。
const failedQuest = card(questDefinition);
const failedIssuer = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: makeDeck(5),
        hand: [failedQuest]
    }),
    adventurer: new AdventurerState({
        baseStats: { [AbilityTypes.VITALITY]: 5 }
    })
});
const failedOpponent = new PlayerState({
    id: 2,
    adventurer: new AdventurerState()
});
const failedContext = createEngineContext(
    failedIssuer,
    failedOpponent
);
failedContext.gameEngine.playCard({
    gameContext: failedContext,
    player: failedIssuer,
    card: failedQuest
});
failedContext.gameState.phase = GamePhaseTypes.QUEST;
failedContext.gameState.turn = 3;
completeQuestPreparation(
    failedContext,
    failedIssuer,
    failedQuest
);
const failedResult = failedContext.gameEngine.resolveQuest({
    gameContext: failedContext,
    player: failedIssuer,
    questCard: failedQuest
});
assert.equal(failedResult.outcome, "FAILURE");
assert.deepEqual(failedResult.participantIds, []);
assert.equal(failedIssuer.adventurer.damage, 0);
assert.equal(failedIssuer.zones.resource.size(), 0);
assert.equal(failedIssuer.zones.hand.size(), 0);
assert.equal(failedIssuer.zones.deck.size(), 5);
assert.equal(failedIssuer.zones.graveyard.contains(failedQuest), true);

// 依頼中の生命補正でダメージを受け、依頼終了後に通常生命で超過を再確認する。
const vitalityQuestDefinition = new CardDefinition({
    id: "VITALITY_QUEST",
    name: "耐久依頼",
    type: CardTypes.QUEST,
    questDamage: 2,
    questRewardResources: 0
});
const vitalityArmorDefinition = new CardDefinition({
    id: "VITALITY_QUEST_ARMOR",
    name: "依頼用防具",
    type: CardTypes.EQUIPMENT,
    equipmentSlot: EquipmentSlotTypes.ARMOR,
    statModifiers: { [AbilityTypes.VITALITY]: 2 }
});
const vitalityQuest = card(vitalityQuestDefinition);
const vitalityArmor = card(vitalityArmorDefinition);
vitalityArmor.zone = ZoneTypes.FIELD;
const vitalityIssuer = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: makeDeck(1),
        hand: [vitalityQuest],
        field: [vitalityArmor]
    }),
    adventurer: new AdventurerState({
        baseStats: { [AbilityTypes.VITALITY]: 1 }
    })
});
const vitalityOpponent = new PlayerState({
    id: 2,
    adventurer: new AdventurerState()
});
const vitalityContext = createEngineContext(
    vitalityIssuer,
    vitalityOpponent
);
vitalityContext.gameEngine.equipmentManager
    .refreshContinuousModifiers(vitalityIssuer);
assert.equal(
    vitalityIssuer.adventurer.getCurrentStat(AbilityTypes.VITALITY),
    1
);
assert.equal(
    vitalityIssuer.adventurer.getQuestStat(AbilityTypes.VITALITY),
    3
);
vitalityContext.gameEngine.playCard({
    gameContext: vitalityContext,
    player: vitalityIssuer,
    card: vitalityQuest
});
vitalityContext.gameState.phase = GamePhaseTypes.QUEST;
vitalityContext.gameState.turn = 3;
vitalityContext.gameState.questPhase = {
    stage: "PARTICIPATION",
    activeQuestInstanceId: null,
    resolvableQuestInstanceIds: []
};
vitalityContext.gameEngine.declareQuestParticipation({
    gameContext: vitalityContext,
    player: vitalityIssuer,
    questCard: vitalityQuest
});
completeQuestPreparation(
    vitalityContext,
    vitalityIssuer,
    vitalityQuest
);
const vitalityResult = vitalityContext.gameEngine.resolveQuest({
    gameContext: vitalityContext,
    player: vitalityIssuer,
    questCard: vitalityQuest
});
assert.equal(vitalityResult.outcome, "SUCCESS");
assert.equal(vitalityIssuer.adventurer.damage, 1);
// 山札が空になったため、依頼書と超過で墓地へ送られた防具は
// 状況起因処理で新しい山札になる。
assert.equal(vitalityIssuer.zones.deck.contains(vitalityArmor), true);
assert.equal(vitalityIssuer.zones.deck.contains(vitalityQuest), true);
assert.equal(vitalityIssuer.zones.graveyard.size(), 0);
assert.equal(vitalityIssuer.deckRefreshCount, 1);
assert.equal(
    vitalityResult.postQuestStateResults[0].result.steps.length,
    1
);

// 依頼中の超過選択後は、依頼攻略を再操作せず自動的に再開する。
const overflowQuestDefinition = new CardDefinition({
    id: "OVERFLOW_CONTINUATION_QUEST",
    name: "超過継続依頼",
    type: CardTypes.QUEST,
    questDamage: 7,
    questRewardResources: 0
});
const overflowQuest = card(overflowQuestDefinition);
const overflowResources = Array.from(
    { length: 3 },
    () => {
        const resource = card(fillerDefinition);
        resource.zone = ZoneTypes.RESOURCE;
        resource.faceUp = false;
        return resource;
    }
);
const overflowIssuer = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: makeDeck(3),
        hand: [overflowQuest],
        resource: overflowResources
    }),
    adventurer: new AdventurerState({
        baseStats: {
            [AbilityTypes.DEXTERITY]: 3,
            [AbilityTypes.VITALITY]: 5
        }
    })
});
const overflowOpponent = new PlayerState({
    id: 2,
    adventurer: new AdventurerState()
});
const overflowContext = createEngineContext(
    overflowIssuer,
    overflowOpponent
);
overflowContext.gameEngine.playCard({
    gameContext: overflowContext,
    player: overflowIssuer,
    card: overflowQuest
});
overflowContext.gameState.phase = GamePhaseTypes.QUEST;
overflowContext.gameState.turn = 3;
overflowContext.gameState.questPhase = {
    stage: "PARTICIPATION",
    activeQuestInstanceId: null,
    resolvableQuestInstanceIds: []
};
overflowContext.gameEngine.declareQuestParticipation({
    gameContext: overflowContext,
    player: overflowIssuer,
    questCard: overflowQuest
});
completeQuestPreparation(
    overflowContext,
    overflowIssuer,
    overflowQuest
);
const pendingOverflowQuest =
    overflowContext.gameEngine.resolveQuest({
        gameContext: overflowContext,
        player: overflowIssuer,
        questCard: overflowQuest
    });
assert.equal(
    pendingOverflowQuest.reason,
    "QUEST_STATE_SELECTION_REQUIRED"
);
const overflowContinuation =
    overflowContext.gameEngine.resolvePendingSelection({
        gameContext: overflowContext,
        requestId:
            pendingOverflowQuest.stateResult.selectionRequest.id,
        player: overflowIssuer,
        selectedIds: overflowResources
            .slice(0, 2)
            .map(resource => resource.instanceId)
    });
assert.equal(overflowContinuation.success, true);
assert.equal(overflowContinuation.actionResult.outcome, "SUCCESS");
assert.equal(
    overflowIssuer.zones.graveyard.contains(overflowQuest),
    true
);
assert.equal(
    overflowContext.gameState.hasPendingSelection(),
    false
);

console.log("Quest rules tests: OK");
