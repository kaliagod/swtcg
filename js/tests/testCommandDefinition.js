import CommandDefinition from "../models/CommandDefinition.js";
import CommandTypes from "../constants/CommandTypes.js";

console.log("=== CommandDefinition Test ===");

const command = new CommandDefinition({

    type: CommandTypes.DRAW,

    amount: 1

});

console.log(command);

console.log(command.type);

console.log(command.amount);