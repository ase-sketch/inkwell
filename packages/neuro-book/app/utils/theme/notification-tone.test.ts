import {describe, expect, it} from "vitest";
import {colord, extend} from "colord";
import a11yPlugin from "colord/plugins/a11y";
import {resolveNotificationToneColor, sanitizeNotificationVars} from "nbook/app/utils/theme/notification-tone";
import {ideThemeIds, themeTokens, type ThemeVars} from "nbook/app/utils/theme/theme-tokens";
import {resolveTheme} from "nbook/app/utils/theme/resolve-theme";
import type {NotificationTone} from "nbook/app/composables/useNotification";
import type {CustomThemeDto} from "nbook/shared/theme/theme-vars";

extend([a11yPlugin]);

const NOTIFICATION_TONES: NotificationTone[] = ["success", "warning", "info", "error"];

/** tone 与状态变量族的对应关系；error 必须走 danger，info 不借用 accent。 */
const TONE_STATUS: Record<NotificationTone, "success" | "warning" | "info" | "danger"> = {
    success: "success",
    warning: "warning",
    info: "info",
    error: "danger",
};

describe("resolveNotificationToneColor", () => {
    it("maps every tone to its status variable family for all built-in themes", () => {
        for (const themeId of ideThemeIds) {
            const vars = themeTokens[themeId];

            for (const tone of NOTIFICATION_TONES) {
                const status = TONE_STATUS[tone];
                const color = resolveNotificationToneColor(tone, vars);

                expect(colord(color.background).isValid(), `${themeId}/${tone} background should be a color`).toBe(true);
                expect(color.foreground).toBe(vars["--text-main"]);
                expect(color.border).toBe(vars[`--status-${status}-border`]);
                expect(color.badge).toBe(vars[`--status-${status}`]);
            }
        }
    });

    it("keeps text-main readable at WCAG AA on every built-in theme and tone pair", () => {
        for (const themeId of ideThemeIds) {
            const vars = themeTokens[themeId];

            for (const tone of NOTIFICATION_TONES) {
                const color = resolveNotificationToneColor(tone, vars);
                const ratio = colord(color.foreground).contrast(color.background);

                expect(ratio, `${themeId}/${tone} contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it("fills partially defined custom themes through resolveTheme without empty colors", () => {
        const customTheme: CustomThemeDto = {
            id: "custom-night",
            name: "Night Draft",
            appearance: "dark",
            vars: {
                "accent-main": "#ff00aa",
            },
        };
        const {vars} = resolveTheme(customTheme.id, [customTheme]);

        for (const tone of NOTIFICATION_TONES) {
            const color = resolveNotificationToneColor(tone, vars);

            expect(color.background).toBeTruthy();
            expect(color.foreground).toBeTruthy();
            expect(color.border).toBeTruthy();
            expect(color.badge).toBeTruthy();
            expect(colord(color.foreground).contrast(color.background)).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("rejects the previous main-color-on-black recipe that failed WCAG AA", () => {
        // PR #178 的旧配方：状态主色 82% 混黑 + 固定白字，dracula/warning 实测约 1.78:1。
        const legacyBackground = colord(themeTokens.dracula["--status-warning"]).mix("#000000", 0.18);
        const ratio = colord("#ffffff").contrast(legacyBackground.toRgbString());

        expect(ratio).toBeLessThan(4.5);
    });
});

describe("sanitizeNotificationVars", () => {
    it("keeps clean built-in presets unchanged", () => {
        expect(sanitizeNotificationVars(themeTokens.dracula)).toEqual(themeTokens.dracula);
    });

    it("falls back invalid consumed fields to the matching appearance preset", () => {
        const poisoned: ThemeVars = {
            ...themeTokens.dracula,
            "--bg-panel": "not-a-color",
            "--bg-hover": "color-mix(in srgb, red 50%, blue)",
            "--text-main": "",
        };
        const sanitized = sanitizeNotificationVars(poisoned, "dark");

        expect(sanitized["--bg-panel"]).toBe(themeTokens.dark["--bg-panel"]);
        expect(sanitized["--bg-hover"]).toBe(themeTokens.dark["--bg-hover"]);
        expect(sanitized["--text-main"]).toBe(themeTokens.dark["--text-main"]);
        // 未被通知表面消费的键不参与净化
        expect(sanitized["--bg-subtle"]).toBe(poisoned["--bg-subtle"]);
    });
});

describe("resolveNotificationToneColor with invalid theme values", () => {
    it("stays valid and WCAG AA when consumed fields are garbage", () => {
        const poisoned: ThemeVars = {
            ...themeTokens.catppuccin,
            "--bg-panel": "garbage",
            "--status-warning-bg": "###",
        };
        // 非法字段按 dark 家族回退，前景保持 catppuccin，不发生跨明暗混搭
        const safe = sanitizeNotificationVars(poisoned, "dark");

        for (const tone of NOTIFICATION_TONES) {
            const color = resolveNotificationToneColor(tone, safe);

            expect(colord(color.background).isValid(), `${tone} background`).toBe(true);
            expect(color.foreground).toBe(themeTokens.catppuccin["--text-main"]);
            expect(colord(color.foreground).contrast(color.background)).toBeGreaterThanOrEqual(4.5);
        }
    });
});
