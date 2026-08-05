import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import QuestPhaseStages from "../constants/QuestPhaseStages.js";
import QuestResolutionStages from "../constants/QuestResolutionStages.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import AdventureAbilityManager from "./AdventureAbilityManager.js";
import DamageOverflowManager from "./DamageOverflowManager.js";
import QuestManager from "./QuestManager.js";

export default class QuestFlowManager {
    constructor({
        questManager,
        damageOverflowManager,
        adventureAbilityManager
    }) {
        if (!(questManager instanceof QuestManager)) {
            throw new Error("QuestFlowManager: questManagerが不正です。");
        }
        if (!(damageOverflowManager instanceof DamageOverflowManager)) {
            throw new Error(
                "QuestFlowManager: damageOverflowManagerが不正です。"
            );
        }
        if (!(adventureAbilityManager instanceof AdventureAbilityManager)) {
            throw new Error(
                "QuestFlowManager: adventureAbilityManagerが不正です。"
            );
        }
        this.questManager = questManager;
        this.damageOverflowManager = damageOverflowManager;
        this.adventureAbilityManager = adventureAbilityManager;
    }

    declareParticipation({ gameContext, player, questCard }) {
        const gameState = gameContext.gameState;
        if (gameState.hasPendingSelection()) {
            return { success: false, reason: "PENDING_SELECTION" };
        }
        const eligibility = this.questManager.getParticipationEligibility({
            gameState,
            player,
            questCard
        });
        if (!eligibility.allowed) {
            return {
                success: false,
                reason: eligibility.reason,
                requirementResult: eligibility.requirementResult
            };
        }
        questCard.questParticipantIds.push(player.id);
        this._recordAction(
            gameContext,
            "QUEST_PARTICIPATION_DECLARED",
            player.id,
            { questInstanceId: questCard.instanceId }
        );
        return {
            success: true,
            reason: null,
            questCard,
            participantIds: [...questCard.questParticipantIds]
        };
    }

    completeParticipation({ gameContext, player }) {
        const gameState = gameContext.gameState;
        if (gameState.hasPendingSelection()) {
            return { success: false, reason: "PENDING_SELECTION" };
        }
        if (
            gameState.phase !== GamePhaseTypes.QUEST ||
            gameState.getCurrentPlayer() !== player ||
            gameState.questPhase?.stage !== QuestPhaseStages.PARTICIPATION
        ) {
            return {
                success: false,
                reason: "QUEST_PARTICIPATION_NOT_IN_PROGRESS"
            };
        }
        const resolvableQuestInstanceIds =
            this.questManager.getResolvableQuests(gameState, player)
                .map(card => card.instanceId);
        gameState.questPhase = {
            stage: QuestPhaseStages.SELECT_QUEST,
            activeQuestInstanceId: null,
            resolvableQuestInstanceIds
        };
        this._recordAction(
            gameContext,
            "QUEST_PARTICIPATION_COMPLETED",
            player.id,
            { resolvableQuestInstanceIds }
        );
        return {
            success: true,
            reason: null,
            resolvableQuestInstanceIds: [...resolvableQuestInstanceIds]
        };
    }

    startPreparation({ gameContext, player, questCard }) {
        const gameState = gameContext.gameState;
        if (gameState.hasPendingSelection()) {
            return { success: false, reason: "PENDING_SELECTION" };
        }
        if (gameState.questPreparation !== null) {
            return {
                success: false,
                reason: "QUEST_PREPARATION_IN_PROGRESS"
            };
        }
        if (!this.questManager.canSelectForResolution({
            gameState,
            player,
            questCard
        })) {
            return { success: false, reason: "QUEST_NOT_RESOLVABLE" };
        }
        if (questCard.questPreparationComplete) {
            return {
                success: false,
                reason: "QUEST_PREPARATION_ALREADY_COMPLETE"
            };
        }

        const playerOrder = [];
        for (let offset = 0; offset < gameState.players.length; offset++) {
            const index = (gameState.currentPlayerIndex + offset) %
                gameState.players.length;
            playerOrder.push(gameState.players[index].id);
        }
        for (const gamePlayer of gameState.players) {
            gamePlayer.adventurer?.clearTemporaryQuestModifiers();
            gamePlayer.adventurer?.clearTemporaryQuestTags();
        }
        gameState.questPhase.stage = QuestPhaseStages.PREPARATION;
        gameState.questPhase.activeQuestInstanceId = questCard.instanceId;
        gameState.questPreparation = {
            questInstanceId: questCard.instanceId,
            ownerId: player.id,
            playerOrder,
            currentIndex: 0,
            passedPlayerIds: [],
            usedMagicNamesByPlayer: Object.fromEntries(
                gameState.players.map(gamePlayer => [gamePlayer.id, []])
            )
        };
        this._recordAction(
            gameContext,
            "QUEST_PREPARATION_STARTED",
            player.id,
            {
                questInstanceId: questCard.instanceId,
                playerOrder: [...playerOrder]
            }
        );
        return {
            success: true,
            reason: null,
            questCard,
            activePlayerId: playerOrder[0],
            playerOrder: [...playerOrder]
        };
    }

    passPreparation({ gameContext, player }) {
        const gameState = gameContext.gameState;
        const preparation = gameState.questPreparation;
        if (gameState.hasPendingSelection()) {
            return { success: false, reason: "PENDING_SELECTION" };
        }
        if (preparation === null) {
            return {
                success: false,
                reason: "QUEST_PREPARATION_NOT_IN_PROGRESS"
            };
        }
        const activePlayerId =
            preparation.playerOrder[preparation.currentIndex];
        if (player?.id !== activePlayerId) {
            return {
                success: false,
                reason: "NOT_QUEST_PREPARATION_PLAYER",
                activePlayerId
            };
        }
        preparation.passedPlayerIds.push(player.id);
        preparation.currentIndex++;
        const completed =
            preparation.currentIndex >= preparation.playerOrder.length;
        let nextPlayerId = null;
        if (completed) {
            const questCard = this.questManager.getAllQuests(gameState)
                .find(card =>
                    card.instanceId === preparation.questInstanceId
                );
            if (!questCard) {
                gameState.questPreparation = null;
                return { success: false, reason: "QUEST_NOT_RESOLVABLE" };
            }
            questCard.questPreparationComplete = true;
            gameState.questPreparation = null;
            gameState.questPhase.stage = QuestPhaseStages.RESOLUTION;
        } else {
            nextPlayerId =
                preparation.playerOrder[preparation.currentIndex];
        }
        this._recordAction(
            gameContext,
            completed
                ? "QUEST_PREPARATION_COMPLETED"
                : "QUEST_PREPARATION_PASSED",
            player.id,
            {
                questInstanceId: preparation.questInstanceId,
                nextPlayerId
            }
        );
        return {
            success: true,
            reason: null,
            completed,
            nextPlayerId
        };
    }

    resolveQuest({
        gameContext,
        player,
        questCard,
        resolveDamageOverflow,
        dealDamage,
        moveCardTransactional,
        expireQuestStatuses,
        resolveStateBasedActions,
        enqueueQuestOutcomeTriggers,
        flushTriggeredEffects,
        createPostProcessingResult
    }) {
        const gameState = gameContext.gameState;
        if (gameState.hasPendingSelection()) {
            return { success: false, reason: "PENDING_SELECTION" };
        }
        if (!this.questManager.canResolve({
            gameState,
            player,
            questCard
        })) {
            return { success: false, reason: "QUEST_NOT_RESOLVABLE" };
        }
        if (gameState.questPreparation !== null) {
            return {
                success: false,
                reason: "QUEST_PREPARATION_IN_PROGRESS"
            };
        }
        if (
            gameState.questPhase?.stage !== QuestPhaseStages.RESOLUTION ||
            gameState.questPhase.activeQuestInstanceId !==
                questCard.instanceId
        ) {
            return {
                success: false,
                reason: "QUEST_NOT_SELECTED_FOR_RESOLUTION"
            };
        }
        if (!questCard.questPreparationComplete) {
            return {
                success: false,
                reason: "QUEST_PREPARATION_REQUIRED"
            };
        }

        if (questCard.questResolution === null) {
            const evaluation = this.questManager.evaluate(
                gameState,
                questCard
            );
            questCard.questResolution = {
                outcome: evaluation.success ? "SUCCESS" : "FAILURE",
                participantIds: [...evaluation.participantIds],
                totals: { ...evaluation.totals },
                requirements: { ...evaluation.requirements },
                rewardPerParticipant: evaluation.rewardPerParticipant,
                nextDamageIndex: 0,
                stage: QuestResolutionStages.TRIGGERS
            };
            const outcomeTrigger = evaluation.success
                ? TriggerTypes.QUEST_SUCCESS
                : TriggerTypes.QUEST_FAILURE;
            enqueueQuestOutcomeTriggers(gameContext, outcomeTrigger);
            gameState.pendingTriggerContinuation = {
                action: "RESOLVE_QUEST",
                ownerId: player.id,
                questInstanceId: questCard.instanceId
            };
            const triggerResolution = flushTriggeredEffects(gameContext);
            if (!triggerResolution.completed) {
                return {
                    success: false,
                    reason: "QUEST_TRIGGER_SELECTION_REQUIRED",
                    questCard,
                    triggerResolution
                };
            }
            gameState.pendingTriggerContinuation = null;
            questCard.questResolution.stage = QuestResolutionStages.DAMAGE;
        }

        const resolution = questCard.questResolution;
        if (resolution.stage === QuestResolutionStages.TRIGGERS) {
            resolution.stage = QuestResolutionStages.DAMAGE;
        }
        for (const participantId of resolution.participantIds) {
            const participant = gameState.getPlayer(participantId);
            const overflowState = this.damageOverflowManager.getState(
                participant,
                { duringQuest: true }
            );
            if (overflowState.excess > 0) {
                const overflowResult = resolveDamageOverflow({
                    gameContext,
                    player: participant,
                    duringQuest: true
                });
                if (!overflowResult.stable) {
                    return {
                        success: false,
                        reason: "QUEST_STATE_SELECTION_REQUIRED",
                        questCard,
                        stateResult: overflowResult
                    };
                }
            }
        }

        while (
            resolution.nextDamageIndex < resolution.participantIds.length
        ) {
            const participantId = resolution.participantIds[
                resolution.nextDamageIndex
            ];
            const participant = gameState.getPlayer(participantId);
            resolution.nextDamageIndex++;
            const damageResult = dealDamage({
                gameContext,
                player: participant,
                amount: typeof questCard.getQuestDamage === "function"
                    ? questCard.getQuestDamage()
                    : questCard.definition.questDamage,
                duringQuest: true,
                questCard
            });
            if (!damageResult.overflowResult.stable) {
                return {
                    success: false,
                    reason: "QUEST_STATE_SELECTION_REQUIRED",
                    questCard,
                    participantId,
                    stateResult: damageResult.overflowResult
                };
            }
        }

        resolution.stage = QuestResolutionStages.FINALIZE;
        const transactionManager = gameContext.transaction;
        transactionManager.begin();
        try {
            const rewardResults = [];
            if (resolution.outcome === "SUCCESS") {
                for (const participantId of resolution.participantIds) {
                    const participant = gameState.getPlayer(participantId);
                    const cards = this._gainResourcesTransactional({
                        player: participant,
                        amount: resolution.rewardPerParticipant,
                        transactionManager,
                        questCard,
                        moveCardTransactional
                    });
                    rewardResults.push({
                        playerId: participantId,
                        requestedAmount: resolution.rewardPerParticipant,
                        gainedCardInstanceIds: cards.map(
                            card => card.instanceId
                        )
                    });
                }
            }
            moveCardTransactional({
                gameContext,
                transactionManager,
                from: player.zones.field,
                to: player.zones.graveyard,
                card: questCard,
                state: {
                    zone: ZoneTypes.GRAVEYARD,
                    controllerId: null,
                    questParticipantIds: [],
                    questPreparationComplete: false,
                    questOverrides: {
                        requirements: null,
                        rewardResources: null,
                        damage: null,
                        tags: null
                    },
                    questAvailableTurn: null
                }
            });
            const issuerDrawCards = [];
            if (resolution.outcome === "SUCCESS") {
                const drawnCard = this._drawOneTransactional({
                    player,
                    transactionManager,
                    moveCardTransactional
                });
                if (drawnCard) {
                    issuerDrawCards.push(drawnCard);
                }
            }
            resolution.stage = QuestResolutionStages.COMPLETE;
            transactionManager.commit();

            gameState.questPhase.stage = QuestPhaseStages.SELECT_QUEST;
            gameState.questPhase.activeQuestInstanceId = null;
            gameState.questPhase.resolvableQuestInstanceIds =
                this.questManager.getResolvableQuests(gameState, player)
                    .filter(card => card !== questCard)
                    .map(card => card.instanceId);
            for (const gamePlayer of gameState.players) {
                gamePlayer.adventurer?.clearTemporaryQuestModifiers();
                gamePlayer.adventurer?.clearTemporaryQuestTags();
            }
            const expiredStatuses = expireQuestStatuses(
                gameContext,
                questCard.instanceId
            );
            const result = {
                success: true,
                reason: null,
                outcome: resolution.outcome,
                questCard,
                participantIds: [...resolution.participantIds],
                totals: { ...resolution.totals },
                requirements: { ...resolution.requirements },
                rewardPerParticipant: resolution.rewardPerParticipant,
                rewardResults,
                issuerDrawCardInstanceIds: issuerDrawCards.map(
                    card => card.instanceId
                )
            };
            this._recordAction(
                gameContext,
                "QUEST_RESOLVED",
                player.id,
                {
                    questInstanceId: questCard.instanceId,
                    outcome: result.outcome,
                    participantIds: result.participantIds,
                    rewardPerParticipant: result.rewardPerParticipant
                }
            );

            const postQuestStateResults = [];
            for (const participantId of result.participantIds) {
                const participant = gameState.getPlayer(participantId);
                const stateResult = resolveDamageOverflow({
                    gameContext,
                    player: participant,
                    duringQuest: false,
                    runStateBasedActions: false
                });
                postQuestStateResults.push({
                    playerId: participantId,
                    result: stateResult
                });
                if (!stateResult.stable) {
                    break;
                }
            }
            result.postQuestStateResults = postQuestStateResults;
            result.stateBasedActionResult = resolveStateBasedActions({
                gameContext
            });
            result.expiredStatuses = expiredStatuses;
            result.triggerResolution = flushTriggeredEffects(gameContext);
            result.committed = true;
            result.postProcessingResult = createPostProcessingResult(
                result.stateBasedActionResult,
                result.triggerResolution
            );
            return result;
        } catch (error) {
            if (transactionManager.isActive()) {
                transactionManager.rollback();
            }
            resolution.stage = QuestResolutionStages.FINALIZE;
            throw error;
        }
    }

    _gainResourcesTransactional({
        player,
        amount,
        transactionManager,
        questCard,
        moveCardTransactional
    }) {
        const questTags = typeof questCard.getTags === "function"
            ? questCard.getTags()
            : [...questCard.definition.tags];
        const bonus = amount > 0
            ? this.adventureAbilityManager.getResourceGainBonus(
                player,
                { questTags }
            )
            : 0;
        const totalAmount = Math.max(0, amount + bonus);
        const cards = [];
        for (let count = 0; count < totalAmount; count++) {
            const card = player.zones.deck.peekTop();
            if (card === null) {
                break;
            }
            moveCardTransactional({
                transactionManager,
                from: player.zones.deck,
                to: player.zones.resource,
                card,
                state: { faceUp: false, zone: ZoneTypes.RESOURCE }
            });
            cards.push(card);
        }
        return cards;
    }

    _drawOneTransactional({
        player,
        transactionManager,
        moveCardTransactional
    }) {
        const card = player.zones.deck.peekTop();
        if (card === null) {
            return null;
        }
        moveCardTransactional({
            transactionManager,
            from: player.zones.deck,
            to: player.zones.hand,
            card,
            state: { faceUp: true, zone: ZoneTypes.HAND }
        });
        return card;
    }

    _recordAction(gameContext, type, playerId, payload) {
        gameContext.actionLog?.append({ type, playerId, payload });
    }
}
