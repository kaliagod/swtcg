import AdventurerState from "../models/AdventurerState.js";
import AbilityTypes from "../constants/AbilityTypes.js";

console.log("=== AdventurerState Test ===");

const adventurer =
    new AdventurerState({

        card: {
            id: "ADV_TEST"
        },

        baseStats: {
            [AbilityTypes.STRENGTH]: 3,
            [AbilityTypes.VITALITY]: 5,
            [AbilityTypes.SPIRIT]: 4
        },

        modifiers: {
            [AbilityTypes.STRENGTH]: -5
        },

        damage: 4,

        mpSpent: 1

    });

if (
    adventurer.getRawStat(
        AbilityTypes.STRENGTH
    ) !== -2 ||
    adventurer.getCurrentStat(
        AbilityTypes.STRENGTH
    ) !== 0 ||
    adventurer.availableMp !== 3
) {
    throw new Error(
        "AdventurerState Test: 能力値の計算結果が期待値と一致しません。"
    );
}

const spentAmount =
    adventurer.spendMp(2);

const recoveredMp =
    adventurer.recoverMp();

const recoveredDamage =
    adventurer.recoverDamage();

if (
    spentAmount !== 2 ||
    recoveredMp !== 3 ||
    adventurer.mpSpent !== 0 ||
    recoveredDamage !== 3 ||
    adventurer.damage !== 1
) {
    throw new Error(
        "AdventurerState Test: カウンター処理の結果が期待値と一致しません。"
    );
}

console.log("Raw Strength:", adventurer.getRawStat(AbilityTypes.STRENGTH));
console.log("Current Strength:", adventurer.getCurrentStat(AbilityTypes.STRENGTH));
console.log("Available MP:", adventurer.availableMp);
console.log("Damage:", adventurer.damage);
