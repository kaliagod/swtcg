import Zone from "../models/Zone.js";
import ZoneTypes from "../constants/ZoneTypes.js";

console.log("=== Zone Test ===");

const cardA = {
    id: "CARD_A",
    name: "カードA"
};

const cardB = {
    id: "CARD_B",
    name: "カードB"
};

const hand =
    new Zone(
        ZoneTypes.HAND
    );

console.log(
    "Initial Size:",
    hand.size()
);

hand.add(cardA);
hand.add(cardB);

console.log(
    "After Add:",
    hand.size()
);

console.log(
    "Contains Card A:",
    hand.contains(cardA)
);

console.log(
    "Card At 0:",
    hand.getAt(0).name
);

const removed =
    hand.remove(cardA);

console.log(
    "Removed:",
    removed.name
);

console.log(
    "After Remove:",
    hand.size()
);

console.log(
    "Is Empty:",
    hand.isEmpty()
);

const cleared =
    hand.clear();

console.log(
    "Cleared Count:",
    cleared.length
);

console.log(
    "Final Size:",
    hand.size()
);