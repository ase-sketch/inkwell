import type {NbThemeModule} from "../../src/theme/theme-manifest";
import {nbookSvgDefs} from "./assets/lens";
import {nbookColorwayMeta, nbookColorways} from "./colorways";
import {manifest} from "./manifest";

import "./vars.css";

/**
 * 第一档主题（声明式）：变量声明 + 取值 + 自带配色 + SVG 资源，没有组件覆盖。
 *
 * 产品默认主题走的是和第三方主题**完全相同**的一条装载路径，不享受任何特殊待遇——
 * 主题包格式先在自己身上被验证一遍，库里只有一条代码路径。
 */
export const nbookTheme: NbThemeModule = {
    manifest,
    colorways: nbookColorways,
    colorwayMeta: nbookColorwayMeta,
    svgDefs: nbookSvgDefs,
};

export default nbookTheme;
