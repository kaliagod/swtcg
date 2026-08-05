import assert from "node:assert/strict";
import CardDefinition from "../models/CardDefinition.js";

console.log("=== CardDefinition Test ===");

const definition = new CardDefinition({

    id: "ADV001",

    name: "新米冒険者",

    type: "ADVENTURER",

    baseStats: {
        DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
        VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
    },

    cost: 1,

    rarity: "COMMON",

    tags: [
        "human",
        "fighter"
    ],

    text: [
        "【常時】サンプル"
    ],

    effects: [
        {
            trigger: "PLAY",
            commands: [
                {
                    type: "DRAW",
                    amount: 1
                }
            ]
        }
    ]

});

console.log(definition.id);

console.log(definition.name);

console.log(definition.cost);

console.log(definition.tags.length);

console.log(definition.text.length);

console.log(definition.effects.length);

console.log(Object.isFrozen(definition));

console.log(Object.isFrozen(definition.tags));

console.log(Object.isFrozen(definition.baseStats));

assert.throws(
    () => new CardDefinition({
        id: "ADV_NO_STATS",
        name: "能力値なし",
        type: "ADVENTURER"
    }),
    /baseStats/
);

assert.throws(
    () => new CardDefinition({
        id: "ADV_INCOMPLETE_STATS",
        name: "能力値不足",
        type: "ADVENTURER",
        baseStats: { DEXTERITY: 3 }
    }),
    /baseStats\.AGILITY/
);
