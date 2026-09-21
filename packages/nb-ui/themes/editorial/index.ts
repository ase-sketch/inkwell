import type {NbThemeModule} from "../../src/theme/theme-manifest";
import {manifest} from "./manifest";

/**
 * 运行期入口。CSS 由入口自己 import，交给打包器——加载器不碰 CSS 文本。
 *
 * 代价写在明处：所有**已装**主题的 CSS 都在产物里，靠 `[data-nb-theme]` 选中，
 * 体积随「装了几套」增长，不随「当前是哪套」。
 */
import "./vars.css";

export const editorialTheme: NbThemeModule = {manifest};

export default editorialTheme;
