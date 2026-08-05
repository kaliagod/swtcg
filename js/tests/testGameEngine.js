import GameEngine from "../engines/GameEngine.js";
import EffectResolver from "../engines/EffectResolver.js";
import ConditionEngine from "../engines/ConditionEngine.js";
import TargetEngine from "../engines/TargetEngine.js";
import CommandExecutor from "../engines/CommandExecutor.js";
import ZoneManager from "../services/ZoneManager.js";

import EffectDefinition from "../models/EffectDefinition.js";
import ConditionDefinition from "../models/ConditionDefinition.js";
import TargetDefinition from "../models/TargetDefinition.js";
import CommandDefinition from "../models/CommandDefinition.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import GameState from "../models/GameState.js";

import TriggerTypes from "../constants/TriggerTypes.js";
import ConditionTypes from "../constants/ConditionTypes.js";
import TargetTypes from "../constants/TargetTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";

import CostEngine from "../engines/CostEngine.js";
import TransactionManager from "../services/TransactionManager.js";

console.log("=== GameEngine Test ===");

//====================
// Test Player
//====================

const player =
    new PlayerState({

        id: 1,

        zones:
            new PlayerZones({

                deck: [

                    {
                        id: "CARD_A",
                        name: "カードA"
                    },

                    {
                        id: "CARD_B",
                        name: "カードB"
                    },

                    {
                        id: "CARD_C",
                        name: "カードC"
                    }

                ]

            }),

        adventurer:
            new AdventurerState({

                baseStats: {
                    [AbilityTypes.VITALITY]: 20,
                    [AbilityTypes.SPIRIT]: 5
                }

            })

    });

//====================
// Effect Definition
//====================

const effect = new EffectDefinition({

    trigger: TriggerTypes.PLAY,

    condition: new ConditionDefinition({

        type: ConditionTypes.ALWAYS

    }),

    target: new TargetDefinition({

        type: TargetTypes.SELF

    }),

    commands: [

        new CommandDefinition({

            type: CommandTypes.DRAW,

            amount: 2

        })

    ]

});

//====================
// Dependencies
//====================

const conditionEngine =
    new ConditionEngine();

const targetEngine =
    new TargetEngine();

const zoneManager =
    new ZoneManager();

const transactionManager =
    new TransactionManager();

const commandExecutor =
    new CommandExecutor(
        zoneManager,
        transactionManager
    );

const costEngine =
    new CostEngine();

const effectResolver =
    new EffectResolver({

        conditionEngine,

        targetEngine,

        costEngine,

        commandExecutor,

        transactionManager

    });

const gameEngine =
    new GameEngine({

        effectResolver,

        zoneManager

    });

const gameState = new GameState();
gameState.addPlayer(player);

const gameContext = {
    gameState,
    transaction: transactionManager
};

//====================
// Execute
//====================

const result =
    gameEngine.resolveEffect({

        gameContext,

        player,

        sourceCard: null,

        effect

    });

//====================
// Result
//====================

console.log(
    "Success:",
    result.success
);

console.log(
    "Reason:",
    result.reason
);

console.log(
    "Targets:",
    result.targets.length
);

console.log(
    "Executed Commands:",
    result.executedCommandCount
);

console.log(
    "Deck Size:",
    player.zones.deck.size()
);

console.log(
    "Hand Size:",
    player.zones.hand.size()
);

if (
    !result.success ||
    result.executedCommandCount !== 1 ||
    player.zones.deck.size() !== 1 ||
    player.zones.hand.size() !== 2
) {
    throw new Error(
        "GameEngine Test: DRAWの効果解決結果が期待値と一致しません。"
    );
}

const drawResult =
    gameEngine.drawCards({

        player,

        amount: 1

    });

console.log(
    "Direct Draw Success:",
    drawResult.success
);

console.log(
    "Deck Size After Direct Draw:",
    player.zones.deck.size()
);

console.log(
    "Hand Size After Direct Draw:",
    player.zones.hand.size()
);

if (
    !drawResult.success ||
    player.zones.deck.size() !== 0 ||
    player.zones.hand.size() !== 3
) {
    throw new Error(
        "GameEngine Test: drawCards()の結果が期待値と一致しません。"
    );
}
