import assert from "node:assert/strict";

import CommandExecutor from "../engines/CommandExecutor.js";
import ZoneManager from "../services/ZoneManager.js";

import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";

import CommandTypes from "../constants/CommandTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";

console.log(
    "=== CommandExecutor Draw Test ==="
);

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

const zones =
    new PlayerZones({

        deck: [
            cardA,
            cardB,
            cardC
        ]

    });

const player =
    new PlayerState({

        id: 1,

        zones,

        adventurer:
            new AdventurerState({

                baseStats: {
                    [AbilityTypes.SPIRIT]: 5
                }

            })

    });

const context = {

    player,

    targets: [player]

};

const command = {

    type: CommandTypes.DRAW,

    amount: 2

};

const zoneManager =
    new ZoneManager();

const commandExecutor =
    new CommandExecutor(
        zoneManager
    );

const result =
    commandExecutor.execute(
        command,
        context
    );

console.log(
    "Draw Success:",
    result.success
);

console.log(
    "Drawn Cards:",
    result.cards.map(
        card => card.name
    )
);

console.log(
    "Deck Size:",
    player.zones.deck.size()
);

console.log(
    "Hand Size:",
    player.zones.hand.size()
);

const loseMpResult =
    commandExecutor.execute(
        {
            type: CommandTypes.LOSE_MP,
            amount: 7,
            params: {}
        },
        context
    );

assert.equal(result.success, true);
assert.deepEqual(
    result.cards.map(card => card.name),
    ["カードC", "カードB"]
);
assert.equal(player.zones.deck.size(), 1);
assert.equal(player.zones.hand.size(), 2);

console.log(
    "Spent MP:",
    loseMpResult.amount
);

console.log(
    "Available MP:",
    loseMpResult.remainingMp
);

if (
    loseMpResult.amount !== 5 ||
    loseMpResult.remainingMp !== 0
) {
    throw new Error(
        "CommandExecutor Test: MP消費結果が期待値と一致しません。"
    );
}
