/**
 * GameBootstrap.js
 * ゲーム開始処理
 */

import Logger from "../services/Logger.js";
import EventBus from "../services/EventBus.js";
import RandomService from "../services/RandomService.js";
import TransactionManager from "../services/TransactionManager.js";

import GameContext from "../context/GameContext.js";

import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";

import CardDatabase from "../database/CardDatabase.js";
import CardFactory from "../factories/CardFactory.js";
import DeckBuilder from "../builders/DeckBuilder.js";

import GameDataLoader from "../loaders/GameDataLoader.js";
import ZoneManager from "../services/ZoneManager.js";
import ConditionEngine from "../engines/ConditionEngine.js";
import TargetEngine from "../engines/TargetEngine.js";
import CostEngine from "../engines/CostEngine.js";
import CommandExecutor from "../engines/CommandExecutor.js";
import EffectResolver from "../engines/EffectResolver.js";
import GameEngine from "../engines/GameEngine.js";
import CardTypes from "../constants/CardTypes.js";
import ActionLog from "../services/ActionLog.js";
import SelectionManager from "../services/SelectionManager.js";
import GameStateSerializer from "../services/GameStateSerializer.js";
import DeckValidator from "../services/DeckValidator.js";
import EquipmentManager from "../services/EquipmentManager.js";
import DamageOverflowManager from "../services/DamageOverflowManager.js";
import QuestManager from "../services/QuestManager.js";
import DeckRefreshManager from "../services/DeckRefreshManager.js";
import AdventureAbilityManager from "../services/AdventureAbilityManager.js";
import AdventurerRequirementEvaluator from "../services/AdventurerRequirementEvaluator.js";
import GameCommandGateway from "../services/GameCommandGateway.js";
import GameEngineServiceFactory from
    "../services/GameEngineServiceFactory.js";
import StatusManager from "../services/StatusManager.js";

export default class GameBootstrap {

    async createGame({
        player1DeckList = null,
        player1AdventureDeckList = null,
        player2DeckList = null,
        player2AdventureDeckList = null
    } = {}) {

        //====================
        // Services
        //====================

        const logger = new Logger();
        const eventBus = new EventBus();
        const random = new RandomService({
            seed: Date.now()
        });
        const transaction = new TransactionManager();
        const zoneManager = new ZoneManager();
        const deckValidator = new DeckValidator();
        const equipmentManager = new EquipmentManager();
        const damageOverflowManager =
            new DamageOverflowManager();
        const deckRefreshManager =
            new DeckRefreshManager(zoneManager);
        const adventureAbilityManager =
            new AdventureAbilityManager();
        const requirementEvaluator =
            new AdventurerRequirementEvaluator();
        const statusManager = new StatusManager();
        const questManager = new QuestManager(
            requirementEvaluator,
            adventureAbilityManager
        );

        //====================
        // Game State
        //====================

        const gameState = new GameState();
        const actionLog = new ActionLog();
        const selectionManager = new SelectionManager(
            gameState,
            actionLog
        );
        const gameStateSerializer =
            new GameStateSerializer();

        //====================
        // Card Database
        //====================

        const gameDataLoader = new GameDataLoader();

        const gameData = await gameDataLoader.load();

        const cardDatabase = new CardDatabase();


        for (const definition of gameData.cardDefinitions) {

            cardDatabase.register(definition);


        }

        //====================
        // Factory / Builder
        //====================

        const cardFactory = new CardFactory(cardDatabase);
        const deckBuilder = new DeckBuilder(cardFactory);

        //====================
        // Engines
        //====================

        const conditionEngine = new ConditionEngine();
        const targetEngine = new TargetEngine();
        const costEngine = new CostEngine();
        const commandExecutor = new CommandExecutor(
            zoneManager,
            transaction,
            statusManager
        );
        const effectResolver = new EffectResolver({
            conditionEngine,
            targetEngine,
            costEngine,
            commandExecutor,
            transactionManager: transaction
        });
        const gameEngineServices =
            new GameEngineServiceFactory().create({
            effectResolver,
            zoneManager,
            deckValidator,
            equipmentManager,
            damageOverflowManager,
            deckRefreshManager,
            adventureAbilityManager,
            questManager,
            requirementEvaluator,
            statusManager
        });
        const gameEngine = new GameEngine(gameEngineServices);

        //====================
        // Context
        //====================

        const context = new GameContext({

            logger,
            eventBus,
            random,
            transaction,
            gameState,

            cardDatabase,
            cardFactory,
            deckBuilder,

            zoneManager,

            gameEngine,

            selectionManager,

            actionLog,

            gameStateSerializer,

            deckValidator,

            equipmentManager,

            damageOverflowManager,

            deckRefreshManager,

            adventureAbilityManager,

            questManager

        });
        context.commandGateway = new GameCommandGateway(context);

        //====================
        // Player
        //====================

        const player1 = this._createPlayer({
            id: 1,
            name: "プレイヤー1",
            deckBuilder,
            deckList: player1DeckList ?? gameData.starterDeck,
            adventureDeckList:
                player1AdventureDeckList ??
                gameData.starterAdventureDeck
        });

        const player2 = this._createPlayer({
            id: 2,
            name: "プレイヤー2",
            deckBuilder,
            deckList: player2DeckList ?? gameData.starterDeck,
            adventureDeckList:
                player2AdventureDeckList ??
                gameData.starterAdventureDeck
        });

        gameState.addPlayer(player1);
        gameState.addPlayer(player2);

        //====================
        // Finish
        //====================

        context.prepareResult =
            gameEngine.prepareGame({
                gameContext: context
            });

        return context;

    }

    _createPlayer({
        id,
        name,
        deckBuilder,
        deckList,
        adventureDeckList
    }) {

        const deck = deckBuilder.build(deckList).cards;
        const adventureDeck = deckBuilder.build(adventureDeckList).cards;
        const adventurerCard = adventureDeck.find(
            card => card.definition.type === CardTypes.ADVENTURER
        );

        return new PlayerState({
            id,
            name,
            zones: new PlayerZones({
                deck,
                adventureDeck
            }),
            adventurer: new AdventurerState({
                baseStats: adventurerCard?.definition.baseStats ?? {}
            })
        });

    }

}
