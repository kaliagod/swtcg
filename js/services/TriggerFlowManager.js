import QuestResolutionStages from "../constants/QuestResolutionStages.js";
import SelectionTypes from "../constants/SelectionTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

export default class TriggerFlowManager {
    recordZoneTransition({
        gameContext,
        from,
        to,
        card,
        previousFaceUp = card.faceUp,
        previousControllerId = card.controllerId
    }) {
        if (!gameContext?.gameState || from.type === to.type) {
            return [];
        }
        const entries = [];
        if (
            from.type === ZoneTypes.FIELD &&
            to.type !== ZoneTypes.FIELD &&
            previousFaceUp
        ) {
            entries.push(...this.enqueueCardTrigger({
                gameContext,
                card,
                controllerId: previousControllerId ?? card.ownerId,
                trigger: TriggerTypes.LEAVE
            }));
        }
        if (
            from.type !== ZoneTypes.FIELD &&
            to.type === ZoneTypes.FIELD &&
            card.faceUp
        ) {
            entries.push(...this.enqueueCardTrigger({
                gameContext,
                card,
                controllerId: card.controllerId ?? card.ownerId,
                trigger: TriggerTypes.ENTER
            }));
        }
        return entries;
    }

    discardQueuedTriggers(gameState, entries) {
        if (!gameState || !Array.isArray(entries) || entries.length === 0) {
            return;
        }
        const discarded = new Set(entries);
        gameState.triggerQueue = gameState.triggerQueue.filter(
            entry => !discarded.has(entry)
        );
    }

    enqueueCardTrigger({
        gameContext,
        card,
        controllerId,
        trigger,
        batchId = null,
        turnPlayerId = null
    }) {
        const gameState = gameContext.gameState;
        const resolvedBatchId = batchId ??
            `TRIGGER_BATCH_${gameState.nextTriggerBatchId++}`;
        const resolvedTurnPlayerId = turnPlayerId ??
            gameState.getCurrentPlayer()?.id ??
            controllerId;
        const entries = [];

        for (const [effectIndex, effect] of
            card.definition.effects.entries()) {
            if (effect.trigger !== trigger) {
                continue;
            }
            const entry = {
                id: `TRIGGER_${gameState.nextTriggerEntryId++}`,
                batchId: resolvedBatchId,
                turnPlayerId: resolvedTurnPlayerId,
                card,
                cardInstanceId: card.instanceId,
                controllerId,
                trigger,
                effectIndex,
                orderResolved: false,
                orderRank: null
            };
            gameState.triggerQueue.push(entry);
            entries.push(entry);
        }

        return entries;
    }

    enqueueTurnTriggers(gameContext, player, trigger) {
        const gameState = gameContext.gameState;
        const batchId =
            `TRIGGER_BATCH_${gameState.nextTriggerBatchId++}`;
        const turnPlayerId =
            gameState.getCurrentPlayer()?.id ?? player.id;
        for (const card of player.zones.field.cards) {
            if (!card.faceUp) {
                continue;
            }
            this.enqueueCardTrigger({
                gameContext,
                card,
                controllerId: player.id,
                trigger,
                batchId,
                turnPlayerId
            });
        }
    }

    enqueueQuestOutcomeTriggers(gameContext, trigger) {
        const gameState = gameContext.gameState;
        const batchId =
            `TRIGGER_BATCH_${gameState.nextTriggerBatchId++}`;
        const turnPlayerId =
            gameState.getCurrentPlayer()?.id ?? null;

        for (const player of gameState.players) {
            for (const card of player.zones.field.cards) {
                if (!card.faceUp) {
                    continue;
                }
                this.enqueueCardTrigger({
                    gameContext,
                    card,
                    controllerId: card.controllerId ?? player.id,
                    trigger,
                    batchId,
                    turnPlayerId
                });
            }
        }
    }

    applyTriggerOrder({
        gameContext,
        batchId,
        controllerId,
        orderedEntryIds
    }) {
        const entries = gameContext.gameState.triggerQueue.filter(
            entry =>
                entry.batchId === batchId &&
                entry.controllerId === controllerId
        );
        if (
            entries.length !== orderedEntryIds.length ||
            entries.some(entry => !orderedEntryIds.includes(entry.id))
        ) {
            return {
                success: false,
                reason: "TRIGGER_ORDER_MISMATCH"
            };
        }
        const order = new Map(
            orderedEntryIds.map((entryId, index) => [entryId, index])
        );
        for (const entry of entries) {
            entry.orderResolved = true;
            entry.orderRank = order.get(entry.id);
        }
        return { success: true, reason: null };
    }

    flushTriggeredEffects(
        gameContext,
        {
            cardInstanceId = null,
            trigger = null,
            effectIndex = null,
            selectedTargetIdsByEffect = {},
            selectedMpReplacementIdsByEffect = {}
        } = {},
        {
            prepareEffectTargetSelections,
            resolveEffectsByTrigger
        }
    ) {
        const gameState = gameContext.gameState;
        const results = [];
        let useSelections = cardInstanceId !== null;

        while (gameState.triggerQueue.length > 0) {
            const group = this._getNextTriggerGroup(gameState);
            if (!group) {
                break;
            }
            const player = gameState.getPlayer(group.controllerId);
            if (!player) {
                const discardedEntries = new Set(group.entries);
                gameState.triggerQueue = gameState.triggerQueue.filter(
                    entry => !discardedEntries.has(entry)
                );
                continue;
            }
            if (
                group.entries.length > 1 &&
                !group.entries.every(entry => entry.orderResolved)
            ) {
                const selectionRequest =
                    this._requestTriggerOrder(gameContext, group);
                return {
                    success: false,
                    reason: "EFFECT_ORDER_SELECTION_REQUIRED",
                    completed: false,
                    selectionRequest,
                    results
                };
            }
            if (group.entries.length === 1) {
                group.entries[0].orderResolved = true;
                group.entries[0].orderRank = 0;
            }
            const entry = [...group.entries].sort(
                (left, right) => left.orderRank - right.orderRank
            )[0];
            if (
                useSelections &&
                (
                    entry.cardInstanceId !== cardInstanceId ||
                    entry.trigger !== trigger ||
                    entry.effectIndex !== effectIndex
                )
            ) {
                return {
                    success: false,
                    reason: "TRIGGER_QUEUE_MISMATCH",
                    completed: false,
                    results
                };
            }
            const targetPreparation = prepareEffectTargetSelections({
                gameContext,
                player,
                card: entry.card,
                trigger: entry.trigger,
                selectedTargetIdsByEffect:
                    useSelections ? selectedTargetIdsByEffect : {},
                selectedMpReplacementIdsByEffect:
                    useSelections ? selectedMpReplacementIdsByEffect : {},
                continuationAction: "RESOLVE_TRIGGER_QUEUE",
                effectIndexes: new Set([entry.effectIndex])
            });
            if (!targetPreparation.success) {
                return {
                    ...targetPreparation,
                    completed: false,
                    results
                };
            }

            const effectResults = resolveEffectsByTrigger({
                gameContext,
                player,
                card: entry.card,
                trigger: entry.trigger,
                selectedTargetIdsByEffect:
                    useSelections ? selectedTargetIdsByEffect : {},
                selectedMpReplacementIdsByEffect:
                    useSelections ? selectedMpReplacementIdsByEffect : {},
                effectIndexes: new Set([entry.effectIndex])
            });
            gameState.triggerQueue = gameState.triggerQueue.filter(
                queuedEntry => queuedEntry !== entry
            );
            results.push({
                cardInstanceId: entry.cardInstanceId,
                trigger: entry.trigger,
                effectIndex: entry.effectIndex,
                effectResults
            });
            useSelections = false;
        }
        return {
            success: true,
            reason: null,
            completed: true,
            results
        };
    }

    completeTriggeredResolution({
        gameContext,
        triggerResolution,
        resolveQuest,
        completePendingPhaseTransition
    }) {
        if (!triggerResolution.completed) {
            return triggerResolution;
        }
        const continuationResult = this.resumePendingContinuation({
            gameContext,
            resolveQuest
        });
        if (continuationResult !== null) {
            return continuationResult;
        }
        completePendingPhaseTransition(gameContext);
        return triggerResolution;
    }

    resumePendingContinuation({ gameContext, resolveQuest }) {
        const gameState = gameContext.gameState;
        const continuation = gameState.pendingTriggerContinuation;
        if (!continuation) {
            return null;
        }
        gameState.pendingTriggerContinuation = null;

        if (continuation.action === "RESOLVE_QUEST") {
            const owner = gameState.getPlayer(continuation.ownerId);
            const questCard = owner?.zones.field.cards.find(card =>
                card.instanceId === continuation.questInstanceId
            );
            if (!owner || !questCard) {
                return {
                    success: false,
                    reason: "QUEST_TRIGGER_CONTINUATION_NOT_FOUND"
                };
            }
            if (questCard.questResolution) {
                questCard.questResolution.stage =
                    QuestResolutionStages.DAMAGE;
            }
            return resolveQuest({
                gameContext,
                player: owner,
                questCard
            });
        }

        return {
            success: false,
            reason: "TRIGGER_CONTINUATION_NOT_SUPPORTED"
        };
    }

    _getTriggerControllerOrder(gameState, turnPlayerId) {
        const startIndex = gameState.players.findIndex(
            player => player.id === turnPlayerId
        );
        if (startIndex === -1) {
            return gameState.players.map(player => player.id);
        }
        return gameState.players.map((_, offset) =>
            gameState.players[
                (startIndex + offset) % gameState.players.length
            ].id
        );
    }

    _getNextTriggerGroup(gameState) {
        const firstEntry = gameState.triggerQueue[0] ?? null;
        if (!firstEntry) {
            return null;
        }
        const batchEntries = gameState.triggerQueue.filter(
            entry => entry.batchId === firstEntry.batchId
        );
        const controllerOrder = this._getTriggerControllerOrder(
            gameState,
            firstEntry.turnPlayerId
        );
        const controllerId = controllerOrder.find(playerId =>
            batchEntries.some(entry => entry.controllerId === playerId)
        ) ?? batchEntries[0]?.controllerId;

        return {
            batchId: firstEntry.batchId,
            controllerId,
            entries: batchEntries.filter(
                entry => entry.controllerId === controllerId
            )
        };
    }

    _requestTriggerOrder(gameContext, group) {
        return gameContext.selectionManager.request({
            type: SelectionTypes.EFFECT_ORDER,
            playerId: group.controllerId,
            prompt: "同時に誘発した効果の解決順を選択してください。",
            candidates: group.entries.map(entry => ({
                id: entry.id,
                name: `${entry.card.name}（効果${entry.effectIndex + 1}）`,
                cardId: entry.card.definition.id,
                cardInstanceId: entry.cardInstanceId,
                trigger: entry.trigger,
                effectIndex: entry.effectIndex
            })),
            min: group.entries.length,
            max: group.entries.length,
            context: {
                action: "TRIGGER_ORDER",
                batchId: group.batchId,
                controllerId: group.controllerId
            }
        });
    }
}
