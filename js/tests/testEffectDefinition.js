import EffectDefinition from "../models/EffectDefinition.js";
import assert from "node:assert/strict";

import TriggerTypes from "../constants/TriggerTypes.js";

import CommandTypes from "../constants/CommandTypes.js";
import ConditionTypes from "../constants/ConditionTypes.js";
import CostTypes from "../constants/CostTypes.js";
import TargetTypes from "../constants/TargetTypes.js";

import CommandDefinition from "../models/CommandDefinition.js";
import ConditionDefinition from "../models/ConditionDefinition.js";
import CostDefinition from "../models/CostDefinition.js";
import TargetDefinition from "../models/TargetDefinition.js";

console.log("=== EffectDefinition Test ===");

const effect = new EffectDefinition({

    trigger: TriggerTypes.PLAY,

    condition: new ConditionDefinition({

        type: ConditionTypes.ALWAYS

    }),

    cost: new CostDefinition({

        type: CostTypes.MP,

        amount: 2

    }),

    target: new TargetDefinition({

        type: TargetTypes.OPPONENT,

        amount: 1

    }),

    commands: [

        new CommandDefinition({

            type: CommandTypes.DRAW,

            amount: 1

        })

    ]

});

console.log(effect);

console.log(effect.trigger);

console.log(effect.condition.type);

console.log(effect.cost.type);

console.log(effect.target.type);

console.log(effect.commands[0].type);

assert.throws(
    () => new EffectDefinition({
        trigger: TriggerTypes.CONTINUOUS,
        commands: [
            new CommandDefinition({ type: CommandTypes.DRAW, amount: 1 })
        ]
    }),
    /継続効果用コマンド/
);

assert.throws(
    () => new EffectDefinition({
        trigger: TriggerTypes.PLAY,
        commands: [
            new CommandDefinition({
                type: CommandTypes.REDUCE_DAMAGE,
                amount: 1
            })
        ]
    }),
    /CONTINUOUSトリガー/
);

assert.throws(
    () => new EffectDefinition({
        trigger: "ATTACK",
        commands: []
    }),
    /未対応のtrigger/
);
