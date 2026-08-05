import CardTypes from "../constants/CardTypes.js";
import AdventureAbilityTypes from "../constants/AdventureAbilityTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import CommandTypes from "../constants/CommandTypes.js";

const PASSIVE_CARD_TYPES = new Set([
    CardTypes.SKILL,
    CardTypes.TRAIT
]);

export default class AdventureAbilityManager {
    isAdventureAbilityCard(card) {
        return [
            CardTypes.MAGIC,
            CardTypes.SKILL,
            CardTypes.TRAIT
        ].includes(card?.definition?.type);
    }

    isPassive(card) {
        return (
            PASSIVE_CARD_TYPES.has(card?.definition?.type) &&
            card.faceUp === true &&
            card.definition.adventureAbilityType ===
                AdventureAbilityTypes.PASSIVE
        );
    }

    isActive(card) {
        return (
            PASSIVE_CARD_TYPES.has(card?.definition?.type) &&
            card.definition.adventureAbilityType ===
                AdventureAbilityTypes.ACTIVE
        );
    }

    refreshPassiveState(player) {
        const modifiers = Object.fromEntries(
            Object.values(AbilityTypes).map(type => [type, 0])
        );
        const tags = new Set();

        for (const card of player.zones.field.cards) {
            if (!this.isPassive(card)) {
                continue;
            }
            for (const [ability, amount] of Object.entries(
                card.definition.statModifiers
            )) {
                modifiers[ability] += amount;
            }
            for (const tag of card.definition.grantedTags) {
                tags.add(tag);
            }
            for (const command of this.getContinuousCommandsForCard(card)) {
                if (
                    command.type === CommandTypes.MODIFY_STAT &&
                    !(command.params.questTags?.length > 0)
                ) {
                    for (const [ability, amount] of Object.entries(
                        command.params.modifiers ?? {}
                    )) {
                        modifiers[ability] += amount;
                    }
                }
                if (command.type === CommandTypes.ADD_TAG) {
                    const tag = command.params.tag ?? command.value;
                    if (typeof tag === "string" && tag.length > 0) {
                        tags.add(tag);
                    }
                }
            }
        }

        const previousModifiers =
            player.adventurer.getGrowthModifiers();
        const previousTags = player.adventurer.getGrantedTags();
        const nextTags = [...tags].sort();
        const changed =
            Object.keys(modifiers).some(
                ability =>
                    modifiers[ability] !== previousModifiers[ability]
            ) ||
            nextTags.length !== previousTags.length ||
            nextTags.some((tag, index) => tag !== previousTags[index]);

        player.adventurer.setGrowthModifiers(modifiers);
        player.adventurer.setGrantedTags(nextTags);

        return { changed, modifiers: { ...modifiers }, tags: nextTags };
    }

    getContinuousCommandsForCard(card) {
        if (
            card?.faceUp !== true ||
            !Array.isArray(card?.definition?.effects)
        ) {
            return [];
        }
        return card.definition.effects
            .filter(effect => effect.trigger === TriggerTypes.CONTINUOUS)
            .flatMap(effect => effect.commands);
    }

    getContinuousEntries(player, commandType = null) {
        return player.zones.field.cards.flatMap(card =>
            this.getContinuousCommandsForCard(card)
                .filter(command =>
                    commandType === null || command.type === commandType
                )
                .map(command => ({ card, command }))
        );
    }

    getQuestStatModifier(player, ability, questTags = []) {
        let modifier = 0;
        for (const { command } of this.getContinuousEntries(
            player,
            CommandTypes.MODIFY_STAT
        )) {
            const requiredTags = command.params.questTags ?? [];
            if (
                requiredTags.length === 0 ||
                !requiredTags.every(tag => questTags.includes(tag))
            ) {
                continue;
            }
            modifier += command.params.modifiers?.[ability] ?? 0;
        }
        return modifier;
    }

    applyDamageEffects({
        player,
        amount,
        questTags = [],
        duringQuest = false,
        unpreventable = false
    }) {
        if (unpreventable) {
            return {
                originalAmount: amount,
                amount,
                prevented: 0,
                sources: []
            };
        }
        const sources = [];
        for (const { card, command } of this.getContinuousEntries(player)) {
            const requiredTags = command.params.questTags ?? [];
            if (!requiredTags.every(tag => questTags.includes(tag))) {
                continue;
            }
            if (command.type === CommandTypes.PREVENT_QUEST_DAMAGE) {
                if (!duringQuest) {
                    continue;
                }
                sources.push(card.instanceId);
                return {
                    originalAmount: amount,
                    amount: 0,
                    prevented: amount,
                    sources
                };
            }
        }
        let result = amount;
        for (const { card, command } of this.getContinuousEntries(
            player,
            CommandTypes.REDUCE_DAMAGE
        )) {
            const requiredTags = command.params.questTags ?? [];
            if (!requiredTags.every(tag => questTags.includes(tag))) {
                continue;
            }
            const reduction = Math.min(result, command.amount ?? 0);
            if (reduction > 0) {
                result -= reduction;
                sources.push(card.instanceId);
            }
        }
        return {
            originalAmount: amount,
            amount: result,
            prevented: amount - result,
            sources
        };
    }

    getResourceGainBonus(player, { questTags = [] } = {}) {
        return this.getContinuousEntries(
            player,
            CommandTypes.MODIFY_RESOURCE_GAIN
        ).reduce((total, { command }) => {
            const requiredTags = command.params.questTags ?? [];
            return requiredTags.every(tag => questTags.includes(tag))
                ? total + (command.amount ?? 0)
                : total;
        }, 0);
    }

    getMpReplacementOptions(player, amount) {
        return this.getContinuousEntries(
            player,
            CommandTypes.REPLACE_MP_WITH_COUNTER
        ).filter(({ card, command }) => {
            const counter = command.params.counter;
            const counterPerMp = command.params.counterPerMp ?? 1;
            const maximum = command.params.maxCounters ?? null;
            if (
                typeof counter !== "string" ||
                counter.length === 0 ||
                !Number.isInteger(counterPerMp) ||
                counterPerMp < 1
            ) {
                return false;
            }
            const next = (card.counters[counter] ?? 0) +
                amount * counterPerMp;
            return maximum === null || next <= maximum;
        });
    }
}
