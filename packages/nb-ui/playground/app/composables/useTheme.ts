import {createThemeStore} from "../../../src/theme/theme-store";
import {PLAYGROUND_DEFAULT_THEME} from "../installed-themes";

/**
 * 主题（theme）会话。与配色（colorway）会话是两条独立的轴：
 * 配色管颜色，主题管形状 / 节奏 / 装饰 / 角色映射，任意组合都应该成立。
 *
 * 这个 composable 现在只是主题登记表的一层薄壳——名称、简介、自带配色全部来自各包的
 * manifest，playground 不再手写任何一份主题元信息。批 3 之前这里有一张手抄的 meta 表，
 * 它与主题包一定会漂移，删掉了。
 *
 * 模块层单例：所有页面共享同一个主题状态，否则跨页切换会丢。
 */
const store = createThemeStore({
    storageKey: "nb-ui-playground-theme",
    defaultId: PLAYGROUND_DEFAULT_THEME,
});

export function useTheme() {
    return store;
}
