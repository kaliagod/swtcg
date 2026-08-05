import Logger from "../services/Logger.js";
import EventBus from "../services/EventBus.js";
import RandomService from "../services/RandomService.js";
import TransactionManager from "../services/TransactionManager.js";

import GameContext from "../context/GameContext.js";

console.log("=== GameContext Test ===");

const context = new GameContext({

    logger: new Logger(),

    eventBus: new EventBus(),

    random: new RandomService(),

    transaction: new TransactionManager(),

    cardDatabase: {},

    cardFactory: {},

    deckBuilder: {}

});

console.log(context);

console.log(context.logger !== undefined);
console.log(context.eventBus !== undefined);
console.log(context.random !== undefined);
console.log(context.transaction !== undefined);
console.log(context.gameState === null);
console.log(context.cardDatabase !== undefined);
console.log(context.cardFactory !== undefined);
console.log(context.deckBuilder !== undefined);
