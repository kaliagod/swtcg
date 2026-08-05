import Card from "../models/Card.js";
import CardDefinition from "../models/CardDefinition.js";

console.log("=== Card Test ===");


const definition = new CardDefinition({

    id: "ADV001",

    name: "新米冒険者",

    type: "ADVENTURER",

    baseStats: {
        DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
        VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
    }

});

const card = new Card(definition);

console.log(card.id);

console.log(card.name);

console.log(card.faceUp);

console.log(card.ownerId);

console.log(card.zone);
