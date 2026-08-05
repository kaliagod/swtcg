import ConditionDefinition from "../models/ConditionDefinition.js";
import ConditionTypes from "../constants/ConditionTypes.js";

console.log("=== ConditionDefinition Test ===");

const condition = new ConditionDefinition({

    type: ConditionTypes.ALWAYS,

    operator: "<=",

    value: 3

});

console.log(condition);

console.log(condition.type);

console.log(condition.operator);

console.log(condition.value);
