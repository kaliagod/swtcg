import GameState from "../models/GameState.js";
import AbilityTypes from "../constants/AbilityTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import CardTypes from "../constants/CardTypes.js";
import { cloneSerializable } from "../utils/Serializable.js";

export default class GameStateSerializer {
    serialize(
        gameState,
        {
            viewerPlayerId = null,
            revealAll = false
        } = {}
    ) {
        if (!(gameState instanceof GameState)) {
            throw new Error(
                "GameStateSerializer.serialize(): gameStateにはGameStateを指定してください。"
            );
        }

        if (
            viewerPlayerId !== null &&
            !gameState.getPlayer(viewerPlayerId)
        ) {
            throw new Error(
                `GameStateSerializer.serialize(): プレイヤー '${viewerPlayerId}' は存在しません。`
            );
        }

        const view = {
            revision: gameState.revision,
            status: gameState.status,
            prepared: gameState.prepared,
            started: gameState.started,
            ended: gameState.ended,
            turn: gameState.turn,
            phase: gameState.phase,
            currentPlayerId:
                gameState.getCurrentPlayer()?.id ?? null,
            winnerIds: [...gameState.winnerIds],
            endReason: gameState.endReason,
            questPhase:
                gameState.questPhase === null
                    ? null
                    : {
                        ...gameState.questPhase,
                        resolvableQuestInstanceIds: [
                            ...(gameState.questPhase
                                .resolvableQuestInstanceIds ?? [])
                        ]
                    },
            questPreparation:
                gameState.questPreparation === null
                    ? null
                    : {
                        ...gameState.questPreparation,
                        playerOrder: [
                            ...gameState.questPreparation.playerOrder
                        ],
                        passedPlayerIds: [
                            ...gameState.questPreparation.passedPlayerIds
                        ],
                        usedMagicNamesByPlayer:
                            Object.fromEntries(
                                Object.entries(
                                    gameState.questPreparation
                                        .usedMagicNamesByPlayer ?? {}
                                ).map(([playerId, names]) => [
                                    playerId,
                                    [...names]
                                ])
                            )
                    },
            players: gameState.players.map(player =>
                this._serializePlayer(
                    player,
                    viewerPlayerId,
                    revealAll
                )
            ),
            pendingSelections:
                gameState.pendingSelections.map(request =>
                    this._serializeSelection(
                        request,
                        viewerPlayerId,
                        revealAll
                    )
                )
        };

        return cloneSerializable(
            view,
            "GameStateSerializer.view"
        );
    }

    _serializePlayer(
        player,
        viewerPlayerId,
        revealAll
    ) {
        const isOwner = player.id === viewerPlayerId;

        return {
            id: player.id,
            name: player.name,
            deckRefreshCount: player.deckRefreshCount ?? 0,
            adventurer:
                this._serializeAdventurer(
                    player.adventurer
                ),
            zones: {
                deck: {
                    type: ZoneTypes.DECK,
                    count: player.zones.deck.size()
                },
                adventureDeck: this._serializePrivateZone(
                    player.zones.adventureDeck,
                    isOwner || revealAll
                ),
                hand: this._serializePrivateZone(
                    player.zones.hand,
                    isOwner || revealAll
                ),
                resource: this._serializePrivateZone(
                    player.zones.resource,
                    isOwner || revealAll
                ),
                field: {
                    type: ZoneTypes.FIELD,
                    count: player.zones.field.size(),
                    cards: player.zones.field.cards.map(card =>
                        this._serializeFieldCard(
                            card,
                            isOwner || revealAll
                        )
                    )
                },
                graveyard: this._serializeVisibleZone(
                    player.zones.graveyard,
                    isOwner || revealAll
                ),
                banished: this._serializeVisibleZone(
                    player.zones.banished,
                    isOwner || revealAll
                )
            }
        };
    }

    _serializeAdventurer(adventurer) {
        if (!adventurer) {
            return null;
        }

        const stats = {};
        for (const type of Object.values(AbilityTypes)) {
            stats[type] = {
                raw: adventurer.getRawStat(type),
                current: adventurer.getCurrentStat(type),
                quest: adventurer.getQuestStat(type),
                questBonus:
                    adventurer.getQuestStat(type) -
                    adventurer.getCurrentStat(type)
            };
        }

        return {
            card: adventurer.card?.definition
                ? this._serializeCard(adventurer.card)
                : adventurer.card,
            level: adventurer.level,
            damage: adventurer.damage,
            mpSpent: adventurer.mpSpent,
            availableMp: adventurer.availableMp,
            equipmentSlots: {
                ...Object.fromEntries(
                    Object.keys(adventurer.equipmentSlots).map(slot => [
                        slot,
                        adventurer.getEquipmentSlotLimit(slot)
                    ])
                )
            },
            accessoryLimit: adventurer.getAccessoryLimit(),
            continuousModifiers:
                adventurer.getContinuousModifiers(),
            questModifiers: adventurer.getQuestModifiers(),
            equipmentSlotModifiers:
                adventurer.getEquipmentSlotModifiers(),
            growthModifiers: adventurer.getGrowthModifiers(),
            temporaryQuestModifiers:
                adventurer.getTemporaryQuestModifiers(),
            grantedTags: adventurer.getGrantedTags(),
            temporaryQuestTags: [
                ...(adventurer.temporaryQuestTags ?? [])
            ],
            counters: { ...(adventurer.counters ?? {}) },
            statuses: (adventurer.statuses ?? []).map(
                status => ({ ...status })
            ),
            stats
        };
    }

    _serializePrivateZone(zone, canReveal) {
        const result = {
            type: zone.type,
            count: zone.size()
        };

        if (canReveal) {
            result.cards = zone.cards.map(
                card => this._serializeCard(card)
            );
        }

        return result;
    }

    _serializeVisibleZone(zone, canRevealFaceDown) {
        return {
            type: zone.type,
            count: zone.size(),
            cards: zone.cards.map(
                card => this._serializeFieldCard(
                    card,
                    canRevealFaceDown
                )
            )
        };
    }

    _serializeFieldCard(card, canRevealFaceDown) {
        if (
            card.faceUp === false &&
            !canRevealFaceDown
        ) {
            return {
                instanceId: card.instanceId,
                hidden: true,
                faceUp: false,
                fieldArea: [
                    CardTypes.MAGIC,
                    CardTypes.SKILL,
                    CardTypes.TRAIT
                ].includes(card.definition.type)
                    ? "ADVENTURE"
                    : "MAIN"
            };
        }

        return this._serializeCard(card);
    }

    _serializeCard(card) {
        return {
            instanceId: card.instanceId,
            id: card.definition.id,
            nameKey: card.definition.nameKey,
            name: card.definition.name,
            imagePath: card.definition.imagePath ?? null,
            type: card.definition.type,
            cost: card.definition.cost,
            equipmentSlot: card.definition.equipmentSlot ?? null,
            equipmentSlots: {
                ...(card.definition.equipmentSlots ?? {})
            },
            levelGain: card.definition.levelGain ?? 0,
            adventureAbilityType:
                card.definition.adventureAbilityType ?? null,
            activeQuestModifiers: {
                ...(card.definition.activeQuestModifiers ?? {})
            },
            grantedTags: [...(card.definition.grantedTags ?? [])],
            useRequirements: {
                ...card.definition.useRequirements,
                minStats: {
                    ...card.definition.useRequirements.minStats
                },
                requiredTags: [
                    ...card.definition.useRequirements.requiredTags
                ],
                forbiddenTags: [
                    ...card.definition.useRequirements.forbiddenTags
                ]
            },
            participationRequirements: {
                ...card.definition.participationRequirements,
                minStats: {
                    ...card.definition.participationRequirements.minStats
                },
                requiredTags: [
                    ...card.definition.participationRequirements.requiredTags
                ],
                forbiddenTags: [
                    ...card.definition.participationRequirements.forbiddenTags
                ]
            },
            ownerId: card.ownerId,
            zone: card.zone,
            faceUp: card.faceUp,
            refreshAtOwnerTurnStart:
                card.refreshAtOwnerTurnStart ?? false,
            enteredFieldTurn: card.enteredFieldTurn ?? null,
            controllerId: card.controllerId ?? null,
            questParticipantIds:
                [...(card.questParticipantIds ?? [])],
            questResolution: card.questResolution ?? null,
            questPreparationComplete:
                card.questPreparationComplete ?? false,
            questOverrides: {
                requirements:
                    card.questOverrides?.requirements === null ||
                    card.questOverrides?.requirements === undefined
                        ? null
                        : { ...card.questOverrides.requirements },
                rewardResources:
                    card.questOverrides?.rewardResources ?? null,
                damage: card.questOverrides?.damage ?? null,
                tags:
                    card.questOverrides?.tags === null ||
                    card.questOverrides?.tags === undefined
                        ? null
                        : [...card.questOverrides.tags]
            },
            questAvailableTurn: card.questAvailableTurn ?? null,
            counters: { ...(card.counters ?? {}) },
            statuses: (card.statuses ?? []).map(
                status => ({ ...status })
            )
        };
    }

    _serializeSelection(
        request,
        viewerPlayerId,
        revealAll
    ) {
        if (
            revealAll ||
            request.playerId === viewerPlayerId
        ) {
            return {
                id: request.id,
                type: request.type,
                playerId: request.playerId,
                prompt: request.prompt,
                candidates: request.candidates,
                min: request.min,
                max: request.max,
                context: request.context
            };
        }

        return {
            id: request.id,
            type: request.type,
            playerId: request.playerId,
            pending: true
        };
    }
}
