import CardTypes from "../constants/CardTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";
import EquipmentSlotTypes from "../constants/EquipmentSlotTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import CommandTypes from "../constants/CommandTypes.js";

export default class EquipmentManager {
    isContinuousEquipment(card) {
        return [
            CardTypes.EQUIPMENT,
            CardTypes.ACCESSORY
        ].includes(card?.definition?.type);
    }

    getEquipmentInSlot(player, slot) {
        return player.zones.field.cards.filter(card =>
            card.definition.type === CardTypes.EQUIPMENT &&
            (card.definition.equipmentSlots?.[slot] ?? 0) > 0
        );
    }

    getSlotRequirement(card, slot) {
        return card?.definition?.equipmentSlots?.[slot] ?? 0;
    }

    getSlotUsage(player, slot, cards = null) {
        return (cards ?? this.getEquipmentInSlot(player, slot))
            .reduce(
                (total, card) =>
                    total + this.getSlotRequirement(card, slot),
                0
            );
    }

    getAccessories(player) {
        return player.zones.field.cards.filter(card =>
            card.definition.type === CardTypes.ACCESSORY
        );
    }

    meetsRequirements(player, card) {
        if (!this.isContinuousEquipment(card)) {
            return true;
        }

        return Object.entries(
            card.definition.equipRequirements
        ).every(([ability, minimum]) =>
            player.adventurer.getCurrentStat(ability) >= minimum
        );
    }

    refreshContinuousModifiers(player) {
        const continuousTotals = Object.fromEntries(
            Object.values(AbilityTypes).map(type => [type, 0])
        );
        const questTotals = Object.fromEntries(
            Object.values(AbilityTypes).map(type => [type, 0])
        );
        const slotModifiers = Object.fromEntries(
            Object.values(EquipmentSlotTypes).map(slot => [slot, 0])
        );
        let accessoryLimitModifier = 0;

        for (const card of player.zones.field.cards) {
            if (
                !this.isContinuousEquipment(card) ||
                card.faceUp === false
            ) {
                continue;
            }

            const destination =
                card.definition.type === CardTypes.EQUIPMENT
                    ? questTotals
                    : continuousTotals;

            for (const [ability, amount] of Object.entries(
                card.definition.statModifiers
            )) {
                destination[ability] += amount;
            }
        }

        for (const card of player.zones.field.cards) {
            if (card.faceUp === false) {
                continue;
            }
            for (const effect of card.definition.effects ?? []) {
                if (effect.trigger !== TriggerTypes.CONTINUOUS) {
                    continue;
                }
                for (const command of effect.commands) {
                    if (
                        command.type !==
                        CommandTypes.MODIFY_EQUIPMENT_SLOTS
                    ) {
                        continue;
                    }
                    for (const [slot, amount] of Object.entries(
                        command.params.slots ?? {}
                    )) {
                        if (!(slot in slotModifiers)) {
                            throw new Error(
                                `EquipmentManager: 未対応の装備枠です。slot=${slot}`
                            );
                        }
                        slotModifiers[slot] += amount;
                    }
                    accessoryLimitModifier +=
                        command.params.accessoryLimit ?? 0;
                }
            }
        }

        player.adventurer.setContinuousModifiers(continuousTotals);
        player.adventurer.setQuestModifiers(questTotals);
        player.adventurer.setEquipmentSlotModifiers(slotModifiers);
        player.adventurer.setAccessoryLimitModifier(
            accessoryLimitModifier
        );
        return {
            continuous: continuousTotals,
            quest: questTotals,
            equipmentSlots: slotModifiers,
            accessoryLimit: accessoryLimitModifier
        };
    }

    getInvalidEquipment(player) {
        return player.zones.field.cards.filter(card =>
            this.isContinuousEquipment(card) &&
            !this.meetsRequirements(player, card)
        );
    }

    getOverflowGroup(player) {
        for (const slot of Object.values(EquipmentSlotTypes)) {
            const cards = this.getEquipmentInSlot(player, slot);
            const limit =
                player.adventurer.getEquipmentSlotLimit(slot);
            const used = this.getSlotUsage(player, slot, cards);
            if (used > limit) {
                return {
                    kind: "EQUIPMENT_SLOT",
                    slot,
                    cards,
                    keepCount: null,
                    minKeepCount: 0,
                    maxKeepCount: cards.length,
                    limit,
                    used
                };
            }
        }

        const accessories = this.getAccessories(player);
        const accessoryLimit =
            player.adventurer.getAccessoryLimit();
        if (accessories.length > accessoryLimit) {
            return {
                kind: "ACCESSORY",
                slot: null,
                cards: accessories,
                keepCount: accessoryLimit,
                minKeepCount: accessoryLimit,
                maxKeepCount: accessoryLimit,
                limit: accessoryLimit,
                used: accessories.length
            };
        }

        return null;
    }

    validateKeepSelection(group, selectedKeepIds) {
        if (
            !Array.isArray(selectedKeepIds) ||
            new Set(selectedKeepIds).size !== selectedKeepIds.length
        ) {
            return false;
        }
        const candidateIds = new Set(
            group.cards.map(card => card.instanceId)
        );
        if (selectedKeepIds.some(id => !candidateIds.has(id))) {
            return false;
        }
        if (group.kind === "ACCESSORY") {
            return selectedKeepIds.length === group.keepCount;
        }

        const selected = group.cards.filter(card =>
            selectedKeepIds.includes(card.instanceId)
        );
        if (
            this.getSlotUsage(
                { zones: { field: { cards: selected } } },
                group.slot,
                selected
            ) > group.limit
        ) {
            return false;
        }

        const unselected = group.cards.filter(
            card => !selected.includes(card)
        );
        const selectedUsage = this.getSlotUsage(
            { zones: { field: { cards: selected } } },
            group.slot,
            selected
        );
        return unselected.every(card =>
            selectedUsage +
                this.getSlotRequirement(card, group.slot) >
                group.limit
        );
    }
}
