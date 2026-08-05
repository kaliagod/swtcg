import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const outputDirectory = path.join(projectRoot, "dist");
const staticEntries = [
    "index.html",
    "card-tool.html",
    "css",
    "js",
    "assets",
    "data"
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const entry of staticEntries) {
    const source = path.join(projectRoot, entry);
    const destination = path.join(outputDirectory, entry);
    await cp(source, destination, {
        recursive: true,
        filter: sourcePath => shouldCopy(entry, sourcePath)
    });
}

console.log(`Static site built: ${outputDirectory}`);

function shouldCopy(entry, sourcePath) {
    if (entry !== "js") {
        return true;
    }
    const relativePath = path.relative(
        path.join(projectRoot, "js"),
        sourcePath
    );
    return relativePath !== "dev.js" &&
        relativePath !== "tests" &&
        !relativePath.startsWith(`tests${path.sep}`);
}
