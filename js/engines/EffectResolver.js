/**
 * EffectResolver.js
 * 効果全体の実行フローを管理する。
 */

import EffectContext from "../context/EffectContext.js";

export default class EffectResolver {

    /**
     * @param {Object} dependencies
     * @param {ConditionEngine} dependencies.conditionEngine
     * @param {TargetEngine} dependencies.targetEngine
     * @param {CostEngine} dependencies.costEngine
     * @param {CommandExecutor} dependencies.commandExecutor
     * @param {TransactionManager} dependencies.transactionManager
     */
    constructor({
        conditionEngine,
        targetEngine,
        costEngine,
        commandExecutor,
        transactionManager
    }) {

        if (!conditionEngine) {
            throw new Error(
                "EffectResolver: conditionEngineを指定してください。"
            );
        }

        if (!targetEngine) {
            throw new Error(
                "EffectResolver: targetEngineを指定してください。"
            );
        }

        if (!costEngine) {
            throw new Error(
                "EffectResolver: costEngineを指定してください。"
            );
        }

        if (!commandExecutor) {
            throw new Error(
                "EffectResolver: commandExecutorを指定してください。"
            );
        }

        if (!transactionManager) {
            throw new Error(
                "EffectResolver: transactionManagerを指定してください。"
            );
        }

        if (
            commandExecutor.transactionManager !==
            transactionManager
        ) {
            throw new Error(
                "EffectResolver: CommandExecutorと同じTransactionManagerを指定してください。"
            );
        }

        this.conditionEngine =
            conditionEngine;

        this.targetEngine =
            targetEngine;

        this.costEngine =
            costEngine;

        this.commandExecutor =
            commandExecutor;

        this.transactionManager =
            transactionManager;

    }

    /**
     * 効果を実行する。
     *
     * @param {EffectContext} context
     *
     * @returns {{
     *   success: boolean,
     *   reason: string|null,
     *   targets: Array,
     *   executedCommandCount: number
     * }}
     */
    execute(context, { selectedTargetIds = null } = {}) {

        if (!(context instanceof EffectContext)) {
            throw new Error(
                "EffectResolver.execute(): EffectContextを指定してください。"
            );
        }

        //====================
        // Condition
        //====================

        const conditionPassed =
            this.conditionEngine.evaluate(
                context
            );

        if (!conditionPassed) {

            return {
                success: false,
                reason: "CONDITION_NOT_MET",
                targets: [],
                executedCommandCount: 0,
                costCommandResults: [],
                commandResults: []
            };

        }

        //====================
        // Target
        //====================

        const targets =
            this.targetEngine.select(
                context,
                selectedTargetIds
            );

        if (!Array.isArray(targets)) {
            throw new Error(
                "TargetEngine.select()は配列を返す必要があります。"
            );
        }

        /*
         * EffectContextは不変オブジェクトなので、
         * 対象決定後の新しいContextを生成する。
         */
        const resolvedContext =
            new EffectContext({

                gameContext:
                    context.gameContext,

                player:
                    context.player,

                sourceCard:
                    context.sourceCard,

                effect:
                    context.effect,

                targets,

                options: context.options

            });

        //====================
        // Cost
        //====================

        if (
            !this.costEngine.canPay(
                resolvedContext
            )
        ) {

            return {
                success: false,
                reason: "CANNOT_PAY_COST",
                targets: [],
                executedCommandCount: 0,
                costCommandResults: [],
                commandResults: []
            };

        }

        const costCommands =
            this.costEngine.buildCommands(
                resolvedContext
            );

        //====================
        // Transaction
        //====================

        const ownsTransaction =
            !this.transactionManager.isActive();

        if (ownsTransaction) {
            this.transactionManager.begin();
        }

        try {

            let executedCommandCount = 0;
            const costCommandResults = [];
            const commandResults = [];

            //--------------------
            // Cost Commands
            //--------------------

            for (
                const command
                of costCommands
            ) {

                /*
                 * execute(command, context)の順序。
                 */
                const commandResult =
                    this.commandExecutor.execute(
                        command,
                        resolvedContext
                    );

                if (!commandResult.success) {
                    throw new Error(
                        `EffectResolver.execute(): コスト支払いに失敗しました。reason=${commandResult.reason}`
                    );
                }

                costCommandResults.push(commandResult);

                executedCommandCount++;

            }

            //--------------------
            // Effect Commands
            //--------------------

            for (
                const command
                of resolvedContext.effect.commands
            ) {

                /*
                 * execute(command, context)の順序。
                 */
                commandResults.push(
                    this.commandExecutor.execute(
                        command,
                        resolvedContext
                    )
                );

                executedCommandCount++;

            }

            if (ownsTransaction) {
                this.transactionManager.commit();
            }

            return {
                success: true,
                reason: null,
                targets: [...targets],
                executedCommandCount,
                costCommandResults,
                commandResults
            };

        } catch (error) {

            if (ownsTransaction) {
                try {
                    this.transactionManager.rollback();
                } catch (rollbackError) {
                    throw new AggregateError(
                        [error, rollbackError],
                        "EffectResolver.execute(): 効果解決と巻き戻しの両方に失敗しました。"
                    );
                }
            }

            throw error;

        }

    }

}
