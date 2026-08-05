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
import GameStatusTypes from "../constants/GameStatusTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

let nextId = 1;
function card(definition) {
    return new Card(definition, `GROWTH_TEST_${nextId++}`);
}

const traitDefinition = new CardDefinition({
    id: "GROWTH_TRAIT",
    name: "成長の証",
    type: CardTypes.TRAIT,
    cost: 1,
    levelGain: 1,
    resolutionZone: ZoneTypes.FIELD
});
const resourceDefinition = new CardDefinition({
    id: "GROWTH_RESOURCE",
    name: "成長用リソース",
    type: CardTypes.EVENT
});

function createContext({ firstLevel = 1, secondLevel = 1 } = {}) {
    const trait = card(traitDefinition);
    const resource = card(resourceDefinition);
    trait.ownerId = 1;
    trait.zone = ZoneTypes.ADVENTURE_DECK;
    trait.faceUp = false;
    resource.ownerId = 1;
    resource.zone = ZoneTypes.RESOURCE;
    resource.faceUp = false;

    const first = new PlayerState({
        id: 1,
        name: "育成者",
        zones: new PlayerZones({
            adventureDeck: [trait],
            resource: [resource]
        }),
        adventurer: new AdventurerState({ level: firstLevel })
    });
    const second = new PlayerState({
        id: 2,
        name: "対戦相手",
        adventurer: new AdventurerState({ level: secondLevel })
    });
    const gameState = new GameState();
    gameState.addPlayer(first);
    gameState.addPlayer(second);
    gameState.prepared = true;
    gameState.started = true;
    gameState.status = GameStatusTypes.IN_PROGRESS;
    gameState.phase = GamePhaseTypes.GROWTH;

    const transaction = new TransactionManager();
    const actionLog = new ActionLog();
    const selectionManager = new SelectionManager(gameState, actionLog);
    const gameEngine = new GameEngine({
        effectResolver: { execute() {} },
        zoneManager: new ZoneManager()
    });

    return {
        context: {
            gameState,
            transaction,
            actionLog,
            selectionManager,
            gameEngine
        },
        gameEngine,
        gameState,
        first,
        second,
        trait,
        resource
    };
}

const growth = createContext({ firstLevel: 10 });
growth.gameState.phase = GamePhaseTypes.MAIN;
assert.equal(growth.gameEngine.playGrowthCard({
    gameContext: growth.context,
    player: growth.first,
    card: growth.trait,
    resourceCardIds: [growth.resource.instanceId]
}).reason, "NOT_GROWTH_PHASE");

growth.gameState.phase = GamePhaseTypes.GROWTH;
const result = growth.gameEngine.playGrowthCard({
    gameContext: growth.context,
    player: growth.first,
    card: growth.trait,
    resourceCardIds: [growth.resource.instanceId]
});
assert.equal(result.success, true);
assert.equal(result.level, 11);
assert.equal(growth.first.zones.adventureDeck.contains(growth.trait), false);
assert.equal(growth.first.zones.field.contains(growth.trait), true);
assert.equal(growth.trait.faceUp, true);
assert.equal(growth.first.zones.resource.contains(growth.resource), false);
assert.equal(growth.first.zones.deck.contains(growth.resource), true);
assert.equal(growth.first.deckRefreshCount, 1);
assert.equal(growth.gameState.ended, true);
assert.deepEqual(growth.gameState.winnerIds, [1]);
assert.equal(growth.gameState.endReason, "LEVEL_11");
assert.equal(result.victoryResult.draw, false);

const drawGame = createContext({
    firstLevel: 11,
    secondLevel: 11
});
const drawResult = drawGame.gameEngine.checkVictory({
    gameContext: drawGame.context
});
assert.equal(drawResult.ended, true);
assert.equal(drawResult.draw, true);
assert.deepEqual(drawResult.winnerIds, [1, 2]);
assert.equal(drawGame.gameState.endReason, "LEVEL_11_DRAW");

const insufficient = createContext();
insufficient.first.zones.resource.remove(insufficient.resource);
assert.equal(insufficient.gameEngine.playGrowthCard({
    gameContext: insufficient.context,
    player: insufficient.first,
    card: insufficient.trait,
    resourceCardIds: []
}).reason, "CANNOT_PAY_RESOURCE");
assert.equal(insufficient.first.adventurer.level, 1);
assert.equal(
    insufficient.first.zones.adventureDeck.contains(insufficient.trait),
    true
);

console.log("Growth and victory tests: OK");
