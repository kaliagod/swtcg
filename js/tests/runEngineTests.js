import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const excludedTests = new Set([
    "testUiBasicOperations.js"
]);

const testFiles = (await readdir(testsDirectory, {
    withFileTypes: true
}))
    .filter(entry =>
        entry.isFile() &&
        /^test.+\.js$/.test(entry.name) &&
        !excludedTests.has(entry.name)
    )
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));

if (testFiles.length === 0) {
    throw new Error("実行対象のエンジンテストが見つかりません。");
}

const failures = [];
for (const testFile of testFiles) {
    const result = await runTestFile(testFile);
    if (result.code === 0) {
        console.log(`OK  ${testFile}`);
        continue;
    }

    failures.push(testFile);
    console.error(`FAIL ${testFile}`);
    if (result.stdout.length > 0) {
        console.error(result.stdout.trimEnd());
    }
    if (result.stderr.length > 0) {
        console.error(result.stderr.trimEnd());
    }
}

if (failures.length > 0) {
    throw new Error(
        `${failures.length}件のエンジンテストが失敗しました: ${failures.join(", ")}`
    );
}

console.log(`Engine test files: ${testFiles.length} OK`);

function runTestFile(testFile) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [path.join(testsDirectory, testFile)],
            {
                cwd: path.resolve(testsDirectory, "../.."),
                stdio: ["ignore", "pipe", "pipe"]
            }
        );
        let stdout = "";
        let stderr = "";

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", chunk => {
            stdout += chunk;
        });
        child.stderr.on("data", chunk => {
            stderr += chunk;
        });
        child.once("error", reject);
        child.once("exit", code => {
            resolve({ code, stdout, stderr });
        });
    });
}
