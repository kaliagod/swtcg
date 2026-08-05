import CardTypes from "../constants/CardTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import QuestPhaseStages from "../constants/QuestPhaseStages.js";
import StatusDurations from "../constants/StatusDurations.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import QuestManager from "./QuestManager.js";
import StatusManager from "./StatusManager.js";

export default class PhaseFlowManager {
    constructor({ questManager, statusManager }) {
        if (!(questManager instanceof QuestManager)) {
            throw new Error(
                "PhaseFlowManager: questManagerが不正です。"
            );
        }
        if (!(statusManager instanceof StatusManager)) {
            throw new Error(
                "PhaseFlowManager: statusManagerが不正です。"
            );
        }
        this.questManager = questManager;
        this.statusManager = statusManager;
    }

    advancePhase({
        gameContext,
        drawCards,
        resolveStateBasedActions,
        enqueueTurnTriggers,
        flushTriggeredEffects
    }) {
        const gameState = gameContext.gameState;
        const player = gameState.getCurrentPlayer();
        if (!gameState.started || gameState.ended) {
            throw new Error(
                "GameEngine.advancePhase(): ゲームは進行中ではありません。"
            );
        }
        if (gameState.hasPendingSelection()) {
            return {
                success: false,
                reason: "PENDING_SELECTION",
                pendingSelectionIds: gameState.pendingSelections.map(
                    request => request.id
                )
            };
        }
        if (gameState.questPreparation !== null) {
            return {
                success: false,
                reason: "QUEST_PREPARATION_IN_PROGRESS",
                questInstanceId:
                    gameState.questPreparation.questInstanceId,
                activePlayerId: gameState.questPreparation.playerOrder[
                    gameState.questPreparation.currentIndex
                ]
            };
        }

        let drawResult = null;
        let stateBasedActionResult = null;
        switch (gameState.phase) {
            case GamePhaseTypes.TURN_START:
                this.expireOwnerTurnStartStatuses(gameContext, player);
                enqueueTurnTriggers(
                    gameContext,
                    player,
                    TriggerTypes.TURN_START
                );
                {
                    const triggerResolution =
                        flushTriggeredEffects(gameContext);
                    if (!triggerResolution.completed) {
                        gameState.pendingPhaseTransition = {
                            from: GamePhaseTypes.TURN_START,
                            to: GamePhaseTypes.DRAW,
                            turn: gameState.turn,
                            playerId: player.id
                        };
                        return {
                            success: true,
                            player,
                            phase: gameState.phase,
                            turn: gameState.turn,
                            triggerResolution
                        };
                    }
                }
                this.completeTurnStartMaintenance(gameContext, player);
                gameState.phase = GamePhaseTypes.DRAW;
                break;

            case GamePhaseTypes.DRAW:
                if (player.zones.deck.isEmpty()) {
                    stateBasedActionResult = resolveStateBasedActions({
                        gameContext
                    });
                    drawResult = {
                        success: false,
                        cards: [],
                        requestedAmount: 1,
                        movedAmount: 0,
                        reason:
                            stateBasedActionResult.refreshResults.length > 0
                                ? "DECK_REFRESHED_DRAW_ENDED"
                                : "SOURCE_EMPTY"
                    };
                } else {
                    drawResult = drawCards({ player, amount: 1 });
                    stateBasedActionResult = resolveStateBasedActions({
                        gameContext
                    });
                }
                gameState.phase = GamePhaseTypes.GROWTH;
                break;

            case GamePhaseTypes.GROWTH:
                gameState.phase = GamePhaseTypes.MAIN;
                break;

            case GamePhaseTypes.MAIN:
                gameState.phase = GamePhaseTypes.QUEST;
                gameState.questPhase = {
                    stage: QuestPhaseStages.PARTICIPATION,
                    activeQuestInstanceId: null,
                    resolvableQuestInstanceIds: []
                };
                break;

            case GamePhaseTypes.QUEST:
                if (
                    gameState.questPhase?.stage ===
                    QuestPhaseStages.PARTICIPATION
                ) {
                    return {
                        success: false,
                        reason: "QUEST_PARTICIPATION_REQUIRED"
                    };
                }
                if (
                    gameState.questPhase?.stage !==
                    QuestPhaseStages.SELECT_QUEST
                ) {
                    return {
                        success: false,
                        reason: "QUEST_PROCESS_IN_PROGRESS",
                        questStage: gameState.questPhase?.stage ?? null
                    };
                }
                {
                    const resolvableQuests =
                        this.questManager.getResolvableQuests(
                            gameState,
                            player
                        );
                    if (resolvableQuests.length > 0) {
                        return {
                            success: false,
                            reason: "QUEST_RESOLUTION_REQUIRED",
                            questInstanceIds: resolvableQuests.map(
                                card => card.instanceId
                            )
                        };
                    }
                }
                gameState.questPhase = null;
                gameState.phase = GamePhaseTypes.TURN_END;
                break;

            case GamePhaseTypes.TURN_END:
                enqueueTurnTriggers(
                    gameContext,
                    player,
                    TriggerTypes.TURN_END
                );
                {
                    const triggerResolution =
                        flushTriggeredEffects(gameContext);
                    if (!triggerResolution.completed) {
                        gameState.pendingPhaseTransition = {
                            from: GamePhaseTypes.TURN_END,
                            to: GamePhaseTypes.TURN_START,
                            turn: gameState.turn
                        };
                        return {
                            success: true,
                            player,
                            phase: gameState.phase,
                            turn: gameState.turn,
                            triggerResolution
                        };
                    }
                }
                this.expireTurnStatuses(gameContext);
                gameState.moveToNextPlayer();
                gameState.phase = GamePhaseTypes.TURN_START;
                break;

            default:
                throw new Error(
                    `GameEngine.advancePhase(): 未対応のフェイズです。phase=${gameState.phase}`
                );
        }

        const result = {
            success: true,
            player: gameState.getCurrentPlayer(),
            phase: gameState.phase,
            turn: gameState.turn,
            drawResult,
            stateBasedActionResult
        };
        this._recordAction(
            gameContext,
            "PHASE_ADVANCED",
            result.player.id,
            { phase: result.phase, turn: result.turn }
        );
        return result;
    }

    completePendingPhaseTransition(gameContext) {
        const gameState = gameContext.gameState;
        const transition = gameState.pendingPhaseTransition;
        if (!transition) {
            return;
        }
        if (
            transition.from === GamePhaseTypes.TURN_START &&
            gameState.phase === GamePhaseTypes.TURN_START
        ) {
            const player = gameState.getPlayer(
                transition.playerId ?? gameState.getCurrentPlayer()?.id
            );
            if (!player) {
                return;
            }
            this.completeTurnStartMaintenance(gameContext, player);
            gameState.phase = GamePhaseTypes.DRAW;
        } else if (
            transition.from === GamePhaseTypes.TURN_END &&
            gameState.phase === GamePhaseTypes.TURN_END
        ) {
            this.expireTurnStatuses(gameContext);
            gameState.moveToNextPlayer();
            gameState.phase = GamePhaseTypes.TURN_START;
        }
        gameState.pendingPhaseTransition = null;
    }

    completeTurnStartMaintenance(gameContext, player) {
        player.adventurer.recoverDamage(3);
        player.adventurer.recoverMp(3);
        for (const card of player.zones.field.cards) {
            if (!card.refreshAtOwnerTurnStart) {
                continue;
            }
            card.faceUp = true;
            card.refreshAtOwnerTurnStart = false;
            this._recordAction(
                gameContext,
                card.definition.type === CardTypes.ITEM
                    ? "ITEM_REFRESHED"
                    : "ADVENTURE_ABILITY_REFRESHED",
                player.id,
                { cardInstanceId: card.instanceId }
            );
        }
    }

    expireQuestStatuses(gameContext, questInstanceId) {
        return this.statusManager.expire(
            gameContext.gameState,
            status =>
                status.duration === StatusDurations.QUEST &&
                status.questInstanceId === questInstanceId
        );
    }

    expireTurnStatuses(gameContext) {
        const turn = gameContext.gameState.turn;
        return this.statusManager.expire(
            gameContext.gameState,
            status =>
                status.duration === StatusDurations.TURN &&
                status.appliedTurn === turn
        );
    }

    expireOwnerTurnStartStatuses(gameContext, player) {
        const turn = gameContext.gameState.turn;
        return this.statusManager.expire(
            gameContext.gameState,
            status =>
                status.duration === StatusDurations.OWNER_TURN_START &&
                status.targetPlayerId === player.id &&
                status.appliedTurn < turn
        );
    }

    _recordAction(gameContext, type, playerId, payload) {
        gameContext.actionLog?.append({ type, playerId, payload });
    }
}
