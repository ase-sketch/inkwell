import {colord, extend} from "colord";
import mixPlugin from "colord/plugins/mix";
import {themeVarNames, type ThemeAppearance, type ThemeVarName} from "nbook/shared/theme/theme-vars";

extend([mixPlugin]);

export const CORE_VAR_KEYS = [
    "bg-main",
    "bg-panel",
    "bg-sidebar",
    "bg-input",
    "text-main",
    "text-secondary",
    "text-muted",
    "border-color",
    "accent-main",
    "status-info",
    "status-success",
    "status-warning",
    "status-danger",
] as const satisfies readonly ThemeVarName[];

export type CoreThemeVarName = typeof CORE_VAR_KEYS[number];
export type DerivedThemeVarName = Exclude<ThemeVarName, CoreThemeVarName>;
export type ThemeCoreVars = Record<CoreThemeVarName, string>;
export type ThemeDerivedVars = Record<DerivedThemeVarName, string>;

const coreVarKeySet = new Set<string>(CORE_VAR_KEYS);
export const DERIVED_VAR_KEYS = themeVarNames.filter((key): key is DerivedThemeVarName => !coreVarKeySet.has(key));

/**
 * 带透明度输出为 rgba，方便 CSS 变量直接消费。
 */
function alpha(color: string, value: number): string {
    return colord(color).alpha(value).toRgbString();
}

/**
 * 按明暗模式调节亮度。
 */
function lightness(color: string, appearance: ThemeAppearance, amount: number): string {
    return appearance === "dark"
        ? colord(color).lighten(amount).toHex()
        : colord(color).darken(amount).toHex();
}

/**
 * 混合两个颜色并输出 hex。
 */
function mix(left: string, right: string, ratio: number): string {
    return colord(left).mix(right, ratio).toHex();
}

/**
 * 根据核心 13 色派生其余 23 个主题变量。派生值只作为自定义主题编辑器默认值。
 */
export function deriveDefaults(coreVars: ThemeCoreVars, appearance: ThemeAppearance): ThemeDerivedVars {
    const panel = coreVars["bg-panel"];
    const main = coreVars["bg-main"];
    const input = coreVars["bg-input"];
    const border = coreVars["border-color"];
    const accent = coreVars["accent-main"];
    const hoverTextMix = appearance === "dark" ? 0.12 : 0.08;
    const editorPanelMix = appearance === "dark" ? 0.7 : 0.55;

    return {
        "bg-subtle": mix(panel, main, 0.5),
        "bg-hover": mix(input, coreVars["text-main"], hoverTextMix),
        "text-inverse": appearance === "dark" ? "#000000" : "#ffffff",
        "border-strong": lightness(border, appearance, 0.08),
        "border-accent": mix(border, accent, 0.46),
        "accent-bg": alpha(accent, 0.15),
        "accent-text": lightness(accent, appearance, 0.12),
        "status-info-bg": alpha(coreVars["status-info"], 0.14),
        "status-info-border": alpha(coreVars["status-info"], 0.32),
        "status-success-bg": alpha(coreVars["status-success"], 0.14),
        "status-success-border": alpha(coreVars["status-success"], 0.30),
        "status-warning-bg": alpha(coreVars["status-warning"], 0.14),
        "status-warning-border": alpha(coreVars["status-warning"], 0.32),
        "status-danger-bg": alpha(coreVars["status-danger"], 0.14),
        "status-danger-border": alpha(coreVars["status-danger"], 0.32),
        "editor-bg": mix(panel, main, editorPanelMix),
        "source-bg": input,
        "source-text": coreVars["text-main"],
        "source-muted": coreVars["text-muted"],
        "shadow-color": appearance === "dark" ? "#000000" : "#0f172a",
        "selection-bg": alpha(accent, appearance === "dark" ? 0.34 : 0.28),
        "toolbar-bg": alpha(panel, 0.92),
        "chat-ai-bg": mix(panel, accent, appearance === "dark" ? 0.12 : 0.05),
    };
}
