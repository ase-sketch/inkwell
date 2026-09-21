import type { ThemeVars } from "./theme-tokens";
import { themeVarKeys } from "./theme-tokens";

/**
 * 清理宿主节点上的所有主题变量。
 */
export const clearThemeVars = (host: HTMLElement): void => {
    for (const key of themeVarKeys) {
        host.style.removeProperty(key);
    }
};

/**
 * 将主题变量显式写入宿主节点。
 */
export const applyThemeVars = (host: HTMLElement, vars: ThemeVars): void => {
    clearThemeVars(host);

    for (const [key, value] of Object.entries(vars) as Array<[`--${string}`, string]>) {
        host.style.setProperty(key, value);
    }
};
