import CostDefinition from "../models/CostDefinition.js";
import CostTypes from "../constants/CostTypes.js";

console.log("=== CostDefinition Test ===");

const cost = new CostDefinition({

    type: CostTypes.MP,

    amount: 2

});

console.log(cost);

console.log(cost.type);

console.log(cost.amount);