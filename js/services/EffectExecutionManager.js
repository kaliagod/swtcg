import CommandTypes from "../constants/CommandTypes.js";
import CostTypes from "../constants/CostTypes.js";
import MpReplacementChoices from "../constants/MpReplacementChoices.js";
import SelectionTypes from "../constants/SelectionTypes.js";
import TargetTypes from "../constants/TargetTypes.js";
import EffectContext from "../context/EffectContext.js";
import EffectDefinition from "../models/EffectDefinition.js";
import AdventureAbilityManager from "./AdventureAbilityManager.js";

const MANUAL_TARGET_TYPES = new Set([
    TargetTypes.PLAYER,
    TargetTypes.OPPONENT,
    TargetTypes.TARGET_CARD,
    TargetTypes.HAND,
    TargetTypes.DECK,
    TargetTypes.DISCARD
]);

export default class EffectExecutionManager {
    constructor({ effectResolver, adventureAbilityManager }) {
        if (!effectResolver || typeof effectResolver.execute !== "function") {
            throw new Error(
                "EffectExecutionManager: effectResolverが不正です。"
            );
        }
        if (!(adventureAbilityManager instanceof AdventureAbilityManager)) {
            throw new Error(
                "EffectExecutionManager: adventureAbilityManagerが不正です。"
            );
        }
        this.effectResolver = effectResolver;
        this.adventureAbilityManager = adventureAbilityManager;
    }

    prepareTargetSelections({
        gameContext,
        player,
        card,
        trigger,
        selectedTargetIdsByEffect = {},
        selectedMpReplacementIdsByEffect = {},
        continuationAction,
        resourceCardIds = [],
        effectIndexes = null
    }) {
        for (const [effectIndex, effect] of
            card.definition.effects.entries()) {
            if (
                effectIndexes !== null &&
                !effectIndexes.has(effectIndex)
            ) {
                continue;
            }
            if (effect.trigger !== trigger) {
                continue;
            }
            const effectContext = new EffectContext({
                gameContext,
                player,
                sourceCard: card,
                effect
            });
            if (
                this.effectResolver.conditionEngine &&
                !this.effectResolver.conditionEngine.evaluate(effectContext)
            ) {
                continue;
            }

            if (MANUAL_TARGET_TYPES.has(effect.target?.type)) {
                const targetPreparation = this._prepareManualTarget({
                    gameContext,
                    player,
                    card,
                    trigger,
                    effect,
                    effectIndex,
                    effectContext,
                    selectedTargetIdsByEffect,
                    selectedMpReplacementIdsByEffect,
                    continuationAction,
                    resourceCardIds
                });
                if (!targetPreparation.success) {
                    return targetPreparation;
                }
            }

            const replacementPreparation = this._prepareMpReplacement({
                gameContext,
                player,
                card,
                trigger,
                effect,
                effectIndex,
                effectContext,
                selectedTargetIdsByEffect,
                selectedMpReplacementIdsByEffect,
                continuationAction,
                resourceCardIds
            });
            if (!replacementPreparation.success) {
                return replacementPreparation;
            }
        }

        return { success: true, reason: null };
    }

    resolveEffectsByTrigger({
        gameContext,
        player,
        card,
        trigger,
        selectedTargetIdsByEffect = {},
        selectedMpReplacementIdsByEffect = {},
        effectIndexes = null,
        resolveStateBasedActions
    }) {
        const results = [];

        for (const [effectIndex, effect] of
            card.definition.effects.entries()) {
            if (
                effectIndexes !== null &&
                !effectIndexes.has(effectIndex)
            ) {
                continue;
            }
            if (effect.trigger !== trigger) {
                continue;
            }

            const result = this.resolveEffect({
                gameContext,
                player,
                sourceCard: card,
                effect,
                selectedTargetIds:
                    selectedTargetIdsByEffect[effectIndex] ?? null,
                mpReplacementIdsByPlayer:
                    this.normalizeMpReplacementSelection(
                        selectedMpReplacementIdsByEffect[effectIndex],
                        player.id
                    ),
                resolveStateBasedActions
            });

            if (!result.success && result.reason === "CANNOT_PAY_COST") {
                const error = new Error(
                    "EffectExecutionManager: 効果コストを支払えません。"
                );
                error.reason = "CANNOT_PAY_COST";
                throw error;
            }

            results.push(result);
        }

        return results;
    }

    resolveEffect({
        gameContext,
        player,
        sourceCard = null,
        effect,
        selectedTargetIds = null,
        mpReplacementCardInstanceId = undefined,
        mpReplacementIdsByPlayer = {},
        resolveStateBasedActions
    }) {
        if (!gameContext) {
            throw new Error(
                "EffectExecutionManager.resolveEffect(): " +
                "gameContextを指定してください。"
            );
        }
        if (!player) {
            throw new Error(
                "EffectExecutionManager.resolveEffect(): " +
                "playerを指定してください。"
            );
        }
        if (!(effect instanceof EffectDefinition)) {
            throw new Error(
                "EffectExecutionManager.resolveEffect(): " +
                "effectにはEffectDefinitionを指定してください。"
            );
        }

        const context = new EffectContext({
            gameContext,
            player,
            sourceCard,
            effect,
            options: {
                mpReplacementCardInstanceId,
                mpReplacementIdsByPlayer
            }
        });

        const gameState = gameContext.gameState;
        gameState.effectResolutionDepth++;
        let result;
        try {
            result = this.effectResolver.execute(context, {
                selectedTargetIds
            });
        } finally {
            gameState.effectResolutionDepth--;
        }

        if (
            gameState.effectResolutionDepth === 0 &&
            !gameContext.transaction?.isActive()
        ) {
            return {
                ...result,
                stateBasedActionResult:
                    resolveStateBasedActions({ gameContext })
            };
        }

        return result;
    }

    normalizeMpReplacementSelection(selection, defaultPlayerId) {
        if (selection === null || selection === undefined) {
            return {};
        }
        if (typeof selection === "string") {
            return { [defaultPlayerId]: selection };
        }
        if (typeof selection === "object" && !Array.isArray(selection)) {
            return { ...selection };
        }
        throw new Error(
            "EffectExecutionManager: MP置換選択の形式が不正です。"
        );
    }

    _prepareManualTarget({
        gameContext,
        player,
        card,
        trigger,
        effectIndex,
        effectContext,
        selectedTargetIdsByEffect,
        selectedMpReplacementIdsByEffect,
        continuationAction,
        resourceCardIds
    }) {
        if (!this.effectResolver.targetEngine) {
            throw new Error(
                "EffectExecutionManager: 対象選択にはtargetEngineが必要です。"
            );
        }
        const specification =
            this.effectResolver.targetEngine.getSelectionSpec(effectContext);
        if (specification.candidates.length < specification.min) {
            return {
                success: false,
                reason: "NO_VALID_TARGETS",
                effectIndex
            };
        }
        if (!specification.requiresSelection) {
            return { success: true, reason: null };
        }

        const existingSelection = selectedTargetIdsByEffect[effectIndex];
        if (existingSelection !== undefined) {
            try {
                this.effectResolver.targetEngine.select(
                    effectContext,
                    existingSelection
                );
            } catch {
                return {
                    success: false,
                    reason: "INVALID_TARGET_SELECTION",
                    effectIndex
                };
            }
            return { success: true, reason: null };
        }

        const selectionRequest = gameContext.selectionManager.request({
            type: SelectionTypes.TARGET,
            playerId: player.id,
            prompt:
                `${card.name}の対象を${specification.min}件選択してください。`,
            candidates: specification.candidates.map(
                candidate => candidate.public
            ),
            min: specification.min,
            max: specification.max,
            context: {
                action: "EFFECT_TARGET",
                continuationAction,
                cardInstanceId: card.instanceId,
                trigger,
                effectIndex,
                resourceCardIds: [...resourceCardIds],
                selectedTargetIdsByEffect: {
                    ...selectedTargetIdsByEffect
                },
                selectedMpReplacementIdsByEffect: {
                    ...selectedMpReplacementIdsByEffect
                }
            }
        });
        return {
            success: false,
            reason: "TARGET_SELECTION_REQUIRED",
            effectIndex,
            selectionRequest
        };
    }

    _prepareMpReplacement({
        gameContext,
        player,
        card,
        trigger,
        effect,
        effectIndex,
        effectContext,
        selectedTargetIdsByEffect,
        selectedMpReplacementIdsByEffect,
        continuationAction,
        resourceCardIds
    }) {
        const mpRequirements = new Map();
        if (effect.cost?.type === CostTypes.MP) {
            mpRequirements.set(player, effect.cost.amount);
        }
        const effectMpAmount = effect.commands
            .filter(command => command.type === CommandTypes.LOSE_MP)
            .reduce((sum, command) => sum + (command.amount ?? 0), 0);
        if (effectMpAmount > 0) {
            const resolvedTargets = this.effectResolver.targetEngine.select(
                effectContext,
                selectedTargetIdsByEffect[effectIndex] ?? null
            );
            const affectedPlayers = resolvedTargets.filter(target =>
                target?.adventurer && target?.zones
            );
            for (const affectedPlayer of
                (affectedPlayers.length > 0 ? affectedPlayers : [player])) {
                mpRequirements.set(
                    affectedPlayer,
                    (mpRequirements.get(affectedPlayer) ?? 0) +
                        effectMpAmount
                );
            }
        }

        const existingSelections = this.normalizeMpReplacementSelection(
            selectedMpReplacementIdsByEffect[effectIndex],
            player.id
        );
        for (const [affectedPlayer, mpAmount] of mpRequirements) {
            const replacementOptions =
                this.adventureAbilityManager.getMpReplacementOptions(
                    affectedPlayer,
                    mpAmount
                );
            if (replacementOptions.length === 0) {
                continue;
            }
            const existingReplacementId =
                existingSelections[affectedPlayer.id];
            if (existingReplacementId !== undefined) {
                if (
                    existingReplacementId !== MpReplacementChoices.DECLINE &&
                    !replacementOptions.some(option =>
                        option.card.instanceId === existingReplacementId
                    )
                ) {
                    return {
                        success: false,
                        reason: "INVALID_MP_REPLACEMENT_SELECTION",
                        effectIndex
                    };
                }
                continue;
            }

            const selectionRequest = gameContext.selectionManager.request({
                type: SelectionTypes.MP_REPLACEMENT,
                playerId: affectedPlayer.id,
                prompt: `${card.name}のMP消費方法を選択してください。`,
                candidates: [
                    {
                        id: MpReplacementChoices.DECLINE,
                        name: "置換せずMPを消費"
                    },
                    ...replacementOptions.map(
                        ({ card: source, command }) => ({
                            id: source.instanceId,
                            cardId: source.definition.id,
                            name: source.name,
                            counter: command.params.counter
                        })
                    )
                ],
                min: 1,
                max: 1,
                context: {
                    action: "EFFECT_MP_REPLACEMENT",
                    continuationAction,
                    actorPlayerId: player.id,
                    replacementPlayerId: affectedPlayer.id,
                    cardInstanceId: card.instanceId,
                    trigger,
                    effectIndex,
                    resourceCardIds: [...resourceCardIds],
                    selectedTargetIdsByEffect: {
                        ...selectedTargetIdsByEffect
                    },
                    selectedMpReplacementIdsByEffect: {
                        ...selectedMpReplacementIdsByEffect
                    }
                }
            });
            return {
                success: false,
                reason: "MP_REPLACEMENT_SELECTION_REQUIRED",
                effectIndex,
                selectionRequest
            };
        }

        return { success: true, reason: null };
    }
}
