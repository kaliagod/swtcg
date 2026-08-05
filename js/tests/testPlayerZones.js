import PlayerZones from "../models/PlayerZones.js";
import ZoneTypes from "../constants/ZoneTypes.js";

console.log("=== PlayerZones Test ===");

const cardA = {
    id: "CARD_A"
};

const cardB = {
    id: "CARD_B"
};

const zones =
    new PlayerZones({

        deck: [
            cardA,
            cardB
        ]

    });

console.log(
    "Deck Size:",
    zones.deck.size()
);

console.log(
    "Hand Size:",
    zones.hand.size()
);

console.log(
    "Field Size:",
    zones.field.size()
);

console.log(
    "Resource Size:",
    zones.resource.size()
);

console.log(
    "All Zones:",
    zones.getAllZones().length
);

console.log(
    "Deck Top:",
    zones.deck.peekTop().id
);

if (
    zones.getAllZones().length !== 7 ||
    zones.getZone(ZoneTypes.DECK) !== zones.deck ||
    zones.getZone(ZoneTypes.ADVENTURE_DECK) !== zones.adventureDeck ||
    zones.getZone(ZoneTypes.RESOURCE) !== zones.resource ||
    zones.getZone("UNKNOWN") !== null
) {
    throw new Error(
        "PlayerZones Test: ゾーン検索結果が期待値と一致しません。"
    );
}
