import RandomService from "../services/RandomService.js";

const random = new RandomService();

console.log("=== RandomService Test ===");

// random()
console.log(random.random());

// randomInt()
console.log(random.randomInt(1, 6));

// choice()
console.log(
    random.choice([
        "戦士",
        "神官",
        "魔法使い",
        "射手"
    ])
);

// shuffle()
console.log(
    random.shuffle([
        1,
        2,
        3,
        4,
        5
    ])
);