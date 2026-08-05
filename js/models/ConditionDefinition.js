/**
 * ConditionDefinition.js
 * 発動条件定義
 */

import ConditionTypes from "../constants/ConditionTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";

const COMPARISON_OPERATORS = new Set([
    "==",
    "!=",
    ">",
    ">=",
    "<",
    "<="
]);

export default class ConditionDefinition {

    constructor({

        type,

        operator = null,

        value = null,

        params = {}

    }) {

        if (
            typeof type !== "string" ||
            type.length === 0
        ) {
            throw new Error(
                "ConditionDefinition: typeを指定してください。"
            );
        }

        if (!Object.values(ConditionTypes).includes(type)) {
            throw new Error(
                `ConditionDefinition: 未対応のtypeです。value=${type}`
            );
        }

        const normalizedParams = { ...params };

        if ([ConditionTypes.ALL, ConditionTypes.ANY].includes(type)) {
            if (
                !Array.isArray(params.conditions) ||
                params.conditions.length === 0
            ) {
                throw new Error(
                    "ConditionDefinition: ALL/ANYにはconditionsを指定してください。"
                );
            }
            normalizedParams.conditions = Object.freeze(
                params.conditions.map(condition =>
                    condition instanceof ConditionDefinition
                        ? condition
                        : new ConditionDefinition(condition)
                )
            );
        }

        if (type === ConditionTypes.NOT) {
            if (!params.condition) {
                throw new Error(
                    "ConditionDefinition: NOTにはconditionを指定してください。"
                );
            }
            normalizedParams.condition =
                params.condition instanceof ConditionDefinition
                    ? params.condition
                    : new ConditionDefinition(params.condition);
        }

        if (
            type === ConditionTypes.PLAYER_STAT &&
            !Object.values(AbilityTypes).includes(params.ability)
        ) {
            throw new Error(
                "ConditionDefinition: PLAYER_STATのabilityが不正です。"
            );
        }

        if (
            [
                ConditionTypes.PLAYER_LEVEL,
                ConditionTypes.PLAYER_STAT,
                ConditionTypes.SOURCE_COUNTER
            ].includes(type)
        ) {
            const comparison = operator ?? ">=";
            if (
                !COMPARISON_OPERATORS.has(comparison) ||
                typeof value !== "number" ||
                !Number.isFinite(value)
            ) {
                throw new Error(
                    "ConditionDefinition: 数値比較条件が不正です。"
                );
            }
        }

        if (
            [
                ConditionTypes.PLAYER_TAG,
                ConditionTypes.PLAYER_STATUS,
                ConditionTypes.SOURCE_STATUS,
                ConditionTypes.QUEST_TAG
            ].includes(type) &&
            (
                typeof (params.tag ?? params.status ?? value) !== "string" ||
                (params.tag ?? params.status ?? value).length === 0
            )
        ) {
            throw new Error(
                "ConditionDefinition: タグまたは状態名を指定してください。"
            );
        }

        if (
            type === ConditionTypes.SOURCE_COUNTER &&
            (
                typeof params.counter !== "string" ||
                params.counter.length === 0
            )
        ) {
            throw new Error(
                "ConditionDefinition: SOURCE_COUNTERにはcounterを指定してください。"
            );
        }

        this.type = type;

        this.operator = operator;

        this.value = value;

        this.params = normalizedParams;

        Object.freeze(this.params);

        Object.freeze(this);

    }

}
