/**
 * Card.js
 * ゲーム中に存在するカード
 */
import CardDefinition from "./CardDefinition.js";
export default class Card {

    

    constructor(
        definition,
        instanceId = null
    ) {
        if (!(definition instanceof CardDefinition)) {
            throw new Error(
                "CardDefinition を指定してください。"
            );
        }

        /**
         * JSONで定義されたカード情報
         */
        this.definition = definition;

        this.instanceId = instanceId;

        /**
         * 所有プレイヤー
         */
        this.ownerId = null;

        /**
         * 現在いるゾーン
         */
        this.zone = null;

        /**
         * 表向きか
         */
        this.faceUp = true;

        this.refreshAtOwnerTurnStart = false;

        this.enteredFieldTurn = null;

        this.controllerId = null;

        this.questParticipantIds = [];

        this.questResolution = null;

        this.questPreparationComplete = false;

        /** カード効果による依頼書の実行時変更。nullは定義値を使う。 */
        this.questOverrides = {
            requirements: null,
            rewardResources: null,
            damage: null,
            tags: null
        };

        /** このターン番号以降に解決できる。nullは従来規則を使う。 */
        this.questAvailableTurn = null;

        /** MP以外を含む汎用カウンター。 */
        this.counters = {};

        /** カード自身に付与された名前付き状態。 */
        this.statuses = [];

    }

    /**
     * カードID
     */
    get id() {

        return this.definition.id;

    }

    /**
     * カード名
     */
    get name() {

        return this.definition.name;

    }

    getQuestRequirements() {
        return {
            ...(this.questOverrides.requirements ??
                this.definition.questRequirements)
        };
    }

    getQuestRewardResources() {
        return this.questOverrides.rewardResources ??
            this.definition.questRewardResources;
    }

    getQuestDamage() {
        return this.questOverrides.damage ??
            this.definition.questDamage;
    }

    getTags() {
        return [
            ...(this.questOverrides.tags ?? this.definition.tags)
        ];
    }

    resetQuestRuntime() {
        this.questParticipantIds = [];
        this.questResolution = null;
        this.questPreparationComplete = false;
        this.questOverrides = {
            requirements: null,
            rewardResources: null,
            damage: null,
            tags: null
        };
        this.questAvailableTurn = null;
    }

}
