/**
 * GameState.js
 * ゲーム全体の状態を保持する
 */

import GameStatusTypes from "../constants/GameStatusTypes.js";

export default class GameState {

    constructor() {

        /**
         * プレイヤー一覧
         */
        this.players = [];

        /**
         * 現在ターン
         */
        this.turn = 1;

        /**
         * 現在フェイズ
         */
        this.phase = null;

        /**
         * 現在のプレイヤーIndex
         */
        this.currentPlayerIndex = 0;

        /**
         * ゲーム開始済み
         */
        this.started = false;

        this.prepared = false;

        this.ended = false;

        this.winnerIds = [];

        this.status = GameStatusTypes.CREATED;

        this.endReason = null;

        this.pendingSelections = [];

        this.nextSelectionId = 1;

        this.nextStatusId = 1;

        /** P2Pコマンド境界で利用する状態リビジョン。 */
        this.revision = 0;

        /** 解決待ちの誘発効果。 */
        this.triggerQueue = [];

        this.nextTriggerEntryId = 1;

        this.nextTriggerBatchId = 1;

        /** 誘発効果の選択待ち中に保留したフェイズ遷移。 */
        this.pendingPhaseTransition = null;

        /** 誘発キュー完了後に再開するゲーム処理。 */
        this.pendingTriggerContinuation = null;

        /**
         * 依頼判定直前の準備タイミング。
         * nullでなければ、playerOrderのcurrentIndexにいるプレイヤーだけが
         * 場のカードを起動するかパスできる。
         */
        this.questPreparation = null;

        /**
         * 依頼フェイズ内の固定進行状態。
         * QuestPhaseStagesで管理する固定進行状態。
         */
        this.questPhase = null;

        /** 現在解決中のカード効果の深さ。 */
        this.effectResolutionDepth = 0;

    }

    /**
     * プレイヤー追加
     */
    addPlayer(player) {

        if (!player || player.id === undefined || player.id === null) {
            throw new Error(
                "GameState.addPlayer(): player.idを指定してください。"
            );
        }

        if (this.getPlayer(player.id)) {
            throw new Error(
                `GameState.addPlayer(): プレイヤーID '${player.id}' は既に登録されています。`
            );
        }

        this.players.push(player);

    }

    /**
     * 現在プレイヤー
     */
    getCurrentPlayer() {

        return this.players[this.currentPlayerIndex] ?? null;

    }

    /**
     * プレイヤー取得
     */
    getPlayer(id) {

        return this.players.find(player => player.id === id) ?? null;

    }

    /**
     * プレイヤー数
     */
    playerCount() {

        return this.players.length;

    }

    setCurrentPlayer(playerId) {

        const index =
            this.players.findIndex(
                player => player.id === playerId
            );

        if (index === -1) {
            throw new Error(
                `GameState.setCurrentPlayer(): プレイヤーID '${playerId}' は存在しません。`
            );
        }

        this.currentPlayerIndex = index;

        return this.players[index];

    }

    moveToNextPlayer() {

        if (this.players.length === 0) {
            return null;
        }

        this.currentPlayerIndex =
            (this.currentPlayerIndex + 1) %
            this.players.length;

        this.turn++;

        return this.getCurrentPlayer();

    }

    markPrepared() {
        if (this.status !== GameStatusTypes.CREATED) {
            throw new Error(
                "GameState.markPrepared(): CREATED状態でのみ準備完了にできます。"
            );
        }

        this.status = GameStatusTypes.PREPARING;
        this.prepared = true;
    }

    start() {
        if (this.status !== GameStatusTypes.PREPARING) {
            throw new Error(
                "GameState.start(): PREPARING状態でのみゲームを開始できます。"
            );
        }

        if (this.hasPendingSelection()) {
            throw new Error(
                "GameState.start(): 未解決の選択要求があります。"
            );
        }

        this.status = GameStatusTypes.IN_PROGRESS;
        this.started = true;
    }

    finish({
        winnerIds = [],
        reason
    }) {
        if (this.status !== GameStatusTypes.IN_PROGRESS) {
            throw new Error(
                "GameState.finish(): 進行中のゲームのみ終了できます。"
            );
        }

        if (!Array.isArray(winnerIds)) {
            throw new Error(
                "GameState.finish(): winnerIdsには配列を指定してください。"
            );
        }

        for (const playerId of winnerIds) {
            if (!this.getPlayer(playerId)) {
                throw new Error(
                    `GameState.finish(): プレイヤー '${playerId}' は存在しません。`
                );
            }
        }

        this.status = GameStatusTypes.ENDED;
        this.ended = true;
        this.winnerIds = [...new Set(winnerIds)];
        this.endReason = reason ?? null;
    }

    hasPendingSelection() {
        return this.pendingSelections.length > 0;
    }

    canAcceptGameAction() {
        return (
            this.status === GameStatusTypes.IN_PROGRESS &&
            !this.ended &&
            !this.hasPendingSelection()
        );
    }

}
