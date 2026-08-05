import SelectionTypes from "../constants/SelectionTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import AdventureAbilityManager from "./AdventureAbilityManager.js";
import DamageOverflowManager from "./DamageOverflowManager.js";
import EquipmentManager from "./EquipmentManager.js";

export default class PlayerStateResolutionManager {
    constructor({
        adventureAbilityManager,
        damageOverflowManager,
        equipmentManager
    }) {
        if (!(adventureAbilityManager instanceof AdventureAbilityManager)) {
            throw new Error(
                "PlayerStateResolutionManager: " +
                "adventureAbilityManagerが不正です。"
            );
        }
        if (!(damageOverflowManager instanceof DamageOverflowManager)) {
            throw new Error(
                "PlayerStateResolutionManager: " +
                "damageOverflowManagerが不正です。"
            );
        }
        if (!(equipmentManager instanceof EquipmentManager)) {
            throw new Error(
                "PlayerStateResolutionManager: equipmentManagerが不正です。"
            );
        }
        this.adventureAbilityManager = adventureAbilityManager;
        this.damageOverflowManager = damageOverflowManager;
        this.equipmentManager = equipmentManager;
    }

    dealDamage({
        operations,
        gameContext,
        player,
        amount,
        duringQuest = false,
        questCard = null,
        unpreventable = false
    }) {
        if (!Number.isInteger(amount) || amount < 0) {
            throw new Error(
                "GameEngine.dealDamage(): amountには0以上の整数を指定してください。"
            );
        }

        if (gameContext.gameState.hasPendingSelection()) {
            return { success: false, reason: "PENDING_SELECTION" };
        }

        const questTags = questCard
            ? (typeof questCard.getTags === "function"
                ? questCard.getTags()
                : [...questCard.definition.tags])
            : [];
        const damageEffectResult =
            this.adventureAbilityManager.applyDamageEffects({
                player,
                amount,
                questTags,
                duringQuest,
                unpreventable
            });
        player.adventurer.addDamage(damageEffectResult.amount);
        operations.recordAction(
            gameContext,
            "DAMAGE_DEALT",
            player.id,
            {
                originalAmount: amount,
                amount: damageEffectResult.amount,
                prevented: damageEffectResult.prevented,
                unpreventable,
                continuousEffectSourceIds:
                    damageEffectResult.sources,
                damage: player.adventurer.damage
            }
        );

        const overflowResult = this.resolveDamageOverflow({
            operations,
            gameContext,
            player,
            duringQuest,
            runStateBasedActions: false
        });
        const stateBasedActionResult =
            !duringQuest && overflowResult.stable
                ? operations.resolveStateBasedActions({ gameContext })
                : null;

        return {
            success: true,
            reason: null,
            originalAmount: amount,
            amount: damageEffectResult.amount,
            prevented: damageEffectResult.prevented,
            unpreventable,
            continuousEffectSourceIds:
                damageEffectResult.sources,
            overflowResult,
            stateBasedActionResult
        };
    }

    resolveDamageOverflow({
        operations,
        gameContext,
        player,
        selectedIds = null,
        duringQuest = false,
        runStateBasedActions = true
    }) {
        if (
            selectedIds !== null &&
            gameContext.gameState.hasPendingSelection()
        ) {
            return {
                success: false,
                reason: "PENDING_SELECTION",
                stable: false,
                steps: []
            };
        }

        const state = this.damageOverflowManager.getState(
            player,
            { duringQuest }
        );

        if (state.excess === 0) {
            return {
                success: true,
                reason: null,
                stable: true,
                steps: []
            };
        }

        if (
            selectedIds === null &&
            state.requiredCount > 0 &&
            state.candidates.length > state.requiredCount
        ) {
            const selectionRequest =
                gameContext.selectionManager.request({
                    type: SelectionTypes.OVERFLOW_DAMAGE,
                    playerId: player.id,
                    prompt:
                        `生命超過ペナルティとして${state.requiredCount}枚を選択してください。`,
                    candidates: state.candidates.map(card => ({
                        id: card.instanceId,
                        cardId: card.definition.id,
                        cardType: card.definition.type,
                        zone: card.zone
                    })),
                    min: state.requiredCount,
                    max: state.requiredCount,
                    context: {
                        action: "DAMAGE_OVERFLOW",
                        excess: state.excess,
                        vitality: state.vitality,
                        duringQuest,
                        questInstanceId:
                            duringQuest
                                ? gameContext.gameState.questPhase
                                    ?.activeQuestInstanceId ?? null
                                : null
                    }
                });

            return {
                success: false,
                reason: "OVERFLOW_SELECTION_REQUIRED",
                stable: false,
                selectionRequest,
                steps: []
            };
        }

        const idsToMove = selectedIds ??
            state.candidates
                .slice(0, state.requiredCount)
                .map(card => card.instanceId);

        if (!this.damageOverflowManager.validateSelection(
            state,
            idsToMove
        )) {
            return {
                success: false,
                reason: "INVALID_OVERFLOW_SELECTION",
                stable: false,
                steps: []
            };
        }

        const selectedCards = idsToMove.map(instanceId =>
            state.candidates.find(
                card => card.instanceId === instanceId
            )
        );
        const transactionManager = gameContext.transaction;
        const previousDamage = player.adventurer.damage;
        const previousEquipmentModifierState =
            player.adventurer.getEquipmentModifierState();

        transactionManager.begin();
        transactionManager.addOperation(() => {
            player.adventurer.setDamage(previousDamage);
            player.adventurer.setEquipmentModifierState(
                previousEquipmentModifierState
            );
        });

        try {
            for (const selectedCard of selectedCards) {
                const sourceZone =
                    player.zones.resource.contains(selectedCard)
                        ? player.zones.resource
                        : player.zones.field;

                operations.moveCardTransactional({
                    gameContext,
                    transactionManager,
                    from: sourceZone,
                    to: player.zones.graveyard,
                    card: selectedCard,
                    state: {
                        faceUp: true,
                        zone: ZoneTypes.GRAVEYARD,
                        controllerId: null
                    }
                });
            }

            this.equipmentManager.refreshContinuousModifiers(player);
            player.adventurer.setDamage(
                Math.min(
                    player.adventurer.damage,
                    state.vitality
                )
            );
            transactionManager.commit();
        } catch (error) {
            if (transactionManager.isActive()) {
                transactionManager.rollback();
            }
            throw error;
        }

        const step = {
            excess: state.excess,
            vitalityBefore: state.vitality,
            movedCardInstanceIds: [...idsToMove],
            damageAfter: player.adventurer.damage
        };

        operations.recordAction(
            gameContext,
            "DAMAGE_OVERFLOW_RESOLVED",
            player.id,
            step
        );

        const equipmentState = this.checkEquipmentState({
            operations,
            gameContext,
            player
        });

        if (!equipmentState.success) {
            return {
                success: false,
                reason: equipmentState.reason,
                stable: false,
                selectionRequest:
                    equipmentState.selectionRequest,
                steps: [step]
            };
        }

        const next = this.resolveDamageOverflow({
            operations,
            gameContext,
            player,
            duringQuest,
            runStateBasedActions: false
        });

        const stateBasedActionResult =
            runStateBasedActions && !duringQuest && next.stable
                ? operations.resolveStateBasedActions({ gameContext })
                : null;

        return {
            ...next,
            steps: [step, ...(next.steps ?? [])],
            stateBasedActionResult
        };
    }

    checkEquipmentState({
        operations,
        gameContext,
        player,
        selectedKeepIds = null
    }) {
        if (gameContext.gameState.hasPendingSelection()) {
            return {
                success: false,
                reason: "PENDING_SELECTION",
                stable: false,
                movedCards: []
            };
        }

        const transactionManager = gameContext.transaction;
        if (!transactionManager) {
            throw new Error(
                "GameEngine.checkEquipmentState(): transactionを指定してください。"
            );
        }

        const conditionMovedCards = [];
        transactionManager.begin();
        const previousEquipmentModifierState =
            player.adventurer.getEquipmentModifierState();
        transactionManager.addOperation(() => {
            player.adventurer.setEquipmentModifierState(
                previousEquipmentModifierState
            );
        });

        try {
            conditionMovedCards.push(
                ...operations.enforceEquipmentConditions({
                    gameContext,
                    player,
                    transactionManager
                })
            );
            transactionManager.commit();
        } catch (error) {
            if (transactionManager.isActive()) {
                transactionManager.rollback();
            }
            throw error;
        }

        for (const movedCard of conditionMovedCards) {
            operations.recordAction(
                gameContext,
                "EQUIPMENT_CONDITION_FAILED",
                player.id,
                { cardInstanceId: movedCard.instanceId }
            );
        }

        const overflowGroup =
            this.equipmentManager.getOverflowGroup(player);

        if (overflowGroup === null) {
            return {
                success: true,
                reason: null,
                stable: true,
                movedCards: conditionMovedCards
            };
        }

        if (selectedKeepIds === null) {
            const fixedCount =
                overflowGroup.minKeepCount ===
                overflowGroup.maxKeepCount;
            const selectionRequest =
                gameContext.selectionManager.request({
                    type: SelectionTypes.EQUIPMENT_LIMIT,
                    playerId: player.id,
                    prompt:
                        fixedCount
                            ? `残すカードを${overflowGroup.keepCount}枚選択してください。`
                            : "装備枠に収まるよう、残すカードを選択してください。",
                    candidates: overflowGroup.cards.map(card => ({
                        id: card.instanceId,
                        cardId: card.definition.id,
                        cardType: card.definition.type
                    })),
                    min: overflowGroup.minKeepCount,
                    max: overflowGroup.maxKeepCount,
                    context: {
                        action: "EQUIPMENT_LIMIT",
                        kind: overflowGroup.kind,
                        slot: overflowGroup.slot,
                        keepCount: overflowGroup.keepCount,
                        limit: overflowGroup.limit
                    }
                });

            return {
                success: false,
                reason: "EQUIPMENT_LIMIT_SELECTION_REQUIRED",
                stable: false,
                movedCards: conditionMovedCards,
                selectionRequest
            };
        }

        if (
            !this.equipmentManager.validateKeepSelection(
                overflowGroup,
                selectedKeepIds
            )
        ) {
            return {
                success: false,
                reason: "INVALID_EQUIPMENT_LIMIT_SELECTION",
                stable: false,
                movedCards: conditionMovedCards
            };
        }

        const keepIds = new Set(selectedKeepIds);
        const excessCards = overflowGroup.cards.filter(
            card => !keepIds.has(card.instanceId)
        );
        const previousModifierState =
            player.adventurer.getEquipmentModifierState();
        transactionManager.begin();
        transactionManager.addOperation(() => {
            player.adventurer.setEquipmentModifierState(
                previousModifierState
            );
        });

        try {
            for (const excessCard of excessCards) {
                operations.moveCardTransactional({
                    gameContext,
                    transactionManager,
                    from: player.zones.field,
                    to: player.zones.resource,
                    card: excessCard,
                    state: {
                        faceUp: false,
                        zone: ZoneTypes.RESOURCE,
                        controllerId: null,
                        enteredFieldTurn: null
                    }
                });
            }
            this.equipmentManager.refreshContinuousModifiers(player);
            transactionManager.commit();
        } catch (error) {
            if (transactionManager.isActive()) {
                transactionManager.rollback();
            }
            throw error;
        }

        for (const excessCard of excessCards) {
            operations.recordAction(
                gameContext,
                "EQUIPMENT_LIMIT_EXCEEDED",
                player.id,
                { cardInstanceId: excessCard.instanceId }
            );
        }

        const next = this.checkEquipmentState({
            operations,
            gameContext,
            player
        });
        return {
            ...next,
            movedCards: [
                ...conditionMovedCards,
                ...excessCards,
                ...(next.movedCards ?? [])
            ]
        };
    }
}

