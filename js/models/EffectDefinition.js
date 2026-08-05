/**
 * EffectDefinition.js
 * カード効果定義
 */
import CommandDefinition from "./CommandDefinition.js";
import ConditionDefinition from "./ConditionDefinition.js";
import CostDefinition from "./CostDefinition.js";
import TargetDefinition from "./TargetDefinition.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import CommandTypes from "../constants/CommandTypes.js";

const CONTINUOUS_ONLY_COMMANDS = new Set([
    CommandTypes.REDUCE_DAMAGE,
    CommandTypes.PREVENT_QUEST_DAMAGE,
    CommandTypes.MODIFY_RESOURCE_GAIN,
    CommandTypes.REPLACE_MP_WITH_COUNTER
]);

const CONTINUOUS_COMMANDS = new Set([
    ...CONTINUOUS_ONLY_COMMANDS,
    CommandTypes.MODIFY_STAT,
    CommandTypes.MODIFY_EQUIPMENT_SLOTS
]);


export default class EffectDefinition {

    constructor({

        trigger,

        condition = null,

        cost = null,

        target = null,

        commands = []

    }) {
        if (
            typeof trigger !== "string" ||
            trigger.length === 0
        ) {
            throw new Error(
                "EffectDefinition: triggerを指定してください。"
            );
        }

        if (!Object.values(TriggerTypes).includes(trigger)) {
            throw new Error(
                `EffectDefinition: 未対応のtriggerです。value=${trigger}`
            );
        }

        if (!Array.isArray(commands)) {
            throw new Error(
                "EffectDefinition: commandsには配列を指定してください。"
            );
        }

        if (
            condition !== null &&
             !(condition instanceof ConditionDefinition)
            ) {

                throw new Error(
                "conditionにはConditionDefinitionを指定してください。"
                );

          }

        if (
          cost !== null &&
          !(cost instanceof CostDefinition)
        ) {

          throw new Error(
              "costにはCostDefinitionを指定してください。"
          );

        }

        if (
          target !== null &&
          !(target instanceof TargetDefinition)
        ) {

         throw new Error(
             "targetにはTargetDefinitionを指定してください。"
         );

        }


        for (const command of commands) {

         if (!(command instanceof CommandDefinition)) {

              throw new Error(
                "commandsにはCommandDefinitionのみ指定できます。"
                 );

             }

        }
        if (
            trigger === TriggerTypes.CONTINUOUS &&
            commands.some(command =>
                !CONTINUOUS_COMMANDS.has(command.type)
            )
        ) {
            throw new Error(
                "EffectDefinition: CONTINUOUSでは継続効果用コマンドのみ使用できます。"
            );
        }
        if (
            trigger !== TriggerTypes.CONTINUOUS &&
            commands.some(command =>
                CONTINUOUS_ONLY_COMMANDS.has(command.type)
            )
        ) {
            throw new Error(
                "EffectDefinition: 継続効果専用コマンドにはCONTINUOUSトリガーが必要です。"
            );
        }
        this.trigger = trigger;

        this.condition = condition;

        this.cost = cost;

        this.target = target;



        this.commands = [...commands];

        Object.freeze(this.commands);

        Object.freeze(this);

    }

}
