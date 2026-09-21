import { test, expect } from "./fixtures";

test.use({ viewport: { width: 1440, height: 800 } });

const combos = [
    { theme: "nbook", colorway: "macos-light", name: "nbook-macos-light" },
    { theme: "nbook", colorway: "nbook-dark", name: "nbook-dark" },
    { theme: "macos", colorway: "macos-light", name: "macos-light" },
    { theme: "macos", colorway: "macos-dark", name: "macos-dark" },
    { theme: "editorial", colorway: "nbook-light", name: "editorial-light" },
    { theme: "editorial", colorway: "dark", name: "editorial-dark" },
    { theme: "aurora", colorway: "macos-light", name: "aurora-light" },
    { theme: "aurora", colorway: "dark", name: "aurora-dark" },
];

test.describe("视觉基线", () => {
    for (const combo of combos) {
        test(`4 主题 × 明暗配色：${combo.name}`, async ({ page }) => {
            await page.goto(`/lab?component=form-input&scene=default&viewport=responsive&theme=${combo.theme}&colorway=${combo.colorway}`);
            await page.locator("#nb-lab-target").waitFor();
            await page.waitForTimeout(500);
            await expect(page).toHaveScreenshot(`visual-${combo.name}.png`);
        });
    }

    for (const component of ["button", "tabs", "switch-field", "segmented-control"]) {
        test(`组件基准：${component}`, async ({ page }) => {
            await page.goto(`/lab?component=${component}&scene=default&viewport=responsive&theme=nbook&colorway=macos-light`);
            await page.locator("#nb-lab-target").waitFor();
            await page.waitForTimeout(400);
            await expect(page).toHaveScreenshot(`visual-${component}.png`);
        });
    }

    test("窄屏 390 视口基准", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/lab?component=form-input&scene=default&viewport=responsive&theme=nbook&colorway=macos-light");
        await page.locator("#nb-lab-target").waitFor();
        await page.waitForTimeout(500);
        await expect(page).toHaveScreenshot("visual-narrow-390.png");
    });
});
