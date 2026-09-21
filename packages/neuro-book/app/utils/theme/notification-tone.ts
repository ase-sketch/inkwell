import {colord, extend} from "colord";
import mixPlugin from "colord/plugins/mix";
import type {ThemeAppearance} from "nbook/shared/theme/theme-vars";
import type {NotificationTone} from "nbook/app/composables/useNotification";
import {themeTokens, type ThemeVarKey, type ThemeVars} from "nbook/app/utils/theme/theme-tokens";

extend([mixPlugin]);

/**
 * 通知表面消费的主题变量。这些键在 8 套内置主题中均为具体颜色字面值；
 * 自定义主题的服务端归一化只保证键名与字符串类型（server/config/normalizer.ts 的
 * normalizeThemeVars），不校验颜色语法，因此消费端必须逐字段兜底。
 */
const CONSUMED_VAR_KEYS: readonly ThemeVarKey[] = [
    "--bg-panel",
    "--bg-hover",
    "--text-main",
    "--text-muted",
    "--status-success",
    "--status-success-bg",
    "--status-success-border",
    "--status-warning",
    "--status-warning-bg",
    "--status-warning-border",
    "--status-info",
    "--status-info-bg",
    "--status-info-border",
    "--status-danger",
    "--status-danger-bg",
    "--status-danger-border",
];

function isUsableColor(value: unknown): value is string {
    return typeof value === "string" && colord(value).isValid();
}

/**
 * 逐字段回退的捐赠预设：与当前主题同明暗家族（light→sepia，dark→dark），
 * 避免非法字段回退后前景/背景跨明暗家族混搭导致对比度塌陷。
 */
const FALLBACK_PRESETS: Record<ThemeAppearance, ThemeVars> = {
    light: themeTokens.sepia,
    dark: themeTokens.dark,
};

/**
 * 净化主题快照中通知消费的字段：缺失、空串、非颜色或 `color-mix(...)` 表达式
 * 一律逐字段回退到 appearance 对应的内置预设，保证下游混色与对比度计算只见具体颜色。
 * 未消费的键原样保留；函数幂等。
 */
export function sanitizeNotificationVars(vars: ThemeVars, appearance: ThemeAppearance = "light"): ThemeVars {
    const fallback = FALLBACK_PRESETS[appearance];
    const result = {...vars};
    for (const key of CONSUMED_VAR_KEYS) {
        if (!isUsableColor(result[key])) {
            result[key] = fallback[key];
        }
    }
    return result;
}

/**
 * tone 到状态变量三件套的映射；error 固定走 danger，info 固定走 info，不借用 accent。
 */
const TONE_VAR_KEYS: Record<NotificationTone, {main: ThemeVarKey; bg: ThemeVarKey; border: ThemeVarKey}> = {
    success: {main: "--status-success", bg: "--status-success-bg", border: "--status-success-border"},
    warning: {main: "--status-warning", bg: "--status-warning-bg", border: "--status-warning-border"},
    info: {main: "--status-info", bg: "--status-info-bg", border: "--status-info-border"},
    error: {main: "--status-danger", bg: "--status-danger-bg", border: "--status-danger-border"},
};

export type NotificationToneColor = {
    /** 卡片背景：状态软底与 --bg-panel 的合成色，具体颜色值而非 var() 引用（通知视口挂在主题宿主外）。 */
    background: string;
    /** 标题与正文前景，取 --text-main，与背景同源配对。 */
    foreground: string;
    /** 卡片边框，取状态软边框变量。 */
    border: string;
    /** 状态圆点徽标底色，取状态主色。 */
    badge: string;
};

/**
 * 卡片背景中状态软底变量的权重；其余部分混入 --bg-panel。
 * 该配比在 8 套内置主题下保证 --text-main 对合成背景的 WCAG AA（>=4.5）对比度，
 * 由 app/utils/theme/notification-tone.test.ts 锁定；调整前必须先跑该矩阵。
 */
const STATUS_BG_MIX_RATIO = 0.14;

/**
 * 把一个通知 tone 解析为背景/前景/边框/徽标的配对颜色。
 *
 * 入参须是已解析的完整变量表（如 novelIdeStore.themeVarsSnapshot 或 themeTokens 预设）；
 * 内部先按 light 家族做逐字段净化，组件侧应传入经
 * `sanitizeNotificationVars(vars, activeThemeAppearance)` 净化的快照以获得正确明暗回退。
 * 输出具体颜色值而不是 var(...) 引用：通知视口位于 .novel-ide-theme 宿主外，
 * 直接写 CSS 变量只会命中 :root 的 sepia fallback，无法跟随当前主题。
 * WCAG AA 对比度保证仅覆盖 8 套内置主题（notification-tone.test.ts 锁定）。
 * 自定义主题只经语法校验：若用户把 --text-main 与 --bg-panel 配成相近色，
 * 本组件与全 IDE 其他消费点同样退化；对比度强制属主题编辑器合同，不在此处兜底。
 */
export function resolveNotificationToneColor(tone: NotificationTone, vars: ThemeVars): NotificationToneColor {
    const safeVars = sanitizeNotificationVars(vars);
    const keys = TONE_VAR_KEYS[tone];
    const background = colord(safeVars[keys.bg]).mix(colord(safeVars["--bg-panel"]), 1 - STATUS_BG_MIX_RATIO).toRgbString();

    return {
        background,
        foreground: safeVars["--text-main"],
        border: safeVars[keys.border],
        badge: safeVars[keys.main],
    };
}
