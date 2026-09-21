import type { Ref } from "vue";
import { applyThemeVars } from "nbook/app/utils/theme/apply-theme";
import { IDE_THEME_HOST_CLASS, type ThemeVars } from "nbook/app/utils/theme/theme-tokens";
import {resolveTheme} from "nbook/app/utils/theme/resolve-theme";
import type {CustomThemeDto} from "nbook/shared/theme/theme-vars";

const themeHost = shallowRef<HTMLElement | null>(null);
const emptyCustomThemes = shallowRef<CustomThemeDto[]>([]);

/**
 * 把变量表应用到当前宿主节点。
 */
const applyVarsToHost = (vars: ThemeVars): void => {
    if (!themeHost.value) {
        return;
    }

    themeHost.value.classList.add(IDE_THEME_HOST_CLASS);
    applyThemeVars(themeHost.value, vars);
};

/**
 * 把外部主题状态挂到 IDE 宿主元素上。
 */
export const useIdeTheme = (
    themeId: Ref<string>,
    customThemes: Ref<CustomThemeDto[]> = emptyCustomThemes,
    varsSnapshot?: Ref<ThemeVars | null>,
) => {
    /**
     * 解析并应用当前主题。
     */
    const applyThemeToHost = (): void => {
        applyVarsToHost(resolveTheme(themeId.value, customThemes.value).vars);
    };

    /**
     * 挂载主题宿主。
     */
    const mountThemeHost = (host: HTMLElement | null): void => {
        themeHost.value = host;
        if (varsSnapshot?.value) {
            applyVarsToHost(varsSnapshot.value);
            return;
        }
        applyThemeToHost();
    };

    /**
     * 切换主题。
     */
    const setTheme = (nextThemeId: string): void => {
        themeId.value = nextThemeId;
        applyThemeToHost();
    };

    watch([themeId, customThemes], applyThemeToHost, {deep: true});

    return {
        mountThemeHost,
        setTheme,
        applyThemeToHost,
    };
};
