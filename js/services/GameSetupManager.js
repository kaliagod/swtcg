import AbilityTypes from "../constants/AbilityTypes.js";
import CardTypes from "../constants/CardTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import DeckValidator from "./DeckValidator.js";
import ZoneManager from "./ZoneManager.js";

export default class GameSetupManager {
    constructor({ zoneManager, deckValidator }) {
        if (!(zoneManager instanceof ZoneManager)) {
            throw new Error(
                "GameSetupManager: zoneManagerにはZoneManagerを指定してください。"
            );
        }
        if (!(deckValidator instanceof DeckValidator)) {
            throw new Error(
                "GameSetupManager: deckValidatorにはDeckValidatorを指定してください。"
            );
        }
        this.zoneManager = zoneManager;
        this.deckValidator = deckValidator;
    }

    prepareGame({
        gameContext,
        initialHandSize = 5,
        initialResourceSize = 3
    }) {
        const gameState = gameContext?.gameState;
        if (!gameState) {
            throw new Error(
                "GameEngine.prepareGame(): gameContext.gameStateを指定してください。"
            );
        }
        if (gameState.playerCount() < 2 || gameState.playerCount() > 4) {
            throw new Error(
                "GameEngine.prepareGame(): プレイヤー数は2～4人である必要があります。"
            );
        }
        if (gameState.started || gameState.prepared) {
            throw new Error(
                "GameEngine.prepareGame(): ゲームは既に準備済みです。"
            );
        }

        for (const player of gameState.players) {
            this.deckValidator.assertPlayer(player);
        }

        const candidates = this._getFirstPlayerCandidates(
            gameState.players
        );
        const firstPlayer = candidates.length === 1
            ? candidates[0]
            : gameContext.random.choice(candidates);
        if (!firstPlayer) {
            throw new Error(
                "GameEngine.prepareGame(): 先攻プレイヤーを決定できませんでした。"
            );
        }

        for (const player of gameState.players) {
            if (!player.adventurer) {
                throw new Error(
                    `GameEngine.prepareGame(): プレイヤー '${player.id}' に冒険者が設定されていません。`
                );
            }
            const adventurerCard =
                player.zones.adventureDeck.cards.find(
                    card => card.definition.type === CardTypes.ADVENTURER
                );
            for (const card of player.zones.adventureDeck.cards) {
                card.ownerId = player.id;
                card.zone = ZoneTypes.ADVENTURE_DECK;
                card.faceUp = false;
            }
            player.zones.adventureDeck.remove(adventurerCard);
            adventurerCard.zone = ZoneTypes.ADVENTURER;
            adventurerCard.faceUp = true;
            player.adventurer.card = adventurerCard;

            player.zones.deck.shuffle(gameContext.random);
            for (const card of player.zones.deck.cards) {
                card.ownerId = player.id;
                card.zone = ZoneTypes.DECK;
            }
            this._drawCards(player, initialHandSize);
            for (let count = 0; count < initialResourceSize; count++) {
                const result = this.zoneManager.moveTop({
                    from: player.zones.deck,
                    to: player.zones.resource
                });
                result.card.faceUp = false;
                result.card.zone = ZoneTypes.RESOURCE;
            }
            for (const card of player.zones.hand.cards) {
                card.zone = ZoneTypes.HAND;
            }
        }

        gameState.setCurrentPlayer(firstPlayer.id);
        gameState.phase = GamePhaseTypes.MULLIGAN;
        gameState.markPrepared();
        const result = {
            success: true,
            reason: null,
            firstPlayerId: firstPlayer.id,
            firstPlayerSelection: candidates.length === 1
                ? "HIGHEST_AGILITY"
                : "RANDOM_TIE_BREAK",
            mulliganEligiblePlayerIds: gameState.players
                .filter(player => !player.zones.hand.cards.some(
                    card => card.definition.type === CardTypes.QUEST
                ))
                .map(player => player.id)
        };
        this._recordAction(gameContext, "GAME_PREPARED", null, {
            firstPlayerId: firstPlayer.id,
            firstPlayerSelection: result.firstPlayerSelection,
            adventurerInstanceIds: gameState.players.map(
                player => player.adventurer.card.instanceId
            )
        });
        return result;
    }

    mulliganInitialHand({ gameContext, player }) {
        const gameState = gameContext.gameState;
        if (
            !gameState.prepared ||
            gameState.started ||
            gameState.phase !== GamePhaseTypes.MULLIGAN
        ) {
            throw new Error(
                "GameEngine.mulliganInitialHand(): 現在はマリガンできません。"
            );
        }
        if (player.zones.hand.cards.some(
            card => card.definition.type === CardTypes.QUEST
        )) {
            return { success: false, reason: "QUEST_ALREADY_IN_HAND" };
        }

        const handSize = player.zones.hand.size();
        for (const card of player.zones.hand.cards) {
            this.zoneManager.move({
                from: player.zones.hand,
                to: player.zones.deck,
                card
            });
            card.zone = ZoneTypes.DECK;
        }
        player.zones.deck.shuffle(gameContext.random);
        const result = this._drawCards(player, handSize);
        for (const card of player.zones.hand.cards) {
            card.zone = ZoneTypes.HAND;
        }
        this._recordAction(
            gameContext,
            "MULLIGAN_PERFORMED",
            player.id,
            {
                handSize,
                randomState: gameContext.random.getState?.() ?? null
            }
        );
        return result;
    }

    beginFirstTurn({ gameContext }) {
        const gameState = gameContext.gameState;
        if (!gameState.prepared || gameState.started) {
            throw new Error(
                "GameEngine.beginFirstTurn(): ゲーム開始準備が完了していません。"
            );
        }
        gameState.start();
        gameState.phase = GamePhaseTypes.TURN_START;
        this._recordAction(
            gameContext,
            "GAME_STARTED",
            gameState.getCurrentPlayer().id,
            { phase: gameState.phase }
        );
        return {
            success: true,
            player: gameState.getCurrentPlayer(),
            phase: gameState.phase
        };
    }

    _drawCards(player, amount) {
        return this.zoneManager.draw({
            deck: player.zones.deck,
            hand: player.zones.hand,
            amount
        });
    }

    _getFirstPlayerCandidates(players) {
        const highestAgility = Math.max(...players.map(player =>
            player.adventurer
                ? player.adventurer.getCurrentStat(AbilityTypes.AGILITY)
                : Number.NEGATIVE_INFINITY
        ));
        return players.filter(player =>
            player.adventurer &&
            player.adventurer.getCurrentStat(AbilityTypes.AGILITY) ===
                highestAgility
        );
    }

    _recordAction(gameContext, type, playerId, payload) {
        gameContext.actionLog?.append({ type, playerId, payload });
    }
}
