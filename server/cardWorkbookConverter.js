import ExcelJS from "exceljs";
import JSZip from "jszip";

import CardDefinition from "../js/models/CardDefinition.js";
import CardTypes from "../js/constants/CardTypes.js";
import AbilityTypes from "../js/constants/AbilityTypes.js";

const CARD_SHEETS = Object.freeze({
    "冒険者": CardTypes.ADVENTURER,
    "魔法": CardTypes.MAGIC,
    "特技": CardTypes.SKILL,
    "特徴": CardTypes.TRAIT,
    "依頼": CardTypes.QUEST,
    "装備品": CardTypes.EQUIPMENT,
    "装飾品": CardTypes.ACCESSORY,
    "アイテム": CardTypes.ITEM,
    "イベント": CardTypes.EVENT,
    ADVENTURER: CardTypes.ADVENTURER,
    MAGIC: CardTypes.MAGIC,
    SKILL: CardTypes.SKILL,
    TRAIT: CardTypes.TRAIT,
    QUEST: CardTypes.QUEST,
    EQUIPMENT: CardTypes.EQUIPMENT,
    ACCESSORY: CardTypes.ACCESSORY,
    ITEM: CardTypes.ITEM,
    EVENT: CardTypes.EVENT
});

const ABILITIES = Object.values(AbilityTypes);

async function normalizePrefixedSpreadsheetXml(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const workbookFile = zip.file("xl/workbook.xml");
    if (!workbookFile) {
        return null;
    }
    const workbookXml = await workbookFile.async("string");
    if (!workbookXml.includes("<x:workbook")) {
        return null;
    }

    const xmlFiles = Object.values(zip.files).filter(file =>
        !file.dir && file.name.endsWith(".xml")
    );
    await Promise.all(xmlFiles.map(async file => {
        const xml = await file.async("string");
        if (!xml.includes("<x:")) {
            return;
        }
        let normalizedXml = xml
            .replace(/<(\/?)x:/g, "<$1")
            .replace(/xmlns:x=/g, "xmlns=");
        if (/^xl\/worksheets\/sheet\d+\.xml$/.test(file.name)) {
            normalizedXml = normalizedXml.replace(
                /<tableParts\b[\s\S]*?<\/tableParts>/g,
                ""
            );
        }
        zip.file(file.name, normalizedXml);
    }));
    return zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE"
    });
}

function valueOf(cell) {
    const value = cell?.value;
    if (value && typeof value === "object") {
        if ("result" in value) {
            return value.result;
        }
        if ("text" in value) {
            return value.text;
        }
        if (Array.isArray(value.richText)) {
            return value.richText.map(part => part.text).join("");
        }
    }
    return value;
}

function text(value) {
    return value === null || value === undefined
        ? ""
        : String(value).trim();
}

function isBlank(value) {
    return text(value) === "";
}

function isDisabled(value) {
    if (value === false || value === 0) {
        return true;
    }
    return ["false", "no", "off", "0", "無効", "いいえ"]
        .includes(text(value).toLowerCase());
}

function list(value, { lines = false } = {}) {
    if (isBlank(value)) {
        return [];
    }
    const separator = lines ? /\r?\n/ : /[;,、\r\n]+/;
    return String(value)
        .split(separator)
        .map(item => item.trim())
        .filter(Boolean);
}

function number(value, label, { integer = false } = {}) {
    if (isBlank(value)) {
        return undefined;
    }
    const parsed = typeof value === "number" ? value : Number(text(value));
    if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
        throw new Error(`${label}には${integer ? "整数" : "数値"}を入力してください。`);
    }
    return parsed;
}

function json(value, label) {
    if (isBlank(value)) {
        return undefined;
    }
    try {
        return JSON.parse(String(value));
    } catch (error) {
        throw new Error(`${label}のJSONが不正です: ${error.message}`);
    }
}

function headersFor(sheet) {
    const headers = new Map();
    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
        const key = text(valueOf(cell));
        if (key) {
            headers.set(key, column);
        }
    });
    return headers;
}

function rowReader(row, headers) {
    return key => {
        const column = headers.get(key);
        return column ? valueOf(row.getCell(column)) : undefined;
    };
}

function setIf(target, key, value) {
    if (value !== undefined && value !== null && value !== "") {
        target[key] = value;
    }
}

function readAbilityMap(get, prefix, label, { integer = false } = {}) {
    const result = {};
    for (const ability of ABILITIES) {
        const parsed = number(
            get(`${prefix}_${ability}`),
            `${label}.${ability}`,
            { integer }
        );
        if (parsed !== undefined) {
            result[ability] = parsed;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function readRequirements(get, prefix, label) {
    const result = {};
    setIf(result, "minLevel", number(
        get(`${prefix}_minLevel`),
        `${label}.minLevel`,
        { integer: true }
    ));
    setIf(result, "minStats", readAbilityMap(get, prefix, `${label}.minStats`));
    const requiredTags = list(get(`${prefix}_requiredTags`));
    const forbiddenTags = list(get(`${prefix}_forbiddenTags`));
    setIf(result, "requiredTags", requiredTags.length ? requiredTags : undefined);
    setIf(result, "forbiddenTags", forbiddenTags.length ? forbiddenTags : undefined);
    return Object.keys(result).length > 0 ? result : undefined;
}

function readCard(row, headers, type) {
    const get = rowReader(row, headers);
    const id = text(get("id"));
    if (!id || id.startsWith("#") || isDisabled(get("enabled"))) {
        return null;
    }

    const card = {
        id,
        name: text(get("name")),
        type
    };

    setIf(card, "nameKey", text(get("nameKey")) || undefined);
    setIf(card, "imagePath", text(get("imagePath")) || undefined);
    setIf(card, "cost", number(get("cost"), "cost", { integer: true }));
    setIf(card, "rarity", text(get("rarity")) || undefined);
    setIf(card, "resolutionZone", text(get("resolutionZone")) || undefined);
    setIf(card, "itemUse", text(get("itemUse")) || undefined);
    setIf(card, "equipmentSlot", text(get("equipmentSlot")) || undefined);
    setIf(card, "equipmentSlots", json(get("equipmentSlotsJson"), "equipmentSlotsJson"));
    setIf(card, "adventureAbilityType", text(get("adventureAbilityType")) || undefined);
    setIf(card, "levelGain", number(get("levelGain"), "levelGain", { integer: true }));
    setIf(card, "questDamage", number(get("questDamage"), "questDamage", { integer: true }));
    setIf(card, "questRewardResources", number(
        get("questRewardResources"),
        "questRewardResources",
        { integer: true }
    ));

    const tags = list(get("tags"));
    const cardText = list(get("text"), { lines: true });
    const grantedTags = list(get("grantedTags"));
    setIf(card, "tags", tags.length ? tags : undefined);
    setIf(card, "text", cardText.length ? cardText : undefined);
    setIf(card, "grantedTags", grantedTags.length ? grantedTags : undefined);
    setIf(card, "baseStats", readAbilityMap(
        get,
        "base",
        "baseStats",
        { integer: true }
    ));
    setIf(card, "statModifiers", readAbilityMap(get, "stat", "statModifiers"));
    setIf(card, "activeQuestModifiers", readAbilityMap(
        get,
        "active",
        "activeQuestModifiers"
    ));
    setIf(card, "equipRequirements", readAbilityMap(
        get,
        "equip",
        "equipRequirements"
    ));
    setIf(card, "questRequirements", readAbilityMap(
        get,
        "quest",
        "questRequirements"
    ));
    setIf(card, "useRequirements", readRequirements(get, "use", "useRequirements"));
    setIf(card, "participationRequirements", readRequirements(
        get,
        "participation",
        "participationRequirements"
    ));

    return card;
}

function readEffects(sheet, errors) {
    if (!sheet) {
        return new Map();
    }
    const headers = headersFor(sheet);
    const effects = new Map();
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const get = rowReader(row, headers);
        const cardId = text(get("cardId"));
        if (!cardId || cardId.startsWith("#") || isDisabled(get("enabled"))) {
            continue;
        }
        try {
            const effect = { trigger: text(get("trigger")) };
            setIf(effect, "condition", json(get("conditionJson"), "conditionJson"));
            setIf(effect, "cost", json(get("costJson"), "costJson"));
            setIf(effect, "target", json(get("targetJson"), "targetJson"));
            const commands = json(get("commandsJson"), "commandsJson");
            effect.commands = commands ?? [];
            if (!Array.isArray(effect.commands)) {
                throw new Error("commandsJsonにはJSON配列を入力してください。");
            }
            const order = number(get("order"), "order", { integer: true }) ?? rowNumber;
            const entries = effects.get(cardId) ?? [];
            entries.push({ order, effect });
            effects.set(cardId, entries);
        } catch (error) {
            errors.push({ sheet: sheet.name, row: rowNumber, cardId, message: error.message });
        }
    }
    for (const entries of effects.values()) {
        entries.sort((left, right) => left.order - right.order);
    }
    return effects;
}

export async function convertCardWorkbook(buffer, fileName = "workbook.xlsx") {
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(buffer);
    } catch (firstError) {
        const normalized = await normalizePrefixedSpreadsheetXml(buffer);
        if (!normalized) {
            throw firstError;
        }
        await workbook.xlsx.load(normalized);
    }

    const cards = [];
    const errors = [];
    const warnings = [];

    for (const sheet of workbook.worksheets) {
        const type = CARD_SHEETS[sheet.name];
        if (!type) {
            continue;
        }
        const headers = headersFor(sheet);
        if (!headers.has("id") || !headers.has("name")) {
            warnings.push(`${sheet.name}: id/name列がないため読み飛ばしました。`);
            continue;
        }
        for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
            try {
                const card = readCard(sheet.getRow(rowNumber), headers, type);
                if (card) {
                    cards.push({ card, sheet: sheet.name, row: rowNumber });
                }
            } catch (error) {
                errors.push({ sheet: sheet.name, row: rowNumber, message: error.message });
            }
        }
    }

    const effectsByCard = readEffects(
        workbook.getWorksheet("効果") ?? workbook.getWorksheet("EFFECTS"),
        errors
    );
    const seen = new Map();
    for (const entry of cards) {
        if (seen.has(entry.card.id)) {
            const first = seen.get(entry.card.id);
            errors.push({
                sheet: entry.sheet,
                row: entry.row,
                cardId: entry.card.id,
                message: `カードIDが重複しています（最初の位置: ${first.sheet} ${first.row}行）。`
            });
            continue;
        }
        seen.set(entry.card.id, entry);
        const effectEntries = effectsByCard.get(entry.card.id);
        if (effectEntries?.length) {
            entry.card.effects = effectEntries.map(item => item.effect);
        }
        try {
            new CardDefinition(entry.card);
        } catch (error) {
            errors.push({
                sheet: entry.sheet,
                row: entry.row,
                cardId: entry.card.id,
                message: error.message
            });
        }
    }

    for (const cardId of effectsByCard.keys()) {
        if (!seen.has(cardId)) {
            warnings.push(`効果: cardId=${cardId} に対応するカードがありません。`);
        }
    }

    return {
        fileName,
        cards: cards.map(entry => entry.card),
        errors,
        warnings,
        stats: {
            total: cards.length,
            byType: Object.fromEntries(Object.values(CardTypes).map(type => [
                type,
                cards.filter(entry => entry.card.type === type).length
            ]))
        }
    };
}
