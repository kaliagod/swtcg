import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import AbilityTypes from "../constants/AbilityTypes.js";

console.log("=== PlayerState Test ===");

const zones =
    new PlayerZones();

const player =
    new PlayerState({

        id: 1,

        zones,

        adventurer:
            new AdventurerState({

                card: {
                    id: "ADV_TEST"
                },

                baseStats: {
                    [AbilityTypes.VITALITY]: 20,
                    [AbilityTypes.SPIRIT]: 5
                }

            })

    });

console.log(
    "Player ID:",
    player.id
);

console.log(
    "Vitality:",
    player.adventurer.getCurrentStat(
        AbilityTypes.VITALITY
    )
);

console.log(
    "Available MP:",
    player.adventurer.availableMp
);

console.log(
    "Deck Size:",
    player.zones.deck.size()
);

console.log(
    "Hand Size:",
    player.zones.hand.size()
);
