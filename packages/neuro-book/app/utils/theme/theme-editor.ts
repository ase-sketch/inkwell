import {colord} from "colord";
import {CORE_VAR_KEYS, deriveDefaults, type ThemeCoreVars} from "nbook/app/utils/theme/derive";
import {resolveTheme} from "nbook/app/utils/theme/resolve-theme";
import type {ThemeVars} from "nbook/app/utils/theme/theme-tokens";
import {themeVarNames, type CustomThemeDto, type ThemeAppearance, type ThemeVarName} from "nbook/shared/theme/theme-vars";

const CUSTOM_THEME_ID_PREFIX = "custom-";

/**
 * 生成符合 Global Config normalizer 约束的自定义主题 ID。
 */
export function createCustomThemeId(name: string, existingThemes: CustomThemeDto[]): string {
    const existingIds = new Set(existingThemes.map((theme) => theme.id));
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "") || "theme";
    const baseId = `${CUSTOM_THEME_ID_PREFIX}${slug}`;
    let nextId = baseId;
    let suffix = 2;
    while (existingIds.has(nextId)) {
        nextId = `${baseId}-${suffix}`;
        suffix += 1;
    }
    return nextId;
}

/**
 * 用一个临时自定义主题把无前缀变量解析成完整 CSS 变量表。
 */
export function resolveDraftThemeVars(theme: Pick<CustomThemeDto, "id" | "name" | "appearance" | "vars">): ThemeVars {
    return resolveTheme(theme.id, [{
        id: theme.id,
        name: theme.name,
        appearance: theme.appearance,
        vars: theme.vars,
    }]).vars;
}

/**
 * 从当前 draft 中提取核心变量；缺失时按 appearance 兜底补齐。
 */
export function readCoreVars(vars: CustomThemeDto["vars"], appearance: ThemeAppearance): ThemeCoreVars {
    const resolvedVars = resolveDraftThemeVars({
        id: "custom-editor-draft",
        name: "Draft",
        appearance,
        vars,
    });
    const result = {} as ThemeCoreVars;
    for (const key of CORE_VAR_KEYS) {
        result[key] = vars[key] ?? resolvedVars[`--${key}`];
    }
    return result;
}

/**
 * 重新派生非核心变量，并保留核心变量当前值。
 */
export function regenerateDerivedVars(vars: CustomThemeDto["vars"], appearance: ThemeAppearance): CustomThemeDto["vars"] {
    const coreVars = readCoreVars(vars, appearance);
    return {
        ...vars,
        ...deriveDefaults(coreVars, appearance),
    };
}

/**
 * 把 ThemeVars 转为自定义主题 JSON 使用的无前缀变量名。
 */
export function themeVarsToCustomVars(vars: ThemeVars): CustomThemeDto["vars"] {
    const result: CustomThemeDto["vars"] = {};
    for (const key of themeVarNames) {
        const cssValue = vars[`--${key}`];
        result[key] = resolveCssColorValue(cssValue, cssValue);
    }
    return result;
}

/**
 * 浏览器端把 color-mix/color(srgb) 等 CSS 表达式解析为取色器可读颜色。
 */
export function resolveCssColorValue(value: string, fallback: string): string {
    if (colord(value).isValid()) {
        return value;
    }
    if (!import.meta.client || !globalThis.document) {
        return fallback;
    }

    const probe = document.createElement("span");
    probe.style.color = value;
    if (!probe.style.color) {
        return fallback;
    }
    probe.style.position = "fixed";
    probe.style.pointerEvents = "none";
    probe.style.opacity = "0";
    (document.body ?? document.documentElement).appendChild(probe);
    const computedColor = getComputedStyle(probe).color;
    probe.remove();
    return normalizeComputedColor(computedColor, fallback);
}

/**
 * 归一化浏览器 computed color，兼容 Chromium 对 color-mix 的 color(srgb ...) 输出。
 */
function normalizeComputedColor(value: string, fallback: string): string {
    const directColor = colord(value);
    if (directColor.isValid()) {
        return directColor.alpha() < 1 ? directColor.toRgbString() : directColor.toHex();
    }

    const srgbMatch = value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/u);
    if (!srgbMatch) {
        return fallback;
    }

    const color = colord({
        r: Math.round(Number(srgbMatch[1]) * 255),
        g: Math.round(Number(srgbMatch[2]) * 255),
        b: Math.round(Number(srgbMatch[3]) * 255),
        a: srgbMatch[4] ? Number(srgbMatch[4]) : 1,
    });
    return color.alpha() < 1 ? color.toRgbString() : color.toHex();
}
