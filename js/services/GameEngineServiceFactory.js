import AdventureAbilityManager from "./AdventureAbilityManager.js";
import AdventurerRequirementEvaluator from
    "./AdventurerRequirementEvaluator.js";
import CardActionManager from "./CardActionManager.js";
import DamageOverflowManager from "./DamageOverflowManager.js";
import DeckRefreshManager from "./DeckRefreshManager.js";
import DeckValidator from "./DeckValidator.js";
import EffectExecutionManager from "./EffectExecutionManager.js";
import EquipmentManager from "./EquipmentManager.js";
import GameSetupManager from "./GameSetupManager.js";
import PhaseFlowManager from "./PhaseFlowManager.js";
import PlayerStateResolutionManager from
    "./PlayerStateResolutionManager.js";
import QuestFlowManager from "./QuestFlowManager.js";
import QuestManager from "./QuestManager.js";
import SelectionContinuationManager from
    "./SelectionContinuationManager.js";
import StateBasedActionManager from "./StateBasedActionManager.js";
import StatusManager from "./StatusManager.js";
import TransactionalZoneMover from "./TransactionalZoneMover.js";
import TriggerFlowManager from "./TriggerFlowManager.js";
import ZoneManager from "./ZoneManager.js";

export default class GameEngineServiceFactory {
    create({
        effectResolver,
        zoneManager,
        deckValidator = new DeckValidator(),
        equipmentManager = new EquipmentManager(),
        damageOverflowManager = new DamageOverflowManager(),
        deckRefreshManager = new DeckRefreshManager(zoneManager),
        adventureAbilityManager = new AdventureAbilityManager(),
        questManager = new QuestManager(),
        requirementEvaluator = new AdventurerRequirementEvaluator(),
        statusManager = new StatusManager(),
        gameSetupManager = null,
        stateBasedActionManager = null,
        phaseFlowManager = null,
        questFlowManager = null,
        triggerFlowManager = null,
        selectionContinuationManager = null,
        effectExecutionManager = null,
        cardActionManager = null,
        playerStateResolutionManager = null,
        transactionalZoneMover = null
    }) {
        this._validateCore({
            effectResolver,
            zoneManager,
            deckValidator,
            equipmentManager,
            damageOverflowManager,
            deckRefreshManager,
            adventureAbilityManager,
            questManager,
            requirementEvaluator,
            statusManager
        });

        const resolved = {
            gameSetupManager: gameSetupManager ??
                new GameSetupManager({ zoneManager, deckValidator }),
            stateBasedActionManager: stateBasedActionManager ??
                new StateBasedActionManager({
                    deckRefreshManager,
                    adventureAbilityManager
                }),
            phaseFlowManager: phaseFlowManager ??
                new PhaseFlowManager({ questManager, statusManager }),
            questFlowManager: questFlowManager ??
                new QuestFlowManager({
                    questManager,
                    damageOverflowManager,
                    adventureAbilityManager
                }),
            triggerFlowManager: triggerFlowManager ??
                new TriggerFlowManager(),
            selectionContinuationManager:
                selectionContinuationManager ??
                new SelectionContinuationManager(),
            effectExecutionManager: effectExecutionManager ??
                new EffectExecutionManager({
                    effectResolver,
                    adventureAbilityManager
                }),
            cardActionManager: cardActionManager ??
                new CardActionManager({
                    equipmentManager,
                    adventureAbilityManager,
                    requirementEvaluator
                }),
            playerStateResolutionManager:
                playerStateResolutionManager ??
                new PlayerStateResolutionManager({
                    adventureAbilityManager,
                    damageOverflowManager,
                    equipmentManager
                }),
            transactionalZoneMover: transactionalZoneMover ??
                new TransactionalZoneMover({ zoneManager })
        };
        this._validateComposite(resolved);

        questManager.adventureAbilityManager = adventureAbilityManager;
        return {
            effectResolver,
            zoneManager,
            deckValidator,
            equipmentManager,
            damageOverflowManager,
            deckRefreshManager,
            adventureAbilityManager,
            questManager,
            requirementEvaluator,
            statusManager,
            ...resolved
        };
    }

    _validateCore(services) {
        if (!services.effectResolver) {
            throw new Error(
                "GameEngineServiceFactory: effectResolverを指定してください。"
            );
        }
        if (typeof services.effectResolver.execute !== "function") {
            throw new Error(
                "GameEngineServiceFactory: " +
                "effectResolverにはexecute()が必要です。"
            );
        }
        this._requireInstance(services.zoneManager, ZoneManager,
            "zoneManager");
        this._requireInstance(services.deckValidator, DeckValidator,
            "deckValidator");
        this._requireInstance(services.equipmentManager, EquipmentManager,
            "equipmentManager");
        this._requireInstance(
            services.damageOverflowManager,
            DamageOverflowManager,
            "damageOverflowManager"
        );
        this._requireInstance(
            services.deckRefreshManager,
            DeckRefreshManager,
            "deckRefreshManager"
        );
        this._requireInstance(
            services.adventureAbilityManager,
            AdventureAbilityManager,
            "adventureAbilityManager"
        );
        this._requireInstance(services.questManager, QuestManager,
            "questManager");
        this._requireInstance(
            services.requirementEvaluator,
            AdventurerRequirementEvaluator,
            "requirementEvaluator"
        );
        this._requireInstance(services.statusManager, StatusManager,
            "statusManager");
    }

    _validateComposite(services) {
        const requirements = [
            ["gameSetupManager", GameSetupManager],
            ["stateBasedActionManager", StateBasedActionManager],
            ["phaseFlowManager", PhaseFlowManager],
            ["questFlowManager", QuestFlowManager],
            ["triggerFlowManager", TriggerFlowManager],
            ["selectionContinuationManager", SelectionContinuationManager],
            ["effectExecutionManager", EffectExecutionManager],
            ["cardActionManager", CardActionManager],
            ["playerStateResolutionManager", PlayerStateResolutionManager],
            ["transactionalZoneMover", TransactionalZoneMover]
        ];
        for (const [name, Type] of requirements) {
            this._requireInstance(services[name], Type, name);
        }
    }

    _requireInstance(value, Type, name) {
        if (!(value instanceof Type)) {
            throw new Error(
                `GameEngineServiceFactory: ${name}が不正です。`
            );
        }
    }
}
