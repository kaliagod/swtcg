export default class AdventurerRequirementEvaluator {
    evaluate(
        player,
        requirements = {},
        { useQuestStats = false } = {}
    ) {
        if (!player?.adventurer) {
            return {
                met: false,
                failures: [{ type: "ADVENTURER_NOT_AVAILABLE" }]
            };
        }

        const adventurer = player.adventurer;
        const failures = [];
        const minLevel = requirements.minLevel ?? 0;

        if (adventurer.level < minLevel) {
            failures.push({
                type: "LEVEL_TOO_LOW",
                required: minLevel,
                actual: adventurer.level
            });
        }

        for (const [ability, minimum] of Object.entries(
            requirements.minStats ?? {}
        )) {
            const actual = useQuestStats
                ? adventurer.getQuestStat(ability)
                : adventurer.getCurrentStat(ability);
            if (actual < minimum) {
                failures.push({
                    type: "STAT_TOO_LOW",
                    ability,
                    required: minimum,
                    actual
                });
            }
        }

        for (const tag of requirements.requiredTags ?? []) {
            if (!adventurer.hasTag(tag)) {
                failures.push({
                    type: "REQUIRED_TAG_MISSING",
                    tag
                });
            }
        }

        for (const tag of requirements.forbiddenTags ?? []) {
            if (adventurer.hasTag(tag)) {
                failures.push({
                    type: "FORBIDDEN_TAG_PRESENT",
                    tag
                });
            }
        }

        return {
            met: failures.length === 0,
            failures
        };
    }
}
