/**
 * GameEvents.js
 * ゲーム内イベント定義
 *
 * EventBusで使用するイベント名を一元管理する。
 * イベント名は文字列の直接記述を禁止し、
 * 必ずこの定数を利用すること。
 */

const GameEvents = Object.freeze({

    // =====================================================
    // ゲーム
    // =====================================================

    GAME_CREATED: "GAME_CREATED",
    GAME_STARTED: "GAME_STARTED",
    GAME_ENDED: "GAME_ENDED",

    // =====================================================
    // ターン
    // =====================================================

    TURN_STARTED: "TURN_STARTED",
    TURN_ENDED: "TURN_ENDED",

    PHASE_CHANGED: "PHASE_CHANGED",

    // =====================================================
    // プレイヤー
    // =====================================================

    PLAYER_CHANGED: "PLAYER_CHANGED",

    // =====================================================
    // カード
    // =====================================================

    CARD_CREATED: "CARD_CREATED",
    CARD_MOVED: "CARD_MOVED",
    CARD_DRAWN: "CARD_DRAWN",
    CARD_PLAYED: "CARD_PLAYED",
    CARD_DISCARDED: "CARD_DISCARDED",

    // =====================================================
    // 冒険者
    // =====================================================

    ADVENTURER_SUMMONED: "ADVENTURER_SUMMONED",
    ADVENTURER_REMOVED: "ADVENTURER_REMOVED",

    LEVEL_CHANGED: "LEVEL_CHANGED",

    // =====================================================
    // 能力値
    // =====================================================

    STATUS_CHANGED: "STATUS_CHANGED",

    DAMAGE_CHANGED: "DAMAGE_CHANGED",

    MP_CHANGED: "MP_CHANGED",

    RESOURCE_CHANGED: "RESOURCE_CHANGED",

    // =====================================================
    // 装備
    // =====================================================

    EQUIPMENT_CHANGED: "EQUIPMENT_CHANGED",

    // =====================================================
    // 効果
    // =====================================================

    EFFECT_STARTED: "EFFECT_STARTED",

    EFFECT_RESOLVED: "EFFECT_RESOLVED",

    EFFECT_CANCELLED: "EFFECT_CANCELLED"

});

export default GameEvents;