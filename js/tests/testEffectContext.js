import EffectContext from "../engines/EffectContext.js";

console.log("=== EffectContext Test ===");

const context = new EffectContext({

    gameContext: {},

    player: {

        id: 1,

        name: "プレイヤー"

    },

    effect: {

        trigger: "PLAY"

    }

});

console.log(context);

console.log(context.player.name);

console.log(context.effect.trigger);