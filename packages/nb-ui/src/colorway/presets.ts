import type {NbColorwayVars} from "./colorway-contract";

/**
 * nb-ui 内置配色（一套）。
 *
 * 全部基于配色契约（NbColorwayVars）定义，消费方 applyColorway 后所有组件自动换色。
 *
 * 色值取自 NeuroBook 主仓 `app/utils/theme/theme-tokens.ts`，逐字对齐，主仓那份是事实源；
 * 这里只去掉 6 个领域专用变量，并补上 nb-ui 自有的三个。
 *
 * 已下线：`catppuccin` / `dracula` / `monokai` / `one-dark-pro` / `tokyo-night`（程序员暗色主题），
 * `midnight` / `slate`（曾作为它们的接盘配色出过第一版取值，未通过观感确认），
 * 以及 `sepia` / `light`（两套亮色，未通过观感确认）。
 * 旧 id 由 retiredColorwayAliases 承接，不会静默回落到默认配色。
 *
 * 内置只留一套是刻意的：一方只出走查过的配色，其余交给主题自带配色或将来的主题市场，
 * 不在库里堆没人维护的取值。**代价写在明处：库里现在没有亮色配色**——
 * 只装库不装主题的消费方在亮色系统下也会拿到暗色界面。亮色由主题包提供
 * （`macos` 自带 macos-light / macos-dark 两套）。
 *
 * 暗色的隐喻是「夜里的书桌」，不是「把纸调黑」，也不是高饱和紫粉。
 */
export type NbColorwayId = "dark";
export type ColorwayAppearance = "light" | "dark";

/** 配色元信息：展示名与明暗归属。 */
export const nbColorwayMeta: Record<NbColorwayId, {label: string; appearance: ColorwayAppearance}> = {
    dark: {label: "Default Dark", appearance: "dark"},
};

/** 配色 id 列表（用于切换器遍历）。 */
export const nbColorwayIds = Object.keys(nbColorwayMeta) as NbColorwayId[];

/** 默认配色。内置只剩这一套。 */
export const NB_DEFAULT_COLORWAY_ID: NbColorwayId = "dark";

/**
 * 已下线配色 id 的迁移映射。
 *
 * 只作用于**读取旧配置**（localStorage / 持久化设置），不出现在配色选择器里。
 * 没有这一层的话，配色 store 对未知 id 静默回退默认配色，且不给任何提示。
 *
 * 全部指向 `dark`：内置只剩这一套。想要亮色或别的取值，装一套自带配色的主题即可
 * （`macos` 就带亮暗两套）。
 */
export const retiredColorwayAliases: Record<string, NbColorwayId> = {
    dracula: "dark",
    "tokyo-night": "dark",
    catppuccin: "dark",
    monokai: "dark",
    "one-dark-pro": "dark",
    midnight: "dark",
    slate: "dark",
    sepia: "dark",
    light: "dark",
};

// 面板浮层阴影与模态遮罩。亮色那两档随 sepia / light 一起下线，主题自带亮色配色时自己给
const DARK_SHADOW = "0 1px 2px rgba(0, 0, 0, 0.45), 0 20px 48px rgba(0, 0, 0, 0.55)";
const DARK_OVERLAY = "rgba(0, 0, 0, 0.5)";

/** 配色变量表：唯一色值来源。 */
export const nbColorways: Record<NbColorwayId, NbColorwayVars> = {
    dark: {
        "--color-scheme": "dark",
        "--bg-main": "#18181b",
        "--bg-panel": "#252529",
        "--bg-sidebar": "#1e1e22",
        "--bg-subtle": "color-mix(in srgb, #1e1e22 78%, #252529)",
        "--bg-input": "#121214",
        "--bg-hover": "#313137",
        "--text-main": "#fafafa",
        "--text-secondary": "#d4d4d8",
        "--text-muted": "#a1a1aa",
        "--text-inverse": "#000000",
        "--border-color": "#3f3f46",
        "--border-strong": "#4e4e54",
        "--border-accent": "color-mix(in srgb, #f59e0b 46%, #3f3f46)",
        "--accent-main": "#f59e0b",
        "--accent-bg": "rgba(245, 158, 11, 0.15)",
        "--accent-text": "#fbbd23",
        "--status-info": "#60a5fa",
        "--status-info-bg": "rgba(96, 165, 250, 0.16)",
        "--status-info-border": "rgba(96, 165, 250, 0.32)",
        "--status-success": "#22c55e",
        "--status-success-bg": "rgba(34, 197, 94, 0.14)",
        "--status-success-border": "rgba(34, 197, 94, 0.30)",
        "--status-warning": "#f59e0b",
        "--status-warning-bg": "rgba(245, 158, 11, 0.15)",
        "--status-warning-border": "rgba(245, 158, 11, 0.32)",
        "--status-danger": "#fb7185",
        "--status-danger-bg": "rgba(251, 113, 133, 0.14)",
        "--status-danger-border": "rgba(251, 113, 133, 0.32)",
        "--shadow-color": "#000000",
        "--selection-bg": "rgba(245, 158, 11, 0.34)",
        "--shadow-panel": DARK_SHADOW,
        "--overlay-bg": DARK_OVERLAY,
    },
};

/**
 * 历史默认配色别名：与 nbColorways.dark 同源，避免两套「默认色值」漂移。
 * 新代码请直接用 nbColorways。
 *
 * 没有 defaultLightColorway：内置配色只剩 dark，亮色由主题包提供。
 */
export const defaultDarkColorway = nbColorways.dark;
