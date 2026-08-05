import TargetDefinition from "../models/TargetDefinition.js";
import TargetTypes from "../constants/TargetTypes.js";

console.log("=== TargetDefinition Test ===");

const target = new TargetDefinition({

    type: TargetTypes.OPPONENT,

    amount: 1

});

console.log(target);

console.log(target.type);

console.log(target.amount);