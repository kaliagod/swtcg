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

import CardTypes from "../constants/CardTypes.js";
import AdventureAbilityTypes from "../constants/AdventureAbilityTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ConditionTypes from "../constants/ConditionTypes.js";
import TargetTypes from "../constants/TargetTypes.js";
import CostTypes from "../constants/CostTypes.js";
import CommandTypes from "../constants/CommandTypes.js";

let nextId = 1;
function card(definition, zone = ZoneTypes.FIELD, controllerId = 1) {
    const result = new Card(definition, `ABILITY_TEST_${nextId++}`);
    result.zone = zone;
    result.controllerId = controllerId;
    result.enteredFieldTurn = 1;
    result.faceUp = zone !== ZoneTypes.ADVENTURE_DECK;
    return result;
}

function createEngineContext(players, phase = GamePhaseTypes.QUEST) {
    const gameState = new GameState();
    for (const player of players) {
        gameState.addPlayer(player);
    }
    gameState.prepared = true;
    gameState.started = true;
    gameState.status = GameStatusTypes.IN_PROGRESS;
    gameState.phase = phase;
    gameState.turn = 2;
    if (phase === GamePhaseTypes.QUEST) {
        gameState.questPhase = {
            stage: "PARTICIPATION",
            activeQuestInstanceId: null,
            resolvableQuestInstanceIds: []
        };
    }

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
    const gameEngine = new GameEngine({
        effectResolver,
        zoneManager
    });
    return {
        gameState,
        transaction,
        actionLog,
        selectionManager,
        gameEngine
    };
}

const questDefinition = new CardDefinition({
    id: "ABILITY_QUEST",
    name: "能力テスト依頼",
    type: CardTypes.QUEST,
    questRequirements: {
        [AbilityTypes.DEXTERITY]: 4,
        [AbilityTypes.STRENGTH]: 3
    }
});
const passiveDefinition = new CardDefinition({
    id: "PASSIVE_TRAIT",
    name: "探索者の素養",
    type: CardTypes.TRAIT,
    adventureAbilityType: AdventureAbilityTypes.PASSIVE,
    statModifiers: { [AbilityTypes.DEXTERITY]: 1 },
    grantedTags: ["EXPLORER"]
});
const activeSkillDefinition = new CardDefinition({
    id: "ACTIVE_SKILL",
    name: "渾身",
    type: CardTypes.SKILL,
    adventureAbilityType: AdventureAbilityTypes.ACTIVE,
    activeQuestModifiers: { [AbilityTypes.STRENGTH]: 2 }
});
function magicDefinition(id) {
    return new CardDefinition({
        id,
        name: "同名の精密魔法",
        type: CardTypes.MAGIC,
        effects: [{
            trigger: TriggerTypes.ACTIVATE,
            condition: { type: ConditionTypes.ALWAYS },
            cost: { type: CostTypes.MP, amount: 1 },
            target: { type: TargetTypes.SELF },
            commands: [{
                type: CommandTypes.ADD_QUEST_MODIFIER,
                params: {
                    modifiers: { [AbilityTypes.DEXTERITY]: 2 }
                }
            }]
        }]
    });
}
const healMagicDefinition = new CardDefinition({
    id: "HEAL_MAGIC",
    name: "治癒魔法",
    type: CardTypes.MAGIC,
    effects: [{
        trigger: TriggerTypes.ACTIVATE,
        condition: { type: ConditionTypes.ALWAYS },
        cost: { type: CostTypes.MP, amount: 2 },
        target: { type: TargetTypes.SELF },
        commands: [{ type: CommandTypes.HEAL, amount: 2 }]
    }]
});

const quest = card(questDefinition);
quest.questParticipantIds = [1];
const passive = card(passiveDefinition);
const activeSkill = card(activeSkillDefinition);
const magicA = card(magicDefinition("MAGIC_A"));
const magicB = card(magicDefinition("MAGIC_B"));
const opponentMagic = card(
    magicDefinition("MAGIC_C"),
    ZoneTypes.FIELD,
    2
);
const healMagic = card(healMagicDefinition);
const owner = new PlayerState({
    id: 1,
    name: "能力使用者",
    zones: new PlayerZones({
        field: [quest, passive, activeSkill, magicA, magicB, healMagic]
    }),
    adventurer: new AdventurerState({
        baseStats: {
            [AbilityTypes.DEXTERITY]: 1,
            [AbilityTypes.STRENGTH]: 1,
            [AbilityTypes.VITALITY]: 5,
            [AbilityTypes.SPIRIT]: 5
        },
        damage: 3
    })
});
const opponent = new PlayerState({
    id: 2,
    name: "相手",
    zones: new PlayerZones({ field: [opponentMagic] }),
    adventurer: new AdventurerState({
        baseStats: { [AbilityTypes.SPIRIT]: 2 }
    })
});
const context = createEngineContext([owner, opponent]);

assert.equal(context.gameEngine.completeQuestParticipation({
    gameContext: context,
    player: owner
}).success, true);

context.gameEngine.resolveStateBasedActions({ gameContext: context });
assert.equal(
    owner.adventurer.getCurrentStat(AbilityTypes.DEXTERITY),
    2
);
assert.equal(owner.adventurer.hasTag("EXPLORER"), true);
assert.equal(context.gameEngine.startQuestPreparation({
    gameContext: context,
    player: owner,
    questCard: quest
}).success, true);

assert.equal(context.gameEngine.activateAdventureCard({
    gameContext: context,
    player: owner,
    card: passive
}).reason, "PASSIVE_ABILITY_NOT_ACTIVATABLE");

const skillResult = context.gameEngine.activateAdventureCard({
    gameContext: context,
    player: owner,
    card: activeSkill
});
assert.equal(skillResult.success, true);
assert.equal(activeSkill.faceUp, false);
assert.equal(activeSkill.refreshAtOwnerTurnStart, true);
assert.equal(
    owner.adventurer.getQuestStat(AbilityTypes.STRENGTH),
    3
);

const magicResult = context.gameEngine.activateAdventureCard({
    gameContext: context,
    player: owner,
    card: magicA
});
assert.equal(magicResult.success, true);
assert.equal(magicA.faceUp, true);
assert.equal(owner.adventurer.mpSpent, 1);
assert.equal(
    owner.adventurer.getQuestStat(AbilityTypes.DEXTERITY),
    4
);
assert.equal(context.gameEngine.activateAdventureCard({
    gameContext: context,
    player: owner,
    card: magicB
}).reason, "SAME_NAME_MAGIC_ALREADY_USED");
assert.equal(owner.adventurer.mpSpent, 1);

assert.equal(context.gameEngine.activateAdventureCard({
    gameContext: context,
    player: owner,
    card: healMagic
}).success, true);
assert.equal(owner.adventurer.damage, 1);
assert.equal(owner.adventurer.mpSpent, 3);
assert.equal(healMagic.faceUp, true);

context.gameEngine.passQuestPreparation({
    gameContext: context,
    player: owner
});
assert.equal(context.gameEngine.activateAdventureCard({
    gameContext: context,
    player: opponent,
    card: opponentMagic
}).success, true);
context.gameEngine.passQuestPreparation({
    gameContext: context,
    player: opponent
});
const questResult = context.gameEngine.resolveQuest({
    gameContext: context,
    player: owner,
    questCard: quest
});
assert.equal(questResult.success, true);
assert.equal(questResult.outcome, "SUCCESS");
assert.equal(
    owner.adventurer.getTemporaryQuestModifiers()[AbilityTypes.DEXTERITY],
    0
);
assert.equal(
    owner.adventurer.getQuestStat(AbilityTypes.DEXTERITY),
    2
);
assert.equal(
    owner.adventurer.getQuestStat(AbilityTypes.STRENGTH),
    1
);

context.gameState.phase = GamePhaseTypes.TURN_START;
context.gameState.currentPlayerIndex = 0;
context.gameEngine.advancePhase({ gameContext: context });
assert.equal(activeSkill.faceUp, true);
assert.equal(activeSkill.refreshAtOwnerTurnStart, false);

// パッシブカードは生命超過で墓地へ送れる候補にはならない。
const overflowState = context.gameEngine.damageOverflowManager.getState(owner);
assert.equal(overflowState.candidates.includes(passive), false);
assert.equal(overflowState.candidates.includes(activeSkill), false);
assert.equal(overflowState.candidates.includes(magicA), false);

console.log("Adventure ability tests: OK");
