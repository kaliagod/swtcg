import assert from "node:assert/strict";

import GameEngine from "../engines/GameEngine.js";
import ZoneManager from "../services/ZoneManager.js";
import TransactionManager from "../services/TransactionManager.js";
import SelectionManager from "../services/SelectionManager.js";
import ActionLog from "../services/ActionLog.js";
import RandomService from "../services/RandomService.js";
import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import CardDefinition from "../models/CardDefinition.js";
import Card from "../models/Card.js";

import CardTypes from "../constants/CardTypes.js";
import GameStatusTypes from "../constants/GameStatusTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ConditionTypes from "../constants/ConditionTypes.js";
import TargetTypes from "../constants/TargetTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";

let nextId = 1;
function card(definition, zone = null) {
    const result = new Card(definition, `REFRESH_TEST_${nextId++}`);
    result.zone = zone;
    return result;
}

const fillerDefinition = new CardDefinition({
    id: "REFRESH_FILLER",
    name: "再構築カード",
    type: CardTypes.EVENT
});
const drawEventDefinition = new CardDefinition({
    id: "REFRESH_DRAW_EVENT",
    name: "限界まで引く",
    type: CardTypes.EVENT,
    resolutionZone: ZoneTypes.GRAVEYARD,
    effects: [{
        trigger: TriggerTypes.PLAY,
        condition: { type: ConditionTypes.ALWAYS },
        target: { type: TargetTypes.SELF },
        commands: [{ type: CommandTypes.DRAW, amount: 2 }]
    }]
});
const plainEventDefinition = new CardDefinition({
    id: "REFRESH_PLAIN_EVENT",
    name: "墓地を作るイベント",
    type: CardTypes.EVENT,
    resolutionZone: ZoneTypes.GRAVEYARD
});

function createContext({
    deck = [],
    hand = [],
    graveyard = [],
    resource = [],
    phase = GamePhaseTypes.MAIN,
    adventurer = new AdventurerState()
} = {}) {
    const player = new PlayerState({
        id: 1,
        name: "再構築者",
        zones: new PlayerZones({
            deck,
            hand,
            graveyard,
            resource
        }),
        adventurer
    });
    const opponent = new PlayerState({
        id: 2,
        name: "対戦相手",
        adventurer: new AdventurerState()
    });
    const gameState = new GameState();
    gameState.addPlayer(player);
    gameState.addPlayer(opponent);
    gameState.prepared = true;
    gameState.started = true;
    gameState.status = GameStatusTypes.IN_PROGRESS;
    gameState.phase = phase;

    const zoneManager = new ZoneManager();
    const transaction = new TransactionManager();
    const actionLog = new ActionLog();
    const selectionManager = new SelectionManager(gameState, actionLog);
    const effectResolver = {
        execute(context) {
            return zoneManager.draw({
                deck: context.player.zones.deck,
                hand: context.player.zones.hand,
                amount: context.effect.commands[0]?.amount ?? 0
            });
        }
    };
    const gameEngine = new GameEngine({
        effectResolver,
        zoneManager
    });
    const context = {
        gameState,
        transaction,
        actionLog,
        selectionManager,
        random: new RandomService({ seed: 12345 }),
        gameEngine
    };
    return { context, gameEngine, gameState, player, opponent };
}

// ドローフェイズ開始時に山札が空なら、再構築してもカードは引かない。
const emptyAtDrawGrave = [
    card(fillerDefinition, ZoneTypes.GRAVEYARD),
    card(fillerDefinition, ZoneTypes.GRAVEYARD)
];
const emptyAtDraw = createContext({
    graveyard: emptyAtDrawGrave,
    phase: GamePhaseTypes.DRAW
});
const drawPhaseResult = emptyAtDraw.gameEngine.advancePhase({
    gameContext: emptyAtDraw.context
});
assert.equal(drawPhaseResult.success, true);
assert.equal(drawPhaseResult.phase, GamePhaseTypes.GROWTH);
assert.equal(drawPhaseResult.drawResult.movedAmount, 0);
assert.equal(
    drawPhaseResult.drawResult.reason,
    "DECK_REFRESHED_DRAW_ENDED"
);
assert.equal(emptyAtDraw.player.zones.hand.size(), 0);
assert.equal(emptyAtDraw.player.zones.deck.size(), 2);
assert.equal(emptyAtDraw.player.zones.graveyard.size(), 0);
assert.equal(emptyAtDraw.player.deckRefreshCount, 1);

// 最後の1枚を通常ドローした場合、そのカードは手札へ移り、既存の墓地で再構築する。
const finalDrawCard = card(fillerDefinition, ZoneTypes.DECK);
const priorGraveCards = [
    card(fillerDefinition, ZoneTypes.GRAVEYARD),
    card(fillerDefinition, ZoneTypes.GRAVEYARD)
];
const finalNormalDraw = createContext({
    deck: [finalDrawCard],
    graveyard: priorGraveCards,
    phase: GamePhaseTypes.DRAW
});
const finalDrawResult = finalNormalDraw.gameEngine.advancePhase({
    gameContext: finalNormalDraw.context
});
assert.equal(finalDrawResult.drawResult.movedAmount, 1);
assert.equal(finalNormalDraw.player.zones.hand.contains(finalDrawCard), true);
assert.equal(finalNormalDraw.player.zones.deck.size(), 2);
assert.equal(finalNormalDraw.player.deckRefreshCount, 1);

// 効果中は空のまま可能な限り引き、効果元が墓地へ移った後にまとめて再構築する。
const effectSource = card(drawEventDefinition, ZoneTypes.HAND);
const onlyDeckCard = card(fillerDefinition, ZoneTypes.DECK);
const oldGraveCard = card(fillerDefinition, ZoneTypes.GRAVEYARD);
const effectDraw = createContext({
    deck: [onlyDeckCard],
    hand: [effectSource],
    graveyard: [oldGraveCard]
});
const effectResult = effectDraw.gameEngine.playCard({
    gameContext: effectDraw.context,
    player: effectDraw.player,
    card: effectSource
});
assert.equal(effectResult.success, true);
assert.equal(effectDraw.player.zones.hand.contains(onlyDeckCard), true);
assert.equal(effectDraw.player.zones.deck.size(), 2);
assert.equal(effectDraw.player.zones.deck.contains(effectSource), true);
assert.equal(effectDraw.player.zones.deck.contains(oldGraveCard), true);
assert.equal(effectDraw.player.zones.graveyard.size(), 0);
assert.equal(effectResult.stateBasedActionResult.refreshResults.length, 1);
assert.equal(effectResult.committed, true);
assert.equal(effectResult.postProcessingResult.completed, true);

// 山札・墓地が空でも、その後の行動で墓地が作られれば直ちに再構築する。
const plainEvent = card(plainEventDefinition, ZoneTypes.HAND);
const delayedRefresh = createContext({ hand: [plainEvent] });
const delayedResult = delayedRefresh.gameEngine.playCard({
    gameContext: delayedRefresh.context,
    player: delayedRefresh.player,
    card: plainEvent
});
assert.equal(delayedResult.success, true);
assert.equal(delayedRefresh.player.zones.deck.contains(plainEvent), true);
assert.equal(delayedRefresh.player.zones.graveyard.size(), 0);
assert.equal(delayedRefresh.player.deckRefreshCount, 1);

// 超過処理で墓地が作られた場合も、次の状況起因処理パスで再構築する。
const overflowResource = card(fillerDefinition, ZoneTypes.RESOURCE);
const chainedState = createContext({
    resource: [overflowResource],
    adventurer: new AdventurerState({
        baseStats: { [AbilityTypes.VITALITY]: 0 },
        damage: 1
    })
});
const chainedResult = chainedState.gameEngine.resolveStateBasedActions({
    gameContext: chainedState.context
});
assert.equal(chainedResult.success, true);
assert.equal(chainedResult.stable, true);
assert.equal(chainedResult.passes >= 2, true);
assert.equal(chainedState.player.adventurer.damage, 0);
assert.equal(chainedState.player.zones.deck.contains(overflowResource), true);
assert.equal(chainedState.player.deckRefreshCount, 1);

const refreshLogs = effectDraw.context.actionLog.getRecords()
    .filter(record => record.type === "DECK_REFRESHED");
assert.equal(refreshLogs.length, 1);
assert.equal(refreshLogs[0].payload.cardCount, 2);

// 状況起因処理が安定しない場合は例外ではなく診断付き結果を返す。
const loopingState = createContext();
loopingState.gameEngine.adventureAbilityManager.refreshPassiveState =
    () => ({ changed: true });
const loopLimitResult =
    loopingState.gameEngine.resolveStateBasedActions({
        gameContext: loopingState.context
    });
assert.equal(loopLimitResult.success, false);
assert.equal(loopLimitResult.stable, false);
assert.equal(
    loopLimitResult.reason,
    "STATE_BASED_ACTION_LOOP_LIMIT"
);
assert.equal(loopLimitResult.passes, 20);
assert.equal(
    loopLimitResult.diagnostics.passDiagnostics.length,
    20
);

console.log("Deck refresh and state-based action tests: OK");
