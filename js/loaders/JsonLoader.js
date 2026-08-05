/**
 * JsonLoader.js
 * JSONからCardDefinitionを生成する
 */

import CardDefinition from "../models/CardDefinition.js";

export default class JsonLoader {

    load(jsonArray) {

        if (!Array.isArray(jsonArray)) {
            throw new Error("配列を指定してください。");
        }

        return jsonArray.map(data => new CardDefinition(data));

    }

}