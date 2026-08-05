/**
 * ConditionTypes.js
 * 発動条件種別
 */

const ConditionTypes = Object.freeze({

    //--------------------------------------
    // 常に真
    //--------------------------------------

    ALWAYS: "ALWAYS",

    ALL: "ALL",

    ANY: "ANY",

    NOT: "NOT",

    PLAYER_LEVEL: "PLAYER_LEVEL",

    PLAYER_STAT: "PLAYER_STAT",

    PLAYER_TAG: "PLAYER_TAG",

    PLAYER_STATUS: "PLAYER_STATUS",

    SOURCE_COUNTER: "SOURCE_COUNTER",

    SOURCE_STATUS: "SOURCE_STATUS",

    QUEST_TAG: "QUEST_TAG"

});

export default ConditionTypes;
