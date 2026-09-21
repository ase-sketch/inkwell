import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {defineConfig} from "vitest/config";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const applicationSourceRoot = resolve(repositoryRoot, "packages/neuro-book");

export default defineConfig({
    root: repositoryRoot,
    resolve: {
        alias: {
            "#scripts": resolve(repositoryRoot, "scripts"),
            nbook: applicationSourceRoot,
        },
    },
    test: {
        environment: "node",
        globals: true,
        maxWorkers: 2,
        hookTimeout: 60_000,
        globalSetup: ["@notnotype/neuro-book-test-support/vitest"],
        setupFiles: ["@notnotype/neuro-book-test-support/vitest"],
        include: [
            "scripts/build/**/*.test.ts",
            "scripts/ci/**/*.test.ts",
            "scripts/deploy/**/*.test.ts",
            "scripts/install/**/*.test.ts",
            "scripts/maintenance/**/*.test.ts",
            "scripts/release/**/*.test.ts",
            "scripts/utils/**/*.test.ts",
        ],
    },
});
