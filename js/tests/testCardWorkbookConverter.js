import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { convertCardWorkbook } from "../../server/cardWorkbookConverter.js";

const workbook = new ExcelJS.Workbook();
const adventurers = workbook.addWorksheet("冒険者");
adventurers.addRow([
    "enabled", "id", "name",
    "base_DEXTERITY", "base_AGILITY", "base_STRENGTH",
    "base_VITALITY", "base_INTELLIGENCE", "base_SPIRIT"
]);
adventurers.addRow([
    true, "ADV900", "変換試験冒険者",
    3, 3, 3, 3, 3, 3
]);
const events = workbook.addWorksheet("イベント");
events.addRow([
    "enabled", "id", "name", "cost", "rarity",
    "resolutionZone", "tags", "text"
]);
events.addRow([
    true, "EVT900", "変換試験", 1, "RARE",
    "GRAVEYARD", "TEST;DRAW", "1枚引く。\n検証用。"
]);

const effects = workbook.addWorksheet("効果");
effects.addRow([
    "enabled", "cardId", "order", "trigger",
    "conditionJson", "costJson", "targetJson", "commandsJson"
]);
effects.addRow([
    true,
    "EVT900",
    1,
    "PLAY",
    '{"type":"ALWAYS"}',
    "",
    '{"type":"SELF"}',
    '[{"type":"DRAW","amount":1}]'
]);

const buffer = await workbook.xlsx.writeBuffer();
const result = await convertCardWorkbook(Buffer.from(buffer), "test.xlsx");

assert.equal(result.errors.length, 0);
assert.equal(result.cards.length, 2);
assert.deepEqual(result.cards.find(card => card.id === "ADV900"), {
    id: "ADV900",
    name: "変換試験冒険者",
    type: "ADVENTURER",
    baseStats: {
        DEXTERITY: 3,
        AGILITY: 3,
        STRENGTH: 3,
        VITALITY: 3,
        INTELLIGENCE: 3,
        SPIRIT: 3
    }
});
assert.deepEqual(result.cards.find(card => card.id === "EVT900"), {
    id: "EVT900",
    name: "変換試験",
    type: "EVENT",
    cost: 1,
    rarity: "RARE",
    resolutionZone: "GRAVEYARD",
    tags: ["TEST", "DRAW"],
    text: ["1枚引く。", "検証用。"],
    effects: [{
        trigger: "PLAY",
        condition: { type: "ALWAYS" },
        target: { type: "SELF" },
        commands: [{ type: "DRAW", amount: 1 }]
    }]
});
assert.equal(result.stats.byType.EVENT, 1);
assert.equal(result.stats.byType.ADVENTURER, 1);
