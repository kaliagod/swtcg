import JsonLoader from "../loaders/JsonLoader.js";

console.log("=== JsonLoader Test ===");

const json = [

    {

        id: "ADV001",

        name: "新米冒険者",

        type: "ADVENTURER",

        baseStats: {
            DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
            VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
        }

    },

    {

        id: "ADV002",

        name: "剣士",

        type: "ADVENTURER",

        baseStats: {
            DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
            VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
        }

    }

];

const loader = new JsonLoader();

const definitions = loader.load(json);

console.log(definitions.length);

console.log(definitions[0].name);

console.log(definitions[1].name);
