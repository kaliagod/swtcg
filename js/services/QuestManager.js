import CardTypes from "../constants/CardTypes.js";
import QuestPhaseStages from "../constants/QuestPhaseStages.js";
import AbilityTypes from "../constants/AbilityTypes.js";
import GamePhaseTypes from "../constants/GamePhaseTypes.js";
import AdventurerRequirementEvaluator from "./AdventurerRequirementEvaluator.js";
import AdventureAbilityManager from "./AdventureAbilityManager.js";

export default class QuestManager {
    constructor(
        requirementEvaluator = new AdventurerRequirementEvaluator(),
        adventureAbilityManager = new AdventureAbilityManager()
    ) {
        if (!(requirementEvaluator instanceof AdventurerRequirementEvaluator)) {
            throw new Error(
                "QuestManager: requirementEvaluatorが不正です。"
            );
        }
        this.requirementEvaluator = requirementEvaluator;
        if (!(adventureAbilityManager instanceof AdventureAbilityManager)) {
            throw new Error(
                "QuestManager: adventureAbilityManagerが不正です。"
            );
        }
        this.adventureAbilityManager = adventureAbilityManager;
    }

    getAllQuests(gameState) {
        return gameState.players.flatMap(player =>
            player.zones.field.cards.filter(card =>
                card.definition.type === CardTypes.QUEST
            )
        );
    }

    canDeclareParticipation({
        gameState,
        player,
        questCard
    }) {
        return this.getParticipationEligibility({
            gameState,
            player,
            questCard
        }).allowed;
    }

    getParticipationEligibility({
        gameState,
        player,
        questCard
    }) {
        if (
            gameState.phase !== GamePhaseTypes.QUEST ||
            gameState.questPhase?.stage !==
                QuestPhaseStages.PARTICIPATION ||
            gameState.questPreparation !== null ||
            gameState.getCurrentPlayer() !== player ||
            questCard?.definition?.type !== CardTypes.QUEST ||
            questCard.enteredFieldTurn === null ||
            questCard.enteredFieldTurn >= gameState.turn ||
            questCard.questParticipantIds.includes(player.id)
        ) {
            return {
                allowed: false,
                reason: "CANNOT_DECLARE_QUEST_PARTICIPATION",
                requirementResult: null
            };
        }

        if (!this.getAllQuests(gameState).includes(questCard)) {
            return {
                allowed: false,
                reason: "CANNOT_DECLARE_QUEST_PARTICIPATION",
                requirementResult: null
            };
        }

        const requirementResult = this.requirementEvaluator.evaluate(
            player,
            questCard.definition.participationRequirements,
            { useQuestStats: true }
        );
        return {
            allowed: requirementResult.met,
            reason: requirementResult.met
                ? null
                : "QUEST_PARTICIPATION_REQUIREMENTS_NOT_MET",
            requirementResult
        };
    }

    canResolve({ gameState, player, questCard }) {
        const availableTurn = Number.isInteger(
            questCard?.questAvailableTurn
        )
            ? questCard.questAvailableTurn
            : (questCard?.enteredFieldTurn ?? gameState.turn) + 1;
        return (
            gameState.phase === GamePhaseTypes.QUEST &&
            gameState.getCurrentPlayer() === player &&
            questCard?.definition?.type === CardTypes.QUEST &&
            questCard.controllerId === player.id &&
            questCard.enteredFieldTurn !== null &&
            availableTurn <= gameState.turn &&
            player.zones.field.contains(questCard)
        );
    }

    getResolvableQuests(gameState, player) {
        return this.getAllQuests(gameState).filter(questCard =>
            this.canResolve({ gameState, player, questCard })
        );
    }

    canSelectForResolution({ gameState, player, questCard }) {
        return (
            gameState.questPhase?.stage ===
                QuestPhaseStages.SELECT_QUEST &&
            this.canResolve({ gameState, player, questCard })
        );
    }

    evaluate(gameState, questCard) {
        const participants = questCard.questParticipantIds
            .map(playerId => gameState.getPlayer(playerId))
            .filter(Boolean);
        const totals = Object.fromEntries(
            Object.values(AbilityTypes).map(type => [type, 0])
        );
        const questTags = typeof questCard.getTags === "function"
            ? questCard.getTags()
            : [...questCard.definition.tags];

        for (const participant of participants) {
            for (const type of Object.values(AbilityTypes)) {
                totals[type] += participant.adventurer.getQuestStat(type) +
                    this.adventureAbilityManager.getQuestStatModifier(
                        participant,
                        type,
                        questTags
                    );
            }
        }

        const requirements = typeof questCard.getQuestRequirements === "function"
            ? questCard.getQuestRequirements()
            : { ...questCard.definition.questRequirements };
        const rewardResources =
            typeof questCard.getQuestRewardResources === "function"
                ? questCard.getQuestRewardResources()
                : questCard.definition.questRewardResources;
        const requirementsMet = Object.entries(
            requirements
        ).every(([ability, minimum]) =>
            totals[ability] >= minimum
        );

        return {
            success:
                participants.length > 0 && requirementsMet,
            participantIds: participants.map(player => player.id),
            totals,
            requirements: {
                ...requirements
            },
            rewardPerParticipant:
                participants.length === 0
                    ? 0
                    : Math.ceil(
                        rewardResources /
                        participants.length
                    )
        };
    }
}
