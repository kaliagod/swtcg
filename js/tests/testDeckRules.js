import assert from "node:assert/strict";

import Card from "../models/Card.js";
import CardDefinition from "../models/CardDefinition.js";
import CardTypes from "../constants/CardTypes.js";
import DeckRules from "../constants/DeckRules.js";
import DeckValidator from "../services/DeckValidator.js";
import ZoneManager from "../services/ZoneManager.js";
import GameEngine from "../engines/GameEngine.js";
import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";

function definition(id, type, nameKey = id) {
    return new CardDefinition({
        id,
        name: id,
        nameKey,
        type,
        ...(type === CardTypes.ADVENTURER
            ? {
                baseStats: {
                    DEXTERITY: 3, AGILITY: 3, STRENGTH: 3,
                    VITALITY: 3, INTELLIGENCE: 3, SPIRIT: 3
                }
            }
            : {})
    });
}

function copies(cardDefinition, count) {
    return Array.from(
        { length: count },
        () => new Card(cardDefinition)
    );
}

const validator = new DeckValidator();
const mainDefinitions = Array.from(
    { length: 11 },
    (_, index) =>
        definition(`MAIN_${index + 1}`, CardTypes.EVENT)
);

const legalMainDeck = mainDefinitions
    .slice(0, 10)
    .flatMap(cardDefinition => copies(cardDefinition, 4));

assert.equal(
    legalMainDeck.length,
    DeckRules.MAIN_DECK_MIN_SIZE
);
assert.equal(validator.validateMainDeck(legalMainDeck).valid, true);

const legalDeckAboveMinimum = mainDefinitions
    .flatMap(cardDefinition => copies(cardDefinition, 4));
assert.equal(
    validator.validateMainDeck(legalDeckAboveMinimum).valid,
    true,
    "メインデッキには上限を設けない"
);

const shortResult = validator.validateMainDeck(
    legalMainDeck.slice(0, 39)
);
assert.equal(shortResult.valid, false);
assert.equal(shortResult.errors[0].code, "DECK_TOO_SMALL");

const mainDeckWithAdventurer = [
    ...legalMainDeck.slice(0, 39),
    new Card(definition("WRONG_MAIN", CardTypes.ADVENTURER))
];
assert.equal(
    validator.validateMainDeck(mainDeckWithAdventurer)
        .errors.some(error =>
            error.code === "INVALID_CARD_TYPE_FOR_DECK"
        ),
    true
);

const aliasA = definition(
    "ALIAS_A",
    CardTypes.EVENT,
    "SAME_CARD"
);
const aliasB = definition(
    "ALIAS_B",
    CardTypes.EVENT,
    "SAME_CARD"
);
const tooManyCopies = [
    ...legalMainDeck,
    ...copies(aliasA, 3),
    ...copies(aliasB, 2)
];
const copyResult = validator.validateMainDeck(tooManyCopies);
assert.equal(copyResult.valid, false);
assert.equal(
    copyResult.errors.some(error =>
        error.code === "TOO_MANY_COPIES" &&
        error.nameKey === "SAME_CARD" &&
        error.actual === 5
    ),
    true
);

const adventurer = definition(
    "ADV_TEST",
    CardTypes.ADVENTURER
);
const secondAdventurer = definition(
    "ADV_TEST_2",
    CardTypes.ADVENTURER
);
const traits = Array.from(
    { length: 4 },
    (_, index) =>
        definition(`TRAIT_${index + 1}`, CardTypes.TRAIT)
);
const legalAdventureDeck = [
    ...copies(adventurer, 1),
    ...copies(traits[0], 4),
    ...copies(traits[1], 4),
    ...copies(traits[2], 4),
    ...copies(traits[3], 2)
];

assert.equal(
    validator.validateAdventureDeck(legalAdventureDeck).valid,
    true
);

const adventureDeckWithEvent = [
    ...legalAdventureDeck.slice(0, 14),
    new Card(definition("WRONG_ADVENTURE", CardTypes.EVENT))
];
assert.equal(
    validator.validateAdventureDeck(adventureDeckWithEvent)
        .errors.some(error =>
            error.code === "INVALID_CARD_TYPE_FOR_DECK"
        ),
    true
);

const wrongAdventureSize = validator.validateAdventureDeck(
    legalAdventureDeck.slice(0, 14)
);
assert.equal(wrongAdventureSize.valid, false);
assert.equal(
    wrongAdventureSize.errors.some(
        error => error.code === "INVALID_DECK_SIZE"
    ),
    true
);

const twoAdventurers = [
    secondAdventurer,
    ...legalAdventureDeck.slice(0, 14)
].map(cardOrDefinition =>
    cardOrDefinition instanceof Card
        ? cardOrDefinition
        : new Card(cardOrDefinition)
);
const adventurerCountResult =
    validator.validateAdventureDeck(twoAdventurers);
assert.equal(adventurerCountResult.valid, false);
assert.equal(
    adventurerCountResult.errors.some(error =>
        error.code === "INVALID_ADVENTURER_COUNT" &&
        error.actual === 2
    ),
    true
);

assert.throws(
    () => validator.assertPlayer({
        id: "INVALID_PLAYER",
        zones: {
            deck: { cards: legalMainDeck.slice(0, 39) },
            adventureDeck: { cards: legalAdventureDeck }
        }
    }),
    error =>
        error.code === "INVALID_DECK" &&
        error.playerId === "INVALID_PLAYER"
);

function player(id, mainDeck) {
    return new PlayerState({
        id,
        zones: new PlayerZones({
            deck: mainDeck,
            adventureDeck: legalAdventureDeck
        }),
        adventurer: new AdventurerState()
    });
}

const gameState = new GameState();
const invalidPlayer = player(
    1,
    legalMainDeck.slice(0, 39)
);
gameState.addPlayer(invalidPlayer);
gameState.addPlayer(player(2, legalMainDeck));

const gameEngine = new GameEngine({
    effectResolver: { execute() {} },
    zoneManager: new ZoneManager(),
    deckValidator: validator
});

assert.throws(
    () => gameEngine.prepareGame({
        gameContext: {
            gameState,
            random: {
                choice(values) {
                    return values[0];
                }
            }
        }
    }),
    error =>
        error.code === "INVALID_DECK" &&
        error.playerId === 1
);
assert.equal(gameState.prepared, false);
assert.equal(invalidPlayer.zones.deck.size(), 39);
assert.equal(invalidPlayer.zones.hand.size(), 0);

console.log("Deck rules tests: OK");
