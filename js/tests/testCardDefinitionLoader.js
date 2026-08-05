import assert from "node:assert/strict";

import CardDefinitionLoader from "../loaders/CardDefinitionLoader.js";
import installFileFetch from "./helpers/installFileFetch.js";

const restoreFetch = installFileFetch();
try {
    const definitions = await new CardDefinitionLoader().load(
        "./data/cards/starter.json"
    );

    assert.equal(definitions.length, 29);
    assert.equal(definitions[0].id, "EVT001");
    assert.equal(definitions[0].name, "旅支度");
} finally {
    restoreFetch();
}
