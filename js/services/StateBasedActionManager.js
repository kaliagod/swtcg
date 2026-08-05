import AdventureAbilityManager from "./AdventureAbilityManager.js";
import DeckRefreshManager from "./DeckRefreshManager.js";

const MAX_PASSES = 20;

export default class StateBasedActionManager {
    constructor({ deckRefreshManager, adventureAbilityManager }) {
        if (!(deckRefreshManager instanceof DeckRefreshManager)) {
            throw new Error(
                "StateBasedActionManager: deckRefreshManagerが不正です。"
            );
        }
        if (!(adventureAbilityManager instanceof AdventureAbilityManager)) {
            throw new Error(
                "StateBasedActionManager: adventureAbilityManagerが不正です。"
            );
        }
        this.deckRefreshManager = deckRefreshManager;
        this.adventureAbilityManager = adventureAbilityManager;
    }

    checkVictory({ gameContext }) {
        const gameState = gameContext.gameState;
        if (gameState.ended) {
            return {
                ended: true,
                winnerIds: [...gameState.winnerIds],
                draw: gameState.winnerIds.length > 1,
                reason: gameState.endReason
            };
        }
        const winnerIds = gameState.players
            .filter(player => player.adventurer?.level >= 11)
            .map(player => player.id);
        if (winnerIds.length === 0) {
            return {
                ended: false,
                winnerIds: [],
                draw: false,
                reason: null
            };
        }
        const draw = winnerIds.length > 1;
        const reason = draw ? "LEVEL_11_DRAW" : "LEVEL_11";
        gameState.finish({ winnerIds, reason });
        this._recordAction(
            gameContext,
            draw ? "GAME_DRAWN" : "GAME_WON",
            draw ? null : winnerIds[0],
            { winnerIds: [...winnerIds], reason }
        );
        return {
            ended: true,
            winnerIds: [...winnerIds],
            draw,
            reason
        };
    }

    refreshDeck({ gameContext, player }) {
        const gameState = gameContext.gameState;
        if (
            gameState.effectResolutionDepth > 0 ||
            gameContext.transaction?.isActive()
        ) {
            return {
                refreshed: false,
                deferred: true,
                cardCount: 0,
                cardInstanceIds: []
            };
        }
        const result = this.deckRefreshManager.refresh(
            player,
            gameContext.random ?? null
        );
        if (result.refreshed) {
            this._recordAction(
                gameContext,
                "DECK_REFRESHED",
                player.id,
                {
                    cardCount: result.cardCount,
                    deckRefreshCount: player.deckRefreshCount,
                    randomState: gameContext.random?.getState?.() ?? null
                }
            );
        }
        return { ...result, deferred: false };
    }

    resolve({
        gameContext,
        checkEquipmentState,
        resolveDamageOverflow
    }) {
        const gameState = gameContext.gameState;
        if (
            gameState.effectResolutionDepth > 0 ||
            gameContext.transaction?.isActive()
        ) {
            return this._emptyResult({ stable: false, deferred: true });
        }
        if (gameState.hasPendingSelection()) {
            return {
                ...this._emptyResult({ stable: false, deferred: false }),
                success: false,
                reason: "PENDING_SELECTION"
            };
        }

        const refreshResults = [];
        const playerResults = [];
        const passDiagnostics = [];
        let passes = 0;
        while (passes < MAX_PASSES) {
            passes++;
            let changed = false;
            const passDiagnostic = {
                pass: passes,
                refreshedPlayerIds: [],
                passiveChangedPlayerIds: [],
                equipmentMovedCardInstanceIds: [],
                damageStepCountsByPlayer: {}
            };

            for (const player of gameState.players) {
                const refreshResult = this.refreshDeck({
                    gameContext,
                    player
                });
                if (refreshResult.refreshed) {
                    changed = true;
                    refreshResults.push({
                        playerId: player.id,
                        ...refreshResult
                    });
                    passDiagnostic.refreshedPlayerIds.push(player.id);
                }
            }

            for (const player of gameState.players) {
                if (!player.adventurer) {
                    continue;
                }
                const passiveResult =
                    this.adventureAbilityManager.refreshPassiveState(player);
                const equipmentResult = checkEquipmentState({
                    gameContext,
                    player
                });
                if (!equipmentResult.stable) {
                    return this._selectionResult({
                        equipmentResult,
                        passes,
                        refreshResults,
                        playerResults
                    });
                }
                const damageResult = resolveDamageOverflow({
                    gameContext,
                    player,
                    runStateBasedActions: false
                });
                playerResults.push({
                    playerId: player.id,
                    passiveResult,
                    equipmentResult,
                    damageResult
                });
                if (!damageResult.stable) {
                    return this._selectionResult({
                        equipmentResult: damageResult,
                        passes,
                        refreshResults,
                        playerResults
                    });
                }
                if (
                    passiveResult.changed ||
                    equipmentResult.movedCards.length > 0 ||
                    damageResult.steps.length > 0
                ) {
                    changed = true;
                }
                if (passiveResult.changed) {
                    passDiagnostic.passiveChangedPlayerIds.push(player.id);
                }
                passDiagnostic.equipmentMovedCardInstanceIds.push(
                    ...equipmentResult.movedCards.map(card => card.instanceId)
                );
                if (damageResult.steps.length > 0) {
                    passDiagnostic.damageStepCountsByPlayer[player.id] =
                        damageResult.steps.length;
                }
            }
            passDiagnostics.push(passDiagnostic);
            if (!changed) {
                const victoryResult = gameState.started
                    ? this.checkVictory({ gameContext })
                    : null;
                return {
                    success: true,
                    stable: true,
                    deferred: false,
                    reason: null,
                    passes,
                    refreshResults,
                    playerResults,
                    victoryResult,
                    passDiagnostics
                };
            }
        }

        return {
            success: false,
            stable: false,
            deferred: false,
            reason: "STATE_BASED_ACTION_LOOP_LIMIT",
            passes,
            refreshResults,
            playerResults,
            victoryResult: null,
            diagnostics: {
                maxPasses: MAX_PASSES,
                passDiagnostics
            }
        };
    }

    _emptyResult({ stable, deferred }) {
        return {
            success: true,
            stable,
            deferred,
            passes: 0,
            refreshResults: [],
            playerResults: [],
            victoryResult: null
        };
    }

    _selectionResult({
        equipmentResult,
        passes,
        refreshResults,
        playerResults
    }) {
        return {
            success: false,
            stable: false,
            deferred: false,
            reason: equipmentResult.reason,
            passes,
            refreshResults,
            playerResults,
            victoryResult: null,
            selectionRequest: equipmentResult.selectionRequest
        };
    }

    _recordAction(gameContext, type, playerId, payload) {
        gameContext.actionLog?.append({ type, playerId, payload });
    }
}
