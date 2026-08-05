/**
 * GameContext.js
 * ゲーム全体で共有するサービスを保持する。
 */

export default class GameContext {

    constructor({

        logger,

        eventBus,

        random,

        transaction,

        gameState = null,

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

        questManager,

        commandGateway = null

    }) {

        this.logger = logger;

        this.eventBus = eventBus;

        this.random = random;

        this.transaction = transaction;

        this.gameState = gameState;

        this.cardDatabase = cardDatabase;

        this.cardFactory = cardFactory;

        this.deckBuilder = deckBuilder;

        this.zoneManager = zoneManager;

        this.gameEngine = gameEngine;

        this.selectionManager = selectionManager;

        this.actionLog = actionLog;

        this.gameStateSerializer = gameStateSerializer;

        this.deckValidator = deckValidator;

        this.equipmentManager = equipmentManager;

        this.damageOverflowManager = damageOverflowManager;

        this.deckRefreshManager = deckRefreshManager;

        this.adventureAbilityManager = adventureAbilityManager;

        this.questManager = questManager;

        this.commandGateway = commandGateway;

    }

    /**
     * GameStateは後から設定できる。
     */
    setGameState(gameState) {

        this.gameState = gameState;

    }

}
