import CardTypes from "../constants/CardTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import ItemUseTypes from "../constants/ItemUseTypes.js";
import SelectionTypes from "../constants/SelectionTypes.js";
import TriggerTypes from "../constants/TriggerTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import AdventureAbilityManager from "./AdventureAbilityManager.js";
import AdventurerRequirementEvaluator from
    "./AdventurerRequirementEvaluator.js";
import EquipmentManager from "./EquipmentManager.js";

const MAIN_PHASE_CARD_TYPES = new Set([
    CardTypes.QUEST,
    CardTypes.EQUIPMENT,
    CardTypes.ACCESSORY,
    CardTypes.ITEM,
    CardTypes.EVENT
]);

const GROWTH_CARD_TYPES = new Set([
    CardTypes.MAGIC,
    CardTypes.SKILL,
    CardTypes.TRAIT
]);

export default class CardActionManager {
    constructor({
        equipmentManager,
        adventureAbilityManager,
        requirementEvaluator
    }) {
        if (!(equipmentManager instanceof EquipmentManager)) {
            throw new Error(
                "CardActionManager: equipmentManagerが不正です。"
            );
        }
        if (!(adventureAbilityManager instanceof AdventureAbilityManager)) {
            throw new Error(
                "CardActionManager: adventureAbilityManagerが不正です。"
            );
        }
        if (!(
            requirementEvaluator instanceof AdventurerRequirementEvaluator
        )) {
            throw new Error(
                "CardActionManager: requirementEvaluatorが不正です。"
            );
        }
        this.equipmentManager = equipmentManager;
        this.adventureAbilityManager = adventureAbilityManager;
        this.requirementEvaluator = requirementEvaluator;
    }

    playCard({
        operations,
        gameContext,
        player,
        card,
        resourceCardIds = null,
        effectTargetIdsByEffect = {},
        mpReplacementIdsByEffect = {}
    }) {
        const gameState = gameContext.gameState;

        if (gameState.hasPendingSelection()) {
            return { success: false, reason: "PENDING_SELECTION" };
        }

        if (
            !gameState.started ||
            gameState.phase !== GamePhaseTypes.MAIN
        ) {
            return { success: false, reason: "NOT_MAIN_PHASE" };
        }

        if (gameState.getCurrentPlayer() !== player) {
            return { success: false, reason: "NOT_TURN_PLAYER" };
        }

        if (!player.zones.hand.contains(card)) {
            return { success: false, reason: "CARD_NOT_IN_HAND" };
        }

        if (!MAIN_PHASE_CARD_TYPES.has(card.definition.type)) {
            return {
                success: false,
                reason: "CARD_TYPE_NOT_SUPPORTED"
            };
        }

        const useRequirementResult =
            this.checkCardUseRequirements(player, card);
        if (!useRequirementResult.met) {
            return {
                success: false,
                reason: "CARD_USE_REQUIREMENTS_NOT_MET",
                requirementResult: useRequirementResult
            };
        }

        const equipmentPlan = this.prepareEquipmentPlay({
            player,
            card
        });

        if (!equipmentPlan.success) {
            return equipmentPlan;
        }

        const resourcePayment = this.prepareResourcePayment({
            gameContext,
            player,
            card,
            resourceCardIds
        });

        if (!resourcePayment.success) {
            return resourcePayment;
        }

        const targetPreparation =
            operations.prepareEffectTargetSelections({
                gameContext,
                player,
                card,
                trigger: TriggerTypes.PLAY,
                selectedTargetIdsByEffect:
                    effectTargetIdsByEffect,
                selectedMpReplacementIdsByEffect:
                    mpReplacementIdsByEffect,
                continuationAction: "PLAY_CARD",
                resourceCardIds:
                    resourcePayment.cards.map(
                        resource => resource.instanceId
                    )
            });
        if (!targetPreparation.success) {
            return targetPreparation;
        }

        const transactionManager = gameContext.transaction;
        if (!transactionManager) {
            throw new Error(
                "GameEngine.playCard(): gameContext.transactionを指定してください。"
            );
        }

        transactionManager.begin();

        try {
            this.payResources({
                player,
                cards: resourcePayment.cards,
                transactionManager,
                moveCardTransactional: operations.moveCardTransactional
            });

            let previousEquipmentModifierState = null;
            if (this.equipmentManager.isContinuousEquipment(card)) {
                previousEquipmentModifierState =
                    player.adventurer.getEquipmentModifierState();
                transactionManager.addOperation(() => {
                    player.adventurer.setEquipmentModifierState(
                        previousEquipmentModifierState
                    );
                });
            }

            for (const replacedCard of
                equipmentPlan.replacedCards ?? []) {
                operations.moveCardTransactional({
                    gameContext,
                    transactionManager,
                    from: player.zones.field,
                    to: player.zones.resource,
                    card: replacedCard,
                    state: {
                        faceUp: false,
                        zone: ZoneTypes.RESOURCE,
                        controllerId: null,
                        enteredFieldTurn: null
                    }
                });
            }

            const fieldState = {
                faceUp: true,
                zone: ZoneTypes.FIELD,
                controllerId: player.id,
                enteredFieldTurn: gameState.turn
            };
            if (card.definition.type === CardTypes.QUEST) {
                fieldState.questParticipantIds = [];
                fieldState.questResolution = null;
                fieldState.questPreparationComplete = false;
                fieldState.questOverrides = {
                    requirements: null,
                    rewardResources: null,
                    damage: null,
                    tags: null
                };
                fieldState.questAvailableTurn = gameState.turn + 1;
            }

            const moveToField = operations.moveCardTransactional({
                gameContext,
                transactionManager,
                from: player.zones.hand,
                to: player.zones.field,
                card,
                state: fieldState
            });

            if (this.equipmentManager.isContinuousEquipment(card)) {
                this.equipmentManager.refreshContinuousModifiers(player);
            }

            const effectResults =
                card.definition.type === CardTypes.ITEM
                    ? []
                    : operations.resolveEffectsByTrigger({
                        gameContext,
                        player,
                        card,
                        trigger: TriggerTypes.PLAY,
                        selectedTargetIdsByEffect:
                            effectTargetIdsByEffect,
                        selectedMpReplacementIdsByEffect:
                            mpReplacementIdsByEffect
                    });

            let stateBasedResourceCards = [];
            if (this.equipmentManager.isContinuousEquipment(card)) {
                this.equipmentManager.refreshContinuousModifiers(player);
                stateBasedResourceCards =
                    this.enforceEquipmentConditions({
                        gameContext,
                        player,
                        transactionManager,
                        moveCardTransactional:
                            operations.moveCardTransactional
                    });
            }

            let destination = player.zones.field;

            if (card.definition.type === CardTypes.EVENT) {
                destination =
                    card.definition.resolutionZone === ZoneTypes.BANISHED
                        ? player.zones.banished
                        : player.zones.graveyard;

                operations.moveCardTransactional({
                    gameContext,
                    transactionManager,
                    from: player.zones.field,
                    to: destination,
                    card,
                    state: { zone: destination.type }
                });
            }

            transactionManager.commit();

            const finalDestination =
                player.zones.field.contains(card)
                    ? destination.type
                    : ZoneTypes.RESOURCE;

            operations.recordAction(
                gameContext,
                "CARD_PLAYED",
                player.id,
                {
                    cardInstanceId: card.instanceId,
                    cardId: card.definition.id,
                    destination: finalDestination,
                    paidResourceInstanceIds:
                        resourcePayment.cards.map(
                            resource => resource.instanceId
                        ),
                    replacedCardInstanceId:
                        equipmentPlan.replacedCard?.instanceId ?? null,
                    replacedCardInstanceIds:
                        (equipmentPlan.replacedCards ?? [])
                            .map(replacedCard =>
                                replacedCard.instanceId
                            ),
                    stateBasedResourceCardInstanceIds:
                        stateBasedResourceCards.map(
                            movedCard => movedCard.instanceId
                        )
                }
            );

            const stateBasedActionResult =
                operations.resolveStateBasedActions({ gameContext });
            const triggerResolution =
                operations.flushTriggeredEffects(gameContext);
            const postProcessingResult =
                operations.createPostProcessingResult(
                    stateBasedActionResult,
                    triggerResolution
                );

            return {
                success: true,
                reason: null,
                committed: true,
                card,
                moveToField,
                effectResults,
                paidResources: [...resourcePayment.cards],
                replacedCard: equipmentPlan.replacedCard,
                replacedCards: [
                    ...(equipmentPlan.replacedCards ?? [])
                ],
                stateBasedResourceCards,
                destination: finalDestination,
                stateBasedActionResult,
                triggerResolution,
                postProcessingResult
            };
        } catch (error) {
            try {
                if (transactionManager.isActive()) {
                    transactionManager.rollback();
                }
            } catch (rollbackError) {
                throw new AggregateError(
                    [error, rollbackError],
                    "GameEngine.playCard(): カード使用と巻き戻しの両方に失敗しました。"
                );
            }

            if (
                error.reason === "CANNOT_PAY_COST" ||
                error.reason === "INVALID_RESOURCE_PAYMENT"
            ) {
                return {
                    success: false,
                    reason: error.reason,
                    card,
                    effectResults: [],
                    paidResources: [],
                    destination: null
                };
            }

            throw error;
        }
    }

    playGrowthCard({
        operations,
        gameContext,
        player,
        card,
        resourceCardIds = null,
        effectTargetIdsByEffect = {},
        mpReplacementIdsByEffect = {}
    }) {
        const gameState = gameContext.gameState;

        if (gameState.hasPendingSelection()) {
            return { success: false, reason: "PENDING_SELECTION" };
        }

        if (!gameState.started || gameState.ended) {
            return { success: false, reason: "GAME_NOT_IN_PROGRESS" };
        }

        if (gameState.phase !== GamePhaseTypes.GROWTH) {
            return { success: false, reason: "NOT_GROWTH_PHASE" };
        }

        if (gameState.getCurrentPlayer() !== player) {
            return { success: false, reason: "NOT_TURN_PLAYER" };
        }

        if (!player.zones.adventureDeck.contains(card)) {
            return {
                success: false,
                reason: "CARD_NOT_IN_ADVENTURE_DECK"
            };
        }

        if (!GROWTH_CARD_TYPES.has(card.definition.type)) {
            return {
                success: false,
                reason: "CARD_TYPE_NOT_SUPPORTED"
            };
        }

        const useRequirementResult =
            this.checkCardUseRequirements(player, card);
        if (!useRequirementResult.met) {
            return {
                success: false,
                reason: "CARD_USE_REQUIREMENTS_NOT_MET",
                requirementResult: useRequirementResult
            };
        }

        const resourcePayment = this.prepareResourcePayment({
            gameContext,
            player,
            card,
            resourceCardIds,
            action: "PLAY_GROWTH_CARD"
        });
        if (!resourcePayment.success) {
            return resourcePayment;
        }

        const targetPreparation =
            operations.prepareEffectTargetSelections({
                gameContext,
                player,
                card,
                trigger: TriggerTypes.PLAY,
                selectedTargetIdsByEffect:
                    effectTargetIdsByEffect,
                selectedMpReplacementIdsByEffect:
                    mpReplacementIdsByEffect,
                continuationAction: "PLAY_GROWTH_CARD",
                resourceCardIds:
                    resourcePayment.cards.map(
                        resource => resource.instanceId
                    )
            });
        if (!targetPreparation.success) {
            return targetPreparation;
        }

        const transactionManager = gameContext.transaction;
        if (!transactionManager) {
            throw new Error(
                "GameEngine.playGrowthCard(): gameContext.transactionを指定してください。"
            );
        }

        transactionManager.begin();
        const previousLevel = player.adventurer.level;
        const previousGrowthModifiers =
            player.adventurer.getGrowthModifiers();
        const previousGrantedTags =
            player.adventurer.getGrantedTags();
        transactionManager.addOperation(() => {
            player.adventurer.setLevel(previousLevel);
            player.adventurer.setGrowthModifiers(
                previousGrowthModifiers
            );
            player.adventurer.setGrantedTags(previousGrantedTags);
        });

        try {
            this.payResources({
                player,
                cards: resourcePayment.cards,
                transactionManager,
                moveCardTransactional: operations.moveCardTransactional
            });

            operations.moveCardTransactional({
                gameContext,
                transactionManager,
                from: player.zones.adventureDeck,
                to: player.zones.field,
                card,
                state: {
                    faceUp: true,
                    zone: ZoneTypes.FIELD,
                    controllerId: player.id,
                    enteredFieldTurn: gameState.turn
                }
            });

            player.adventurer.addLevel(card.definition.levelGain);
            const passiveState =
                this.adventureAbilityManager.refreshPassiveState(player);

            const effectResults = operations.resolveEffectsByTrigger({
                gameContext,
                player,
                card,
                trigger: TriggerTypes.PLAY,
                selectedTargetIdsByEffect:
                    effectTargetIdsByEffect,
                selectedMpReplacementIdsByEffect:
                    mpReplacementIdsByEffect
            });

            let destination = player.zones.field;
            if (
                card.definition.resolutionZone !== null &&
                card.definition.resolutionZone !== ZoneTypes.FIELD
            ) {
                destination = player.zones.getZone(
                    card.definition.resolutionZone
                );
                if (!destination) {
                    throw new Error(
                        `GameEngine.playGrowthCard(): 移動先ゾーンが存在しません。zone=${card.definition.resolutionZone}`
                    );
                }
                operations.moveCardTransactional({
                    gameContext,
                    transactionManager,
                    from: player.zones.field,
                    to: destination,
                    card,
                    state: {
                        zone: destination.type,
                        controllerId: null
                    }
                });
            }

            transactionManager.commit();

            operations.recordAction(
                gameContext,
                "GROWTH_CARD_PLAYED",
                player.id,
                {
                    cardInstanceId: card.instanceId,
                    cardId: card.definition.id,
                    levelGain: card.definition.levelGain,
                    level: player.adventurer.level,
                    destination: destination.type,
                    paidResourceInstanceIds:
                        resourcePayment.cards.map(
                            resource => resource.instanceId
                        )
                }
            );

            const stateBasedActionResult =
                operations.resolveStateBasedActions({ gameContext });
            const victoryResult =
                stateBasedActionResult.victoryResult;
            const triggerResolution =
                operations.flushTriggeredEffects(gameContext);
            const postProcessingResult =
                operations.createPostProcessingResult(
                    stateBasedActionResult,
                    triggerResolution
                );

            return {
                success: true,
                reason: null,
                committed: true,
                card,
                effectResults,
                paidResources: [...resourcePayment.cards],
                destination: destination.type,
                level: player.adventurer.level,
                victoryResult,
                passiveState,
                stateBasedActionResult,
                triggerResolution,
                postProcessingResult
            };
        } catch (error) {
            try {
                if (transactionManager.isActive()) {
                    transactionManager.rollback();
                }
            } catch (rollbackError) {
                throw new AggregateError(
                    [error, rollbackError],
                    "GameEngine.playGrowthCard(): 育成と巻き戻しの両方に失敗しました。"
                );
            }

            if (error.reason === "CANNOT_PAY_COST") {
                return { success: false, reason: error.reason };
            }
            throw error;
        }
    }

    activateAdventureCard({
        operations,
        gameContext,
        player,
        card,
        effectTargetIdsByEffect = {},
        mpReplacementIdsByEffect = {}
    }) {
        const gameState = gameContext.gameState;
        const preparation = gameState.questPreparation;

        if (gameState.hasPendingSelection()) {
            return { success: false, reason: "PENDING_SELECTION" };
        }

        if (
            !gameState.started ||
            gameState.phase !== GamePhaseTypes.QUEST ||
            preparation === null
        ) {
            return {
                success: false,
                reason: "NOT_QUEST_PREPARATION_TIMING"
            };
        }

        if (
            preparation.playerOrder[preparation.currentIndex] !==
            player?.id
        ) {
            return {
                success: false,
                reason: "NOT_QUEST_PREPARATION_PLAYER"
            };
        }

        if (!player.zones.field.contains(card)) {
            return { success: false, reason: "CARD_NOT_ON_FIELD" };
        }

        if (!this.adventureAbilityManager.isAdventureAbilityCard(card)) {
            return {
                success: false,
                reason: "NOT_ADVENTURE_ABILITY_CARD"
            };
        }

        const useRequirementResult =
            this.checkCardUseRequirements(player, card);
        if (!useRequirementResult.met) {
            return {
                success: false,
                reason: "CARD_USE_REQUIREMENTS_NOT_MET",
                requirementResult: useRequirementResult
            };
        }

        const isMagic = card.definition.type === CardTypes.MAGIC;
        if (!isMagic && !this.adventureAbilityManager.isActive(card)) {
            return {
                success: false,
                reason: "PASSIVE_ABILITY_NOT_ACTIVATABLE"
            };
        }

        if (!card.faceUp || card.refreshAtOwnerTurnStart) {
            return {
                success: false,
                reason: "ADVENTURE_ABILITY_NOT_READY"
            };
        }

        if (
            isMagic &&
            preparation.usedMagicNamesByPlayer[player.id]
                .includes(card.definition.name)
        ) {
            return {
                success: false,
                reason: "SAME_NAME_MAGIC_ALREADY_USED"
            };
        }

        const targetPreparation =
            operations.prepareEffectTargetSelections({
                gameContext,
                player,
                card,
                trigger: TriggerTypes.ACTIVATE,
                selectedTargetIdsByEffect:
                    effectTargetIdsByEffect,
                selectedMpReplacementIdsByEffect:
                    mpReplacementIdsByEffect,
                continuationAction: "ACTIVATE_ADVENTURE_CARD"
            });
        if (!targetPreparation.success) {
            return targetPreparation;
        }

        const transactionManager = gameContext.transaction;
        transactionManager.begin();
        const previousTemporaryModifiers =
            player.adventurer.getTemporaryQuestModifiers();
        const previousFaceUp = card.faceUp;
        const previousRefresh = card.refreshAtOwnerTurnStart;
        transactionManager.addOperation(() => {
            player.adventurer.setTemporaryQuestModifiers(
                previousTemporaryModifiers
            );
            card.faceUp = previousFaceUp;
            card.refreshAtOwnerTurnStart = previousRefresh;
        });

        try {
            player.adventurer.addTemporaryQuestModifiers(
                card.definition.activeQuestModifiers
            );
            const effectResults = operations.resolveEffectsByTrigger({
                gameContext,
                player,
                card,
                trigger: TriggerTypes.ACTIVATE,
                selectedTargetIdsByEffect:
                    effectTargetIdsByEffect,
                selectedMpReplacementIdsByEffect:
                    mpReplacementIdsByEffect
            });

            if (!isMagic) {
                card.faceUp = false;
                card.refreshAtOwnerTurnStart = true;
            }

            transactionManager.commit();

            if (isMagic) {
                preparation.usedMagicNamesByPlayer[player.id]
                    .push(card.definition.name);
            }

            operations.recordAction(
                gameContext,
                "ADVENTURE_ABILITY_ACTIVATED",
                player.id,
                {
                    cardInstanceId: card.instanceId,
                    cardId: card.definition.id,
                    cardType: card.definition.type,
                    questInstanceId: preparation.questInstanceId,
                    faceUp: card.faceUp,
                    usedMagicName: isMagic
                        ? card.definition.name
                        : null
                }
            );

            const stateBasedActionResult =
                operations.resolveStateBasedActions({ gameContext });
            const triggerResolution =
                operations.flushTriggeredEffects(gameContext);
            return {
                success: true,
                reason: null,
                committed: true,
                card,
                effectResults,
                faceUp: card.faceUp,
                temporaryQuestModifiers:
                    player.adventurer.getTemporaryQuestModifiers(),
                stateBasedActionResult,
                triggerResolution,
                postProcessingResult:
                    operations.createPostProcessingResult(
                        stateBasedActionResult,
                        triggerResolution
                    )
            };
        } catch (error) {
            if (transactionManager.isActive()) {
                transactionManager.rollback();
            }
            if (error.reason === "CANNOT_PAY_COST") {
                return { success: false, reason: error.reason };
            }
            throw error;
        }
    }

    activateCard({
        operations,
        gameContext,
        player,
        card,
        effectTargetIdsByEffect = {},
        mpReplacementIdsByEffect = {}
    }) {
        const gameState = gameContext.gameState;

        if (gameState.hasPendingSelection()) {
            return { success: false, reason: "PENDING_SELECTION" };
        }

        const preparation = gameState.questPreparation;
        const isMainTiming =
            gameState.phase === GamePhaseTypes.MAIN &&
            gameState.getCurrentPlayer() === player;
        const isQuestPreparationTiming =
            gameState.phase === GamePhaseTypes.QUEST &&
            preparation !== null &&
            preparation.playerOrder[preparation.currentIndex] === player?.id;

        if (!gameState.started || (!isMainTiming && !isQuestPreparationTiming)) {
            return { success: false, reason: "NOT_MAIN_PHASE" };
        }

        if (!player.zones.field.contains(card)) {
            return { success: false, reason: "CARD_NOT_ON_FIELD" };
        }

        if (card.definition.type !== CardTypes.ITEM) {
            return { success: false, reason: "NOT_ACTIVATABLE_ITEM" };
        }

        const useRequirementResult =
            this.checkCardUseRequirements(player, card);
        if (!useRequirementResult.met) {
            return {
                success: false,
                reason: "CARD_USE_REQUIREMENTS_NOT_MET",
                requirementResult: useRequirementResult
            };
        }

        if (!card.faceUp || card.refreshAtOwnerTurnStart) {
            return { success: false, reason: "ITEM_NOT_READY" };
        }

        if (card.definition.itemUse === null) {
            return {
                success: false,
                reason: "ITEM_USE_NOT_DEFINED"
            };
        }

        const targetPreparation =
            operations.prepareEffectTargetSelections({
                gameContext,
                player,
                card,
                trigger: TriggerTypes.ACTIVATE,
                selectedTargetIdsByEffect:
                    effectTargetIdsByEffect,
                selectedMpReplacementIdsByEffect:
                    mpReplacementIdsByEffect,
                continuationAction: "ACTIVATE_CARD"
            });
        if (!targetPreparation.success) {
            return targetPreparation;
        }

        const transactionManager = gameContext.transaction;
        transactionManager.begin();

        try {
            const effectResults = operations.resolveEffectsByTrigger({
                gameContext,
                player,
                card,
                trigger: TriggerTypes.ACTIVATE,
                selectedTargetIdsByEffect:
                    effectTargetIdsByEffect,
                selectedMpReplacementIdsByEffect:
                    mpReplacementIdsByEffect
            });

            let destination = player.zones.field;

            if (
                card.definition.itemUse ===
                ItemUseTypes.GRAVEYARD
            ) {
                destination = player.zones.graveyard;
                operations.moveCardTransactional({
                    gameContext,
                    transactionManager,
                    from: player.zones.field,
                    to: destination,
                    card,
                    state: { zone: ZoneTypes.GRAVEYARD }
                });
            } else {
                const previousFaceUp = card.faceUp;
                const previousRefresh =
                    card.refreshAtOwnerTurnStart;
                card.faceUp = false;
                card.refreshAtOwnerTurnStart = true;
                transactionManager.addOperation(() => {
                    card.faceUp = previousFaceUp;
                    card.refreshAtOwnerTurnStart = previousRefresh;
                });
            }

            transactionManager.commit();

            operations.recordAction(
                gameContext,
                "ITEM_ACTIVATED",
                player.id,
                {
                    cardInstanceId: card.instanceId,
                    itemUse: card.definition.itemUse,
                    destination: destination.type
                }
            );

            const stateBasedActionResult =
                operations.resolveStateBasedActions({ gameContext });
            const triggerResolution =
                operations.flushTriggeredEffects(gameContext);
            const postProcessingResult =
                operations.createPostProcessingResult(
                    stateBasedActionResult,
                    triggerResolution
                );

            return {
                success: true,
                reason: null,
                committed: true,
                card,
                effectResults,
                destination: destination.type,
                stateBasedActionResult,
                triggerResolution,
                postProcessingResult
            };
        } catch (error) {
            try {
                if (transactionManager.isActive()) {
                    transactionManager.rollback();
                }
            } catch (rollbackError) {
                throw new AggregateError(
                    [error, rollbackError],
                    "GameEngine.activateCard(): 使用と巻き戻しの両方に失敗しました。"
                );
            }

            if (error.reason === "CANNOT_PAY_COST") {
                return { success: false, reason: error.reason };
            }
            throw error;
        }
    }

    checkCardUseRequirements(player, card) {
        return this.requirementEvaluator.evaluate(
            player,
            card?.definition?.useRequirements ?? {}
        );
    }

    prepareResourcePayment({
        gameContext,
        player,
        card,
        resourceCardIds,
        action = "PLAY_CARD"
    }) {
        const amount = card.definition.cost;
        if (amount === 0) {
            return { success: true, cards: [] };
        }
        if (player.zones.resource.size() < amount) {
            return { success: false, reason: "CANNOT_PAY_RESOURCE" };
        }
        if (resourceCardIds === null) {
            const selectionRequest = gameContext.selectionManager?.request({
                type: SelectionTypes.RESOURCE_PAYMENT,
                playerId: player.id,
                prompt: `${amount}枚のリソースを選択してください。`,
                candidates: player.zones.resource.cards.map(resource => ({
                    id: resource.instanceId,
                    cardId: resource.definition.id
                })),
                min: amount,
                max: amount,
                context: {
                    action,
                    cardInstanceId: card.instanceId,
                    amount
                }
            }) ?? null;
            return {
                success: false,
                reason: "RESOURCE_SELECTION_REQUIRED",
                selectionRequest
            };
        }
        if (
            !Array.isArray(resourceCardIds) ||
            resourceCardIds.length !== amount ||
            new Set(resourceCardIds).size !== amount
        ) {
            return {
                success: false,
                reason: "INVALID_RESOURCE_PAYMENT"
            };
        }
        const cards = resourceCardIds.map(instanceId =>
            player.zones.resource.cards.find(resource =>
                resource.instanceId === instanceId
            ) ?? null
        );
        if (cards.some(resource => resource === null)) {
            return {
                success: false,
                reason: "INVALID_RESOURCE_PAYMENT"
            };
        }
        return { success: true, cards };
    }

    payResources({
        player,
        cards,
        transactionManager,
        moveCardTransactional
    }) {
        for (const card of cards) {
            moveCardTransactional({
                transactionManager,
                from: player.zones.resource,
                to: player.zones.graveyard,
                card,
                state: {
                    faceUp: true,
                    zone: ZoneTypes.GRAVEYARD
                },
                failureReason: "INVALID_RESOURCE_PAYMENT"
            });
        }
    }

    prepareEquipmentPlay({ player, card }) {
        if (card.definition.type === CardTypes.EQUIPMENT) {
            const slotRequirements = card.definition.equipmentSlots ?? {};
            if (Object.keys(slotRequirements).length === 0) {
                return {
                    success: false,
                    reason: "EQUIPMENT_SLOT_NOT_DEFINED"
                };
            }
            if (!this.equipmentManager.meetsRequirements(player, card)) {
                return {
                    success: false,
                    reason: "EQUIP_CONDITION_NOT_MET"
                };
            }
            this.equipmentManager.refreshContinuousModifiers(player);
            const replacedCards = new Set();
            for (const [slot, required] of Object.entries(slotRequirements)) {
                const limit =
                    player.adventurer.getEquipmentSlotLimit(slot);
                if (required > limit) {
                    return {
                        success: false,
                        reason: "EQUIPMENT_SLOT_UNAVAILABLE",
                        slot,
                        required,
                        limit
                    };
                }
                const equipped =
                    this.equipmentManager.getEquipmentInSlot(player, slot);
                const used = this.equipmentManager.getSlotUsage(
                    player,
                    slot,
                    equipped
                );
                if (used + required > limit && required === limit) {
                    for (const equippedCard of equipped) {
                        replacedCards.add(equippedCard);
                    }
                }
            }
            return {
                success: true,
                replacedCard: [...replacedCards][0] ?? null,
                replacedCards: [...replacedCards]
            };
        }
        if (
            card.definition.type === CardTypes.ACCESSORY &&
            !this.equipmentManager.meetsRequirements(player, card)
        ) {
            return {
                success: false,
                reason: "EQUIP_CONDITION_NOT_MET"
            };
        }
        return {
            success: true,
            replacedCard: null,
            replacedCards: []
        };
    }

    enforceEquipmentConditions({
        gameContext,
        player,
        transactionManager,
        moveCardTransactional
    }) {
        const movedCards = [];
        while (true) {
            this.equipmentManager.refreshContinuousModifiers(player);
            const invalidCards =
                this.equipmentManager.getInvalidEquipment(player);
            if (invalidCards.length === 0) {
                break;
            }
            for (const invalidCard of invalidCards) {
                moveCardTransactional({
                    gameContext,
                    transactionManager,
                    from: player.zones.field,
                    to: player.zones.resource,
                    card: invalidCard,
                    state: {
                        faceUp: false,
                        zone: ZoneTypes.RESOURCE,
                        controllerId: null,
                        enteredFieldTurn: null
                    }
                });
                movedCards.push(invalidCard);
            }
        }
        this.equipmentManager.refreshContinuousModifiers(player);
        return movedCards;
    }
}
