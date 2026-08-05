/**
 * CommandDefinition.js
 * 効果コマンド定義
 */

import CommandTypes from "../constants/CommandTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";
import EquipmentSlotTypes from "../constants/EquipmentSlotTypes.js";

export default class CommandDefinition {

    constructor({

        type,

        amount = null,

        value = null,

        status = null,

        params = {}

    }) {

        if (
            typeof type !== "string" ||
            type.length === 0
        ) {
            throw new Error(
                "CommandDefinition: typeを指定してください。"
            );
        }

        if (!Object.values(CommandTypes).includes(type)) {
            throw new Error(
                `CommandDefinition: 未対応のtypeです。value=${type}`
            );
        }

        if (
            amount !== null &&
            (!Number.isInteger(amount) || amount < 0)
        ) {
            throw new Error(
                "CommandDefinition: amountには0以上の整数を指定してください。"
            );
        }

        if (
            params === null ||
            typeof params !== "object" ||
            Array.isArray(params)
        ) {
            throw new Error(
                "CommandDefinition: paramsにはオブジェクトを指定してください。"
            );
        }

        if (
            [CommandTypes.DOUBLE_STAT, CommandTypes.HALVE_STAT]
                .includes(type) &&
            (
                !Array.isArray(params.abilities) ||
                params.abilities.length === 0 ||
                params.abilities.some(ability =>
                    !Object.values(AbilityTypes).includes(ability)
                ) ||
                new Set(params.abilities).size !==
                    params.abilities.length ||
                (
                    params.duration !== undefined &&
                    !["QUEST", "PERMANENT"].includes(params.duration)
                )
            )
        ) {
            throw new Error(
                "CommandDefinition: 能力値の倍化・半減指定が不正です。"
            );
        }

        if (type === CommandTypes.MODIFY_EQUIPMENT_SLOTS) {
            const slots = params.slots ?? {};
            if (
                slots === null ||
                typeof slots !== "object" ||
                Array.isArray(slots) ||
                Object.entries(slots).some(([slot, value]) =>
                    !Object.values(EquipmentSlotTypes).includes(slot) ||
                    !Number.isInteger(value)
                ) ||
                (
                    params.accessoryLimit !== undefined &&
                    !Number.isInteger(params.accessoryLimit)
                ) ||
                (
                    Object.keys(slots).length === 0 &&
                    params.accessoryLimit === undefined
                )
            ) {
                throw new Error(
                    "CommandDefinition: 装備枠修正指定が不正です。"
                );
            }
        }

        this.type = type;

        this.amount = amount;

        this.value = value;

        this.status = status;

        this.params = Object.freeze({
            ...params
        });

        Object.freeze(this);

    }

}
