import DeckZone from "../models/DeckZone.js";
import ZoneTypes from "../constants/ZoneTypes.js";

console.log("=== DeckZone Test ===");

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

const deck =
    new DeckZone([
        cardA,
        cardB,
        cardC
    ]);

console.log(
    "Zone Type:",
    deck.type
);

console.log(
    "Is Deck:",
    deck.type === ZoneTypes.DECK
);

console.log(
    "Initial Size:",
    deck.size()
);

console.log(
    "Top Card:",
    deck.peekTop().name
);

const drawnCard =
    deck.drawTop();

console.log(
    "Drawn Card:",
    drawnCard.name
);

console.log(
    "After Draw:",
    deck.size()
);

console.log(
    "New Top:",
    deck.peekTop().name
);