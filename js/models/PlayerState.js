/**
 * PlayerState.js
 */

import PlayerZones from "./PlayerZones.js";
import AdventurerState from "./AdventurerState.js";

export default class PlayerState {

    constructor({

        id,

        name = "",

        zones = new PlayerZones(),

        adventurer = null

    } = {}) {

        if (id === undefined || id === null) {
            throw new Error(
                "PlayerState: idを指定してください。"
            );
        }

        if (!(zones instanceof PlayerZones)) {
            throw new Error(
                "PlayerState: zonesにはPlayerZonesを指定してください。"
            );
        }

        if (
            adventurer !== null &&
            !(adventurer instanceof AdventurerState)
        ) {
            throw new Error(
                "PlayerState: adventurerにはAdventurerStateを指定してください。"
            );
        }

        this.id = id;

        this.name = name;

        this.zones = zones;

        this.adventurer = adventurer;

        this.deckRefreshCount = 0;

    }

}
