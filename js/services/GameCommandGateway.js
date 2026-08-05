import GameCommandTypes from "../constants/GameCommandTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import { cloneSerializable } from "../utils/Serializable.js";

const SELECTION_CONTINUATION_REASONS = new Set([
    "RESOURCE_SELECTION_REQUIRED",
    "TARGET_SELECTION_REQUIRED",
    "MP_REPLACEMENT_SELECTION_REQUIRED",
    "EFFECT_ORDER_SELECTION_REQUIRED",
    "QUEST_TRIGGER_SELECTION_REQUIRED",
    "QUEST_STATE_SELECTION_REQUIRED"
]);

export default class GameCommandGateway {
    constructor(gameContext) {
        if (!gameContext?.gameState || !gameContext?.gameEngine) {
            throw new Error(
                "GameCommandGateway: gameContext is required."
            );
        }
        if (!gameContext.gameStateSerializer) {
            throw new Error(
                "GameCommandGateway: gameStateSerializer is required."
            );
        }
        this.gameContext = gameContext;
        this.processedCommands = new Map();
    }

    execute(
        command,
        {
            authenticatedPlayerId
        } = {}
    ) {
        let normalized;
        try {
            normalized = cloneSerializable(
                command,
                "GameCommandGateway.command"
            );
        } catch {
            return this._createRejectedResponse({
                commandId: command?.id ?? null,
                type: command?.type ?? null,
                playerId: authenticatedPlayerId ?? null,
                reason: "COMMAND_NOT_SERIALIZABLE"
            });
        }

        const validation = this._validateCommand(
            normalized,
            authenticatedPlayerId
        );
        if (!validation.success) {
            return this._createRejectedResponse({
                commandId: normalized?.id ?? null,
                type: normalized?.type ?? null,
                playerId: authenticatedPlayerId ?? null,
                reason: validation.reason
            });
        }

        const signature = JSON.stringify(normalized);
        const processed = this.processedCommands.get(normalized.id);
        if (processed) {
            if (processed.signature !== signature) {
                return this._createRejectedResponse({
                    commandId: normalized.id,
                    type: normalized.type,
                    playerId: authenticatedPlayerId,
                    reason: "COMMAND_ID_CONFLICT"
                });
            }
            return this._createResponse({
                ...processed.outcome,
                replayed: true,
                viewerPlayerId: authenticatedPlayerId
            });
        }

        const gameState = this.gameContext.gameState;
        if (normalized.expectedRevision !== gameState.revision) {
            return this._createRejectedResponse({
                commandId: normalized.id,
                type: normalized.type,
                playerId: authenticatedPlayerId,
                reason: "STALE_REVISION"
            });
        }

        let engineResult;
        try {
            engineResult = this._executeValidated(
                normalized,
                authenticatedPlayerId
            );
        } catch (error) {
            return this._createRejectedResponse({
                commandId: normalized.id,
                type: normalized.type,
                playerId: authenticatedPlayerId,
                reason: error.reason ?? "COMMAND_EXECUTION_ERROR"
            });
        }

        const selectionContinues =
            SELECTION_CONTINUATION_REASONS.has(engineResult?.reason) ||
            (
                engineResult?.completed === false &&
                gameState.hasPendingSelection()
            );
        const accepted =
            engineResult?.success === true || selectionContinues;
        const outcome = {
            accepted,
            reason: accepted
                ? null
                : engineResult?.reason ?? "COMMAND_REJECTED",
            commandId: normalized.id,
            type: normalized.type,
            playerId: authenticatedPlayerId,
            commandRevision: accepted
                ? gameState.revision + 1
                : gameState.revision
        };

        if (accepted) {
            gameState.revision++;
            this.processedCommands.set(normalized.id, {
                signature,
                outcome
            });
        }

        return this._createResponse({
            ...outcome,
            replayed: false,
            viewerPlayerId: authenticatedPlayerId
        });
    }

    getPublicState(viewerPlayerId = null) {
        return cloneSerializable({
            protocolVersion: 1,
            revision: this.gameContext.gameState.revision,
            state: this.gameContext.gameStateSerializer.serialize(
                this.gameContext.gameState,
                { viewerPlayerId }
            )
        }, "GameCommandGateway.publicState");
    }

    _validateCommand(command, authenticatedPlayerId) {
        if (!command || typeof command !== "object") {
            return { success: false, reason: "INVALID_COMMAND" };
        }
        if (command.protocolVersion !== 1) {
            return {
                success: false,
                reason: "UNSUPPORTED_PROTOCOL_VERSION"
            };
        }
        if (typeof command.id !== "string" || command.id.length === 0) {
            return { success: false, reason: "INVALID_COMMAND_ID" };
        }
        if (!Object.values(GameCommandTypes).includes(command.type)) {
            return { success: false, reason: "UNKNOWN_COMMAND_TYPE" };
        }
        if (
            command.playerId === null ||
            command.playerId === undefined ||
            !this.gameContext.gameState.getPlayer(command.playerId)
        ) {
            return { success: false, reason: "PLAYER_NOT_FOUND" };
        }
        if (command.playerId !== authenticatedPlayerId) {
            return {
                success: false,
                reason: "AUTHENTICATED_PLAYER_MISMATCH"
            };
        }
        if (
            !Number.isInteger(command.expectedRevision) ||
            command.expectedRevision < 0
        ) {
            return {
                success: false,
                reason: "INVALID_EXPECTED_REVISION"
            };
        }
        if (
            command.payload !== undefined &&
            (
                command.payload === null ||
                typeof command.payload !== "object" ||
                Array.isArray(command.payload)
            )
        ) {
            return { success: false, reason: "INVALID_COMMAND_PAYLOAD" };
        }
        return { success: true, reason: null };
    }

    _executeValidated(command, playerId) {
        const { gameState, gameEngine } = this.gameContext;
        const player = gameState.getPlayer(playerId);
        const payload = command.payload ?? {};

        switch (command.type) {
            case GameCommandTypes.BEGIN_GAME:
                if (gameState.getCurrentPlayer() !== player) {
                    return { success: false, reason: "NOT_TURN_PLAYER" };
                }
                return gameEngine.beginFirstTurn({
                    gameContext: this.gameContext
                });

            case GameCommandTypes.MULLIGAN:
                return gameEngine.mulliganInitialHand({
                    gameContext: this.gameContext,
                    player
                });

            case GameCommandTypes.ADVANCE_PHASE:
                if (gameState.getCurrentPlayer() !== player) {
                    return { success: false, reason: "NOT_TURN_PLAYER" };
                }
                return gameEngine.advancePhase({
                    gameContext: this.gameContext
                });

            case GameCommandTypes.PLAY_CARD:
                return gameEngine.playCard({
                    gameContext: this.gameContext,
                    player,
                    card: this._findOwnedCard(
                        player,
                        ZoneTypes.HAND,
                        payload.cardInstanceId
                    ),
                    resourceCardIds: payload.resourceCardIds ?? null
                });

            case GameCommandTypes.PLAY_GROWTH_CARD:
                return gameEngine.playGrowthCard({
                    gameContext: this.gameContext,
                    player,
                    card: this._findOwnedCard(
                        player,
                        ZoneTypes.ADVENTURE_DECK,
                        payload.cardInstanceId
                    ),
                    resourceCardIds: payload.resourceCardIds ?? null
                });

            case GameCommandTypes.ACTIVATE_CARD:
                return gameEngine.activateCard({
                    gameContext: this.gameContext,
                    player,
                    card: this._findOwnedCard(
                        player,
                        ZoneTypes.FIELD,
                        payload.cardInstanceId
                    )
                });

            case GameCommandTypes.ACTIVATE_ADVENTURE_CARD:
                return gameEngine.activateAdventureCard({
                    gameContext: this.gameContext,
                    player,
                    card: this._findOwnedCard(
                        player,
                        ZoneTypes.FIELD,
                        payload.cardInstanceId
                    )
                });

            case GameCommandTypes.DECLARE_QUEST_PARTICIPATION:
                return gameEngine.declareQuestParticipation({
                    gameContext: this.gameContext,
                    player,
                    questCard: this._findPublicFieldCard(
                        payload.questInstanceId
                    )
                });

            case GameCommandTypes.COMPLETE_QUEST_PARTICIPATION:
                return gameEngine.completeQuestParticipation({
                    gameContext: this.gameContext,
                    player
                });

            case GameCommandTypes.START_QUEST_PREPARATION:
                return this._executeQuestOwnerAction({
                    player,
                    questInstanceId: payload.questInstanceId,
                    action: (owner, questCard) =>
                        gameEngine.startQuestPreparation({
                            gameContext: this.gameContext,
                            player: owner,
                            questCard
                        })
                });

            case GameCommandTypes.PASS_QUEST_PREPARATION:
                return gameEngine.passQuestPreparation({
                    gameContext: this.gameContext,
                    player
                });

            case GameCommandTypes.RESOLVE_QUEST:
                return this._executeQuestOwnerAction({
                    player,
                    questInstanceId: payload.questInstanceId,
                    action: (owner, questCard) =>
                        gameEngine.resolveQuest({
                            gameContext: this.gameContext,
                            player: owner,
                            questCard
                        })
                });

            case GameCommandTypes.RESOLVE_SELECTION:
                return gameEngine.resolvePendingSelection({
                    gameContext: this.gameContext,
                    requestId: payload.requestId,
                    player,
                    selectedIds: payload.selectedIds ?? []
                });

            default:
                return { success: false, reason: "UNKNOWN_COMMAND_TYPE" };
        }
    }

    _executeQuestOwnerAction({
        player,
        questInstanceId,
        action
    }) {
        const gameState = this.gameContext.gameState;
        if (gameState.getCurrentPlayer() !== player) {
            return { success: false, reason: "NOT_TURN_PLAYER" };
        }
        const questCard = this._findPublicFieldCard(questInstanceId);
        const owner = gameState.getPlayer(questCard.controllerId);
        if (!owner) {
            const error = new Error("Quest owner was not found.");
            error.reason = "QUEST_OWNER_NOT_FOUND";
            throw error;
        }
        return action(owner, questCard);
    }

    _findOwnedCard(player, zoneType, instanceId) {
        const zone = player.zones.getZone(zoneType);
        const card = zone?.cards.find(
            candidate => candidate.instanceId === instanceId
        );
        if (!card) {
            const error = new Error("Card was not found in the zone.");
            error.reason = "CARD_NOT_FOUND";
            throw error;
        }
        return card;
    }

    _findPublicFieldCard(instanceId) {
        for (const player of this.gameContext.gameState.players) {
            const card = player.zones.field.cards.find(
                candidate =>
                    candidate.instanceId === instanceId &&
                    candidate.faceUp !== false
            );
            if (card) {
                return card;
            }
        }
        const error = new Error("Public field card was not found.");
        error.reason = "CARD_NOT_FOUND";
        throw error;
    }

    _createRejectedResponse({
        commandId,
        type,
        playerId,
        reason
    }) {
        return this._createResponse({
            accepted: false,
            reason,
            commandId,
            type,
            playerId,
            commandRevision: this.gameContext.gameState.revision,
            replayed: false,
            viewerPlayerId:
                this.gameContext.gameState.getPlayer(playerId)
                    ? playerId
                    : null
        });
    }

    _createResponse({
        accepted,
        reason,
        commandId,
        type,
        playerId,
        commandRevision,
        replayed,
        viewerPlayerId
    }) {
        return cloneSerializable({
            protocolVersion: 1,
            accepted,
            reason,
            commandId,
            type,
            playerId,
            commandRevision,
            replayed,
            publicState: this.getPublicState(viewerPlayerId)
        }, "GameCommandGateway.response");
    }
}
