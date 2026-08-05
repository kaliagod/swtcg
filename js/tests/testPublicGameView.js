import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

globalThis.fetch = async requestPath => {
    const filePath = path.resolve(
        String(requestPath).replace(/^\.\//, "")
    );
    return {
        ok: fs.existsSync(filePath),
        async json() {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        }
    };
};

const { default: GameBootstrap } =
    await import("../bootstrap/GameBootstrap.js");
const { createPublicGameContext } =
    await import("../network/PublicGameView.js");

const authoritative = await new GameBootstrap().createGame();
const definitions = new Map(
    authoritative.cardDatabase.getAll().map(definition => [
        definition.id,
        definition
    ])
);
const publicState = authoritative.commandGateway.getPublicState(2);
const guestContext = createPublicGameContext(
    publicState,
    definitions
);
const hostView = guestContext.gameState.getPlayer(1);
const guestView = guestContext.gameState.getPlayer(2);

assert.equal(guestContext.gameState.revision, 0);
assert.equal(
    guestContext.gameState.getCurrentPlayer().id,
    authoritative.gameState.getCurrentPlayer().id
);
assert.equal(hostView.zones.hand.size(), 5);
assert.equal(
    hostView.zones.hand.cards.every(card =>
        card.hidden === true && card.name === "非公開カード"
    ),
    true
);
assert.equal(
    hostView.zones.resource.cards.every(card => card.hidden === true),
    true
);
assert.equal(
    hostView.zones.deck.cards.every(card => card.hidden === true),
    true
);
assert.equal(guestView.zones.hand.size(), 5);
assert.equal(
    guestView.zones.hand.cards.every(card =>
        card.hidden !== true && definitions.has(card.id)
    ),
    true
);
assert.equal(guestView.zones.resource.size(), 3);
assert.equal(
    guestView.zones.resource.cards.every(card => definitions.has(card.id)),
    true
);
assert.equal(
    guestView.adventurer.getCurrentStat("VITALITY"),
    authoritative.gameState.getPlayer(2)
        .adventurer.getCurrentStat("VITALITY")
);

console.log("Public game view tests: OK");
