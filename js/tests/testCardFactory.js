import CardFactory from "../factories/CardFactory.js";
import CardDatabase from "../database/CardDatabase.js";
import CardDefinition from "../models/CardDefinition.js";

console.log("=== CardFactory Test ===");

const database = new CardDatabase();

database.register(
    new CardDefinition({
        id: "ADV001",
        name: "新米冒険者",
        type: "ADVENTURER",
        baseStats: {
            DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
            VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
        }
    })
);

const factory = new CardFactory(database);

const card = factory.create("ADV001");

console.log(card.definition.id);

console.log(card.definition.name);
