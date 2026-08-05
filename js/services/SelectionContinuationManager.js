const SUPPORTED_ACTIONS = new Set([
    "PLAY_CARD",
    "PLAY_GROWTH_CARD",
    "DAMAGE_OVERFLOW",
    "EQUIPMENT_LIMIT",
    "EFFECT_TARGET",
    "EFFECT_MP_REPLACEMENT",
    "TRIGGER_ORDER"
]);

const CONTINUATION_REASONS = new Set([
    "TARGET_SELECTION_REQUIRED",
    "RESOURCE_SELECTION_REQUIRED",
    "MP_REPLACEMENT_SELECTION_REQUIRED",
    "EFFECT_ORDER_SELECTION_REQUIRED",
    "QUEST_TRIGGER_SELECTION_REQUIRED",
    "QUEST_STATE_SELECTION_REQUIRED"
]);

export default class SelectionContinuationManager {
    resolve({
        gameContext,
        requestId,
        player,
        selectedIds,
        applyTriggerOrder,
        flushTriggeredEffects,
        completeTriggeredResolution,
        normalizeMpReplacementSelection,
        playCard,
        playGrowthCard,
        activateCard,
        activateAdventureCard,
        resolveDamageOverflow,
        resolveQuest,
        checkEquipmentState,
        resolveStateBasedActions
    }) {
        const request = gameContext.gameState.pendingSelections.find(
            candidate => candidate.id === requestId
        );
        if (!request) {
            return { success: false, reason: "SELECTION_NOT_FOUND" };
        }
        if (request.playerId !== player?.id) {
            return { success: false, reason: "NOT_SELECTION_PLAYER" };
        }
        if (!SUPPORTED_ACTIONS.has(request.context.action)) {
            return {
                success: false,
                reason: "SELECTION_CONTINUATION_NOT_SUPPORTED"
            };
        }

        const resolution = gameContext.selectionManager.resolve({
            requestId,
            playerId: player.id,
            selectedIds
        });
        let actionResult;

        if (request.context.action === "TRIGGER_ORDER") {
            actionResult = applyTriggerOrder({
                gameContext,
                batchId: request.context.batchId,
                controllerId: request.context.controllerId,
                orderedEntryIds: selectedIds
            });
            if (actionResult.success) {
                actionResult = flushTriggeredEffects(gameContext);
                actionResult = completeTriggeredResolution(
                    gameContext,
                    actionResult
                );
            }
        } else if (
            request.context.action === "EFFECT_TARGET" ||
            request.context.action === "EFFECT_MP_REPLACEMENT"
        ) {
            actionResult = this._continueEffectSelection({
                gameContext,
                request,
                player,
                selectedIds,
                resolution,
                normalizeMpReplacementSelection,
                playCard,
                playGrowthCard,
                activateCard,
                activateAdventureCard,
                flushTriggeredEffects,
                completeTriggeredResolution
            });
            if (actionResult.terminalResult) {
                return actionResult.terminalResult;
            }
            actionResult = actionResult.actionResult;
        } else if (
            request.context.action === "PLAY_CARD" ||
            request.context.action === "PLAY_GROWTH_CARD"
        ) {
            const card = player.zones.getAllZones()
                .flatMap(zone => zone.cards)
                .find(candidate =>
                    candidate.instanceId ===
                        request.context.cardInstanceId
                );
            if (!card) {
                return {
                    success: false,
                    reason: "SELECTION_CARD_NOT_FOUND",
                    resolution
                };
            }
            actionResult = request.context.action === "PLAY_CARD"
                ? playCard({
                    gameContext,
                    player,
                    card,
                    resourceCardIds: selectedIds
                })
                : playGrowthCard({
                    gameContext,
                    player,
                    card,
                    resourceCardIds: selectedIds
                });
        } else if (request.context.action === "DAMAGE_OVERFLOW") {
            const overflowResult = resolveDamageOverflow({
                gameContext,
                player,
                selectedIds,
                duringQuest: request.context.duringQuest ?? false
            });
            actionResult = overflowResult;
            if (
                overflowResult.stable &&
                request.context.duringQuest === true &&
                request.context.questInstanceId
            ) {
                const quest = this._findQuest(
                    gameContext.gameState,
                    request.context.questInstanceId
                );
                if (quest !== null) {
                    actionResult = {
                        ...resolveQuest({
                            gameContext,
                            player: quest.owner,
                            questCard: quest.card
                        }),
                        overflowResult
                    };
                }
            }
        } else {
            actionResult = checkEquipmentState({
                gameContext,
                player,
                selectedKeepIds: selectedIds
            });
            if (actionResult.stable) {
                actionResult.stateBasedActionResult =
                    resolveStateBasedActions({ gameContext });
            }
        }

        return this._createResult(resolution, actionResult);
    }

    _continueEffectSelection({
        gameContext,
        request,
        player,
        selectedIds,
        resolution,
        normalizeMpReplacementSelection,
        playCard,
        playGrowthCard,
        activateCard,
        activateAdventureCard,
        flushTriggeredEffects,
        completeTriggeredResolution
    }) {
        const actionPlayer = request.context.actorPlayerId === undefined
            ? player
            : gameContext.gameState.getPlayer(
                request.context.actorPlayerId
            );
        if (!actionPlayer) {
            return {
                terminalResult: {
                    success: false,
                    reason: "SELECTION_ACTOR_NOT_FOUND",
                    resolution
                }
            };
        }
        const card = gameContext.gameState.players
            .flatMap(gamePlayer =>
                gamePlayer.zones.getAllZones()
                    .flatMap(zone => zone.cards)
            )
            .find(candidate =>
                candidate.instanceId === request.context.cardInstanceId
            );
        if (!card) {
            return {
                terminalResult: {
                    success: false,
                    reason: "SELECTION_CARD_NOT_FOUND",
                    resolution
                }
            };
        }
        const effectTargetIdsByEffect = {
            ...(request.context.selectedTargetIdsByEffect ?? {})
        };
        const mpReplacementIdsByEffect = {
            ...(request.context.selectedMpReplacementIdsByEffect ?? {})
        };
        if (request.context.action === "EFFECT_TARGET") {
            effectTargetIdsByEffect[request.context.effectIndex] =
                [...selectedIds];
        } else {
            const effectIndex = request.context.effectIndex;
            const existing = normalizeMpReplacementSelection(
                mpReplacementIdsByEffect[effectIndex],
                actionPlayer.id
            );
            existing[
                request.context.replacementPlayerId ?? player.id
            ] = selectedIds[0];
            mpReplacementIdsByEffect[effectIndex] = existing;
        }
        const continuation = {
            gameContext,
            player: actionPlayer,
            card,
            effectTargetIdsByEffect,
            mpReplacementIdsByEffect
        };
        let actionResult;
        switch (request.context.continuationAction) {
            case "PLAY_CARD":
                actionResult = playCard({
                    ...continuation,
                    resourceCardIds: request.context.resourceCardIds ?? []
                });
                break;
            case "PLAY_GROWTH_CARD":
                actionResult = playGrowthCard({
                    ...continuation,
                    resourceCardIds: request.context.resourceCardIds ?? []
                });
                break;
            case "ACTIVATE_CARD":
                actionResult = activateCard(continuation);
                break;
            case "ACTIVATE_ADVENTURE_CARD":
                actionResult = activateAdventureCard(continuation);
                break;
            case "RESOLVE_TRIGGER_QUEUE":
                actionResult = flushTriggeredEffects(gameContext, {
                    cardInstanceId: card.instanceId,
                    trigger: request.context.trigger,
                    effectIndex: request.context.effectIndex,
                    selectedTargetIdsByEffect: effectTargetIdsByEffect,
                    selectedMpReplacementIdsByEffect:
                        mpReplacementIdsByEffect
                });
                actionResult = completeTriggeredResolution(
                    gameContext,
                    actionResult
                );
                break;
            default:
                return {
                    terminalResult: {
                        success: false,
                        reason: "SELECTION_CONTINUATION_NOT_SUPPORTED",
                        resolution
                    }
                };
        }
        return { actionResult };
    }

    _findQuest(gameState, questInstanceId) {
        for (const player of gameState.players) {
            const card = player.zones.field.cards.find(candidate =>
                candidate.instanceId === questInstanceId
            );
            if (card) {
                return { owner: player, card };
            }
        }
        return null;
    }

    _createResult(resolution, actionResult) {
        const continuedToAnotherSelection =
            CONTINUATION_REASONS.has(actionResult.reason) ||
            actionResult.completed === false;
        return {
            success:
                actionResult.success ||
                actionResult.completed === true ||
                continuedToAnotherSelection,
            reason: continuedToAnotherSelection
                ? null
                : actionResult.reason ?? null,
            resolution,
            actionResult
        };
    }
}
