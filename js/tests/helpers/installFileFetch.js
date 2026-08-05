import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultProjectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.."
);

export default function installFileFetch({
    projectRoot = defaultProjectRoot
} = {}) {
    const previousFetch = globalThis.fetch;

    globalThis.fetch = async requestPath => {
        const relativePath = String(requestPath)
            .replace(/^https?:\/\/[^/]+\//, "")
            .replace(/^\.\//, "");
        const filePath = path.resolve(projectRoot, relativePath);

        if (
            filePath !== projectRoot &&
            !filePath.startsWith(`${projectRoot}${path.sep}`)
        ) {
            return createResponse(null, 403);
        }

        try {
            const text = await readFile(filePath, "utf8");
            return createResponse(text, 200);
        } catch (error) {
            if (error.code === "ENOENT") {
                return createResponse(null, 404);
            }
            throw error;
        }
    };

    return () => {
        globalThis.fetch = previousFetch;
    };
}

function createResponse(text, status) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            if (text === null) {
                throw new Error("レスポンス本文がありません。");
            }
            return JSON.parse(text);
        },
        async text() {
            return text ?? "";
        }
    };
}
