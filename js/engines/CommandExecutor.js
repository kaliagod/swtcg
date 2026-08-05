/**
 * CommandDefinitionをゲーム状態の変更へ変換する。
 */

import CommandTypes from "../constants/CommandTypes.js";
import MpReplacementChoices from "../constants/MpReplacementChoices.js";
import ZoneManager from "../services/ZoneManager.js";
import TransactionManager from "../services/TransactionManager.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import CardTypes from "../constants/CardTypes.js";
import StatusManager from "../services/StatusManager.js";
import AbilityTypes from "../constants/AbilityTypes.js";

export default class CommandExecutor {

    constructor(
        zoneManager,
        transactionManager = null,
        statusManager = new StatusManager()
    ) {
        if (!(zoneManager instanceof ZoneManager)) {
            throw new Error(
                "CommandExecutor: zoneManagerにはZoneManagerを指定してください。"
            );
        }

        if (
            transactionManager !== null &&
            !(transactionManager instanceof TransactionManager)
        ) {
            throw new Error(
                "CommandExecutor: transactionManagerにはTransactionManagerを指定してください。"
            );
        }

        this.zoneManager = zoneManager;
        this.transactionManager = transactionManager;
        this.statusManager = statusManager;
    }

    execute(command, context) {
        if (!command) {
            throw new Error(
                "CommandExecutor.execute(): commandを指定してください。"
            );
        }

        if (!context) {
            throw new Error(
                "CommandExecutor.execute(): contextを指定してください。"
            );
        }

        switch (command.type) {
            case CommandTypes.DRAW:
                return this._executeDraw(command, context);

            case CommandTypes.DISCARD:
                return this._executeMoveCard({
                    ...command,
                    params: {
                        ...command.params,
                        source: ZoneTypes.HAND,
                        destination: ZoneTypes.GRAVEYARD
                    }
                }, context);

            case CommandTypes.MOVE_CARD:
                return this._executeMoveCard(command, context);

            case CommandTypes.MOVE_TOP_CARDS:
                return this._executeMoveTopCards(command, context);

            case CommandTypes.SEARCH_DECK:
                return this._executeSearchDeck(command, context);

            case CommandTypes.REVEAL_TOP_AND_TAKE:
                return this._executeRevealTopAndTake(command, context);

            case CommandTypes.SHUFFLE:
                return this._executeShuffle(command, context);

            case CommandTypes.DAMAGE:
                return this._executeDamage(command, context);

            case CommandTypes.LOSE_MP:
                return this._executeLoseMp(command, context);

            case CommandTypes.GAIN_MP:
                return this._executeGainMp(command, context);

            case CommandTypes.HEAL:
                return this._executeHeal(command, context);

            case CommandTypes.ADD_STATUS:
                return this._executeStatus(command, context, true);

            case CommandTypes.REMOVE_STATUS:
                return this._executeStatus(command, context, false);

            case CommandTypes.ADD_QUEST_MODIFIER:
                return this._executeAddQuestModifier(command, context);

            case CommandTypes.MODIFY_STAT:
                return this._executeModifyStat(command, context);

            case CommandTypes.DOUBLE_STAT:
                return this._executeScaleStat(command, context, 2);

            case CommandTypes.HALVE_STAT:
                return this._executeScaleStat(command, context, 0.5);

            case CommandTypes.ADD_TAG:
                return this._executeTag(command, context, true);

            case CommandTypes.REMOVE_TAG:
                return this._executeTag(command, context, false);

            case CommandTypes.MODIFY_QUEST:
                return this._executeModifyQuest(command, context);

            case CommandTypes.DECLARE_QUEST_PARTICIPATION:
                return this._executeQuestParticipation(command, context, true);

            case CommandTypes.REMOVE_QUEST_PARTICIPATION:
                return this._executeQuestParticipation(command, context, false);

            case CommandTypes.SET_QUEST_TIMING:
                return this._executeSetQuestTiming(command, context);

            case CommandTypes.FLIP_FACE_DOWN:
                return this._executeFlip(context, false);

            case CommandTypes.FLIP_FACE_UP:
                return this._executeFlip(context, true);

            case CommandTypes.ADD_COUNTER:
                return this._executeCounter(command, context, true);

            case CommandTypes.REMOVE_COUNTER:
                return this._executeCounter(command, context, false);

            default:
                throw new Error(
                    `CommandExecutor.execute(): 未対応のコマンドです。type=${command.type}`
                );
        }
    }

    _executeDraw(command, context) {
        return this._forTargetPlayers(context, player => {
            if (!player?.zones) {
                throw new Error(
                    "CommandExecutor._executeDraw(): 対象プレイヤーのzonesが存在しません。"
                );
            }
            const amount = command.amount ?? 1;
            const result = this.zoneManager.draw({
                deck: player.zones.deck,
                hand: player.zones.hand,
                amount
            });
            if (result.cards.length > 0) {
                this._registerRollback(() => {
                    for (const card of [...result.cards].reverse()) {
                        const rollbackResult = this.zoneManager.move({
                            from: player.zones.hand,
                            to: player.zones.deck,
                            card
                        });
                        if (!rollbackResult.success) {
                            throw new Error(
                                `CommandExecutor._executeDraw(): ドローの巻き戻しに失敗しました。reason=${rollbackResult.reason}`
                            );
                        }
                    }
                });
            }
            return { ...result, playerId: player.id };
        });
    }

    _executeLoseMp(command, context) {
        const amount = command.amount ?? 0;
        const requireFullPayment =
            command.params &&
            command.params.requireFullPayment === true;
        return this._forTargetPlayers(context, player => {
            if (!player.adventurer) {
                throw new Error(
                    "CommandExecutor._executeLoseMp(): 対象にadventurerが存在しません。"
                );
            }
            const replacementOptions = context.gameContext
                ?.adventureAbilityManager
                ?.getMpReplacementOptions(player, amount) ?? [];
            let replacementDecisionMade =
                command.params.replacementDecisionMade === true;
            let replacementId =
                command.params.replacementCardInstanceId ?? null;
            const selections =
                context.options?.mpReplacementIdsByPlayer;
            if (
                !replacementDecisionMade &&
                selections &&
                Object.prototype.hasOwnProperty.call(
                    selections,
                    player.id
                )
            ) {
                replacementDecisionMade = true;
                replacementId = selections[player.id];
            } else if (
                !replacementDecisionMade &&
                context.options?.mpReplacementCardInstanceId !== undefined
            ) {
                replacementDecisionMade = true;
                replacementId =
                    context.options.mpReplacementCardInstanceId;
            }
            if (replacementId === MpReplacementChoices.DECLINE) {
                replacementId = null;
            }
            if (replacementId !== null) {
                const replacement = replacementOptions.find(
                    option => option.card.instanceId === replacementId
                );
                if (!replacement) {
                    throw new Error(
                        "CommandExecutor._executeLoseMp(): MP置換候補が不正です。"
                    );
                }
                const counter = replacement.command.params.counter;
                const counterPerMp =
                    replacement.command.params.counterPerMp ?? 1;
                const previous = replacement.card.counters[counter] ?? 0;
                const placed = amount * counterPerMp;
                replacement.card.counters[counter] = previous + placed;
                this._registerRollback(() => {
                    if (previous === 0) {
                        delete replacement.card.counters[counter];
                    } else {
                        replacement.card.counters[counter] = previous;
                    }
                });
                return {
                    success: true,
                    reason: null,
                    playerId: player.id,
                    requestedAmount: amount,
                    amount,
                    remainingMp: player.adventurer.availableMp,
                    mpSpent: player.adventurer.mpSpent,
                    replaced: true,
                    replacementCardInstanceId:
                        replacement.card.instanceId,
                    counter,
                    countersPlaced: placed,
                    counterCount: replacement.card.counters[counter]
                };
            }
            if (
                replacementOptions.length > 0 &&
                !replacementDecisionMade
            ) {
                const error = new Error(
                    "CommandExecutor._executeLoseMp(): MP置換候補の選択が必要です。"
                );
                error.reason = "MP_REPLACEMENT_SELECTION_REQUIRED";
                throw error;
            }
            const spentAmount = player.adventurer.spendMp(
                amount,
                { allowPartial: !requireFullPayment }
            );
            if (spentAmount > 0) {
                this._registerRollback(() => {
                    player.adventurer.recoverMp(spentAmount);
                });
            }
            return {
                success: true,
                reason: null,
                playerId: player.id,
                requestedAmount: amount,
                amount: spentAmount,
                remainingMp: player.adventurer.availableMp,
                mpSpent: player.adventurer.mpSpent,
                replaced: false,
                replacementCardInstanceId: null
            };
        });
    }

    _executeGainMp(command, context) {
        const amount = command.amount ?? 0;
        return this._forTargetPlayers(context, player => {
            const recoveredAmount = player.adventurer.recoverMp(amount);
            if (recoveredAmount > 0) {
                this._registerRollback(() => {
                    player.adventurer.spendMp(recoveredAmount);
                });
            }
            return {
                success: true,
                reason: null,
                playerId: player.id,
                requestedAmount: amount,
                amount: recoveredAmount,
                remainingMp: player.adventurer.availableMp
            };
        });
    }

    _executeStatus(command, context, add) {
        const status = command.status ?? command.params?.status;
        const amount = command.amount ?? (add ? 1 : null);
        const targets = context.targets.length > 0
            ? context.targets
            : [context.player];
        const results = targets.map(target => {
            const isPlayer = Boolean(target?.adventurer && target?.zones);
            const holder = isPlayer ? target.adventurer : target;
            const previous = (holder?.statuses ?? []).map(
                entry => ({ ...entry })
            );
            const changed = add
                ? this.statusManager.add({
                    holder,
                    status,
                    amount,
                    duration: command.params?.duration,
                    gameState: context.gameContext?.gameState,
                    sourceCard: context.sourceCard,
                    targetPlayerId: isPlayer
                        ? target.id
                        : target?.controllerId ?? target?.ownerId ?? null
                })
                : this.statusManager.remove({
                    holder,
                    status,
                    amount
                });
            this._registerRollback(() => {
                holder.statuses = previous.map(entry => ({ ...entry }));
            });
            return {
                success: true,
                reason: null,
                status,
                added: add,
                amount: changed.length,
                statusIds: changed.map(entry => entry.id)
            };
        });
        return results.length === 1
            ? results[0]
            : { success: true, reason: null, targetResults: results };
    }

    _executeDamage(command, context) {
        const amount = command.amount ?? 0;
        return this._forTargetPlayers(context, player => {
            const gameEngine = context.gameContext?.gameEngine;
            if (gameEngine?.dealDamage) {
                const activeQuestId = context.gameContext.gameState
                    ?.questPhase?.activeQuestInstanceId;
                const questCard = activeQuestId
                    ? context.gameContext.gameState.players
                        .flatMap(candidate => candidate.zones.field.cards)
                        .find(card => card.instanceId === activeQuestId) ?? null
                    : null;
                const result = gameEngine.dealDamage({
                    gameContext: context.gameContext,
                    player,
                    amount,
                    duringQuest: questCard !== null,
                    questCard,
                    unpreventable:
                        command.params.unpreventable === true
                });
                if (result.success && result.amount > 0) {
                    this._registerRollback(() => {
                        player.adventurer.recoverDamage(result.amount);
                    });
                }
                return result;
            }
            const damageResult = context.gameContext
                ?.adventureAbilityManager?.applyDamageEffects({
                    player,
                    amount,
                    questTags: [],
                    duringQuest: false,
                    unpreventable:
                        command.params.unpreventable === true
                }) ?? {
                    amount,
                    prevented: 0,
                    sources: []
                };
            player.adventurer.addDamage(damageResult.amount);
            if (damageResult.amount > 0) {
                this._registerRollback(() => {
                    player.adventurer.recoverDamage(damageResult.amount);
                });
            }
            return {
                success: true,
                reason: null,
                playerId: player.id,
                originalAmount: amount,
                amount: damageResult.amount,
                prevented: damageResult.prevented,
                unpreventable: command.params.unpreventable === true,
                continuousEffectSourceIds: damageResult.sources,
                damage: player.adventurer.damage
            };
        });
    }

    _executeMoveCard(command, context) {
        const destinationType = command.params.destination;
        if (!Object.values(ZoneTypes).includes(destinationType)) {
            throw new Error(
                "CommandExecutor._executeMoveCard(): destinationが不正です。"
            );
        }
        return this._forTargetCards(context, card => {
            const sourceOwner = this._findCardOwner(context, card);
            const source = sourceOwner?.zones.getZone(card.zone);
            if (!source || (
                command.params.source &&
                source.type !== command.params.source
            )) {
                return { success: false, reason: "CARD_NOT_IN_SOURCE" };
            }
            const destinationOwner = this._getDestinationPlayer(
                context,
                card,
                command.params.destinationPlayerId
            );
            const destination = destinationOwner.zones.getZone(destinationType);
            const previousFaceUp = card.faceUp;
            const previousZone = card.zone;
            const previousControllerId = card.controllerId;
            const previousEnteredFieldTurn = card.enteredFieldTurn;
            const previousQuestRuntime = card.definition.type === CardTypes.QUEST
                ? {
                    participantIds: [...card.questParticipantIds],
                    resolution: card.questResolution,
                    preparationComplete: card.questPreparationComplete,
                    overrides: {
                        requirements:
                            card.questOverrides.requirements === null
                                ? null
                                : { ...card.questOverrides.requirements },
                        rewardResources:
                            card.questOverrides.rewardResources,
                        damage: card.questOverrides.damage,
                        tags: card.questOverrides.tags === null
                            ? null
                            : [...card.questOverrides.tags]
                    },
                    availableTurn: card.questAvailableTurn
                }
                : null;
            const result = this.zoneManager.move({
                from: source,
                to: destination,
                card,
                position: command.params.deckPosition ?? "TOP"
            });
            if (!result.success) {
                return result;
            }
            if (typeof command.params.faceUp === "boolean") {
                card.faceUp = command.params.faceUp;
            } else if (destinationType === ZoneTypes.RESOURCE) {
                card.faceUp = false;
            }
            card.zone = destinationType;
            card.controllerId =
                destinationType === ZoneTypes.FIELD
                    ? destinationOwner.id
                    : null;
            card.enteredFieldTurn =
                destinationType === ZoneTypes.FIELD
                    ? context.gameContext?.gameState?.turn ?? null
                    : null;
            if (
                source.type === ZoneTypes.FIELD &&
                destinationType !== ZoneTypes.FIELD &&
                card.definition.type === CardTypes.QUEST
            ) {
                card.resetQuestRuntime();
            }
            const triggerEntries =
                context.gameContext?.gameEngine?.recordZoneTransition({
                    gameContext: context.gameContext,
                    from: source,
                    to: destination,
                    card,
                    previousFaceUp,
                    previousControllerId
                }) ?? [];
            this._registerRollback(() => {
                context.gameContext?.gameEngine?.discardQueuedTriggers(
                    context.gameContext?.gameState,
                    triggerEntries
                );
                this.zoneManager.move({
                    from: destination,
                    to: source,
                    card
                });
                card.faceUp = previousFaceUp;
                card.zone = previousZone;
                card.controllerId = previousControllerId;
                card.enteredFieldTurn = previousEnteredFieldTurn;
                if (previousQuestRuntime) {
                    card.questParticipantIds =
                        [...previousQuestRuntime.participantIds];
                    card.questResolution = previousQuestRuntime.resolution;
                    card.questPreparationComplete =
                        previousQuestRuntime.preparationComplete;
                    card.questOverrides = previousQuestRuntime.overrides;
                    card.questAvailableTurn =
                        previousQuestRuntime.availableTurn;
                }
            });
            return {
                ...result,
                ownerId: destinationOwner.id,
                destination: destinationType
            };
        });
    }

    _executeMoveTopCards(command, context) {
        const destinationType = command.params.destination;
        if (!Object.values(ZoneTypes).includes(destinationType)) {
            throw new Error(
                "CommandExecutor._executeMoveTopCards(): destinationが不正です。"
            );
        }
        const requestedAmount = command.amount ?? 1;
        return this._forTargetPlayers(context, player => {
            const resourceBonus =
                destinationType === ZoneTypes.RESOURCE &&
                requestedAmount > 0
                    ? context.gameContext?.adventureAbilityManager
                        ?.getResourceGainBonus(player) ?? 0
                    : 0;
            const amount = Math.max(0, requestedAmount + resourceBonus);
            const destination = player.zones.getZone(destinationType);
            const cards = [];
            for (let index = 0; index < amount; index++) {
                const result = this.zoneManager.moveTop({
                    from: player.zones.deck,
                    to: destination
                });
                if (!result.success) {
                    break;
                }
                if (destinationType === ZoneTypes.RESOURCE) {
                    result.card.faceUp = false;
                }
                cards.push(result.card);
            }
            if (cards.length > 0) {
                this._registerRollback(() => {
                    for (const card of [...cards].reverse()) {
                        this.zoneManager.move({
                            from: destination,
                            to: player.zones.deck,
                            card
                        });
                    }
                });
            }
            return {
                success: cards.length === amount,
                reason: cards.length === amount ? null : "SOURCE_EMPTY",
                playerId: player.id,
                cards,
                requestedAmount,
                resourceBonus,
                movedAmount: cards.length
            };
        });
    }

    _executeSearchDeck(command, context) {
        const owners = new Set(
            context.targets
                .map(card => this._findCardOwner(context, card))
                .filter(Boolean)
        );
        const result = this._executeMoveCard({
            ...command,
            params: {
                ...command.params,
                source: ZoneTypes.DECK
            }
        }, context);
        for (const owner of owners) {
            this._shuffleDeck(owner.zones.deck, context);
        }
        return result;
    }

    _executeRevealTopAndTake(command, context) {
        const revealedCount = command.params.revealedCount;
        const remainingPosition = command.params.remainingPosition ?? "TOP";
        if (!Number.isInteger(revealedCount) || revealedCount < 1) {
            throw new Error(
                "CommandExecutor._executeRevealTopAndTake(): revealedCountが不正です。"
            );
        }
        if (!["TOP", "BOTTOM"].includes(remainingPosition)) {
            throw new Error(
                "CommandExecutor._executeRevealTopAndTake(): remainingPositionが不正です。"
            );
        }
        const selectedCards = context.targets.filter(target =>
            target?.definition && target.zone === ZoneTypes.DECK
        );
        const owners = new Set(
            selectedCards
                .map(card => this._findCardOwner(context, card))
                .filter(Boolean)
        );
        for (const owner of owners) {
            const revealed = owner.zones.deck.cards
                .slice(-revealedCount)
                .reverse();
            if (selectedCards.some(card => !revealed.includes(card))) {
                throw new Error(
                    "CommandExecutor._executeRevealTopAndTake(): 選択カードが公開範囲外です。"
                );
            }
        }
        const result = this._executeMoveCard({
            ...command,
            params: {
                ...command.params,
                source: ZoneTypes.DECK,
                destination: command.params.destination ?? ZoneTypes.HAND
            }
        }, context);
        if (remainingPosition === "BOTTOM") {
            for (const owner of owners) {
                const deck = owner.zones.deck;
                const remaining = deck.cards
                    .slice(-Math.max(0, revealedCount - selectedCards.length))
                    .reverse();
                for (const card of [...remaining].reverse()) {
                    deck.remove(card);
                    deck.addBottom(card);
                }
            }
        }
        return {
            ...result,
            revealedCount,
            selectedCardInstanceIds:
                selectedCards.map(card => card.instanceId),
            remainingPosition
        };
    }

    _executeShuffle(command, context) {
        return this._forTargetPlayers(context, player => {
            this._shuffleDeck(player.zones.deck, context);
            return {
                success: true,
                reason: null,
                playerId: player.id,
                deckSize: player.zones.deck.size()
            };
        });
    }

    _shuffleDeck(deck, context) {
        const previous = deck.cards;
        deck.shuffle(context.gameContext?.random ?? null);
        this._registerRollback(() => deck.replaceCards(previous));
    }

    _executeModifyStat(command, context) {
        const modifiers = command.params.modifiers ?? {};
        const duration = command.params.duration ?? "QUEST";
        return this._forTargetPlayers(context, player => {
            if (duration === "QUEST") {
                const previous = player.adventurer
                    .getTemporaryQuestModifiers();
                player.adventurer.addTemporaryQuestModifiers(modifiers);
                this._registerRollback(() => {
                    player.adventurer.setTemporaryQuestModifiers(previous);
                });
            } else if (duration === "PERMANENT") {
                for (const [type, amount] of Object.entries(modifiers)) {
                    player.adventurer.addModifier(type, amount);
                    this._registerRollback(() => {
                        player.adventurer.addModifier(type, -amount);
                    });
                }
            } else {
                throw new Error(
                    `CommandExecutor._executeModifyStat(): 未対応のdurationです。value=${duration}`
                );
            }
            return {
                success: true,
                reason: null,
                playerId: player.id,
                duration,
                modifiers: { ...modifiers }
            };
        });
    }

    _executeScaleStat(command, context, factor) {
        const abilities = command.params.abilities ?? [];
        const duration = command.params.duration ?? "QUEST";
        if (
            !Array.isArray(abilities) ||
            abilities.length === 0 ||
            abilities.some(ability =>
                !Object.values(AbilityTypes).includes(ability)
            ) ||
            new Set(abilities).size !== abilities.length
        ) {
            throw new Error(
                "CommandExecutor._executeScaleStat(): abilitiesが不正です。"
            );
        }
        if (!["QUEST", "PERMANENT"].includes(duration)) {
            throw new Error(
                `CommandExecutor._executeScaleStat(): 未対応のdurationです。value=${duration}`
            );
        }

        return this._forTargetPlayers(context, player => {
            const deltas = {};
            for (const ability of abilities) {
                const current = duration === "QUEST"
                    ? player.adventurer.getQuestStat(ability)
                    : player.adventurer.getCurrentStat(ability);
                const next = Math.ceil(current * factor);
                deltas[ability] = next - current;
            }

            if (duration === "QUEST") {
                const previous = player.adventurer
                    .getTemporaryQuestModifiers();
                player.adventurer.addTemporaryQuestModifiers(deltas);
                this._registerRollback(() => {
                    player.adventurer.setTemporaryQuestModifiers(previous);
                });
            } else {
                for (const [ability, delta] of Object.entries(deltas)) {
                    player.adventurer.addModifier(ability, delta);
                }
                this._registerRollback(() => {
                    for (const [ability, delta] of Object.entries(deltas)) {
                        player.adventurer.addModifier(ability, -delta);
                    }
                });
            }

            return {
                success: true,
                reason: null,
                playerId: player.id,
                duration,
                factor,
                abilities: [...abilities],
                deltas
            };
        });
    }

    _executeTag(command, context, add) {
        const tag = command.params.tag ?? command.value;
        const duration = command.params.duration ?? "QUEST";
        if (typeof tag !== "string" || tag.length === 0) {
            throw new Error("CommandExecutor._executeTag(): tagが不正です。");
        }
        return this._forTargetPlayers(context, player => {
            const previous = duration === "QUEST"
                ? [...player.adventurer.temporaryQuestTags]
                : player.adventurer.getGrantedTags();
            if (duration === "QUEST") {
                if (add) {
                    player.adventurer.addTemporaryQuestTag(tag);
                } else {
                    player.adventurer.removeTemporaryQuestTag(tag);
                }
            } else if (duration === "PERMANENT") {
                const tags = new Set(player.adventurer.getGrantedTags());
                add ? tags.add(tag) : tags.delete(tag);
                player.adventurer.setGrantedTags([...tags]);
            } else {
                throw new Error(
                    `CommandExecutor._executeTag(): 未対応のdurationです。value=${duration}`
                );
            }
            this._registerRollback(() => {
                if (duration === "QUEST") {
                    player.adventurer.temporaryQuestTags = [...previous];
                } else {
                    player.adventurer.setGrantedTags(previous);
                }
            });
            return { success: true, reason: null, playerId: player.id, tag, add, duration };
        });
    }

    _executeModifyQuest(command, context) {
        return this._forQuestCards(context, questCard => {
            const previous = {
                requirements: questCard.questOverrides.requirements === null
                    ? null
                    : { ...questCard.questOverrides.requirements },
                rewardResources: questCard.questOverrides.rewardResources,
                damage: questCard.questOverrides.damage,
                tags: questCard.questOverrides.tags === null
                    ? null
                    : [...questCard.questOverrides.tags]
            };
            const mode = command.params.mode ?? "ADD";
            if (command.params.requirements) {
                const current = questCard.getQuestRequirements();
                const requirementKeys = [...new Set([
                        ...Object.keys(current),
                        ...Object.keys(command.params.requirements)
                    ])];
                questCard.questOverrides.requirements = Object.fromEntries(
                    requirementKeys.map(key => [
                        key,
                        mode === "SET"
                            ? (command.params.requirements[key] ?? current[key])
                            : (current[key] ?? 0) +
                                (command.params.requirements[key] ?? 0)
                    ])
                );
            }
            if (command.params.rewardResources !== undefined) {
                const value = mode === "SET"
                    ? command.params.rewardResources
                    : questCard.getQuestRewardResources() +
                        command.params.rewardResources;
                questCard.questOverrides.rewardResources = Math.max(0, value);
            }
            if (command.params.damage !== undefined) {
                const value = mode === "SET"
                    ? command.params.damage
                    : questCard.getQuestDamage() + command.params.damage;
                questCard.questOverrides.damage = Math.max(0, value);
            }
            const tags = new Set(questCard.getTags());
            for (const tag of command.params.addTags ?? []) {
                tags.add(tag);
            }
            for (const tag of command.params.removeTags ?? []) {
                tags.delete(tag);
            }
            if (command.params.addTags || command.params.removeTags) {
                questCard.questOverrides.tags = [...tags].sort();
            }
            this._registerRollback(() => {
                questCard.questOverrides = previous;
            });
            return {
                success: true,
                reason: null,
                questInstanceId: questCard.instanceId,
                requirements: questCard.getQuestRequirements(),
                rewardResources: questCard.getQuestRewardResources(),
                damage: questCard.getQuestDamage(),
                tags: questCard.getTags()
            };
        });
    }

    _executeQuestParticipation(command, context, add) {
        const participantId = command.params.playerId ?? context.player.id;
        const participant = context.gameContext?.gameState
            ?.getPlayer(participantId);
        if (!participant) {
            throw new Error(
                "CommandExecutor._executeQuestParticipation(): participantが存在しません。"
            );
        }
        return this._forQuestCards(context, questCard => {
            const previous = [...questCard.questParticipantIds];
            if (add && !questCard.questParticipantIds.includes(participantId)) {
                questCard.questParticipantIds.push(participantId);
            }
            if (!add) {
                questCard.questParticipantIds = questCard.questParticipantIds
                    .filter(id => id !== participantId);
            }
            this._registerRollback(() => {
                questCard.questParticipantIds = previous;
            });
            return {
                success: true,
                reason: null,
                questInstanceId: questCard.instanceId,
                participantIds: [...questCard.questParticipantIds]
            };
        });
    }

    _executeSetQuestTiming(command, context) {
        const timing = command.params.timing;
        if (!["THIS_TURN", "NEXT_TURN"].includes(timing)) {
            throw new Error(
                "CommandExecutor._executeSetQuestTiming(): timingが不正です。"
            );
        }
        const turn = context.gameContext?.gameState?.turn;
        if (!Number.isInteger(turn)) {
            throw new Error(
                "CommandExecutor._executeSetQuestTiming(): gameState.turnが必要です。"
            );
        }
        return this._forQuestCards(context, questCard => {
            const previous = questCard.questAvailableTurn;
            questCard.questAvailableTurn = timing === "THIS_TURN"
                ? turn
                : turn + 1;
            this._registerRollback(() => {
                questCard.questAvailableTurn = previous;
            });
            return {
                success: true,
                reason: null,
                questInstanceId: questCard.instanceId,
                availableTurn: questCard.questAvailableTurn
            };
        });
    }

    _executeFlip(context, faceUp) {
        return this._forTargetCards(context, card => {
            const previous = card.faceUp;
            card.faceUp = faceUp;
            this._registerRollback(() => {
                card.faceUp = previous;
            });
            return {
                success: true,
                reason: null,
                cardInstanceId: card.instanceId,
                faceUp
            };
        });
    }

    _executeCounter(command, context, add) {
        const counter = command.params.counter;
        const amount = command.amount ?? 1;
        if (typeof counter !== "string" || counter.length === 0) {
            throw new Error(
                "CommandExecutor._executeCounter(): counterが不正です。"
            );
        }
        const targets = context.targets.length > 0
            ? context.targets
            : [context.player];
        const results = targets.map(target => {
            const holder = target?.adventurer ?? target;
            if (!holder || typeof holder !== "object") {
                throw new Error(
                    "CommandExecutor._executeCounter(): 対象が不正です。"
                );
            }
            holder.counters ??= {};
            const previous = holder.counters[counter] ?? 0;
            holder.counters[counter] = add
                ? previous + amount
                : Math.max(0, previous - amount);
            this._registerRollback(() => {
                if (previous === 0) {
                    delete holder.counters[counter];
                } else {
                    holder.counters[counter] = previous;
                }
            });
            return {
                success: true,
                reason: null,
                counter,
                amount: Math.abs(holder.counters[counter] - previous),
                count: holder.counters[counter]
            };
        });
        return results.length === 1
            ? results[0]
            : { success: true, reason: null, targetResults: results };
    }

    _executeHeal(command, context) {
        const amount = command.amount ?? 0;
        return this._forTargetPlayers(context, player => {
            const recoveredAmount =
                player.adventurer.recoverDamage(amount);
            if (recoveredAmount > 0) {
                this._registerRollback(() => {
                    player.adventurer.addDamage(recoveredAmount);
                });
            }
            return {
                success: true,
                reason: null,
                playerId: player.id,
                requestedAmount: amount,
                amount: recoveredAmount,
                damage: player.adventurer.damage
            };
        });
    }

    _executeAddQuestModifier(command, context) {
        const player = context.player;
        const preparation = context.gameContext?.gameState
            ?.questPreparation;
        if (
            preparation === null ||
            preparation === undefined ||
            preparation.playerOrder[preparation.currentIndex] !== player.id
        ) {
            throw new Error(
                "CommandExecutor._executeAddQuestModifier(): 依頼準備中の優先プレイヤーだけが使用できます。"
            );
        }
        const modifiers = command.params.modifiers ?? {};
        return this._forTargetPlayers(context, targetPlayer => {
            const previous = targetPlayer.adventurer
                .getTemporaryQuestModifiers();
            targetPlayer.adventurer
                .addTemporaryQuestModifiers(modifiers);
            this._registerRollback(() => {
                targetPlayer.adventurer
                    .setTemporaryQuestModifiers(previous);
            });
            return {
                success: true,
                reason: null,
                playerId: targetPlayer.id,
                modifiers: { ...modifiers },
                temporaryQuestModifiers:
                    targetPlayer.adventurer
                        .getTemporaryQuestModifiers()
            };
        });
    }

    _forTargetPlayers(context, executeForPlayer) {
        const selectedPlayers = context.targets.filter(target =>
            target?.adventurer && target?.zones
        );
        const players = selectedPlayers.length > 0
            ? selectedPlayers
            : [context.player];
        const results = players.map(executeForPlayer);
        if (results.length === 1) {
            return results[0];
        }
        return {
            success: results.every(result => result.success !== false),
            reason: null,
            targetResults: results
        };
    }

    _forTargetCards(context, executeForCard) {
        const cards = context.targets.filter(target =>
            target?.definition && target?.zone
        );
        if (cards.length === 0) {
            throw new Error(
                "CommandExecutor: カード対象が指定されていません。"
            );
        }
        const results = cards.map(executeForCard);
        return results.length === 1
            ? results[0]
            : {
                success: results.every(result => result.success !== false),
                reason: null,
                targetResults: results
            };
    }

    _forQuestCards(context, executeForQuest) {
        return this._forTargetCards(context, card => {
            if (card.definition.type !== CardTypes.QUEST) {
                throw new Error("CommandExecutor: 対象は依頼書ではありません。");
            }
            return executeForQuest(card);
        });
    }

    _findCardOwner(context, card) {
        return context.gameContext?.gameState?.players.find(player =>
            player.zones.getAllZones().some(zone => zone.contains(card))
        ) ?? null;
    }

    _getDestinationPlayer(context, card, playerId) {
        const gameState = context.gameContext?.gameState;
        if (playerId !== undefined && playerId !== null) {
            const player = gameState?.getPlayer(playerId);
            if (!player) {
                throw new Error(
                    `CommandExecutor: 移動先プレイヤーが存在しません。playerId=${playerId}`
                );
            }
            return player;
        }
        return gameState?.getPlayer(card.ownerId) ??
            this._findCardOwner(context, card) ??
            context.player;
    }

    _registerRollback(rollbackFunction) {
        if (
            this.transactionManager &&
            this.transactionManager.isActive()
        ) {
            this.transactionManager.addOperation(rollbackFunction);
        }
    }

}
