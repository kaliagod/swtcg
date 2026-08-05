import Logger from "../services/Logger.js";
import GameEvents from "../constants/GameEvents.js";
import LogCategories from "../constants/LogCategories.js";

const logger = new Logger();

console.log("=== Logger Test ===");

logger.info(
    "GameSetupManager",
    LogCategories.GAME,
    GameEvents.GAME_STARTED,
    "ゲーム開始"
);

logger.warn(
    "CardExecutor",
    LogCategories.CARD,
    GameEvents.CARD_PLAYED,
    "カードを使用",
    {
        cardId: "CARD001"
    }
);

console.log(logger.getLogs());

logger.clear();

console.log(logger.getLogs());