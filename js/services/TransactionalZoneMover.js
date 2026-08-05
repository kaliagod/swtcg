import ZoneManager from "./ZoneManager.js";

export default class TransactionalZoneMover {
    constructor({ zoneManager }) {
        if (!(zoneManager instanceof ZoneManager)) {
            throw new Error(
                "TransactionalZoneMover: zoneManagerが不正です。"
            );
        }
        this.zoneManager = zoneManager;
    }

    move({
        gameContext = null,
        transactionManager,
        from,
        to,
        card,
        state = {},
        failureReason = "CARD_MOVE_FAILED",
        recordZoneTransition,
        discardQueuedTriggers
    }) {
        const previousFaceUp = card.faceUp;
        const previousControllerId = card.controllerId;
        const previousState = {};
        for (const key of Object.keys(state)) {
            previousState[key] = card[key];
        }

        const result = this.zoneManager.move({ from, to, card });
        if (!result.success) {
            const error = new Error(
                "TransactionalZoneMover: カードを移動できませんでした。" +
                `reason=${result.reason}`
            );
            error.reason = failureReason;
            throw error;
        }

        Object.assign(card, state);
        const triggerEntries = gameContext
            ? recordZoneTransition({
                gameContext,
                from,
                to,
                card,
                previousFaceUp,
                previousControllerId
            })
            : [];

        transactionManager.addOperation(() => {
            discardQueuedTriggers(
                gameContext?.gameState,
                triggerEntries
            );
            const rollbackResult = this.zoneManager.move({
                from: to,
                to: from,
                card
            });
            if (!rollbackResult.success) {
                throw new Error(
                    "TransactionalZoneMover: " +
                    "カード移動を巻き戻せませんでした。" +
                    `reason=${rollbackResult.reason}`
                );
            }
            Object.assign(card, previousState);
        });

        return result;
    }
}
