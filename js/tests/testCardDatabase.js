import CardDatabase from "../database/CardDatabase.js";
import CardDefinition from "../models/CardDefinition.js";

console.log("=== CardDatabase Test ===");

const database = new CardDatabase();

const card1 = new CardDefinition({

    id: "ADV001",

    name: "新米冒険者",
    type: "ADVENTURER",
    baseStats: {
        DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
        VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
    }

});

const card2 = new CardDefinition({

    id: "ADV002",

    name: "剣士",
    type: "ADVENTURER",
    baseStats: {
        DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
        VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
    }

});

database.register(card1);
database.register(card2);

console.log(database.size());

console.log(database.has("ADV001"));

console.log(database.get("ADV001").name);

console.log(database.getAll().length);

database.clear();

console.log(database.size());
