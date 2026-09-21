import type {NbColorwayVars} from "../../src/colorway/colorway-contract";
import type {ColorwayMeta} from "../../src/colorway/colorway-store";

/**
 * nbook 自带的两套配色。两套都写全 33 色，不从内置 dark spread。
 *
 * 理由是整套色都换了基准：内置 dark 与 macos-dark 是**通体冷中性**（#18181b / #1c1c1e 一系），
 * nbook 要的是**冷暖分家**。spread 之后要改的项比留下的还多，反而看不出哪些是刻意的。
 *
 * 冷暖分家就是这套配色的全部身份，也是它与 macOS 主题真正的分界：
 *
 * · **器械是冷的**：窗体底、侧栏、工具栏、菜单、按钮——一整套导航层走 --bg-main / --bg-sidebar
 *   这一系冷灰，和 macOS 一个路子，因为它本来就该像操作系统的一部分。
 * · **纸是暖的**：只有 --bg-panel 偏暖，而内容面板与稿面都从它派生。
 *
 * 第一版试过「整套都偏暖一点」，实测的结果是**看不出来**——低亮度下 3～5 个通道单位的色相偏移
 * 在屏幕上等于零，一眼看去和 macOS 没有区别，等于没有身份。让冷暖同屏才有对比可看，
 * 而这个对比恰好就是主题的论点：器械和稿面是两种材质。
 *
 * 强调色保持 System Blue 不动：冷强调压在冷器械上是同族，落到暖纸上才跳出来——
 * 「当前章节」「主操作」这些恰恰都出现在纸的附近。
 *
 * 三条不变量，任何一条破了这套主题的论点就没了：
 *
 * ① **--bg-panel 必须比 --bg-main 亮**，明暗两档都是。稿面消费 --bg-panel（经 --page-surface），
 *    窗体底消费 --bg-main，「纸比桌亮」全靠这一条。反过来就退回成普通 IDE。
 * ② **--bg-input 不许暗于 --bg-panel**。上一轮实测的原话是「浏览器原生的那一条黑线好像没有删掉」，
 *    根因是暗色下 --bg-input 比窗体底还暗，输入框成了挖在面板上的黑洞。
 * ③ **--accent-main 必须与 --status-warning 明显不同**。内置 dark 这两项是同一个色值（#f59e0b），
 *    于是「当前章节」和「草稿状态」在屏幕上分不出来——而写作工具里满屏都是草稿。
 *
 * 状态色取自 Apple 系统色板（暗色档直接用，亮色档压深一档以保证在近白底上可读），
 * 且 --status-info 刻意选青而不是蓝：强调色已经占了蓝，两个蓝在一起分不出「当前」和「运行中」。
 */

/** 夜：冷灰的器械，暖白的纸 */
const NBOOK_DARK: NbColorwayVars = {
    "--color-scheme": "dark",
    // 桌面。冷，全屏最暗
    "--bg-main": "#1a1b1e",
    // 纸。**唯一偏暖的面**，内容面板与稿面都从它派生。不变量 ①：必须亮于 --bg-main
    "--bg-panel": "#2d2925",
    // 器械。冷，玻璃分区（侧栏 / 工具栏 / 浮层 / 按钮）全部从它派生
    "--bg-sidebar": "#212328",
    "--bg-subtle": "color-mix(in srgb, #212328 78%, #2d2925)",
    // 不变量 ②：亮于 --bg-panel。输入框是从纸上抬起，不是挖下去
    "--bg-input": "#383129",
    // 悬停主要出现在列表与菜单里，所以跟器械走冷
    "--bg-hover": "#33353b",
    // 暖白，不是 #fafafa：这是墨色，纯中性白落在纸上会显得发青
    "--text-main": "#efe9df",
    "--text-secondary": "#c3bcb0",
    "--text-muted": "#918a7e",
    "--text-inverse": "#1a1b1e",
    "--border-color": "#383a40",
    "--border-strong": "#494c53",
    "--border-accent": "color-mix(in srgb, #0a84ff 46%, #383a40)",
    // System Blue（暗色档）。落在暖纸上才跳出来，这是它保持不变的理由
    "--accent-main": "#0a84ff",
    "--accent-bg": "rgba(10, 132, 255, 0.16)",
    "--accent-text": "#5eb0ff",
    "--selection-bg": "rgba(10, 132, 255, 0.34)",
    // 青而不是蓝：强调色已经占了蓝
    "--status-info": "#64d2ff",
    "--status-info-bg": "rgba(100, 210, 255, 0.14)",
    "--status-info-border": "rgba(100, 210, 255, 0.30)",
    "--status-success": "#30d158",
    "--status-success-bg": "rgba(48, 209, 88, 0.14)",
    "--status-success-border": "rgba(48, 209, 88, 0.30)",
    "--status-warning": "#ff9f0a",
    "--status-warning-bg": "rgba(255, 159, 10, 0.14)",
    "--status-warning-border": "rgba(255, 159, 10, 0.30)",
    "--status-danger": "#ff453a",
    "--status-danger-bg": "rgba(255, 69, 58, 0.14)",
    "--status-danger-border": "rgba(255, 69, 58, 0.30)",
    "--shadow-color": "#000000",
    "--shadow-panel": "0 1px 2px rgba(0, 0, 0, 0.50), 0 20px 48px rgba(0, 0, 0, 0.60)",
    /*
     * 模态遮罩 0.55 → 0.28。
     *
     * 这个数原来是按「遮罩负责把注意力收到对话框上」调的，但对话框本身是玻璃：它采的样
     * 正是遮罩压过之后的页面。0.55 的黑把整页压成一片近乎均匀的暗色，玻璃再怎么糊、
     * 怎么折射都无从下手，结果就是一块灰板子。macOS 的 sheet 干脆不压暗底下的窗口，
     * 靠的就是材质与影子本身来分层。
     *
     * 0.28 仍然清楚地读作「后面那层被挡住了」，同时给玻璃留下可采的结构。
     */
    "--overlay-bg": "rgba(0, 0, 0, 0.28)",
};

/** 昼：同一套东西在白天。器械是冷灰，纸接近象牙白，强调色压深一档才压得住纸 */
const NBOOK_LIGHT: NbColorwayVars = {
    "--color-scheme": "light",
    "--bg-main": "#e3e4e6",
    "--bg-panel": "#fffcf5",
    "--bg-sidebar": "#edeef0",
    "--bg-subtle": "color-mix(in srgb, #edeef0 78%, #fffcf5)",
    "--bg-input": "#fffcf5",
    "--bg-hover": "#dcdee1",
    "--text-main": "#1f1c17",
    "--text-secondary": "#57534b",
    "--text-muted": "#8b857b",
    "--text-inverse": "#fffcf5",
    "--border-color": "#d8d9dc",
    "--border-strong": "#bcbec2",
    "--border-accent": "color-mix(in srgb, #007aff 46%, #d8d9dc)",
    // System Blue（亮色档）
    "--accent-main": "#007aff",
    "--accent-bg": "rgba(0, 122, 255, 0.10)",
    "--accent-text": "#0060df",
    "--selection-bg": "rgba(0, 122, 255, 0.22)",
    "--status-info": "#0a7ea4",
    "--status-info-bg": "rgba(10, 126, 164, 0.11)",
    "--status-info-border": "rgba(10, 126, 164, 0.26)",
    "--status-success": "#2c7a39",
    "--status-success-bg": "rgba(44, 122, 57, 0.11)",
    "--status-success-border": "rgba(44, 122, 57, 0.26)",
    "--status-warning": "#9a5b00",
    "--status-warning-bg": "rgba(154, 91, 0, 0.12)",
    "--status-warning-border": "rgba(154, 91, 0, 0.28)",
    "--status-danger": "#c0342a",
    "--status-danger-bg": "rgba(192, 52, 42, 0.10)",
    "--status-danger-border": "rgba(192, 52, 42, 0.26)",
    // 纸的影子落在冷灰的桌面上，所以阴影基色也跟着冷：暖阴影压在冷底上会发紫
    "--shadow-color": "#33353a",
    "--shadow-panel": "0 1px 2px rgba(51, 53, 58, 0.10), 0 18px 44px rgba(51, 53, 58, 0.14)",
    /* 同暗色：遮罩压得越重，压在它上面的玻璃对话框越没东西可采，见 NBOOK_DARK 那一段 */
    "--overlay-bg": "rgba(51, 53, 58, 0.16)",
};

export const nbookColorways: Record<string, NbColorwayVars> = {
    "nbook-light": NBOOK_LIGHT,
    "nbook-dark": NBOOK_DARK,
};

export const nbookColorwayMeta: Record<string, ColorwayMeta> = {
    "nbook-light": {label: "NeuroBook · 昼", appearance: "light"},
    "nbook-dark": {label: "NeuroBook · 夜", appearance: "dark"},
};
