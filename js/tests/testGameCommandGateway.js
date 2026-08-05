import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import GameCommandTypes from "../constants/GameCommandTypes.js";
import SelectionTypes from "../constants/SelectionTypes.js";

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

const context = await new GameBootstrap().createGame();
const gateway = context.commandGateway;
const player1 = context.gameState.getCurrentPlayer();
const player2 = context.gameState.players.find(
    player => player.id !== player1.id
);

const player1Initial = gateway.getPublicState(player1.id);
const spectatorInitial = gateway.getPublicState();
assert.equal(player1Initial.protocolVersion, 1);
assert.equal(player1Initial.revision, 0);
assert.equal(player1Initial.state.revision, 0);
assert.equal(
    player1Initial.state.players.find(
        player => player.id === player1.id
    ).zones.hand.cards.length,
    5
);
assert.equal(
    "cards" in player1Initial.state.players.find(
        player => player.id === player2.id
    ).zones.hand,
    false
);
assert.equal(
    "cards" in spectatorInitial.state.players[0].zones.hand,
    false
);

const beginCommand = {
    protocolVersion: 1,
    id: "CMD_BEGIN_1",
    type: GameCommandTypes.BEGIN_GAME,
    playerId: player1.id,
    expectedRevision: 0,
    payload: {}
};
const beginResult = gateway.execute(beginCommand, {
    authenticatedPlayerId: player1.id
});
assert.equal(beginResult.accepted, true);
assert.equal(beginResult.replayed, false);
assert.equal(beginResult.commandRevision, 1);
assert.equal(beginResult.publicState.revision, 1);
assert.equal(context.gameState.revision, 1);
assert.doesNotThrow(() => JSON.stringify(beginResult));

const replayResult = gateway.execute(beginCommand, {
    authenticatedPlayerId: player1.id
});
assert.equal(replayResult.accepted, true);
assert.equal(replayResult.replayed, true);
assert.equal(context.gameState.revision, 1);

const conflictResult = gateway.execute({
    ...beginCommand,
    type: GameCommandTypes.ADVANCE_PHASE
}, {
    authenticatedPlayerId: player1.id
});
assert.equal(conflictResult.accepted, false);
assert.equal(conflictResult.reason, "COMMAND_ID_CONFLICT");

const impersonationResult = gateway.execute({
    protocolVersion: 1,
    id: "CMD_IMPERSONATE",
    type: GameCommandTypes.ADVANCE_PHASE,
    playerId: player1.id,
    expectedRevision: 1,
    payload: {}
}, {
    authenticatedPlayerId: player2.id
});
assert.equal(impersonationResult.accepted, false);
assert.equal(
    impersonationResult.reason,
    "AUTHENTICATED_PLAYER_MISMATCH"
);

const staleResult = gateway.execute({
    protocolVersion: 1,
    id: "CMD_STALE",
    type: GameCommandTypes.ADVANCE_PHASE,
    playerId: player1.id,
    expectedRevision: 0,
    payload: {}
}, {
    authenticatedPlayerId: player1.id
});
assert.equal(staleResult.accepted, false);
assert.equal(staleResult.reason, "STALE_REVISION");

const wrongTurnResult = gateway.execute({
    protocolVersion: 1,
    id: "CMD_WRONG_TURN",
    type: GameCommandTypes.ADVANCE_PHASE,
    playerId: player2.id,
    expectedRevision: 1,
    payload: {}
}, {
    authenticatedPlayerId: player2.id
});
assert.equal(wrongTurnResult.accepted, false);
assert.equal(wrongTurnResult.reason, "NOT_TURN_PLAYER");
assert.equal(context.gameState.revision, 1);

const missingAuthenticationResult = gateway.execute({
    protocolVersion: 1,
    id: "CMD_NO_AUTH",
    type: GameCommandTypes.ADVANCE_PHASE,
    playerId: player1.id,
    expectedRevision: 1,
    payload: {}
});
assert.equal(missingAuthenticationResult.accepted, false);
assert.equal(
    missingAuthenticationResult.reason,
    "AUTHENTICATED_PLAYER_MISMATCH"
);

const opponentCardResult = gateway.execute({
    protocolVersion: 1,
    id: "CMD_OPPONENT_CARD",
    type: GameCommandTypes.PLAY_CARD,
    playerId: player1.id,
    expectedRevision: 1,
    payload: {
        cardInstanceId: player2.zones.hand.cards[0].instanceId
    }
}, {
    authenticatedPlayerId: player1.id
});
assert.equal(opponentCardResult.accepted, false);
assert.equal(opponentCardResult.reason, "CARD_NOT_FOUND");

const invalidSerializationResult = gateway.execute({
    protocolVersion: 1,
    id: "CMD_INVALID_JSON",
    type: GameCommandTypes.ADVANCE_PHASE,
    playerId: player1.id,
    expectedRevision: 1,
    payload: {
        callback() {}
    }
}, {
    authenticatedPlayerId: player1.id
});
assert.equal(invalidSerializationResult.accepted, false);
assert.equal(
    invalidSerializationResult.reason,
    "COMMAND_NOT_SERIALIZABLE"
);

const selectionRequest = context.selectionManager.request({
    type: SelectionTypes.EQUIPMENT_LIMIT,
    playerId: player1.id,
    prompt: "Test selection",
    candidates: [{ id: "KEEP_NONE", name: "Test" }],
    min: 0,
    max: 1,
    context: { action: "EQUIPMENT_LIMIT" }
});
assert.equal(
    "candidates" in gateway.getPublicState(player2.id)
        .state.pendingSelections[0],
    false
);
const selectionResult = gateway.execute({
    protocolVersion: 1,
    id: "CMD_RESOLVE_SELECTION",
    type: GameCommandTypes.RESOLVE_SELECTION,
    playerId: player1.id,
    expectedRevision: 1,
    payload: {
        requestId: selectionRequest.id,
        selectedIds: []
    }
}, {
    authenticatedPlayerId: player1.id
});
assert.equal(selectionResult.accepted, true);
assert.equal(selectionResult.publicState.revision, 2);
assert.equal(context.gameState.hasPendingSelection(), false);

console.log("Game command gateway tests: OK");
