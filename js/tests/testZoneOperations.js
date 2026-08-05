import Zone from "../models/Zone.js";
import DeckZone from "../models/DeckZone.js";
import ZoneManager from "../services/ZoneManager.js";

import ZoneTypes from "../constants/ZoneTypes.js";

console.log(
    "=== Zone Operations Test ==="
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

const cardD = {
    id: "CARD_D",
    name: "カードD"
};

const deck =
    new DeckZone([
        cardA,
        cardB,
        cardC,
        cardD
    ]);

const hand =
    new Zone(
        ZoneTypes.HAND
    );

const graveyard =
    new Zone(
        ZoneTypes.GRAVEYARD
    );

const zoneManager =
    new ZoneManager();


//====================
// moveTop
//====================

const moveTopResult =
    zoneManager.moveTop({

        from: deck,

        to: hand

    });

console.log(
    "Move Top Success:",
    moveTopResult.success
);

console.log(
    "Moved Card:",
    moveTopResult.card.name
);

console.log(
    "Deck Size After Move Top:",
    deck.size()
);

console.log(
    "Hand Size After Move Top:",
    hand.size()
);


//====================
// draw
//====================

const drawResult =
    zoneManager.draw({

        deck,

        hand,

        amount: 2

    });

console.log(
    "Draw Success:",
    drawResult.success
);

console.log(
    "Drawn Cards:",
    drawResult.cards.map(
        card => card.name
    )
);

console.log(
    "Drawn Amount:",
    drawResult.movedAmount
);

console.log(
    "Deck Size After Draw:",
    deck.size()
);

console.log(
    "Hand Size After Draw:",
    hand.size()
);


//====================
// discard
//====================

const discardCard =
    hand.getAt(0);

const discardResult =
    zoneManager.discard({

        hand,

        graveyard,

        card: discardCard

    });

console.log(
    "Discard Success:",
    discardResult.success
);

console.log(
    "Discarded Card:",
    discardResult.card.name
);

console.log(
    "Hand Size After Discard:",
    hand.size()
);

console.log(
    "Graveyard Size After Discard:",
    graveyard.size()
);


//====================
// mill
//====================

const millResult =
    zoneManager.mill({

        deck,

        graveyard,

        amount: 1

    });

console.log(
    "Mill Success:",
    millResult.success
);

console.log(
    "Milled Cards:",
    millResult.cards.map(
        card => card.name
    )
);

console.log(
    "Deck Size After Mill:",
    deck.size()
);

console.log(
    "Graveyard Size After Mill:",
    graveyard.size()
);


//====================
// Empty Deck
//====================

const emptyDrawResult =
    zoneManager.draw({

        deck,

        hand,

        amount: 1

    });

console.log(
    "Empty Draw Success:",
    emptyDrawResult.success
);

console.log(
    "Empty Draw Reason:",
    emptyDrawResult.reason
);

console.log(
    "Empty Draw Amount:",
    emptyDrawResult.movedAmount
);