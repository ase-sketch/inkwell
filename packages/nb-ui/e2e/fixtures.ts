import { test as base, expect } from "@playwright/test";

// 全局 fixture：每个用例收集 console.error 与 pageerror，用例结束断言两者为空。
// 验收标准：控制台 error 与 pageerror 均为 0。
export const test = base.extend<{ consoleGuard: void }>({
    consoleGuard: [
        async ({ page }, use) => {
            const consoleErrors: string[] = [];
            const pageErrors: string[] = [];
            page.on("console", (msg) => {
                if (msg.type() === "error") consoleErrors.push(msg.text());
            });
            page.on("pageerror", (err) => pageErrors.push(String(err)));
            await use();
            expect(consoleErrors, "console.error 应为 0").toEqual([]);
            expect(pageErrors, "pageerror 应为 0").toEqual([]);
        },
        { auto: true },
    ],
});

export { expect };
