import ZoneManager from "./ZoneManager.js";
import ZoneTypes from "../constants/ZoneTypes.js";

export default class DeckRefreshManager {
    constructor(zoneManager) {
        if (!(zoneManager instanceof ZoneManager)) {
            throw new Error(
                "DeckRefreshManager: zoneManagerにはZoneManagerを指定してください。"
            );
        }
        this.zoneManager = zoneManager;
    }

    canRefresh(player) {
        return Boolean(
            player?.zones?.deck?.isEmpty() &&
            !player.zones.graveyard.isEmpty()
        );
    }

    refresh(player, randomService = null) {
        if (!this.canRefresh(player)) {
            return {
                refreshed: false,
                cardCount: 0,
                cardInstanceIds: []
            };
        }

        const cards = player.zones.graveyard.cards;
        for (const card of cards) {
            const result = this.zoneManager.move({
                from: player.zones.graveyard,
                to: player.zones.deck,
                card
            });
            if (!result.success) {
                throw new Error(
                    `DeckRefreshManager.refresh(): カードを山札へ戻せません。reason=${result.reason}`
                );
            }
            card.faceUp = false;
            card.zone = ZoneTypes.DECK;
            card.controllerId = null;
        }

        player.zones.deck.shuffle(randomService);
        player.deckRefreshCount++;

        return {
            refreshed: true,
            cardCount: cards.length,
            cardInstanceIds: cards.map(card => card.instanceId)
        };
    }
}
