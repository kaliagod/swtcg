/**
 * CardDefinitionLoader.js
 * CardDefinition読み込み
 */

import CardDefinition from "../models/CardDefinition.js";

export default class CardDefinitionLoader {

    /**
     * JSONファイルからCardDefinition一覧を読み込む
     * @param {string} path
     * @returns {Promise<CardDefinition[]>}
     */
    async load(path) {

        const response = await fetch(path);

        if (!response.ok) {
            throw new Error(
                `カードデータの読み込みに失敗しました : ${path}`
            );
        }

        const json = await response.json();

        if (!Array.isArray(json)) {
            throw new Error("カードデータは配列である必要があります。");
        }

        return json.map(data => new CardDefinition(data));

    }

}