/**
 * CostEngine.js
 * コストを実行用Commandへ変換する。
 */

import CostTypes from "../constants/CostTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import MpReplacementChoices from "../constants/MpReplacementChoices.js";
import CommandDefinition from "../models/CommandDefinition.js";

export default class CostEngine {

    /**
     * 支払い可能か判定する
     *
     * @param {EffectContext} context
     * @returns {boolean}
     */
    canPay(context) {

        const cost = context.effect.cost;

        if (cost === null) {

            return true;

        }

        switch (cost.type) {

            case CostTypes.NONE:

                return true;

            case CostTypes.MP:

                if (this._getMpReplacementOptions(
                    context,
                    cost.amount
                ).length > 0) {
                    return true;
                }

                return Boolean(
                    context.player &&
                    context.player.adventurer &&
                    context.player.adventurer.canSpendMp(
                        cost.amount
                    )
                );

            default:

                throw new Error(
                    `未対応のCostType: ${cost.type}`
                );

        }

    }

    /**
     * 支払いCommandを生成する
     *
     * @param {EffectContext} context
     * @returns {CommandDefinition[]}
     */
    buildCommands(context) {

        const cost = context.effect.cost;

        if (cost === null) {

            return [];

        }

        switch (cost.type) {

            case CostTypes.NONE:

                return [];

            case CostTypes.MP:

                {
                    const selections =
                        context.options.mpReplacementIdsByPlayer;
                    let selectedChoice;
                    if (
                        selections &&
                        Object.prototype.hasOwnProperty.call(
                            selections,
                            context.player.id
                        )
                    ) {
                        selectedChoice = selections[context.player.id];
                    } else if (
                        context.options.mpReplacementCardInstanceId !==
                        undefined
                    ) {
                        selectedChoice =
                            context.options.mpReplacementCardInstanceId;
                    }
                    const replacementDecisionMade =
                        selectedChoice !== undefined;
                    const selectedId =
                        selectedChoice === MpReplacementChoices.DECLINE
                            ? null
                            : selectedChoice ?? null;

                return [

                    new CommandDefinition({

                        type: CommandTypes.LOSE_MP,

                        amount: cost.amount,

                        params: {
                            requireFullPayment: true,
                            replacementCardInstanceId: selectedId,
                            replacementDecisionMade
                        }

                    })

                ];
                }

            default:

                throw new Error(
                    `未対応のCostType: ${cost.type}`
                );

        }

    }

    _getMpReplacementOptions(context, amount) {
        return context.gameContext?.adventureAbilityManager
            ?.getMpReplacementOptions(context.player, amount) ?? [];
    }

}
