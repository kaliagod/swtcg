/**
 * 効果解決中に共有する不変コンテキスト。
 */
export default class EffectContext {
    constructor({
        gameContext,
        player,
        sourceCard = null,
        effect,
        targets = [],
        options = {}
    }) {
        this.gameContext = gameContext;
        this.player = player;
        this.sourceCard = sourceCard;
        this.effect = effect;
        this.targets = [...targets];
        Object.freeze(this.targets);
        this.options = Object.freeze({ ...options });
        Object.freeze(this);
    }
}
