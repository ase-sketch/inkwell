import {installTheme} from "../../src/theme/theme-loader";
import auroraTheme from "../../themes/aurora";
import editorialTheme from "../../themes/editorial";
import macosTheme from "../../themes/macos";
import nbookTheme from "../../themes/nbook";

/**
 * playground 装了哪些主题。
 *
 * 单独一个模块而不是塞进某个 composable，是为了**固定求值顺序**：配色 store 在创建时
 * 就把配色表定死了，所以「装主题」必须先于「建配色 store」发生。两个 composable 都从
 * 这里 import，ES 模块的求值顺序保证本文件的副作用先跑完。
 *
 * 装载顺序 = 主题切换器里的显示顺序（getInstalledThemes 按装载顺序返回）。
 *
 * 四套主题走的是**同一条装载路径**：默认主题不享受任何特殊待遇。这是刻意的——
 * 主题包格式先在自己身上被验证一遍，只有一条代码路径。
 */
for (const module of [nbookTheme, macosTheme, editorialTheme, auroraTheme]) {
    installTheme(module);
}

export const PLAYGROUND_DEFAULT_THEME = nbookTheme.manifest.id;

/**
 * 默认配色取自默认主题 manifest 的 `defaultColorway.dark`，不在这里另抄一份 id。
 *
 * 抄一份的话，主题换了自带配色而 playground 忘了跟，表现是一进来就撞见一套主题没调过的
 * 颜色——正是 `defaultColorway` 这个字段存在的意义。它是**默认值不是约束**，用户切走后
 * 由配色 store 自己持久化。
 */
export const PLAYGROUND_DEFAULT_COLORWAY = nbookTheme.manifest.defaultColorway?.dark ?? "dark";
