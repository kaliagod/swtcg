import CardTypes from "./CardTypes.js";

const DeckRules = Object.freeze({
    MAIN_DECK_MIN_SIZE: 40,
    MAIN_DECK_MAX_COPIES: 4,
    ADVENTURE_DECK_SIZE: 15,
    ADVENTURE_DECK_MAX_COPIES: 4,
    ADVENTURER_CARD_COUNT: 1,
    MAIN_DECK_CARD_TYPES: Object.freeze([
        CardTypes.QUEST,
        CardTypes.EQUIPMENT,
        CardTypes.ACCESSORY,
        CardTypes.ITEM,
        CardTypes.EVENT
    ]),
    ADVENTURE_DECK_CARD_TYPES: Object.freeze([
        CardTypes.ADVENTURER,
        CardTypes.MAGIC,
        CardTypes.SKILL,
        CardTypes.TRAIT
    ])
});

export default DeckRules;
