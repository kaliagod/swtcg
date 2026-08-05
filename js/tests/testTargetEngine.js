import TargetEngine from "../engines/TargetEngine.js";
import EffectContext from "../engines/EffectContext.js";

import EffectDefinition from "../models/EffectDefinition.js";
import TargetDefinition from "../models/TargetDefinition.js";

import TargetTypes from "../constants/TargetTypes.js";

console.log("=== TargetEngine Test ===");

const engine = new TargetEngine();

const player = {

    id: 1,

    name: "プレイヤー"

};

const effect = new EffectDefinition({

    trigger: "PLAY",

    target: new TargetDefinition({

        type: TargetTypes.SELF

    })

});

const context = new EffectContext({

    gameContext: {},

    player,

    effect

});

const targets = engine.select(context);

console.log(targets);

console.log(targets.length);


console.log(targets[0].name);