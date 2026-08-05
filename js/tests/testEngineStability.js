import assert from "node:assert/strict";

import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import EffectDefinition from "../models/EffectDefinition.js";
import CardDefinition from "../models/CardDefinition.js";
import CommandDefinition from "../models/CommandDefinition.js";
import CostDefinition from "../models/CostDefinition.js";
import EffectContext from "../engines/EffectContext.js";
import ConditionEngine from "../engines/ConditionEngine.js";
import TargetEngine from "../engines/TargetEngine.js";
import CostEngine from "../engines/CostEngine.js";
import CommandExecutor from "../engines/CommandExecutor.js";
import EffectResolver from "../engines/EffectResolver.js";
import ZoneManager from "../services/ZoneManager.js";
import TransactionManager from "../services/TransactionManager.js";
import RandomService from "../services/RandomService.js";

import AbilityTypes from "../constants/AbilityTypes.js";
import CommandTypes from "../constants/CommandTypes.js";
import CostTypes from "../constants/CostTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";

function buildPlayer(deckSize) {
    return new PlayerState({
        id: 1,
        zones: new PlayerZones({
            deck: Array.from(
                { length: deckSize },
                (_, index) => ({ id: `CARD_${index}` })
            )
        }),
        adventurer: new AdventurerState({
            baseStats: {
                [AbilityTypes.SPIRIT]: 5
            }
        })
    });
}

function buildResolver(transactionManager) {
    const zoneManager = new ZoneManager();
    class FailingCommandExecutor extends CommandExecutor {
        execute(command, context) {
            if (command.params.forceFailure === true) {
                throw new Error("Intentional command failure.");
            }
            return super.execute(command, context);
        }
    }

    return new EffectResolver({
        conditionEngine: new ConditionEngine(),
        targetEngine: new TargetEngine(),
        costEngine: new CostEngine(),
        commandExecutor: new FailingCommandExecutor(
            zoneManager,
            transactionManager
        ),
        transactionManager
    });
}

function testRollback() {
    const player = buildPlayer(3);
    const originalDeck = player.zones.deck.cards;
    const transactionManager = new TransactionManager();
    const resolver = buildResolver(transactionManager);
    const effect = new EffectDefinition({
        trigger: TriggerTypes.PLAY,
        cost: new CostDefinition({
            type: CostTypes.MP,
            amount: 2
        }),
        commands: [
            new CommandDefinition({
                type: CommandTypes.DRAW,
                amount: 2
            }),
            new CommandDefinition({
                type: CommandTypes.DRAW,
                amount: 0,
                params: {
                    forceFailure: true
                }
            })
        ]
    });

    assert.throws(() => {
        resolver.execute(new EffectContext({
            gameContext: {},
            player,
            effect
        }));
    });

    assert.equal(player.adventurer.mpSpent, 0);
    assert.equal(player.zones.hand.size(), 0);
    assert.deepEqual(player.zones.deck.cards, originalDeck);
    assert.equal(transactionManager.isActive(), false);
}

function testPartialResolution() {
    const player = buildPlayer(1);
    const transactionManager = new TransactionManager();
    const resolver = buildResolver(transactionManager);
    const effect = new EffectDefinition({
        trigger: TriggerTypes.PLAY,
        commands: [
            new CommandDefinition({
                type: CommandTypes.DRAW,
                amount: 2
            })
        ]
    });

    const result = resolver.execute(new EffectContext({
        gameContext: {},
        player,
        effect
    }));

    assert.equal(result.success, true);
    assert.equal(result.commandResults.length, 1);
    assert.equal(result.commandResults[0].success, false);
    assert.equal(result.commandResults[0].movedAmount, 1);
    assert.equal(player.zones.hand.size(), 1);
    assert.equal(player.zones.deck.size(), 0);
}

function testSeededRandom() {
    const first = new RandomService({ seed: 20260721 });
    const second = new RandomService({ seed: 20260721 });
    const source = [1, 2, 3, 4, 5, 6, 7, 8];

    assert.deepEqual(
        first.shuffle(source),
        second.shuffle(source)
    );
    assert.deepEqual(source, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(first.getState(), second.getState());
}

function testDefinitionValidation() {
    assert.throws(
        () => new CardDefinition({
            id: "INVALID_WITHOUT_TYPE",
            name: "不正カード"
        }),
        /type/
    );

    assert.throws(
        () => new CardDefinition({
            id: "INVALID_EFFECT",
            name: "不正効果カード",
            type: "EVENT",
            effects: [null]
        }),
        /effects/
    );

    assert.throws(
        () => new CommandDefinition({
            type: CommandTypes.DRAW,
            amount: -1
        }),
        /amount/
    );
}

testRollback();
testPartialResolution();
testSeededRandom();
testDefinitionValidation();

console.log("Engine stability tests: OK");
