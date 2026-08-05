/**
 * 冒険者カードに紐づく、ゲーム中に変化する状態。
 */

import AbilityTypes from "../constants/AbilityTypes.js";
import EquipmentSlotTypes from "../constants/EquipmentSlotTypes.js";

const ABILITY_TYPES =
    Object.freeze(
        Object.values(AbilityTypes)
    );

export default class AdventurerState {

    constructor({

        card = null,

        level = 1,

        baseStats = {},

        modifiers = {},

        continuousModifiers = {},

        questModifiers = {},

        growthModifiers = {},

        temporaryQuestModifiers = {},

        grantedTags = [],

        equipmentSlots = {},

        accessoryLimit = 3,

        damage = 0,

        mpSpent = 0

    } = {}) {

        this._validateNonNegativeInteger(
            level,
            "level"
        );

        this._validateNonNegativeInteger(
            damage,
            "damage"
        );

        this._validateNonNegativeInteger(
            mpSpent,
            "mpSpent"
        );

        this._validateNonNegativeInteger(
            accessoryLimit,
            "accessoryLimit"
        );

        this.card = card;

        this.level = level;

        this.baseStats =
            Object.freeze(
                this._buildStats(baseStats)
            );

        this.modifiers =
            this._buildStats(modifiers);

        this.continuousModifiers =
            this._buildStats(continuousModifiers);

        this.questModifiers =
            this._buildStats(questModifiers);

        this.growthModifiers =
            this._buildStats(growthModifiers);

        this.temporaryQuestModifiers =
            this._buildStats(temporaryQuestModifiers);

        this.setGrantedTags(grantedTags);

        this.equipmentSlots = {};
        this.equipmentSlotModifiers = {};
        for (const slot of Object.values(EquipmentSlotTypes)) {
            const limit = equipmentSlots[slot] ?? 1;
            this._validateNonNegativeInteger(
                limit,
                `equipmentSlots.${slot}`
            );
            this.equipmentSlots[slot] = limit;
            this.equipmentSlotModifiers[slot] = 0;
        }

        this.accessoryLimit = accessoryLimit;

        this.accessoryLimitModifier = 0;

        this.damage = damage;

        this.mpSpent = mpSpent;

        this.temporaryQuestTags = [];

        this.counters = {};

        this.statuses = [];

    }

    getRawStat(type) {

        this._validateAbilityType(type);

        return this.baseStats[type] +
            this.modifiers[type] +
            this.continuousModifiers[type] +
            this.growthModifiers[type];

    }

    getCurrentStat(type) {

        return Math.max(
            0,
            this.getRawStat(type)
        );

    }

    getQuestRawStat(type) {
        this._validateAbilityType(type);
        return this.getRawStat(type) +
            this.questModifiers[type] +
            this.temporaryQuestModifiers[type];
    }

    getQuestStat(type) {
        return Math.max(0, this.getQuestRawStat(type));
    }

    addModifier(
        type,
        amount
    ) {

        this._validateAbilityType(type);

        this._validateNumber(
            amount,
            "amount"
        );

        this.modifiers[type] += amount;

        return this.modifiers[type];

    }

    setContinuousModifiers(values = {}) {
        this.continuousModifiers = this._buildStats(values);
        return { ...this.continuousModifiers };
    }

    getContinuousModifiers() {
        return { ...this.continuousModifiers };
    }

    setQuestModifiers(values = {}) {
        this.questModifiers = this._buildStats(values);
        return { ...this.questModifiers };
    }

    getQuestModifiers() {
        return { ...this.questModifiers };
    }

    setGrowthModifiers(values = {}) {
        this.growthModifiers = this._buildStats(values);
        return { ...this.growthModifiers };
    }

    getGrowthModifiers() {
        return { ...this.growthModifiers };
    }

    setTemporaryQuestModifiers(values = {}) {
        this.temporaryQuestModifiers = this._buildStats(values);
        return { ...this.temporaryQuestModifiers };
    }

    getTemporaryQuestModifiers() {
        return { ...this.temporaryQuestModifiers };
    }

    addTemporaryQuestModifiers(values = {}) {
        for (const [type, amount] of Object.entries(values)) {
            this._validateAbilityType(type);
            this._validateNumber(amount, type);
            this.temporaryQuestModifiers[type] += amount;
        }
        return this.getTemporaryQuestModifiers();
    }

    clearTemporaryQuestModifiers() {
        return this.setTemporaryQuestModifiers({});
    }

    setGrantedTags(tags = []) {
        if (
            !Array.isArray(tags) ||
            tags.some(tag => typeof tag !== "string" || tag.length === 0)
        ) {
            throw new Error(
                "AdventurerState: grantedTagsには空でない文字列の配列を指定してください。"
            );
        }
        this.grantedTags = [...new Set(tags)].sort();
        return this.getGrantedTags();
    }

    getGrantedTags() {
        return [...this.grantedTags];
    }

    hasTag(tag) {
        return this.grantedTags.includes(tag) ||
            this.temporaryQuestTags.includes(tag);
    }

    addTemporaryQuestTag(tag) {
        this._validateTag(tag);
        if (!this.temporaryQuestTags.includes(tag)) {
            this.temporaryQuestTags.push(tag);
            this.temporaryQuestTags.sort();
        }
        return [...this.temporaryQuestTags];
    }

    removeTemporaryQuestTag(tag) {
        this._validateTag(tag);
        this.temporaryQuestTags = this.temporaryQuestTags
            .filter(current => current !== tag);
        return [...this.temporaryQuestTags];
    }

    clearTemporaryQuestTags() {
        this.temporaryQuestTags = [];
        return [];
    }

    getEquipmentModifierState() {
        return {
            continuous: this.getContinuousModifiers(),
            quest: this.getQuestModifiers(),
            equipmentSlots: this.getEquipmentSlotModifiers(),
            accessoryLimit: this.accessoryLimitModifier
        };
    }

    setEquipmentModifierState(state) {
        this.setContinuousModifiers(state.continuous);
        this.setQuestModifiers(state.quest);
        this.setEquipmentSlotModifiers(
            state.equipmentSlots ?? {}
        );
        this.setAccessoryLimitModifier(
            state.accessoryLimit ?? 0
        );
    }

    getEquipmentSlotLimit(slot) {
        if (!Object.values(EquipmentSlotTypes).includes(slot)) {
            throw new Error(
                `AdventurerState: 未対応の装備枠です。slot=${slot}`
            );
        }
        return Math.max(
            0,
            this.equipmentSlots[slot] +
                this.equipmentSlotModifiers[slot]
        );
    }

    setEquipmentSlotLimit(slot, limit) {
        this.getEquipmentSlotLimit(slot);
        this._validateNonNegativeInteger(
            limit,
            `equipmentSlots.${slot}`
        );
        this.equipmentSlots[slot] = limit;
        return limit;
    }

    setAccessoryLimit(limit) {
        this._validateNonNegativeInteger(limit, "accessoryLimit");
        this.accessoryLimit = limit;
        return limit;
    }

    getEquipmentSlotModifiers() {
        return { ...this.equipmentSlotModifiers };
    }

    setEquipmentSlotModifiers(values = {}) {
        const next = {};
        for (const slot of Object.values(EquipmentSlotTypes)) {
            const value = values[slot] ?? 0;
            this._validateNumber(
                value,
                `equipmentSlotModifiers.${slot}`
            );
            next[slot] = value;
        }
        this.equipmentSlotModifiers = next;
        return this.getEquipmentSlotModifiers();
    }

    getAccessoryLimit() {
        return Math.max(
            0,
            this.accessoryLimit + this.accessoryLimitModifier
        );
    }

    setAccessoryLimitModifier(value = 0) {
        this._validateNumber(value, "accessoryLimitModifier");
        this.accessoryLimitModifier = value;
        return value;
    }

    addLevel(amount = 1) {
        this._validateNonNegativeInteger(amount, "amount");
        this.level += amount;
        return this.level;
    }

    setLevel(level) {
        this._validateNonNegativeInteger(level, "level");
        this.level = level;
        return this.level;
    }

    get availableMp() {

        return Math.max(
            0,
            this.getCurrentStat(
                AbilityTypes.SPIRIT
            ) - this.mpSpent
        );

    }

    canSpendMp(amount) {

        this._validateNonNegativeInteger(
            amount,
            "amount"
        );

        return this.availableMp >= amount;

    }

    spendMp(
        amount,
        { allowPartial = false } = {}
    ) {

        this._validateNonNegativeInteger(
            amount,
            "amount"
        );

        if (
            !allowPartial &&
            !this.canSpendMp(amount)
        ) {
            throw new Error(
                "AdventurerState.spendMp(): 使用可能なMPが不足しています。"
            );
        }

        const spentAmount =
            allowPartial
                ? Math.min(
                    amount,
                    this.availableMp
                )
                : amount;

        this.mpSpent += spentAmount;

        return spentAmount;

    }

    recoverMp(amount = 3) {

        this._validateNonNegativeInteger(
            amount,
            "amount"
        );

        const recoveredAmount =
            Math.min(
                amount,
                this.mpSpent
            );

        this.mpSpent -= recoveredAmount;

        return recoveredAmount;

    }

    addDamage(amount) {

        this._validateNonNegativeInteger(
            amount,
            "amount"
        );

        this.damage += amount;

        return amount;

    }

    setDamage(amount) {
        this._validateNonNegativeInteger(amount, "damage");
        this.damage = amount;
        return this.damage;
    }

    recoverDamage(amount = 3) {

        this._validateNonNegativeInteger(
            amount,
            "amount"
        );

        const recoveredAmount =
            Math.min(
                amount,
                this.damage
            );

        this.damage -= recoveredAmount;

        return recoveredAmount;

    }

    _buildStats(values) {

        const stats = {};

        for (const type of ABILITY_TYPES) {

            const value = values[type] ?? 0;

            this._validateNumber(
                value,
                type
            );

            stats[type] = value;

        }

        return stats;

    }

    _validateAbilityType(type) {

        if (!ABILITY_TYPES.includes(type)) {
            throw new Error(
                `AdventurerState: 未対応の能力値です。type=${type}`
            );
        }

    }

    _validateNumber(
        value,
        parameterName
    ) {

        if (
            typeof value !== "number" ||
            !Number.isFinite(value)
        ) {
            throw new Error(
                `AdventurerState: ${parameterName}には数値を指定してください。`
            );
        }

    }

    _validateNonNegativeInteger(
        value,
        parameterName
    ) {

        if (
            !Number.isInteger(value) ||
            value < 0
        ) {
            throw new Error(
                `AdventurerState: ${parameterName}には0以上の整数を指定してください。`
            );
        }

    }

    _validateTag(tag) {
        if (typeof tag !== "string" || tag.length === 0) {
            throw new Error(
                "AdventurerState: tagには空でない文字列を指定してください。"
            );
        }
    }

}
