import CardTypes from "../constants/CardTypes.js";
import DeckRules from "../constants/DeckRules.js";

export default class DeckValidator {
    validateMainDeck(cards) {
        return this._validate({
            cards,
            deckType: "MAIN",
            exactSize: null,
            minimumSize: DeckRules.MAIN_DECK_MIN_SIZE,
            maximumCopies: DeckRules.MAIN_DECK_MAX_COPIES,
            requireAdventurerCount: null,
            allowedTypes: DeckRules.MAIN_DECK_CARD_TYPES
        });
    }

    validateAdventureDeck(cards) {
        return this._validate({
            cards,
            deckType: "ADVENTURE",
            exactSize: DeckRules.ADVENTURE_DECK_SIZE,
            minimumSize: null,
            maximumCopies: DeckRules.ADVENTURE_DECK_MAX_COPIES,
            requireAdventurerCount:
                DeckRules.ADVENTURER_CARD_COUNT,
            allowedTypes: DeckRules.ADVENTURE_DECK_CARD_TYPES
        });
    }

    validatePlayer(player) {
        const mainDeck = this.validateMainDeck(
            player?.zones?.deck?.cards
        );
        const adventureDeck = this.validateAdventureDeck(
            player?.zones?.adventureDeck?.cards
        );

        return {
            valid: mainDeck.valid && adventureDeck.valid,
            mainDeck,
            adventureDeck
        };
    }

    assertPlayer(player) {
        const validation = this.validatePlayer(player);

        if (validation.valid) {
            return validation;
        }

        const error = new Error(
            `DeckValidator: プレイヤー '${player?.id ?? "UNKNOWN"}' のデッキ構成が不正です。`
        );
        error.code = "INVALID_DECK";
        error.playerId = player?.id ?? null;
        error.validation = validation;
        throw error;
    }

    _validate({
        cards,
        deckType,
        exactSize,
        minimumSize,
        maximumCopies,
        requireAdventurerCount,
        allowedTypes
    }) {
        const errors = [];

        if (!Array.isArray(cards)) {
            return {
                valid: false,
                deckType,
                cardCount: 0,
                errors: [{ code: "DECK_NOT_AVAILABLE" }]
            };
        }

        if (exactSize !== null && cards.length !== exactSize) {
            errors.push({
                code: "INVALID_DECK_SIZE",
                expected: exactSize,
                actual: cards.length
            });
        }

        if (minimumSize !== null && cards.length < minimumSize) {
            errors.push({
                code: "DECK_TOO_SMALL",
                minimum: minimumSize,
                actual: cards.length
            });
        }

        const copyCounts = new Map();
        let adventurerCount = 0;

        for (const [index, card] of cards.entries()) {
            const definition = card?.definition ?? card;

            if (
                !definition ||
                typeof definition.nameKey !== "string" ||
                typeof definition.type !== "string"
            ) {
                errors.push({
                    code: "INVALID_CARD_ENTRY",
                    index
                });
                continue;
            }

            copyCounts.set(
                definition.nameKey,
                (copyCounts.get(definition.nameKey) ?? 0) + 1
            );

            if (definition.type === CardTypes.ADVENTURER) {
                adventurerCount++;
            }

            if (!allowedTypes.includes(definition.type)) {
                errors.push({
                    code: "INVALID_CARD_TYPE_FOR_DECK",
                    index,
                    cardId: definition.id,
                    cardType: definition.type,
                    deckType
                });
            }
        }

        for (const [nameKey, count] of copyCounts) {
            if (count > maximumCopies) {
                errors.push({
                    code: "TOO_MANY_COPIES",
                    nameKey,
                    maximum: maximumCopies,
                    actual: count
                });
            }
        }

        if (
            requireAdventurerCount !== null &&
            adventurerCount !== requireAdventurerCount
        ) {
            errors.push({
                code: "INVALID_ADVENTURER_COUNT",
                expected: requireAdventurerCount,
                actual: adventurerCount
            });
        }

        return {
            valid: errors.length === 0,
            deckType,
            cardCount: cards.length,
            adventurerCount,
            errors
        };
    }
}
