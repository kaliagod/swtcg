/**
 * ConditionEngine.js
 * 発動条件判定
 */

import ConditionTypes from "../constants/ConditionTypes.js";

export default class ConditionEngine {

    /**
     * 条件を判定する
     *
     * @param {EffectContext} context
     * @returns {boolean}
     */
    evaluate(context) {

        const condition = context.effect.condition;

        //--------------------------------------
        // 条件なし
        //--------------------------------------

        if (condition === null) {

            return true;

        }

        switch (condition.type) {

            case ConditionTypes.ALWAYS:

                return true;

            case ConditionTypes.ALL:
                return condition.params.conditions.every(
                    child => this._evaluateCondition(child, context)
                );

            case ConditionTypes.ANY:
                return condition.params.conditions.some(
                    child => this._evaluateCondition(child, context)
                );

            case ConditionTypes.NOT:
                return !this._evaluateCondition(
                    condition.params.condition,
                    context
                );

            case ConditionTypes.PLAYER_LEVEL:
                return this._compare(
                    context.player?.adventurer?.level,
                    condition.operator ?? ">=",
                    condition.value
                );

            case ConditionTypes.PLAYER_STAT: {
                const adventurer = context.player?.adventurer;
                if (!adventurer) {
                    return false;
                }
                const useQuestValue =
                    condition.params.quest === true ||
                    (
                        condition.params.quest !== false &&
                        context.gameContext?.gameState?.questPhase
                            ?.activeQuestInstanceId !== null &&
                        context.gameContext?.gameState?.questPhase
                            ?.activeQuestInstanceId !== undefined
                    );
                const stat = useQuestValue
                    ? adventurer.getQuestStat(condition.params.ability)
                    : adventurer.getCurrentStat(condition.params.ability);
                return this._compare(
                    stat,
                    condition.operator ?? ">=",
                    condition.value
                );
            }

            case ConditionTypes.PLAYER_TAG:
                return this._matchesPresence(
                    context.player?.adventurer?.hasTag(
                        condition.params.tag ?? condition.value
                    ) ?? false,
                    condition.operator
                );

            case ConditionTypes.PLAYER_STATUS:
                return this._matchesPresence(
                    context.player?.adventurer?.statuses?.some(
                        status =>
                            status.name ===
                            (condition.params.status ?? condition.value)
                    ) ?? false,
                    condition.operator
                );

            case ConditionTypes.SOURCE_COUNTER:
                return this._compare(
                    context.sourceCard?.counters?.[
                        condition.params.counter
                    ] ?? 0,
                    condition.operator ?? ">=",
                    condition.value
                );

            case ConditionTypes.SOURCE_STATUS:
                return this._matchesPresence(
                    context.sourceCard?.statuses?.some(
                        status =>
                            status.name ===
                            (condition.params.status ?? condition.value)
                    ) ?? false,
                    condition.operator
                );

            case ConditionTypes.QUEST_TAG: {
                const questCard = this._getActiveQuest(context);
                return this._matchesPresence(
                    questCard?.getTags?.().includes(
                        condition.params.tag ?? condition.value
                    ) ?? false,
                    condition.operator
                );
            }

            default:

                throw new Error(

                    `未対応のConditionType: ${condition.type}`

                );

        }

    }

    _evaluateCondition(condition, context) {
        return this.evaluate({
            ...context,
            effect: {
                ...context.effect,
                condition
            }
        });
    }

    _compare(left, operator, right) {
        if (typeof left !== "number" || !Number.isFinite(left)) {
            return false;
        }
        switch (operator) {
            case "==": return left === right;
            case "!=": return left !== right;
            case ">": return left > right;
            case ">=": return left >= right;
            case "<": return left < right;
            case "<=": return left <= right;
            default:
                throw new Error(
                    `未対応の比較演算子: ${operator}`
                );
        }
    }

    _matchesPresence(present, operator = null) {
        if (operator === "NOT" || operator === "NOT_HAS") {
            return !present;
        }
        if (
            operator !== null &&
            operator !== "HAS" &&
            operator !== "=="
        ) {
            throw new Error(
                `未対応の存在演算子: ${operator}`
            );
        }
        return present;
    }

    _getActiveQuest(context) {
        const gameState = context.gameContext?.gameState;
        const questInstanceId =
            gameState?.questPhase?.activeQuestInstanceId;
        if (!questInstanceId) {
            return null;
        }
        return gameState.players
            .flatMap(player => player.zones.field.cards)
            .find(card => card.instanceId === questInstanceId) ?? null;
    }

}
