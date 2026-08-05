import assert from "node:assert/strict";

import CommandExecutor from "../engines/CommandExecutor.js";
import ZoneManager from "../services/ZoneManager.js";
import TransactionManager from "../services/TransactionManager.js";
import RandomService from "../services/RandomService.js";
import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";
import PlayerZones from "../models/PlayerZones.js";
import AdventurerState from "../models/AdventurerState.js";
import CardDefinition from "../models/CardDefinition.js";
import Card from "../models/Card.js";

import CommandTypes from "../constants/CommandTypes.js";
import CardTypes from "../constants/CardTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import AbilityTypes from "../constants/AbilityTypes.js";

function makeCard(id, type = CardTypes.EVENT) {
    return new Card(new CardDefinition({
        id,
        name: id,
        type,
        cost: 0,
        tags: type === CardTypes.QUEST ? ["BASE"] : [],
        questRequirements: type === CardTypes.QUEST
            ? { [AbilityTypes.STRENGTH]: 3 }
            : undefined,
        questDamage: type === CardTypes.QUEST ? 2 : undefined,
        questRewardResources: type === CardTypes.QUEST ? 4 : undefined
    }), `EXPANDED_${id}`);
}

const deckCardA = makeCard("MOVE_A");
const deckCardB = makeCard("MOVE_B");
const fieldCard = makeCard("FIELD_ITEM", CardTypes.ITEM);
const questCard = makeCard("QUEST", CardTypes.QUEST);

for (const card of [deckCardA, deckCardB]) {
    card.ownerId = 1;
    card.zone = ZoneTypes.DECK;
}
for (const card of [fieldCard, questCard]) {
    card.ownerId = 1;
    card.controllerId = 1;
    card.zone = ZoneTypes.FIELD;
}
questCard.enteredFieldTurn = 2;

const player = new PlayerState({
    id: 1,
    zones: new PlayerZones({
        deck: [deckCardA, deckCardB],
        field: [fieldCard, questCard]
    }),
    adventurer: new AdventurerState({
        baseStats: {
            [AbilityTypes.STRENGTH]: 3,
            [AbilityTypes.SPIRIT]: 5
        },
        mpSpent: 3
    })
});
const opponent = new PlayerState({
    id: 2,
    zones: new PlayerZones(),
    adventurer: new AdventurerState()
});
const gameState = new GameState();
gameState.addPlayer(player);
gameState.addPlayer(opponent);
gameState.turn = 3;

const transaction = new TransactionManager();
const executor = new CommandExecutor(new ZoneManager(), transaction);
const gameContext = {
    gameState,
    random: new RandomService({ seed: 10 })
};
const context = (targets = []) => ({
    player,
    targets,
    gameContext
});

let result = executor.execute({
    type: CommandTypes.MOVE_TOP_CARDS,
    amount: 1,
    params: { destination: ZoneTypes.RESOURCE }
}, context([player]));
assert.equal(result.success, true);
assert.equal(player.zones.resource.size(), 1);
assert.equal(player.zones.resource.cards[0].faceUp, false);

result = executor.execute({
    type: CommandTypes.MOVE_CARD,
    params: {
        source: ZoneTypes.FIELD,
        destination: ZoneTypes.HAND
    }
}, context([fieldCard]));
assert.equal(result.success, true);
assert.equal(fieldCard.zone, ZoneTypes.HAND);

const revealA = makeCard("REVEAL_A");
const revealB = makeCard("REVEAL_B");
const revealC = makeCard("REVEAL_C");
for (const card of [revealA, revealB, revealC]) {
    card.ownerId = 1;
    card.zone = ZoneTypes.DECK;
    player.zones.deck.add(card);
}
result = executor.execute({
    type: CommandTypes.REVEAL_TOP_AND_TAKE,
    params: {
        revealedCount: 3,
        destination: ZoneTypes.HAND,
        remainingPosition: "BOTTOM"
    }
}, context([revealC]));
assert.equal(result.success, true);
assert.equal(revealC.zone, ZoneTypes.HAND);
assert.equal(player.zones.deck.cards[0], revealB);

result = executor.execute({
    type: CommandTypes.SEARCH_DECK,
    params: { destination: ZoneTypes.GRAVEYARD }
}, context([deckCardA]));
assert.equal(result.success, true);
assert.equal(deckCardA.zone, ZoneTypes.GRAVEYARD);
assert.equal(player.zones.graveyard.contains(deckCardA), true);

executor.execute({
    type: CommandTypes.MODIFY_STAT,
    params: {
        modifiers: { [AbilityTypes.STRENGTH]: 2 }
    }
}, context([player]));
assert.equal(player.adventurer.getQuestStat(AbilityTypes.STRENGTH), 5);
assert.equal(player.adventurer.getCurrentStat(AbilityTypes.STRENGTH), 3);

executor.execute({
    type: CommandTypes.ADD_TAG,
    params: { tag: "TEMPORARY" }
}, context([player]));
assert.equal(player.adventurer.hasTag("TEMPORARY"), true);

executor.execute({
    type: CommandTypes.MODIFY_QUEST,
    params: {
        mode: "ADD",
        requirements: { [AbilityTypes.STRENGTH]: 2 },
        rewardResources: 3,
        damage: -1,
        addTags: ["DANGER"]
    }
}, context([questCard]));
assert.deepEqual(questCard.getQuestRequirements(), {
    [AbilityTypes.STRENGTH]: 5
});
assert.equal(questCard.getQuestRewardResources(), 7);
assert.equal(questCard.getQuestDamage(), 1);
assert.deepEqual(questCard.getTags(), ["BASE", "DANGER"]);

executor.execute({
    type: CommandTypes.DECLARE_QUEST_PARTICIPATION,
    params: { playerId: 2 }
}, context([questCard]));
assert.deepEqual(questCard.questParticipantIds, [2]);
executor.execute({
    type: CommandTypes.REMOVE_QUEST_PARTICIPATION,
    params: { playerId: 2 }
}, context([questCard]));
assert.deepEqual(questCard.questParticipantIds, []);

executor.execute({
    type: CommandTypes.SET_QUEST_TIMING,
    params: { timing: "THIS_TURN" }
}, context([questCard]));
assert.equal(questCard.questAvailableTurn, 3);

executor.execute({
    type: CommandTypes.FLIP_FACE_DOWN
}, context([questCard]));
assert.equal(questCard.faceUp, false);
executor.execute({
    type: CommandTypes.FLIP_FACE_UP
}, context([questCard]));
assert.equal(questCard.faceUp, true);

executor.execute({
    type: CommandTypes.ADD_COUNTER,
    amount: 2,
    params: { counter: "CHARGE" }
}, context([questCard]));
executor.execute({
    type: CommandTypes.REMOVE_COUNTER,
    amount: 1,
    params: { counter: "CHARGE" }
}, context([questCard]));
assert.equal(questCard.counters.CHARGE, 1);

result = executor.execute({
    type: CommandTypes.GAIN_MP,
    amount: 2
}, context([player]));
assert.equal(result.amount, 2);
assert.equal(player.adventurer.mpSpent, 1);

console.log("Expanded Effect Commands Test: OK");
