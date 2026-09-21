import {builtInThemeIds, themeVarNames, type BuiltInThemeId, type CustomThemeDto, type ThemeAppearance, type ThemeVarName} from "nbook/shared/theme/theme-vars";
import {themeMeta, themeTokens, type ThemeVars} from "nbook/app/utils/theme/theme-tokens";

const builtInThemeIdSet = new Set<string>(builtInThemeIds);
const DEFAULT_THEME_ID: BuiltInThemeId = "sepia";

export type ResolvedTheme = {
    id: string;
    label: string;
    appearance: ThemeAppearance;
    vars: ThemeVars;
    builtIn: boolean;
};

/**
 * 判断主题 ID 是否为内置预设。
 */
export function isBuiltInThemeId(themeId: string): themeId is BuiltInThemeId {
    return builtInThemeIdSet.has(themeId);
}

/**
 * 复制完整变量表，避免调用方误改内置预设。
 */
function cloneThemeVars(vars: ThemeVars): ThemeVars {
    return {...vars};
}

/**
 * 把 DTO 中不带 `--` 的变量名转换为 CSS 变量名。
 */
function customVarsToThemeVars(vars: CustomThemeDto["vars"]): Partial<ThemeVars> {
    const result: Partial<ThemeVars> = {};
    for (const name of themeVarNames) {
        const value = vars[name as ThemeVarName];
        if (typeof value === "string" && value.trim()) {
            result[`--${name}`] = value;
        }
    }
    return result;
}

/**
 * 解析内置或自定义主题。未知 ID 回退 sepia；自定义主题缺键按 appearance 合并内置预设。
 */
export function resolveTheme(themeId: string, customThemes: CustomThemeDto[] = []): ResolvedTheme {
    if (isBuiltInThemeId(themeId)) {
        return {
            id: themeId,
            label: themeMeta[themeId].label,
            appearance: themeMeta[themeId].appearance,
            vars: cloneThemeVars(themeTokens[themeId]),
            builtIn: true,
        };
    }

    const customTheme = customThemes.find((theme) => theme.id === themeId);
    if (customTheme) {
        const baseThemeId: BuiltInThemeId = customTheme.appearance === "dark" ? "dark" : "sepia";
        return {
            id: customTheme.id,
            label: customTheme.name,
            appearance: customTheme.appearance,
            vars: {
                ...themeTokens[baseThemeId],
                ...customVarsToThemeVars(customTheme.vars),
            },
            builtIn: false,
        };
    }

    return {
        id: DEFAULT_THEME_ID,
        label: themeMeta[DEFAULT_THEME_ID].label,
        appearance: themeMeta[DEFAULT_THEME_ID].appearance,
        vars: cloneThemeVars(themeTokens[DEFAULT_THEME_ID]),
        builtIn: true,
    };
}
