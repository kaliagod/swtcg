/**
 * JSONから読み込む不変のカード定義。
 */

import EffectDefinition from "./EffectDefinition.js";
import CommandDefinition from "./CommandDefinition.js";
import ConditionDefinition from "./ConditionDefinition.js";
import CostDefinition from "./CostDefinition.js";
import TargetDefinition from "./TargetDefinition.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import CardTypes from "../constants/CardTypes.js";
import ItemUseTypes from "../constants/ItemUseTypes.js";
import EquipmentSlotTypes from "../constants/EquipmentSlotTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";
import AdventureAbilityTypes from "../constants/AdventureAbilityTypes.js";

export default class CardDefinition {

    constructor(data) {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error(
                "CardDefinition: データオブジェクトを指定してください。"
            );
        }

        if (typeof data.id !== "string" || data.id.length === 0) {
            throw new Error(
                "CardDefinition: idを指定してください。"
            );
        }

        if (typeof data.name !== "string" || data.name.length === 0) {
            throw new Error(
                `CardDefinition(${data.id}): nameを指定してください。`
            );
        }

        if (typeof data.type !== "string" || data.type.length === 0) {
            throw new Error(
                `CardDefinition(${data.id}): typeを指定してください。`
            );
        }

        if (
            data.nameKey !== undefined &&
            (typeof data.nameKey !== "string" || data.nameKey.length === 0)
        ) {
            throw new Error(
                `CardDefinition(${data.id}): nameKeyには空でない文字列を指定してください。`
            );
        }

        if (
            data.imagePath !== undefined &&
            data.imagePath !== null &&
            (
                typeof data.imagePath !== "string" ||
                data.imagePath.length === 0
            )
        ) {
            throw new Error(
                `CardDefinition(${data.id}): imagePathには空でない文字列を指定してください。`
            );
        }

        if (!Object.values(CardTypes).includes(data.type)) {
            throw new Error(
                `CardDefinition(${data.id}): 未対応のtypeです。value=${data.type}`
            );
        }

        if (
            data.cost !== undefined &&
            (!Number.isInteger(data.cost) || data.cost < 0)
        ) {
            throw new Error(
                `CardDefinition(${data.id}): costには0以上の整数を指定してください。`
            );
        }

        for (const propertyName of ["tags", "text", "effects"]) {
            if (
                data[propertyName] !== undefined &&
                !Array.isArray(data[propertyName])
            ) {
                throw new Error(
                    `CardDefinition(${data.id}): ${propertyName}には配列を指定してください。`
                );
            }
        }

        this._validateBaseStats(data);

        if (
            data.grantedTags !== undefined &&
            (
                !Array.isArray(data.grantedTags) ||
                data.grantedTags.some(tag =>
                    typeof tag !== "string" || tag.length === 0
                )
            )
        ) {
            throw new Error(
                `CardDefinition(${data.id}): grantedTagsには空でない文字列の配列を指定してください。`
            );
        }

        for (const propertyName of [
            "useRequirements",
            "participationRequirements"
        ]) {
            this._validateAdventurerRequirements(
                data.id,
                propertyName,
                data[propertyName]
            );
        }

        if (
            data.participationRequirements !== undefined &&
            data.type !== CardTypes.QUEST
        ) {
            throw new Error(
                `CardDefinition(${data.id}): participationRequirementsはQUESTにのみ指定できます。`
            );
        }

        if (
            data.adventureAbilityType !== undefined &&
            data.adventureAbilityType !== null &&
            !Object.values(AdventureAbilityTypes).includes(
                data.adventureAbilityType
            )
        ) {
            throw new Error(
                `CardDefinition(${data.id}): adventureAbilityTypeが不正です。`
            );
        }

        if (
            data.resolutionZone !== undefined &&
            data.resolutionZone !== null &&
            !Object.values(ZoneTypes).includes(data.resolutionZone)
        ) {
            throw new Error(
                `CardDefinition(${data.id}): 未対応のresolutionZoneです。value=${data.resolutionZone}`
            );
        }

        if (
            data.itemUse !== undefined &&
            data.itemUse !== null &&
            !Object.values(ItemUseTypes).includes(data.itemUse)
        ) {
            throw new Error(
                `CardDefinition(${data.id}): 未対応のitemUseです。Value=${data.itemUse}`
            );
        }

        if (
            data.equipmentSlot !== undefined &&
            data.equipmentSlot !== null &&
            !Object.values(EquipmentSlotTypes).includes(
                data.equipmentSlot
            )
        ) {
            throw new Error(
                `CardDefinition(${data.id}): 未対応のequipmentSlotです。Value=${data.equipmentSlot}`
            );
        }

        if (
            data.equipmentSlot !== undefined &&
            data.type !== CardTypes.EQUIPMENT
        ) {
            throw new Error(
                `CardDefinition(${data.id}): equipmentSlotはEQUIPMENTにのみ指定できます。`
            );
        }

        if (data.equipmentSlots !== undefined) {
            if (
                data.type !== CardTypes.EQUIPMENT ||
                data.equipmentSlots === null ||
                typeof data.equipmentSlots !== "object" ||
                Array.isArray(data.equipmentSlots) ||
                Object.keys(data.equipmentSlots).length === 0
            ) {
                throw new Error(
                    `CardDefinition(${data.id}): equipmentSlotsが不正です。`
                );
            }
            for (const [slot, amount] of Object.entries(
                data.equipmentSlots
            )) {
                if (
                    !Object.values(EquipmentSlotTypes).includes(slot) ||
                    !Number.isInteger(amount) ||
                    amount < 1
                ) {
                    throw new Error(
                        `CardDefinition(${data.id}): equipmentSlots.${slot}が不正です。`
                    );
                }
            }
        }

        if (
            data.equipmentSlot !== undefined &&
            data.equipmentSlots !== undefined
        ) {
            throw new Error(
                `CardDefinition(${data.id}): equipmentSlotとequipmentSlotsは同時に指定できません。`
            );
        }

        for (const propertyName of [
            "equipRequirements",
            "statModifiers",
            "activeQuestModifiers"
        ]) {
            const values = data[propertyName];
            if (values === undefined) {
                continue;
            }
            if (
                values === null ||
                typeof values !== "object" ||
                Array.isArray(values)
            ) {
                throw new Error(
                    `CardDefinition(${data.id}): ${propertyName}にはオブジェクトを指定してください。`
                );
            }
            for (const [ability, value] of Object.entries(values)) {
                if (!Object.values(AbilityTypes).includes(ability)) {
                    throw new Error(
                        `CardDefinition(${data.id}): 未対応の能力値です。Ability=${ability}`
                    );
                }
                if (
                    typeof value !== "number" ||
                    !Number.isFinite(value) ||
                    (propertyName === "equipRequirements" && value < 0)
                ) {
                    throw new Error(
                        `CardDefinition(${data.id}): ${propertyName}.${ability}が不正です。`
                    );
                }
            }
        }

        if (
            data.equipRequirements !== undefined &&
            ![
                CardTypes.EQUIPMENT,
                CardTypes.ACCESSORY
            ].includes(data.type)
        ) {
            throw new Error(
                `CardDefinition(${data.id}): equipRequirementsは装備品・装飾品にのみ指定できます。`
            );
        }

        if (
            data.adventureAbilityType !== undefined &&
            ![CardTypes.SKILL, CardTypes.TRAIT].includes(data.type)
        ) {
            throw new Error(
                `CardDefinition(${data.id}): adventureAbilityTypeは特技・特徴にのみ指定できます。`
            );
        }

        if (
            (
                data.activeQuestModifiers !== undefined ||
                data.grantedTags !== undefined
            ) &&
            ![
                CardTypes.MAGIC,
                CardTypes.SKILL,
                CardTypes.TRAIT
            ].includes(data.type)
        ) {
            throw new Error(
                `CardDefinition(${data.id}): 冒険者能力情報は魔法・特技・特徴にのみ指定できます。`
            );
        }

        if (data.questRequirements !== undefined) {
            if (
                data.questRequirements === null ||
                typeof data.questRequirements !== "object" ||
                Array.isArray(data.questRequirements)
            ) {
                throw new Error(
                    `CardDefinition(${data.id}): questRequirementsにはオブジェクトを指定してください。`
                );
            }
            for (const [ability, minimum] of Object.entries(
                data.questRequirements
            )) {
                if (
                    !Object.values(AbilityTypes).includes(ability) ||
                    typeof minimum !== "number" ||
                    !Number.isFinite(minimum) ||
                    minimum < 0
                ) {
                    throw new Error(
                        `CardDefinition(${data.id}): questRequirements.${ability}が不正です。`
                    );
                }
            }
        }

        for (const propertyName of [
            "questDamage",
            "questRewardResources",
            "levelGain"
        ]) {
            if (
                data[propertyName] !== undefined &&
                (!Number.isInteger(data[propertyName]) ||
                    data[propertyName] < 0)
            ) {
                throw new Error(
                    `CardDefinition(${data.id}): ${propertyName}には0以上の整数を指定してください。`
                );
            }
        }

        if (
            [
                "questRequirements",
                "questDamage",
                "questRewardResources"
            ].some(propertyName => data[propertyName] !== undefined) &&
            data.type !== CardTypes.QUEST
        ) {
            throw new Error(
                `CardDefinition(${data.id}): 依頼情報はQUESTにのみ指定できます。`
            );
        }

        if (
            data.levelGain !== undefined &&
            ![
                CardTypes.MAGIC,
                CardTypes.SKILL,
                CardTypes.TRAIT
            ].includes(data.type)
        ) {
            throw new Error(
                `CardDefinition(${data.id}): levelGainは冒険者デッキの成長カードにのみ指定できます。`
            );
        }

        if (
            data.itemUse !== undefined &&
            data.type !== CardTypes.ITEM
        ) {
            throw new Error(
                `CardDefinition(${data.id}): itemUseはITEMにのみ指定できます。`
            );
        }

        this.id = data.id;
        this.name = data.name;
        this.nameKey = data.nameKey ?? data.id;
        this.imagePath = data.imagePath ?? null;
        this.type = data.type;
        this.cost = data.cost ?? 0;
        this.rarity = data.rarity ?? "COMMON";
        this.resolutionZone = data.resolutionZone ?? null;
        this.itemUse = data.itemUse ?? null;
        this.equipmentSlot = data.equipmentSlot ?? null;
        this.equipmentSlots = Object.freeze(
            data.equipmentSlots !== undefined
                ? { ...data.equipmentSlots }
                : data.equipmentSlot !== undefined &&
                    data.equipmentSlot !== null
                    ? { [data.equipmentSlot]: 1 }
                    : {}
        );
        this.baseStats = Object.freeze({
            ...(data.baseStats ?? {})
        });
        this.adventureAbilityType =
            data.adventureAbilityType ??
            ([CardTypes.SKILL, CardTypes.TRAIT].includes(data.type)
                ? AdventureAbilityTypes.PASSIVE
                : null);
        this.equipRequirements = Object.freeze({
            ...(data.equipRequirements ?? {})
        });
        this.statModifiers = Object.freeze({
            ...(data.statModifiers ?? {})
        });
        this.activeQuestModifiers = Object.freeze({
            ...(data.activeQuestModifiers ?? {})
        });
        this.grantedTags = Object.freeze([
            ...(data.grantedTags ?? [])
        ]);
        this.useRequirements =
            this._freezeAdventurerRequirements(
                data.useRequirements
            );
        this.participationRequirements =
            this._freezeAdventurerRequirements(
                data.participationRequirements
            );
        this.questRequirements = Object.freeze({
            ...(data.questRequirements ?? {})
        });
        this.questDamage = data.questDamage ?? 0;
        this.questRewardResources =
            data.questRewardResources ?? 0;
        this.levelGain = data.levelGain ?? 0;
        this.tags = Object.freeze([...(data.tags ?? [])]);
        this.text = Object.freeze([...(data.text ?? [])]);
        this.effects = Object.freeze(
            (data.effects ?? []).map(
                effect => this._buildEffect(effect)
            )
        );

        Object.freeze(this);
    }

    _validateBaseStats(data) {
        const abilities = Object.values(AbilityTypes);
        const values = data.baseStats;

        if (data.type !== CardTypes.ADVENTURER) {
            if (values !== undefined) {
                throw new Error(
                    `CardDefinition(${data.id}): baseStatsはADVENTURERにのみ指定できます。`
                );
            }
            return;
        }

        if (
            values === null ||
            typeof values !== "object" ||
            Array.isArray(values)
        ) {
            throw new Error(
                `CardDefinition(${data.id}): 冒険者カードにはbaseStatsを指定してください。`
            );
        }

        const unknownAbility = Object.keys(values).find(
            ability => !abilities.includes(ability)
        );
        if (unknownAbility !== undefined) {
            throw new Error(
                `CardDefinition(${data.id}): baseStats.${unknownAbility}は未対応です。`
            );
        }

        for (const ability of abilities) {
            const value = values[ability];
            if (!Number.isInteger(value) || value < 0) {
                throw new Error(
                    `CardDefinition(${data.id}): baseStats.${ability}には0以上の整数を指定してください。`
                );
            }
        }
    }

    _validateAdventurerRequirements(cardId, propertyName, value) {
        if (value === undefined) {
            return;
        }
        if (
            value === null ||
            typeof value !== "object" ||
            Array.isArray(value)
        ) {
            throw new Error(
                `CardDefinition(${cardId}): ${propertyName}にはオブジェクトを指定してください。`
            );
        }

        const allowedKeys = new Set([
            "minLevel",
            "minStats",
            "requiredTags",
            "forbiddenTags"
        ]);
        for (const key of Object.keys(value)) {
            if (!allowedKeys.has(key)) {
                throw new Error(
                    `CardDefinition(${cardId}): ${propertyName}.${key}は未対応です。`
                );
            }
        }

        if (
            value.minLevel !== undefined &&
            (!Number.isInteger(value.minLevel) || value.minLevel < 0)
        ) {
            throw new Error(
                `CardDefinition(${cardId}): ${propertyName}.minLevelが不正です。`
            );
        }

        if (value.minStats !== undefined) {
            if (
                value.minStats === null ||
                typeof value.minStats !== "object" ||
                Array.isArray(value.minStats)
            ) {
                throw new Error(
                    `CardDefinition(${cardId}): ${propertyName}.minStatsにはオブジェクトを指定してください。`
                );
            }
            for (const [ability, minimum] of Object.entries(
                value.minStats
            )) {
                if (
                    !Object.values(AbilityTypes).includes(ability) ||
                    typeof minimum !== "number" ||
                    !Number.isFinite(minimum)
                ) {
                    throw new Error(
                        `CardDefinition(${cardId}): ${propertyName}.minStats.${ability}が不正です。`
                    );
                }
            }
        }

        for (const tagProperty of [
            "requiredTags",
            "forbiddenTags"
        ]) {
            const tags = value[tagProperty];
            if (tags === undefined) {
                continue;
            }
            if (
                !Array.isArray(tags) ||
                tags.some(tag =>
                    typeof tag !== "string" || tag.length === 0
                ) ||
                new Set(tags).size !== tags.length
            ) {
                throw new Error(
                    `CardDefinition(${cardId}): ${propertyName}.${tagProperty}が不正です。`
                );
            }
        }

        const forbidden = new Set(value.forbiddenTags ?? []);
        if ((value.requiredTags ?? []).some(tag => forbidden.has(tag))) {
            throw new Error(
                `CardDefinition(${cardId}): ${propertyName}で同じタグを必須・禁止にできません。`
            );
        }
    }

    _freezeAdventurerRequirements(value = undefined) {
        return Object.freeze({
            minLevel: value?.minLevel ?? 0,
            minStats: Object.freeze({ ...(value?.minStats ?? {}) }),
            requiredTags: Object.freeze([
                ...(value?.requiredTags ?? [])
            ]),
            forbiddenTags: Object.freeze([
                ...(value?.forbiddenTags ?? [])
            ])
        });
    }

    _buildEffect(effect) {
        if (effect instanceof EffectDefinition) {
            return effect;
        }

        if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
            throw new Error(
                `CardDefinition(${this.id}): effectsには効果定義オブジェクトを指定してください。`
            );
        }

        return new EffectDefinition({
            trigger: effect.trigger,
            condition: effect.condition
                ? new ConditionDefinition(effect.condition)
                : null,
            cost: effect.cost
                ? new CostDefinition(effect.cost)
                : null,
            target: effect.target
                ? new TargetDefinition(effect.target)
                : null,
            commands: (effect.commands ?? []).map(
                command => new CommandDefinition(command)
            )
        });
    }

}
