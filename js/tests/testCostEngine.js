import CostEngine from "../engines/CostEngine.js";
import EffectContext from "../engines/EffectContext.js";

import EffectDefinition from "../models/EffectDefinition.js";
import CostDefinition from "../models/CostDefinition.js";
import AdventurerState from "../models/AdventurerState.js";

import CostTypes from "../constants/CostTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";

console.log("=== CostEngine Test ===");

const player = {

    adventurer:
        new AdventurerState({

            baseStats: {
                [AbilityTypes.SPIRIT]: 5
            }

        })

};

const effect = new EffectDefinition({

    trigger:"PLAY",

    cost:new CostDefinition({

        type:CostTypes.MP,

        amount:2

    })

});

const context = new EffectContext({

    gameContext:{},

    player,

    effect

});

const engine = new CostEngine();

console.log(engine.canPay(context));

const commands = engine.buildCommands(context);

console.log(commands);
console.log(commands.length);
console.log(commands[0].type);
console.log(commands[0].amount);
console.log(commands[0].params.requireFullPayment);
