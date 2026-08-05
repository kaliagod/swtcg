import TargetTypes from "../constants/TargetTypes.js";
import ZoneTypes from "../constants/ZoneTypes.js";

const CARD_TARGET_TYPES = new Set([
    TargetTypes.TARGET_CARD,
    TargetTypes.ALL_CARDS,
    TargetTypes.HAND,
    TargetTypes.DECK,
    TargetTypes.DISCARD
]);

export default class TargetEngine {
    select(context, selectedIds = null) {
        const specification = this.getSelectionSpec(context);

        if (!specification.requiresSelection) {
            return specification.candidates.map(candidate =>
                candidate.target
            );
        }
        if (!Array.isArray(selectedIds)) {
            throw new Error(
                "TargetEngine.select(): 対象IDを指定してください。"
            );
        }
        if (
            selectedIds.length < specification.min ||
            selectedIds.length > specification.max ||
            new Set(selectedIds.map(id =>
                `${typeof id}:${String(id)}`
            )).size !== selectedIds.length
        ) {
            throw new Error(
                "TargetEngine.select(): 対象の選択数が不正です。"
            );
        }

        const candidatesById = new Map(
            specification.candidates.map(candidate => [
                `${typeof candidate.id}:${String(candidate.id)}`,
                candidate
            ])
        );
        const selected = selectedIds.map(id =>
            candidatesById.get(`${typeof id}:${String(id)}`) ?? null
        );
        if (selected.some(candidate => candidate === null)) {
            throw new Error(
                "TargetEngine.select(): 候補にない対象が選択されています。"
            );
        }
        return selected.map(candidate => candidate.target);
    }

    getSelectionSpec(context) {
        const target = context.effect.target;
        if (target === null || target.type === TargetTypes.NONE) {
            return this._automatic([]);
        }
        if (target.type === TargetTypes.SELF) {
            return this._automatic([
                this._playerCandidate(context.player)
            ]);
        }
        if (target.type === TargetTypes.SELF_CARD) {
            return this._automatic(
                context.sourceCard
                    ? [this._cardCandidate(
                        context.sourceCard,
                        context.player
                    )]
                    : []
            );
        }

        const gameState = context.gameContext?.gameState;
        if (!gameState) {
            throw new Error(
                "TargetEngine: gameContext.gameStateが必要です。"
            );
        }

        if (target.type === TargetTypes.ALL_PLAYERS) {
            return this._automatic(
                gameState.players.map(player =>
                    this._playerCandidate(player)
                )
            );
        }
        if (
            target.type === TargetTypes.PLAYER ||
            target.type === TargetTypes.OPPONENT
        ) {
            const players = gameState.players.filter(player =>
                target.type === TargetTypes.PLAYER ||
                player.id !== context.player.id
            );
            return this._manual(
                players.map(player => this._playerCandidate(player)),
                target.amount ?? 1
            );
        }

        if (CARD_TARGET_TYPES.has(target.type)) {
            const candidates = this._getCardCandidates(context, target);
            if (target.type === TargetTypes.ALL_CARDS) {
                return this._automatic(candidates);
            }
            return this._manual(candidates, target.amount ?? 1);
        }

        throw new Error(
            `未対応のTargetType: ${target.type}`
        );
    }

    _getCardCandidates(context, target) {
        const gameState = context.gameContext.gameState;
        const zoneTypes = this._getZoneTypes(target);
        const filter = target.filter ?? {};
        const candidates = [];

        for (const owner of gameState.players) {
            if (
                [TargetTypes.HAND, TargetTypes.DECK].includes(
                    target.type
                ) &&
                owner.id !== context.player.id
            ) {
                continue;
            }
            if (
                filter.controller === "SELF" &&
                owner.id !== context.player.id
            ) {
                continue;
            }
            if (
                filter.controller === "OPPONENT" &&
                owner.id === context.player.id
            ) {
                continue;
            }
            for (const zoneType of zoneTypes) {
                if (
                    [
                        ZoneTypes.HAND,
                        ZoneTypes.DECK,
                        ZoneTypes.RESOURCE,
                        ZoneTypes.ADVENTURE_DECK
                    ].includes(zoneType) &&
                    owner.id !== context.player.id
                ) {
                    continue;
                }
                const zone = owner.zones.getZone(zoneType);
                if (!zone) {
                    continue;
                }
                const zoneCards =
                    zoneType === ZoneTypes.DECK && filter.top
                        ? zone.cards.slice(-filter.top).reverse()
                        : zone.cards;
                for (const card of zoneCards) {
                    if (!this._matchesCardFilter(card, filter)) {
                        continue;
                    }
                    candidates.push(this._cardCandidate(card, owner));
                }
            }
        }
        return candidates;
    }

    _getZoneTypes(target) {
        if (target.type === TargetTypes.HAND) {
            return [ZoneTypes.HAND];
        }
        if (target.type === TargetTypes.DECK) {
            return [ZoneTypes.DECK];
        }
        if (target.type === TargetTypes.DISCARD) {
            return [ZoneTypes.GRAVEYARD];
        }
        return target.filter?.zones ?? [ZoneTypes.FIELD];
    }

    _matchesCardFilter(card, filter) {
        return (
            (!filter.cardTypes ||
                filter.cardTypes.includes(card.definition.type)) &&
            (filter.faceUp === undefined ||
                card.faceUp === filter.faceUp) &&
            (!filter.tags ||
                filter.tags.every(tag =>
                    (typeof card.getTags === "function"
                        ? card.getTags()
                        : card.definition.tags
                    ).includes(tag)
                ))
        );
    }

    _playerCandidate(player) {
        return {
            id: player.id,
            target: player,
            public: {
                id: player.id,
                kind: "PLAYER",
                playerId: player.id,
                name: player.name
            }
        };
    }

    _cardCandidate(card, owner) {
        return {
            id: card.instanceId,
            target: card,
            public: {
                id: card.instanceId,
                kind: "CARD",
                cardId: card.definition.id,
                name: card.definition.name,
                cardType: card.definition.type,
                ownerId: owner?.id ?? card.ownerId,
                zone: card.zone,
                faceUp: card.faceUp
            }
        };
    }

    _automatic(candidates) {
        return {
            requiresSelection: false,
            candidates,
            min: candidates.length,
            max: candidates.length
        };
    }

    _manual(candidates, amount) {
        if (amount === 0) {
            return this._automatic([]);
        }
        return {
            requiresSelection: true,
            candidates,
            min: amount,
            max: amount
        };
    }
}
