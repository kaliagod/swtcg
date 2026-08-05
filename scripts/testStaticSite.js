import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const outputDirectory = path.join(projectRoot, "dist");

for (const requiredPath of [
    "index.html",
    "card-tool.html",
    "css/style.css",
    "css/card-tool.css",
    "js/app.js",
    "js/card-tool.js",
    "assets/cards/placeholder.svg",
    "assets/templates/card-data-template.xlsx",
    "data/cards/starter.json",
    "data/decks/starterDeck.json",
    "data/decks/starterAdventureDeck.json"
]) {
    await assertExists(requiredPath);
}

for (const privatePath of [
    "server.js",
    "server",
    "api",
    ".env",
    ".env.example",
    "js/tests",
    "js/dev.js"
]) {
    await assert.rejects(
        access(path.join(outputDirectory, privatePath)),
        `${privatePath}を静的出力へ含めてはいけません。`
    );
}

for (const htmlPath of ["index.html", "card-tool.html"]) {
    await verifyHtmlReferences(htmlPath);
}
await verifyImagePaths();

console.log("Static site references: OK");

async function assertExists(relativePath) {
    await access(path.join(outputDirectory, relativePath));
}

async function verifyHtmlReferences(relativePath) {
    const absolutePath = path.join(outputDirectory, relativePath);
    const html = await readFile(absolutePath, "utf8");
    const references = [...html.matchAll(
        /(?:href|src)=["']([^"'#]+)["']/g
    )].map(match => match[1]);
    for (const reference of references) {
        if (/^(?:https?:|data:|mailto:)/i.test(reference)) {
            continue;
        }
        const target = path.resolve(
            path.dirname(absolutePath),
            reference.split(/[?#]/)[0]
        );
        assert.ok(
            target === outputDirectory ||
                target.startsWith(`${outputDirectory}${path.sep}`),
            `${relativePath}の参照が出力先外を指しています: ${reference}`
        );
        await access(target);
    }
}

async function verifyImagePaths() {
    const jsonFiles = await listFiles(path.join(outputDirectory, "data"));
    for (const jsonFile of jsonFiles.filter(file => file.endsWith(".json"))) {
        const value = JSON.parse(await readFile(jsonFile, "utf8"));
        for (const imagePath of collectImagePaths(value)) {
            await access(path.resolve(outputDirectory, imagePath));
        }
    }
}

async function listFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFiles(absolutePath));
        } else {
            files.push(absolutePath);
        }
    }
    return files;
}

function collectImagePaths(value, results = []) {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectImagePaths(item, results);
        }
    } else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            if (key === "imagePath" && typeof item === "string") {
                results.push(item);
            } else {
                collectImagePaths(item, results);
            }
        }
    }
    return results;
}
