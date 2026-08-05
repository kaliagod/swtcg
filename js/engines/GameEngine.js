/**
 * GameEngine.js
 *
 * ゲーム全体からの処理要求を受け付ける窓口。
 *
 * 現段階では、EffectContextを生成し、
 * EffectResolverへ効果解決を依頼する。
 */

import AdventureAbilityTypes from "../constants/AdventureAbilityTypes.js";
import QuestPhaseStages from "../constants/QuestPhaseStages.js";
import GameEngineServiceFactory from
    "../services/GameEngineServiceFactory.js";

export default class GameEngine {

    /**
     * @param {Object} dependencies
     * @param {EffectResolver} dependencies.effectResolver
     */
    constructor(dependencies = {}) {
        const services = new GameEngineServiceFactory().create(dependencies);
        Object.assign(this, services);
    }
    /**
     * 指定したプレイヤーがメインデッキからカードを引く。
     *
     * デッキリフレッシュなどのフェイズ固有ルールは、
     * この低水準操作の呼び出し側で判断する。
     *
     * @param {Object} parameters
     * @param {PlayerState|Object} parameters.player
     * @param {number} parameters.amount
     * @returns {Object}
     */
    drawCards({
        player,
        amount = 1
    }) {

        if (
            !player ||
            !player.zones
        ) {
            throw new Error(
                "GameEngine.drawCards(): player.zonesを指定してください。"
            );
        }

        return this.zoneManager.draw({

            deck:
                player.zones.deck,

            hand:
                player.zones.hand,

            amount

        });

    }

    getCardUseEligibility({ player, card }) {
        const requirementResult =
            this._checkCardUseRequirements(player, card);
        return {
            allowed: requirementResult.met,
            reason: requirementResult.met
                ? null
                : "CARD_USE_REQUIREMENTS_NOT_MET",
            requirementResult
        };
    }

    prepareGame({
        gameContext,
        initialHandSize = 5,
        initialResourceSize = 3
    }) {
        return this.gameSetupManager.prepareGame({
            gameContext,
            initialHandSize,
            initialResourceSize
        });
    }

    mulliganInitialHand({
        gameContext,
        player
    }) {
        return this.gameSetupManager.mulliganInitialHand({
            gameContext,
            player
        });
    }

    beginFirstTurn({ gameContext }) {
        return this.gameSetupManager.beginFirstTurn({ gameContext });
    }

    advancePhase({ gameContext }) {
        return this.phaseFlowManager.advancePhase({
            gameContext,
            drawCards: parameters => this.drawCards(parameters),
            resolveStateBasedActions: parameters =>
                this.resolveStateBasedActions(parameters),
            enqueueTurnTriggers: (...parameters) =>
                this._enqueueTurnTriggers(...parameters),
            flushTriggeredEffects: context =>
                this._flushTriggeredEffects(context)
        });
    }

    playCard(parameters) {
        return this.cardActionManager.playCard({
            ...parameters,
            operations: this._createCardActionOperations()
        });
    }

    playGrowthCard(parameters) {
        return this.cardActionManager.playGrowthCard({
            ...parameters,
            operations: this._createCardActionOperations()
        });
    }
    checkVictory({ gameContext }) {
        return this.stateBasedActionManager.checkVictory({
            gameContext
        });
    }

    refreshDeck({ gameContext, player }) {
        return this.stateBasedActionManager.refreshDeck({
            gameContext,
            player
        });
    }

    resolveStateBasedActions({ gameContext }) {
        return this.stateBasedActionManager.resolve({
            gameContext,
            checkEquipmentState: parameters =>
                this.checkEquipmentState(parameters),
            resolveDamageOverflow: parameters =>
                this.resolveDamageOverflow(parameters)
        });
    }

    resolvePendingSelection({
        gameContext,
        requestId,
        player,
        selectedIds
    }) {
        return this.selectionContinuationManager.resolve({
            gameContext,
            requestId,
            player,
            selectedIds,
            applyTriggerOrder: parameters =>
                this._applyTriggerOrder(parameters),
            flushTriggeredEffects: (...parameters) =>
                this._flushTriggeredEffects(...parameters),
            completeTriggeredResolution: (...parameters) =>
                this._completeTriggeredResolution(...parameters),
            normalizeMpReplacementSelection: (...parameters) =>
                this._normalizeMpReplacementSelection(...parameters),
            playCard: parameters => this.playCard(parameters),
            playGrowthCard: parameters =>
                this.playGrowthCard(parameters),
            activateCard: parameters => this.activateCard(parameters),
            activateAdventureCard: parameters =>
                this.activateAdventureCard(parameters),
            resolveDamageOverflow: parameters =>
                this.resolveDamageOverflow(parameters),
            resolveQuest: parameters => this.resolveQuest(parameters),
            checkEquipmentState: parameters =>
                this.checkEquipmentState(parameters),
            resolveStateBasedActions: parameters =>
                this.resolveStateBasedActions(parameters)
        });
    }
    declareQuestParticipation({
        gameContext,
        player,
        questCard
    }) {
        return this.questFlowManager.declareParticipation({
            gameContext,
            player,
            questCard
        });
    }

    completeQuestParticipation({ gameContext, player }) {
        return this.questFlowManager.completeParticipation({
            gameContext,
            player
        });
    }

    startQuestPreparation({
        gameContext,
        player,
        questCard
    }) {
        return this.questFlowManager.startPreparation({
            gameContext,
            player,
            questCard
        });
    }

    passQuestPreparation({ gameContext, player }) {
        return this.questFlowManager.passPreparation({
            gameContext,
            player
        });
    }

    resolveQuest({
        gameContext,
        player,
        questCard
    }) {
        return this.questFlowManager.resolveQuest({
            gameContext,
            player,
            questCard,
            resolveDamageOverflow: parameters =>
                this.resolveDamageOverflow(parameters),
            dealDamage: parameters => this.dealDamage(parameters),
            moveCardTransactional: parameters =>
                this._moveCardTransactional(parameters),
            expireQuestStatuses: (...parameters) =>
                this._expireQuestStatuses(...parameters),
            resolveStateBasedActions: parameters =>
                this.resolveStateBasedActions(parameters),
            enqueueQuestOutcomeTriggers: (...parameters) =>
                this._enqueueQuestOutcomeTriggers(...parameters),
            flushTriggeredEffects: context =>
                this._flushTriggeredEffects(context),
            createPostProcessingResult: (...parameters) =>
                this._createPostProcessingResult(...parameters)
        });
    }

    dealDamage(parameters) {
        return this.playerStateResolutionManager.dealDamage({
            ...parameters,
            operations: this._createPlayerStateOperations()
        });
    }

    resolveDamageOverflow(parameters) {
        return this.playerStateResolutionManager.resolveDamageOverflow({
            ...parameters,
            operations: this._createPlayerStateOperations()
        });
    }

    checkEquipmentState(parameters) {
        return this.playerStateResolutionManager.checkEquipmentState({
            ...parameters,
            operations: this._createPlayerStateOperations()
        });
    }

    _createPlayerStateOperations() {
        return {
            recordAction: (...parameters) =>
                this._recordAction(...parameters),
            resolveStateBasedActions: parameters =>
                this.resolveStateBasedActions(parameters),
            moveCardTransactional: parameters =>
                this._moveCardTransactional(parameters),
            enforceEquipmentConditions: parameters =>
                this._enforceEquipmentConditions(parameters)
        };
    }
    _enforceEquipmentConditions(parameters) {
        return this.cardActionManager.enforceEquipmentConditions({
            ...parameters,
            moveCardTransactional: moveParameters =>
                this._moveCardTransactional(moveParameters)
        });
    }
    activateAdventureCard(parameters) {
        return this.cardActionManager.activateAdventureCard({
            ...parameters,
            operations: this._createCardActionOperations()
        });
    }

    activateCard(parameters) {
        return this.cardActionManager.activateCard({
            ...parameters,
            operations: this._createCardActionOperations()
        });
    }

    _createCardActionOperations() {
        return {
            prepareEffectTargetSelections: parameters =>
                this._prepareEffectTargetSelections(parameters),
            moveCardTransactional: parameters =>
                this._moveCardTransactional(parameters),
            resolveEffectsByTrigger: parameters =>
                this._resolveEffectsByTrigger(parameters),
            recordAction: (...parameters) =>
                this._recordAction(...parameters),
            resolveStateBasedActions: parameters =>
                this.resolveStateBasedActions(parameters),
            flushTriggeredEffects: (...parameters) =>
                this._flushTriggeredEffects(...parameters),
            createPostProcessingResult: (...parameters) =>
                this._createPostProcessingResult(...parameters)
        };
    }

    _checkCardUseRequirements(player, card) {
        return this.cardActionManager.checkCardUseRequirements(player, card);
    }

    _prepareEffectTargetSelections(parameters) {
        return this.effectExecutionManager.prepareTargetSelections(
            parameters
        );
    }

    _resolveEffectsByTrigger(parameters) {
        return this.effectExecutionManager.resolveEffectsByTrigger({
            ...parameters,
            resolveStateBasedActions: stateParameters =>
                this.resolveStateBasedActions(stateParameters)
        });
    }
    _moveCardTransactional(parameters) {
        return this.transactionalZoneMover.move({
            ...parameters,
            recordZoneTransition: transitionParameters =>
                this.recordZoneTransition(transitionParameters),
            discardQueuedTriggers: (...discardParameters) =>
                this.discardQueuedTriggers(...discardParameters)
        });
    }
    _createPostProcessingResult(
        stateBasedActionResult,
        triggerResolution
    ) {
        const stateComplete = Boolean(
            stateBasedActionResult?.success &&
            stateBasedActionResult?.stable
        );
        const triggersComplete = Boolean(
            triggerResolution?.success &&
            triggerResolution?.completed
        );
        return {
            success: stateComplete && triggersComplete,
            completed: stateComplete && triggersComplete,
            reason:
                !stateComplete
                    ? stateBasedActionResult?.reason ??
                        (stateBasedActionResult?.deferred
                            ? "STATE_BASED_ACTIONS_DEFERRED"
                            : "STATE_BASED_ACTIONS_INCOMPLETE")
                    : !triggersComplete
                        ? triggerResolution?.reason ??
                            "TRIGGER_RESOLUTION_INCOMPLETE"
                        : null
        };
    }

    recordZoneTransition({
        gameContext,
        from,
        to,
        card,
        previousFaceUp = card.faceUp,
        previousControllerId = card.controllerId
    }) {
        return this.triggerFlowManager.recordZoneTransition({
            gameContext,
            from,
            to,
            card,
            previousFaceUp,
            previousControllerId
        });
    }

    discardQueuedTriggers(gameState, entries) {
        return this.triggerFlowManager.discardQueuedTriggers(
            gameState,
            entries
        );
    }

    _enqueueCardTrigger({
        gameContext,
        card,
        controllerId,
        trigger,
        batchId = null,
        turnPlayerId = null
    }) {
        return this.triggerFlowManager.enqueueCardTrigger({
            gameContext,
            card,
            controllerId,
            trigger,
            batchId,
            turnPlayerId
        });
    }

    _enqueueTurnTriggers(gameContext, player, trigger) {
        return this.triggerFlowManager.enqueueTurnTriggers(
            gameContext,
            player,
            trigger
        );
    }

    _enqueueQuestOutcomeTriggers(gameContext, trigger) {
        return this.triggerFlowManager.enqueueQuestOutcomeTriggers(
            gameContext,
            trigger
        );
    }

    _applyTriggerOrder({
        gameContext,
        batchId,
        controllerId,
        orderedEntryIds
    }) {
        return this.triggerFlowManager.applyTriggerOrder({
            gameContext,
            batchId,
            controllerId,
            orderedEntryIds
        });
    }

    _flushTriggeredEffects(
        gameContext,
        {
            cardInstanceId = null,
            trigger = null,
            effectIndex = null,
            selectedTargetIdsByEffect = {},
            selectedMpReplacementIdsByEffect = {}
        } = {}
    ) {
        return this.triggerFlowManager.flushTriggeredEffects(
            gameContext,
            {
                cardInstanceId,
                trigger,
                effectIndex,
                selectedTargetIdsByEffect,
                selectedMpReplacementIdsByEffect
            },
            {
                prepareEffectTargetSelections: parameters =>
                    this._prepareEffectTargetSelections(parameters),
                resolveEffectsByTrigger: parameters =>
                    this._resolveEffectsByTrigger(parameters)
            }
        );
    }

    _completePendingPhaseTransition(gameContext) {
        return this.phaseFlowManager.completePendingPhaseTransition(
            gameContext
        );
    }

    _completeTriggeredResolution(gameContext, triggerResolution) {
        return this.triggerFlowManager.completeTriggeredResolution({
            gameContext,
            triggerResolution,
            resolveQuest: parameters => this.resolveQuest(parameters),
            completePendingPhaseTransition: context =>
                this._completePendingPhaseTransition(context)
        });
    }

    _expireQuestStatuses(gameContext, questInstanceId) {
        return this.phaseFlowManager.expireQuestStatuses(
            gameContext,
            questInstanceId
        );
    }

    _normalizeMpReplacementSelection(selection, defaultPlayerId) {
        return this.effectExecutionManager.normalizeMpReplacementSelection(
            selection,
            defaultPlayerId
        );
    }

    _recordAction(
        gameContext,
        type,
        playerId,
        payload
    ) {
        gameContext.actionLog?.append({
            type,
            playerId,
            payload
        });
    }

    /**
     * 効果1件を解決する。
     *
     * @param {Object} parameters
     * @param {GameContext} parameters.gameContext
     * @param {PlayerState|Object} parameters.player
     * @param {Card|null} parameters.sourceCard
     * @param {EffectDefinition} parameters.effect
     *
     * @returns {Object}
     */
    resolveEffect({
        gameContext,
        player,
        sourceCard = null,
        effect,
        selectedTargetIds = null,
        mpReplacementCardInstanceId = undefined,
        mpReplacementIdsByPlayer = {}
    }) {
        return this.effectExecutionManager.resolveEffect({
            gameContext,
            player,
            sourceCard,
            effect,
            selectedTargetIds,
            mpReplacementCardInstanceId,
            mpReplacementIdsByPlayer,
            resolveStateBasedActions: parameters =>
                this.resolveStateBasedActions(parameters)
        });
    }
}
