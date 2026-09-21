import {fileURLToPath} from "node:url";

import {defineConfig} from "vitest/config";

/** Manager clean-checkout合同不加载Nuxt或Agent测试的全局fixture。 */
const rootDir = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
    root: rootDir,
    resolve: {
        alias: {
            nbook: rootDir,
        },
    },
    test: {
        environment: "node",
        setupFiles: ["@notnotype/neuro-book-test-support/vitest"],
        globalSetup: ["@notnotype/neuro-book-test-support/vitest"],
        include: ["scripts/release/manager-release-contract.test.ts"],
    },
});
