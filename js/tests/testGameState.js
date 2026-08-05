import GameState from "../models/GameState.js";
import PlayerState from "../models/PlayerState.js";

console.log("=== GameState Test ===");

const gameState = new GameState();

const player1 = new PlayerState({
    id: 1
});

const player2 = new PlayerState({
    id: 2
});

gameState.addPlayer(player1);
gameState.addPlayer(player2);

console.log("Player Count:", gameState.playerCount());

console.log(
    "Current Player ID:",
    gameState.getCurrentPlayer().id
);

console.log(
    "Player2 ID:",
    gameState.getPlayer(2).id
);

console.log("Turn:", gameState.turn);

console.log("Started:", gameState.started);

if (
    gameState.playerCount() !== 2 ||
    gameState.getCurrentPlayer() !== player1 ||
    gameState.getPlayer(2) !== player2
) {
    throw new Error(
        "GameState Test: プレイヤー状態が期待値と一致しません。"
    );
}
