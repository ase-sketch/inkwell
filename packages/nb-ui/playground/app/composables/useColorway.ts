import {createColorwayStore} from "../../../src/colorway";
import {nbColorwayMeta, nbColorways} from "../../../src/colorway/presets";
import {collectThemeColorways} from "../../../src/theme/theme-loader";
import {PLAYGROUND_DEFAULT_COLORWAY} from "../installed-themes";

/**
 * playground 的配色会话（模块层单例）。
 * 画廊页需要在同一套配色下渲染，所以不能每个页面各建一个 store。
 *
 * 配色表 = 内置的 + 已装主题自带的。合并这一步必须由消费方做，因为 store 的表在创建时
 * 就定死了；`collectThemeColorways()` 只是免得每个消费方各写一遍 reduce。
 * 顺序上依赖 ../installed-themes 先求值完（见该文件的说明）。
 *
 * 默认配色来自默认主题自带的那套暗色，不是库内置的 dark——库内置只剩一套通用暗色，
 * 玻璃在它上面会发灰（见 themes/macos/colorways.ts）。
 *
 * 持久化键从 `nb-ui-playground-theme` 改成 `-colorway`：`-theme` 现在归主题轴
 * （见 ./useTheme.ts）。旧值会被主题轴当作未装的主题拒掉并回落到默认主题，
 * playground 是开发工程，不为此加迁移层。
 */
const fromThemes = collectThemeColorways();

const store = createColorwayStore<string>({
    storageKey: "nb-ui-playground-colorway",
    defaultId: PLAYGROUND_DEFAULT_COLORWAY,
    colorways: {...nbColorways, ...fromThemes.colorways},
    meta: {...nbColorwayMeta, ...fromThemes.colorwayMeta},
});

export function useColorway() {
    return store;
}
