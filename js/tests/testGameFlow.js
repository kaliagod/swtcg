import Logger from "../services/Logger.js";
import EventBus from "../services/EventBus.js";
import TransactionManager from "../services/TransactionManager.js";
import ZoneManager from "../services/ZoneManager.js";
import ActionLog from "../services/ActionLog.js";
import SelectionManager from "../services/SelectionManager.js";

import GameContext from "../context/GameContext.js";
import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import CardDefinition from "../models/CardDefinition.js";
import Card from "../models/Card.js";

import ConditionEngine from "../engines/ConditionEngine.js";
import TargetEngine from "../engines/TargetEngine.js";
import CostEngine from "../engines/CostEngine.js";
import CommandExecutor from "../engines/CommandExecutor.js";
import EffectResolver from "../engines/EffectResolver.js";
import GameEngine from "../engines/GameEngine.js";

import AbilityTypes from "../constants/AbilityTypes.js";
import CardTypes from "../constants/CardTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import ConditionTypes from "../constants/ConditionTypes.js";
import CostTypes from "../constants/CostTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import SelectionTypes from "../constants/SelectionTypes.js";
import TargetTypes from "../constants/TargetTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

console.log("=== Game Flow Test ===");

const eventDefinition =
    new CardDefinition({
        id: "EVT_DRAW_2",
        name: "旅支度",
        type: CardTypes.EVENT,
        resolutionZone: ZoneTypes.GRAVEYARD,
        text: ["カードを2枚引く。"],
        effects: [
            {
                trigger: TriggerTypes.PLAY,
                condition: {
                    type: ConditionTypes.ALWAYS
                },
                target: {
                    type: TargetTypes.SELF
                },
                commands: [
                    {
                        type: CommandTypes.DRAW,
                        amount: 2
                    }
                ]
            }
        ]
    });

const questDefinition =
    new CardDefinition({
        id: "QST_TEST",
        name: "薬草採取",
        type: CardTypes.QUEST,
        text: ["テスト用の依頼書。"]
    });

const fillerDefinition =
    new CardDefinition({
        id: "ITM_TEST",
        name: "保存食",
        type: CardTypes.ITEM,
        text: ["テスト用カード。"]
    });

const additionalMainDefinitions =
    Array.from(
        { length: 7 },
        (_, index) => new CardDefinition({
            id: `FILLER_${index + 1}`,
            name: `予備カード${index + 1}`,
            type: CardTypes.ITEM
        })
    );

const adventurerDefinition = new CardDefinition({
    id: "ADV_TEST",
    name: "テスト冒険者",
    type: CardTypes.ADVENTURER,
    baseStats: {
        DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
        VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
    }
});

const traitDefinitions =
    Array.from(
        { length: 4 },
        (_, index) => new CardDefinition({
            id: `TRAIT_${index + 1}`,
            name: `特性${index + 1}`,
            type: CardTypes.TRAIT
        })
    );

const expensiveEventDefinition =
    new CardDefinition({
        id: "EVT_EXPENSIVE",
        name: "大魔法の準備",
        type: CardTypes.EVENT,
        resolutionZone: ZoneTypes.GRAVEYARD,
        effects: [
            {
                trigger: TriggerTypes.PLAY,
                cost: {
                    type: CostTypes.MP,
                    amount: 10
                },
                commands: [
                    {
                        type: CommandTypes.DRAW,
                        amount: 1
                    }
                ]
            }
        ]
    });

function buildDeck() {
    const definitions = [
        fillerDefinition,
        questDefinition,
        ...additionalMainDefinitions,
        eventDefinition
    ];

    return definitions.flatMap(definition =>
        Array.from(
            { length: 4 },
            () => new Card(definition)
        )
    );
}

function buildAdventureDeck() {
    return [
        new Card(adventurerDefinition),
        ...traitDefinitions.flatMap(
            (definition, index) =>
                Array.from(
                    { length: index === 3 ? 2 : 4 },
                    () => new Card(definition)
                )
        )
    ];
}

function buildPlayer(id, agility) {
    return new PlayerState({
        id,
        zones: new PlayerZones({
            deck: buildDeck(),
            adventureDeck: buildAdventureDeck()
        }),
        adventurer: new AdventurerState({
            baseStats: {
                [AbilityTypes.AGILITY]: agility,
                [AbilityTypes.VITALITY]: 5,
                [AbilityTypes.SPIRIT]: 5
            }
        })
    });
}

const gameState = new GameState();
const player1 = buildPlayer(1, 4);
const player2 = buildPlayer(2, 3);
gameState.addPlayer(player1);
gameState.addPlayer(player2);
const actionLog = new ActionLog();
const selectionManager = new SelectionManager(
    gameState,
    actionLog
);

const zoneManager = new ZoneManager();
const transactionManager = new TransactionManager();
const commandExecutor = new CommandExecutor(
    zoneManager,
    transactionManager
);
const effectResolver = new EffectResolver({
    conditionEngine: new ConditionEngine(),
    targetEngine: new TargetEngine(),
    costEngine: new CostEngine(),
    commandExecutor,
    transactionManager
});
const gameEngine = new GameEngine({
    effectResolver,
    zoneManager
});
const gameContext = new GameContext({
    logger: new Logger(),
    eventBus: new EventBus(),
    random: {
        shuffle(array) {
            return [...array];
        }
    },
    transaction: transactionManager,
    gameState,
    actionLog,
    selectionManager
});

const prepareResult = gameEngine.prepareGame({
    gameContext
});

gameEngine.beginFirstTurn({ gameContext });
gameEngine.advancePhase({ gameContext });
gameEngine.advancePhase({ gameContext });
gameEngine.advancePhase({ gameContext });

const eventCard =
    player1.zones.hand.cards.find(
        card => card.definition.type === CardTypes.EVENT
    );

const blockingSelection = selectionManager.request({
    type: SelectionTypes.TARGET,
    playerId: player1.id,
    candidates: [{ id: "ACK" }],
    min: 1,
    max: 1
});
const blockedPhaseResult = gameEngine.advancePhase({
    gameContext
});
const blockedPlayResult = gameEngine.playCard({
    gameContext,
    player: player1,
    card: eventCard
});
selectionManager.resolve({
    requestId: blockingSelection.id,
    playerId: player1.id,
    selectedIds: ["ACK"]
});

const playResult = gameEngine.playCard({
    gameContext,
    player: player1,
    card: eventCard
});

const expensiveCard =
    new Card(expensiveEventDefinition);

player1.zones.hand.add(expensiveCard);

const failedPlayResult = gameEngine.playCard({
    gameContext,
    player: player1,
    card: expensiveCard
});

if (
    !prepareResult.success ||
    prepareResult.firstPlayerId !== 1 ||
    gameState.phase !== GamePhaseTypes.MAIN ||
    blockedPhaseResult.success ||
    blockedPhaseResult.reason !== "PENDING_SELECTION" ||
    blockedPlayResult.success ||
    blockedPlayResult.reason !== "PENDING_SELECTION" ||
    !playResult.success ||
    failedPlayResult.success ||
    failedPlayResult.reason !== "CANNOT_PAY_COST" ||
    !player1.zones.hand.contains(expensiveCard) ||
    player1.adventurer.mpSpent !== 0 ||
    player1.zones.hand.size() !== 8 ||
    player1.zones.deck.size() !== 29 ||
    player1.zones.adventureDeck.size() !== 14 ||
    player1.adventurer.card.definition.type !==
        CardTypes.ADVENTURER ||
    player1.zones.resource.size() !== 3 ||
    player1.zones.graveyard.size() !== 1
) {
    throw new Error(
        "Game Flow Test: 縦切りゲーム進行の結果が期待値と一致しません。"
    );
}

console.log("First Player:", prepareResult.firstPlayerId);
console.log("Phase:", gameState.phase);
console.log("Hand:", player1.zones.hand.size());
console.log("Deck:", player1.zones.deck.size());
console.log("Resource:", player1.zones.resource.size());
console.log("Graveyard:", player1.zones.graveyard.size());
