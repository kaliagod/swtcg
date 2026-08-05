/**
 * DeckLoader.js
 * デッキリスト読込
 */

export default class DeckLoader {

    /**
     * デッキ読込
     * @param {string} path
     * @returns {Promise<string[]>}
     */
    async load(path) {

        const response = await fetch(path);

        if (!response.ok) {

            throw new Error(
                `デッキデータの読み込みに失敗しました : ${path}`
            );

        }

        const json = await response.json();

        if (!Array.isArray(json)) {

            throw new Error(
                "デッキデータは配列である必要があります。"
            );

        }

        for (const [index, cardId] of json.entries()) {
            if (
                typeof cardId !== "string" ||
                cardId.length === 0
            ) {
                throw new Error(
                    `デッキデータの${index + 1}番目にはカードID文字列を指定してください。`
                );
            }
        }

        return [...json];

    }

}
