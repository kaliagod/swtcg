import CardDatabase from "../database/CardDatabase.js";
import CardDefinition from "../models/CardDefinition.js";
import CardFactory from "../factories/CardFactory.js";
import DeckBuilder from "../builders/DeckBuilder.js";

console.log("=== DeckBuilder Test ===");

const database = new CardDatabase();

database.register(new CardDefinition({
    id: "ADV001",
    name: "新米冒険者",
    type: "ADVENTURER",
    baseStats: {
        DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
        VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
    }
}));

database.register(new CardDefinition({
    id: "ADV002",
    name: "剣士",
    type: "ADVENTURER",
    baseStats: {
        DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
        VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
    }
}));

const factory = new CardFactory(database);

const builder = new DeckBuilder(factory);

const deck = builder.build([
    "ADV001",
    "ADV002",
    "ADV001"
]);

console.log("Deck:", deck.size());

console.log(deck.drawTop().definition.name);

console.log(deck.drawTop().definition.name);

console.log(deck.drawTop().definition.name);
