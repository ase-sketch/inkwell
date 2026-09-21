import type {NbThemeManifest} from "../../src/theme/theme-manifest";

/**
 * nbook —— NeuroBook 的产品主题。从 macOS 那套 Liquid Glass 衍生。
 *
 * 论点一句话：**玻璃是器械，纸不是玻璃**。
 *
 * 这不是给 macOS 换个色。Apple 关于 Liquid Glass 最硬的一条规矩是「玻璃只属导航 / 控件层，
 * 内容层不许套玻璃」（HIG Materials；hig-doctor 的 materials.md 索引把它列在第一条）。
 * 写作工具恰好拥有这条规矩最强的一个实例：稿面。别的应用的「内容层」是列表、表格、卡片，
 * 做成实心只是不出错；写作应用的内容层是**一页正文**，它不只该实心，还该是纸——
 * 全屏唯一不透明、唯一暖、唯一浮起、唯一用衬线的面。
 *
 * 所以这套主题 = macOS 的材料与几何 + 一个真的纸做的内容层 + 中文排版。
 * 三样东西各自独立成立，合起来才有产品身份。
 *
 * 身份放在**配色层与角色映射层**，不放在结构层：nbook 的器械是冷的（和 macOS 同族，
 * 它本来就该像操作系统的一部分），只有内容面板是暖的。强调色仍是 System Blue——
 * 冷强调压在冷器械上是同族，落到暖纸上才跳出来，而「当前章节」「主操作」恰恰都出现在纸的附近。
 * 几何与材料几乎原样继承 macOS，因为那是被验证过的取值，没有理由为了不一样而不一样。
 *
 * 与 macos 主题的关系：**同级，不是继承**。两者各自自包含，删掉任何一个另一个照常装载。
 * 代价是折射滤镜那段静态标记有两份（见 assets/lens.ts），换来的是主题包不互相依赖。
 */
export const manifest: NbThemeManifest = {
    id: "nbook",
    name: "NeuroBook",
    tagline: "Liquid Glass · 中文写作版",
    description: "器械是冷玻璃，稿面是暖的纸——全屏只有内容面板偏暖。浮层薄糊留结构，正文用衬线，字距归零。",
    version: "1.0.0",
    author: "nb-ui",
    hostVersion: "^0.2.0",
    /*
     * 17 个新变量分两组：玻璃 / 窗口那 10 个与 macos 大体同名同 fallback（装载器允许两套主题
     * 声明同一个变量名——按 NbThemeVarDeclaration 的判据，这说明配色契约漏了一批角色，
     * 该去补契约而不是逼作者改名），纸那 7 个来自已下线的 lamplight。
     *
     * 全部是「派生型」：每个都给一个能从配色契约算出来的 fallback，所以别的主题激活时
     * 引用它们不会塌，用户新建配色时也不必为 nbook 填任何东西。
     * 玻璃那几个的 fallback 是 `none`——正确的兜底不是「差一点的玻璃」而是「没有玻璃」。
     */
    declares: [
        {
            name: "--glass-blur",
            fallback: "none",
            description: "导航面的磨砂配方（blur + 饱和 + 明度）。没有玻璃主题时就该是 none。",
        },
        {
            name: "--glass-blur-strong",
            fallback: "none",
            description:
                "大容器的纯 blur fallback（14px）；真实浮层改由 --overlay-blur 使用 8px 纯 blur，完整折射强档由 --glass-lens-strong 提供。",
        },
        {
            name: "--glass-lens",
            fallback: "none",
            description: "带边缘折射的完整配方，含 url(#nbook-lens-sm)。只有 Chromium 支持，@supports 分支专用。",
        },
        {
            name: "--glass-lens-strong",
            fallback: "none",
            description: "大容器的折射配方，含 url(#nbook-lens)。",
        },
        {
            name: "--glass-rim",
            fallback: "none",
            description: "镜面高光层（background-image）。只画整块玻璃的轮廓，不画贴在里面的分区。",
        },
        {
            name: "--glass-rim-inset",
            fallback: "none",
            description: "沿轮廓的内阴影，与 --glass-rim 配套画出玻璃的厚度。",
        },
        /*
         * 这里曾经还有一个 --glass-sheen（浮层的镜面层）。已删：面上铺渐变会让小浮层读起来
         * 是「盖了一层渐变」而不是一块玻璃，判据写在 vars.css 里原来那一段的位置。
         * 浮层的高光改由 --elevation-popover 的顶内线承担，不再需要单独的变量。
         */
        {
            name: "--glass-lift",
            fallback: "none",
            description: "交互时的抬起变换。Apple 的说法是控件会 flex / lift / 短暂浮起。",
        },
        {
            name: "--window-backdrop",
            fallback: "none",
            description: "窗体底纹。折射与磨砂作用在纯色上等于零效果，所以玻璃主题必须自带一层。",
        },
        {
            name: "--chrome-surface",
            fallback: "var(--toolbar-surface)",
            description:
                "窗口左上角那一格的面。判给侧栏时侧栏从窗口顶端一路通到底，判给标题栏时标题栏是一条全宽横带。"
                + "nbook 判给侧栏：这套主题的侧栏是玻璃，被标题栏横切一刀就不是一整块了。",
        },
        {
            name: "--chrome-seam",
            fallback: "0 1px 0 var(--divider)",
            description: "窗口左上角那一格的分隔线。归标题栏时画在下边，归侧栏时画在右边。",
        },

        /* ── 纸。以下 7 个继承自已下线的 lamplight，是这套主题相对 macOS 真正新增的东西 ── */
        {
            name: "--page-surface",
            /*
             * fallback 挑 --bg-panel 而不是 --bg-main：亮暗两套配色里 --bg-panel 都比 --bg-main 亮，
             * 「纸比桌亮」用一条派生式就能同时在明暗下成立，不需要按 data-nb-appearance 分档。
             */
            fallback: "var(--bg-panel)",
            description: "稿面的面色。必须比窗体底（--bg-main）亮，明暗两档都是——这是内容层做成纸的支点。",
        },
        {
            name: "--page-ink",
            fallback: "var(--text-main)",
            description: "正文墨色。与界面文字分开：稿面可以用比界面更高的对比，界面反而该退后。",
        },
        {
            name: "--page-rule",
            fallback: "var(--divider)",
            description: "稿面上的细线：版心边界、页边栏分界。比界面分隔线更淡。",
        },
        {
            name: "--page-lift",
            // 正确的兜底不是「淡一点的阴影」而是「没有阴影」——纸浮起来是本主题的说法，不是通则
            fallback: "none",
            description: "稿面的投影。内容层唯一一处阴影：玻璃靠模糊表达层级，纸靠影子。",
        },
        {
            name: "--font-emphasis",
            /*
             * 中文没有斜体。浏览器的 italic 是把字形做剪切变形，看起来像渲染故障，
             * 所以正文强调必须换字面（楷体），不能换字形。这条对中文写作工具是硬需求。
             */
            fallback: "var(--font-display)",
            description: "正文强调用的字面。中文以楷体表强调，不用 font-style: italic。",
        },
        {
            name: "--reading-size",
            fallback: "16px",
            description: "稿面正文字号。与界面字号（--text-sm）分开，两个区的密度本来就不该一样。",
        },
        {
            name: "--reading-measure",
            /*
             * 用 em 不用 rem：CJK 下 1em 恰好是一个汉字宽，所以 34em ≈ 每行 34 个字，
             * 行宽口径能直接说人话。rem 只能靠猜，而且改了字号行宽就错。
             */
            fallback: "34em",
            description: "稿面行宽，单位 em。CJK 下 1em 是一个汉字宽，所以这个数就是「每行多少字」。",
        },
    ],
    providesColorways: ["nbook-light", "nbook-dark"],
    defaultColorway: {light: "nbook-light", dark: "nbook-dark"},
    /*
     * 第一档（声明式）：变量声明 + 取值 + 自带配色 + SVG 资源，没有组件覆盖。
     * 产品默认主题不需要第二档能力——换控件实现是主题市场的扩展点，不是默认体验的一部分。
     * 对照页里「切到 macOS 时间选择器变成滚轮、切到 nbook 变回下拉」正是这条边界的现场。
     */
};
