import EffectResolver
    from "../engines/EffectResolver.js";

import EffectContext
    from "../engines/EffectContext.js";

import ConditionEngine
    from "../engines/ConditionEngine.js";

import TargetEngine
    from "../engines/TargetEngine.js";

import CommandExecutor
    from "../engines/CommandExecutor.js";

import CostEngine
    from "../engines/CostEngine.js";


import EffectDefinition
    from "../models/EffectDefinition.js";

import ConditionDefinition
    from "../models/ConditionDefinition.js";

import TargetDefinition
    from "../models/TargetDefinition.js";

import CommandDefinition
    from "../models/CommandDefinition.js";

import CostDefinition
    from "../models/CostDefinition.js";

import PlayerState
    from "../models/PlayerState.js";

import PlayerZones
    from "../models/PlayerZones.js";

import AdventurerState
    from "../models/AdventurerState.js";


import TriggerTypes
    from "../constants/TriggerTypes.js";

import ConditionTypes
    from "../constants/ConditionTypes.js";

import TargetTypes
    from "../constants/TargetTypes.js";

import CommandTypes
    from "../constants/CommandTypes.js";

import AbilityTypes
    from "../constants/AbilityTypes.js";

import CostTypes
    from "../constants/CostTypes.js";


import TransactionManager
    from "../services/TransactionManager.js";

import ZoneManager
    from "../services/ZoneManager.js";


console.log(
    "=== EffectResolver Test ==="
);


//====================
// Test Cards
//====================

const cardA = {
    id: "CARD_A",
    name: "カードA"
};

const cardB = {
    id: "CARD_B",
    name: "カードB"
};

const cardC = {
    id: "CARD_C",
    name: "カードC"
};


//====================
// Player Zones
//====================

const zones =
    new PlayerZones({

        deck: [
            cardA,
            cardB,
            cardC
        ]

    });


//====================
// Player State
//====================

const player =
    new PlayerState({

        id: 1,

        zones,

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

const effect =
    new EffectDefinition({

        trigger:
            TriggerTypes.PLAY,

        condition:
            new ConditionDefinition({

                type:
                    ConditionTypes.ALWAYS

            }),

        target:
            new TargetDefinition({

                type:
                    TargetTypes.SELF

            }),

        cost:
            new CostDefinition({

                type:
                    CostTypes.MP,

                amount: 2

            }),

        commands: [

            new CommandDefinition({

                type:
                    CommandTypes.DRAW,

                amount: 2

            })

        ]

    });


//====================
// Effect Context
//====================

const context =
    new EffectContext({

        gameContext: {},

        player,

        sourceCard: null,

        effect

    });


//====================
// Dependencies
//====================

const conditionEngine =
    new ConditionEngine();

const targetEngine =
    new TargetEngine();

const costEngine =
    new CostEngine();

const transactionManager =
    new TransactionManager();

const zoneManager =
    new ZoneManager();

const commandExecutor =
    new CommandExecutor(
        zoneManager,
        transactionManager
    );

const effectResolver =
    new EffectResolver({

        conditionEngine,

        targetEngine,

        costEngine,

        transactionManager,

        commandExecutor

    });


//====================
// Execute
//====================

const result =
    effectResolver.execute(
        context
    );


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

if (result.targets.length > 0) {

    console.log(
        "Target ID:",
        result.targets[0].id
    );

}

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

console.log(
    "Hand Cards:",
    player.zones.hand.cards.map(
        card => card.name
    )
);

console.log(
    "MP Spent:",
    player.adventurer.mpSpent
);

if (
    !result.success ||
    result.executedCommandCount !== 2 ||
    player.adventurer.mpSpent !== 2 ||
    player.zones.deck.size() !== 1 ||
    player.zones.hand.size() !== 2
) {
    throw new Error(
        "EffectResolver Test: MPコスト付き効果の解決結果が期待値と一致しません。"
    );
}
