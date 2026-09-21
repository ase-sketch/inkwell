import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        root: import.meta.dirname,
        environment: "node",
        setupFiles: ["@notnotype/neuro-book-test-support/vitest"],
        globalSetup: ["@notnotype/neuro-book-test-support/vitest"],
        include: ["src/**/*.test.ts"],
    },
});
