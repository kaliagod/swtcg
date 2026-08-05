/**
 * CommandTypes.js
 * 効果コマンド種別
 */

const CommandTypes = Object.freeze({

    //--------------------------------------
    // カード操作
    //--------------------------------------

    DRAW: "DRAW",

    DISCARD: "DISCARD",

    SHUFFLE: "SHUFFLE",

    MOVE_CARD: "MOVE_CARD",

    MOVE_TOP_CARDS: "MOVE_TOP_CARDS",

    SEARCH_DECK: "SEARCH_DECK",

    REVEAL_TOP_AND_TAKE: "REVEAL_TOP_AND_TAKE",

    //--------------------------------------
    // HP
    //--------------------------------------

    DAMAGE: "DAMAGE",

    HEAL: "HEAL",

    //--------------------------------------
    // MP
    //--------------------------------------

    GAIN_MP: "GAIN_MP",

    LOSE_MP: "LOSE_MP",

    //--------------------------------------
    // ステータス
    //--------------------------------------

    ADD_STATUS: "ADD_STATUS",

    REMOVE_STATUS: "REMOVE_STATUS",

    ADD_QUEST_MODIFIER: "ADD_QUEST_MODIFIER",

    MODIFY_STAT: "MODIFY_STAT",

    DOUBLE_STAT: "DOUBLE_STAT",

    HALVE_STAT: "HALVE_STAT",

    ADD_TAG: "ADD_TAG",

    REMOVE_TAG: "REMOVE_TAG",

    MODIFY_QUEST: "MODIFY_QUEST",

    DECLARE_QUEST_PARTICIPATION: "DECLARE_QUEST_PARTICIPATION",

    REMOVE_QUEST_PARTICIPATION: "REMOVE_QUEST_PARTICIPATION",

    SET_QUEST_TIMING: "SET_QUEST_TIMING",

    FLIP_FACE_DOWN: "FLIP_FACE_DOWN",

    FLIP_FACE_UP: "FLIP_FACE_UP",

    ADD_COUNTER: "ADD_COUNTER",

    REMOVE_COUNTER: "REMOVE_COUNTER",

    REDUCE_DAMAGE: "REDUCE_DAMAGE",

    PREVENT_QUEST_DAMAGE: "PREVENT_QUEST_DAMAGE",

    MODIFY_RESOURCE_GAIN: "MODIFY_RESOURCE_GAIN",

    REPLACE_MP_WITH_COUNTER: "REPLACE_MP_WITH_COUNTER",

    MODIFY_EQUIPMENT_SLOTS: "MODIFY_EQUIPMENT_SLOTS"

});

export default CommandTypes;
