import Zone from "../models/Zone.js";
import DeckZone from "../models/DeckZone.js";
import ZoneManager from "../services/ZoneManager.js";

import ZoneTypes from "../constants/ZoneTypes.js";

console.log("=== ZoneManager Test ===");

const cardA = {
    id: "CARD_A",
    name: "カードA"
};

const cardB = {
    id: "CARD_B",
    name: "カードB"
};

const deck =
    new DeckZone([
        cardA,
        cardB
    ]);

const hand =
    new Zone(
        ZoneTypes.HAND
    );

const field =
    new Zone(
        ZoneTypes.FIELD
    );

const zoneManager =
    new ZoneManager();

//====================
// Find
//====================

const foundBeforeMove =
    zoneManager.findCard({

        card: cardA,

        zones: [
            deck,
            hand,
            field
        ]

    });

console.log(
    "Found Before Move:",
    foundBeforeMove.type
);

//====================
// Move
//====================

const moveResult =
    zoneManager.move({

        from: deck,

        to: hand,

        card: cardA

    });

console.log(
    "Move Success:",
    moveResult.success
);

console.log(
    "Deck Size:",
    deck.size()
);

console.log(
    "Hand Size:",
    hand.size()
);

console.log(
    "Hand Contains Card A:",
    zoneManager.contains({

        zone: hand,

        card: cardA

    })
);

//====================
// Find After Move
//====================

const foundAfterMove =
    zoneManager.findCard({

        card: cardA,

        zones: [
            deck,
            hand,
            field
        ]

    });

console.log(
    "Found After Move:",
    foundAfterMove.type
);

//====================
// Invalid Move
//====================

const invalidResult =
    zoneManager.move({

        from: deck,

        to: field,

        card: cardA

    });

console.log(
    "Invalid Move Success:",
    invalidResult.success
);

console.log(
    "Invalid Move Reason:",
    invalidResult.reason
);