import StatusDurations from "../constants/StatusDurations.js";

export default class StatusManager {
    add({
        holder,
        status,
        amount = 1,
        duration = StatusDurations.QUEST,
        gameState,
        sourceCard = null,
        targetPlayerId = null
    }) {
        this._validateHolder(holder);
        this._validateStatus(status);
        this._validateAmount(amount);
        if (!Object.values(StatusDurations).includes(duration)) {
            throw new Error(
                `StatusManager.add(): durationが不正です。value=${duration}`
            );
        }

        const questInstanceId =
            gameState?.questPreparation?.questInstanceId ??
            gameState?.questPhase?.activeQuestInstanceId ??
            null;
        if (
            duration === StatusDurations.QUEST &&
            questInstanceId === null
        ) {
            throw new Error(
                "StatusManager.add(): QUEST期間の状態には解決中の依頼が必要です。"
            );
        }

        holder.statuses ??= [];
        const added = [];
        for (let index = 0; index < amount; index++) {
            const entry = {
                id: `STATUS_${gameState?.nextStatusId ?? index + 1}`,
                name: status,
                duration,
                sourceCardInstanceId:
                    sourceCard?.instanceId ?? null,
                appliedTurn: gameState?.turn ?? null,
                targetPlayerId,
                questInstanceId:
                    duration === StatusDurations.QUEST
                        ? questInstanceId
                        : null
            };
            if (gameState) {
                gameState.nextStatusId++;
            }
            holder.statuses.push(entry);
            added.push(entry);
        }
        return added;
    }

    remove({ holder, status, amount = null }) {
        this._validateHolder(holder);
        this._validateStatus(status);
        if (amount !== null) {
            this._validateAmount(amount);
        }
        holder.statuses ??= [];
        const matching = holder.statuses.filter(
            entry => entry.name === status
        );
        const removeIds = new Set(
            (amount === null ? matching : matching.slice(0, amount))
                .map(entry => entry.id)
        );
        const removed = holder.statuses.filter(
            entry => removeIds.has(entry.id)
        );
        holder.statuses = holder.statuses.filter(
            entry => !removeIds.has(entry.id)
        );
        return removed;
    }

    expire(gameState, predicate) {
        const expired = [];
        for (const { holder, playerId, cardInstanceId } of
            this._getHolders(gameState)) {
            const previous = holder.statuses ?? [];
            const removed = previous.filter(predicate);
            if (removed.length === 0) {
                continue;
            }
            const removedIds = new Set(removed.map(entry => entry.id));
            holder.statuses = previous.filter(
                entry => !removedIds.has(entry.id)
            );
            expired.push({
                playerId,
                cardInstanceId,
                statuses: removed
            });
        }
        return expired;
    }

    _getHolders(gameState) {
        const holders = [];
        for (const player of gameState.players) {
            if (player.adventurer) {
                holders.push({
                    holder: player.adventurer,
                    playerId: player.id,
                    cardInstanceId: null
                });
            }
            for (const zone of player.zones.getAllZones()) {
                for (const card of zone.cards) {
                    holders.push({
                        holder: card,
                        playerId: player.id,
                        cardInstanceId: card.instanceId
                    });
                }
            }
        }
        return holders;
    }

    _validateHolder(holder) {
        if (!holder || typeof holder !== "object") {
            throw new Error("StatusManager: 状態保持対象が不正です。");
        }
    }

    _validateStatus(status) {
        if (typeof status !== "string" || status.length === 0) {
            throw new Error("StatusManager: statusを指定してください。");
        }
    }

    _validateAmount(amount) {
        if (!Number.isInteger(amount) || amount < 1) {
            throw new Error(
                "StatusManager: amountには1以上の整数を指定してください。"
            );
        }
    }
}
