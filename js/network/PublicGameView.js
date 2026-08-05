import Card from "../models/Card.js";
import Zone from "../models/Zone.js";
import PlayerZones from "../models/PlayerZones.js";
import ZoneTypes from "../constants/ZoneTypes.js";
import AdventurerRequirementEvaluator from "../services/AdventurerRequirementEvaluator.js";
import QuestManager from "../services/QuestManager.js";

function createHiddenCard({ playerId, zoneType, index, value = {} }) {
    const hiddenType = value.fieldArea === "ADVENTURE"
        ? "MAGIC"
        : "ITEM";
    return {
        instanceId:
            value.instanceId ?? `HIDDEN_${playerId}_${zoneType}_${index}`,
        definition: {
            id: "HIDDEN",
            name: "非公開カード",
            nameKey: "HIDDEN",
            imagePath: null,
            type: hiddenType,
            cost: 0,
            tags: [],
            text: [],
            grantedTags: [],
            statModifiers: {},
            activeQuestModifiers: {},
            useRequirements: {
                minLevel: 0,
                minStats: {},
                requiredTags: [],
                forbiddenTags: []
            },
            participationRequirements: {
                minLevel: 0,
                minStats: {},
                requiredTags: [],
                forbiddenTags: []
            },
            questRequirements: {},
            questDamage: 0,
            questRewardResources: 0,
            levelGain: 0,
            adventureAbilityType: null,
            itemUse: null
        },
        ownerId: playerId,
        controllerId: playerId,
        zone: zoneType,
        faceUp: false,
        hidden: true,
        counters: {},
        statuses: [],
        questParticipantIds: [],
        questOverrides: {
            requirements: null,
            rewardResources: null,
            damage: null,
            tags: null
        },
        get name() {
            return "非公開カード";
        },
        getTags() {
            return [];
        },
        getQuestRequirements() {
            return {};
        },
        getQuestDamage() {
            return 0;
        },
        getQuestRewardResources() {
            return 0;
        }
    };
}

function hydrateCard(value, definitions, fallback) {
    if (value?.hidden === true || !value?.id) {
        return createHiddenCard({ ...fallback, value });
    }
    const definition = definitions.get(value.id);
    if (!definition) {
        throw new Error(`公開状態に未登録のカードIDがあります：${value.id}`);
    }
    const card = new Card(definition, value.instanceId);
    const definitionKeys = new Set([
        "id",
        "nameKey",
        "name",
        "imagePath",
        "type",
        "cost",
        "equipmentSlot",
        "equipmentSlots",
        "levelGain",
        "adventureAbilityType",
        "activeQuestModifiers",
        "grantedTags",
        "useRequirements",
        "participationRequirements"
    ]);
    for (const [key, entry] of Object.entries(value)) {
        if (!definitionKeys.has(key)) {
            card[key] = entry;
        }
    }
    card.questOverrides = {
        requirements: null,
        rewardResources: null,
        damage: null,
        tags: null,
        ...(value.questOverrides ?? {})
    };
    return card;
}

function hydrateZone(zoneView, playerId, definitions) {
    const visibleCards = zoneView.cards ?? [];
    const cards = visibleCards.map((card, index) =>
        hydrateCard(card, definitions, {
            playerId,
            zoneType: zoneView.type,
            index
        })
    );
    for (let index = cards.length; index < zoneView.count; index++) {
        cards.push(createHiddenCard({
            playerId,
            zoneType: zoneView.type,
            index
        }));
    }
    return cards;
}

function hydrateAdventurer(value, definitions, playerId) {
    const card = value.card
        ? hydrateCard(value.card, definitions, {
            playerId,
            zoneType: ZoneTypes.ADVENTURER,
            index: 0
        })
        : null;
    return {
        ...value,
        card,
        getRawStat(type) {
            return value.stats[type]?.raw ?? 0;
        },
        getCurrentStat(type) {
            return value.stats[type]?.current ?? 0;
        },
        getQuestStat(type) {
            return value.stats[type]?.quest ?? 0;
        },
        getGrantedTags() {
            return [...(value.grantedTags ?? [])];
        },
        hasTag(tag) {
            return (value.grantedTags ?? []).includes(tag) ||
                (value.temporaryQuestTags ?? []).includes(tag);
        }
    };
}

function hydratePlayer(value, definitions) {
    const zoneCards = Object.fromEntries(
        Object.entries(value.zones).map(([key, zone]) => [
            key,
            hydrateZone(zone, value.id, definitions)
        ])
    );
    return {
        id: value.id,
        name: value.name,
        deckRefreshCount: value.deckRefreshCount,
        adventurer: hydrateAdventurer(
            value.adventurer,
            definitions,
            value.id
        ),
        zones: new PlayerZones(zoneCards)
    };
}

export function createPublicGameContext(publicState, definitions) {
    if (publicState?.protocolVersion !== 1 || !publicState.state) {
        throw new Error("対応していない公開状態です。");
    }
    const source = publicState.state;
    const players = source.players.map(player =>
        hydratePlayer(player, definitions)
    );
    const gameState = {
        ...source,
        revision: publicState.revision,
        players,
        getPlayer(id) {
            return this.players.find(player => player.id === id) ?? null;
        },
        getCurrentPlayer() {
            return this.getPlayer(this.currentPlayerId);
        },
        hasPendingSelection() {
            return this.pendingSelections.length > 0;
        }
    };
    const requirementEvaluator = new AdventurerRequirementEvaluator();
    return {
        gameState,
        gameEngine: {
            getCardUseEligibility({ player, card }) {
                const requirementResult = requirementEvaluator.evaluate(
                    player,
                    card.definition.useRequirements
                );
                return {
                    allowed: requirementResult.met,
                    reason: requirementResult.met
                        ? null
                        : "CARD_USE_REQUIREMENTS_NOT_MET",
                    requirementResult
                };
            }
        },
        questManager: new QuestManager()
    };
}
