export const NB_UI_COLORWAY_HOST_CLASS = "nb-ui-colorway";

/**
 * **配色**契约：切换配色时会变的颜色变量，全部在这里登记。
 *
 * 三层术语里的最底层：配色只管颜色。形状 / 节奏 / 装饰归**主题**（见 `src/theme/`），
 * 主题可以按配色的明暗属性（`data-nb-appearance`）分档，但不该绑定某个配色的身份。
 *
 * 与 NeuroBook 主仓 `app/utils/theme/` 的 36 变量总表对齐——主仓 36 个里除去 6 个领域专用的
 * （`--editor-bg`、`--source-bg`、`--source-text`、`--source-muted`、`--toolbar-bg`、`--chat-ai-bg`）
 * 全部进入本契约，再加 nb-ui 自有的 3 个（`--color-scheme`、`--shadow-panel`、`--overlay-bg`），共 33 个。
 *
 * 排版 / 间距 / 圆角 / 层级 / 动效这五组 token **不在这里**——它们不随配色变化，
 * 事实源在 `src/tokens.css`，名单见 `src/theme/tokens.ts`。
 */
export const nbColorwayVarKeys = [
    // 浏览器原生 UI 的明暗（滚动条、原生下拉、表单控件）
    "--color-scheme",

    // 背景层次
    "--bg-main",
    "--bg-panel",
    "--bg-sidebar",
    "--bg-subtle",
    "--bg-input",
    "--bg-hover",

    // 文本层次
    "--text-main",
    "--text-secondary",
    "--text-muted",
    "--text-inverse",

    // 边框
    "--border-color",
    "--border-strong",
    "--border-accent",

    // 强调色（选中 / 当前项 / 主操作）
    "--accent-main",
    "--accent-bg",
    "--accent-text",

    // 状态色体系：info 运行中/引用/说明、success 完成、warning 草稿/未保存、danger 错误/删除。
    // 每档三件套（主色 / 底色 / 边框色），与主仓 AGENTS.md 的状态色约定同构。
    "--status-info",
    "--status-info-bg",
    "--status-info-border",
    "--status-success",
    "--status-success-bg",
    "--status-success-border",
    "--status-warning",
    "--status-warning-bg",
    "--status-warning-border",
    "--status-danger",
    "--status-danger-bg",
    "--status-danger-border",

    // 投影基色与选区。--elevation-* token 由 --shadow-color 推导，见 src/tokens.css
    "--shadow-color",
    "--selection-bg",

    // nb-ui 自有：完整阴影值与遮罩底色，主仓无对应变量。
    // TODO(阶段 3)：--shadow-panel 与 --elevation-popover / --elevation-dialog 职责重叠，
    // 待 .nb-ui-popover-surface 改为消费 --elevation-* 后移除。
    "--shadow-panel",
    "--overlay-bg",
] as const;

export type NbColorwayVarKey = typeof nbColorwayVarKeys[number];

/**
 * 组件库消费的基础 CSS 变量。
 * 产品可以补充额外 --* 变量；库组件只依赖 nbColorwayVarKeys 中的公共变量。
 * 内置色值预设见 ./presets.ts（defaultDarkColorway / defaultLightColorway 也在那里，与预设同源）。
 */
export type NbColorwayVars = Partial<Record<NbColorwayVarKey, string>> & {
    [key: `--${string}`]: string | undefined;
};
