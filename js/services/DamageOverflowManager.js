import AbilityTypes from "../constants/AbilityTypes.js";
import CardTypes from "../constants/CardTypes.js";

const ELIGIBLE_FIELD_TYPES = new Set([
    CardTypes.EQUIPMENT,
    CardTypes.ACCESSORY,
    CardTypes.ITEM
]);

export default class DamageOverflowManager {
    getState(player, { duringQuest = false } = {}) {
        const vitality = duringQuest
            ? player.adventurer.getQuestStat(AbilityTypes.VITALITY)
            : player.adventurer.getCurrentStat(AbilityTypes.VITALITY);
        const damage = player.adventurer.damage;
        const excess = Math.max(0, damage - vitality);
        const candidates = [
            ...player.zones.resource.cards,
            ...player.zones.field.cards.filter(card =>
                ELIGIBLE_FIELD_TYPES.has(card.definition.type)
            )
        ];

        return {
            vitality,
            damage,
            excess,
            candidates,
            requiredCount: Math.min(excess, candidates.length)
        };
    }

    validateSelection(state, selectedIds) {
        if (
            !Array.isArray(selectedIds) ||
            selectedIds.length !== state.requiredCount ||
            new Set(selectedIds).size !== selectedIds.length
        ) {
            return false;
        }

        const candidateIds = new Set(
            state.candidates.map(card => card.instanceId)
        );
        return selectedIds.every(id => candidateIds.has(id));
    }
}
