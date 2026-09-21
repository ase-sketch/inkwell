import {defineConfig} from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
    plugins: [vue()],
    test: {
        globals: true,
        environment: "happy-dom",
        // e2e/ 是 Playwright 用例，由 test:e2e 单独跑，vitest 不扫
        exclude: ["e2e/**", "**/node_modules/**"],
    },
});
