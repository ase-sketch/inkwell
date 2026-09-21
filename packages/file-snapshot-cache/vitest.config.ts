import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
    root: rootDir,
    resolve: {
        alias: {
            nbook: rootDir,
        },
    },
    test: {
        include: ["packages/file-snapshot-cache/tests/**/*.test.ts"],
        environment: "node",
        setupFiles: ["@notnotype/neuro-book-test-support/vitest"],
        globalSetup: ["@notnotype/neuro-book-test-support/vitest"],
        testTimeout: 20_000,
    },
});
