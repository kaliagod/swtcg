import ConditionEngine from "../engines/ConditionEngine.js";

import EffectContext from "../engines/EffectContext.js";

import EffectDefinition from "../models/EffectDefinition.js";
import ConditionDefinition from "../models/ConditionDefinition.js";

import ConditionTypes from "../constants/ConditionTypes.js";

console.log("=== ConditionEngine Test ===");

const engine = new ConditionEngine();

const effect = new EffectDefinition({

    trigger: "PLAY",

    condition: new ConditionDefinition({

        type: ConditionTypes.ALWAYS

    })

});

const context = new EffectContext({

    gameContext: {},

    player: {},

    effect

});

console.log(engine.evaluate(context));