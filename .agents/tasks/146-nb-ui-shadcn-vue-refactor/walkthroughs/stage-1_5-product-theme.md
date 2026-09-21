# 阶段 1.5（第四轮）实现报告：产品主题定稿与五处缺陷修复

日期：2026-08-13。工作仓：sibling `nb-ui`，分支 `refactor/t146-reka-tailwind-base`。
主仓本轮只改文档，**零业务改动**。

状态：批 0–7 全部实施完毕，**未提交**（第三轮的 7 个 commit 之后的工作区改动）。
`bun run test` 165 passed / 11 files、`vue-tsc --noEmit` 无输出、`bun run build:css` 已重建
`dist/nb-ui.css`。Chromium 探针五组全过。**等用户浏览器走查。**

## 为什么变

用户看过主题对照页后改了方向。原话：

> 算了，还是基于 MacOS 这个主题改吧。我觉得目前 主题对照 这里的 MacOS 系列组合比较好看。
> NeuroBook 在这个基础上改吧。
> 你这个其实不能算是 MacOS 主题了。应该只能算是衍生。

以及五处点名的问题（截图为对照页 ① 界面切片，macOS 主题 + macOS Dark 配色）：

1. 「这里的边框好像被 border-radius 切掉一部分…暗色主题上边框的处理其实有些地方做得不是很好」
2. 「输入框 outline 的边框没有处理好。浏览器原生的那一条黑线好像没有删掉」
3. 「下拉选择目前还是浏览器原生的」
4. 「时间选择器这里没有做好。」
5. 「我更喜欢模糊，你的这个上下文菜单这里可以加一点模糊（可以是高斯模糊）。Dialog 这里可以调一下」

三处拍板（AskUserQuestion，均取推荐项）：主题阵容**删灯下、留 4 套**；改动范围**主题 + 对照页 +
被点名的组件**（其余 27 个组件的硬编码刻度仍归阶段 2）；设计语言文档放**nb-ui 仓库 `docs/` 下**。

## 与计划的出入

计划见 [`../PLAN-stage-1_5-theme-system.md`](../PLAN-stage-1_5-theme-system.md) 顶部的方向变更段
与批准的实施计划。六处偏离：

| 计划 | 实际 | 为什么 |
| --- | --- | --- |
| `nbook` 从 lamplight 搬 5 个阅读面变量 | **搬了 7 个** | 多搬 `--font-emphasis` 与 `--page-lift`。丢掉前者中文强调就无处可去（中文没有斜体），丢掉后者纸就不再浮起 |
| 加载器九条校验 | **十条** | 新增 `svg-defs-id-collides`。见下 |
| 时间选择器只做「点外面关闭 + 滚轮打磨」 | 还得**传送到 body** | 见下「弹出层被面板切掉」 |
| 「未装主题时零回归」是一条验收判据 | 它抓出了**本轮自己引入的真回归** | 见下 |
| 用沿圆弧采样判断高光有没有被切 | 判据不成立，回到计划自己列的「关掉高光拍对照图」 | 采样点跨过 1px 描边，读到的是抗锯齿不是断口 |
| macOS 只同修两处缺陷 | 还补了浮层折射的 `@supports` 升级 | 它的真组件比它自己的对照页少一层玻璃，与本轮要消灭的是同一个毛病 |

## 交付物

### 产品主题 `themes/nbook/`

id `nbook`，名 `NeuroBook`，tagline `Liquid Glass · 中文写作版`。从 `themes/macos/` 整份 fork，
不做共享 CSS 文件——两套主题本来就该发散，共享层为 2 个消费方引入同特异性排序依赖不划算。
自带 `nbook-light` / `nbook-dark` 两套完整配色（33 变量），声明 17 个变量，**无 `overrides`**（只吃第一档）。

**论点是「玻璃是器械，纸不是玻璃」。** Apple 的硬规矩是玻璃只属导航 / 控件层、内容层不许套玻璃；
写作工具把这条推到底：内容层不只实心，还是纸——全屏唯一不透明、唯一浮起、唯一用衬线的面。

相对 `macos` 的实质差异只有三处，其余原样继承：

- **纸**：新增 `--page-surface` / `--page-ink` / `--page-rule` / `--page-lift` / `--reading-size` /
  `--reading-measure` / `--font-emphasis` 七个稿面变量
- **中文排版**：字距归零、正文加一档（13→14px）、行高放松（1.35→1.5）、稿面用宋体、强调用楷体
- **浮层更模糊**：`--glass-blur-strong` 从 `blur(34px)` 提到 `blur(48px)`（暗色 50px）

**身份落在角色映射层，不是全局色偏。** 第一版试的是「整套都偏暖一点」，实测色差只有 3–5 个通道单位，
在低亮度下根本看不出来——和 macOS 摆在一起分不清谁是谁。改成**冷器械 / 暖纸**，并在角色映射层钉死：
器械一律从 `--bg-sidebar` 派生（冷），只有内容面板从 `--bg-panel` 派生（暖）。
这是与 `macos` 唯一一处结构性差异——macos 通体冷中性，chrome 从哪个变量取都一样。

### 库层：浮层外观基座接通主题（批 1）

`src/tokens.css` + `src/theme/tokens.ts` 新增角色 `--overlay-blur`（默认 `none`）。
判据按 `docs/authoring-themes.md` 的规矩：两套以上主题都要用 → 属于库该补的角色。

`src/styles.css` 的 `.nb-ui-popover-surface` 从写死的三件套改为五项全走主题变量
（border / radius / background / shadow / backdrop-filter）。配套删掉 `ContextMenu.vue` 与
`Dialog.vue` 上硬编码的 `rounded-lg`——那一层排在 utilities 之后且同为单类选择器，
原子类**永远不会生效**，留着会让人以为改了其实没改。

这一处是**六个浮层组件共用的登记处**（Dropdown / Combobox / ContextMenu / Tooltip / Dialog / TimePicker）。
接上它之后，真组件才第一次吃到玻璃——在这之前玻璃只活在对照页的手写标记里，
用户说的「上下文菜单可以加一点模糊」不是某个组件漏调了样式，是整条通路没接。

### SVG defs id 的文档级碰撞（批 2，计划外）

`url(#id)` 在文档里解析。两套玻璃主题同时装上时，同名 id 会**静默命中先装的那一个**，不报错。
第三轮只有 `macos` 一套玻璃主题，这个洞够不着；`nbook` 一落地就变成可达路径。

处理方式沿用加载器既有的「拒绝 + 明确报错」纪律：新增 `collectSvgDefsIds()`（`src/theme/svg-defs.ts`）
与第十条拒绝理由 `svg-defs-id-collides`。`nbook` 用 `nbook-lens` / `nbook-lens-sm`，
`macos` 用 `nb-lens` / `nb-lens-sm`；`nbook` 自带一份滤镜副本而不是从 `themes/macos/` import，
这样卸掉任一套，另一套仍能装。

### `FormSelect` 重写在 Reka Select 上（批 4）

原生 `<select>` 的弹出列表由操作系统绘制，任何 CSS 都够不着——这不是样式没调好，是原生控件的硬边界。
换成 Reka 的 `Select` 原语后弹出层是页面内的 DOM，吃得到 `.nb-ui-popover-surface`。

**props / emits / FormField 集成一字未改**，换的只是实现。表单提交也没丢：读 Reka 源码确认
`SelectRoot` 在「trigger 处于 `<form>` 内且给了 `name`」时会渲染一个视觉隐藏的原生 select 承载提交值。

一处真回归被测试挡下：`SelectValue` 的默认文本取自 `SelectItem` 挂载时注册的选项表，
而 item 在 portal 里的 `SelectContent` 中——关着时整棵内容树没挂载，**没点开过的下拉是一片空白**。
原生 `<select>` 不会这样。改成组件自己从 `props.options` 算显示文字。

### 时间选择器（批 5）

两个实现（库默认的输入框 + 列表、macOS 主题的滚轮）同样处理：

- **点外面关闭**，且与 Esc 刻意不同的两点：不回滚值（点外面是「就这样吧」，Esc 才是「算了」）、
  不抢回焦点（用户刚点了别的东西）
- **传送到 body**：见下
- `scrollIntoView` 换成直接算 `scrollTop`——前者会连带滚动所有可滚的祖先，点开一个下拉整页跳走
- 滚轮加**中央选中带 + 上下渐隐**（iOS 滚轮的定义性特征），列的上下留白改为
  `(轮高 − 格高) / 2`，只有正好这个值首项和末项才能滚到中央对上选中带
- 契约测试补一条「点外面关闭且值不变」，两个实现都过；滚轮另加一条只属于它的
  「选完小时不关闭，还能接着选分钟」

**弹出层被面板切掉（计划外）。** 验收截图里滚轮只露出顶上一条边——弹出层原地绝对定位，
被 `.sc-panel` 的 `overflow: hidden` 切掉了，而面板为了圆角本来就得 `overflow: hidden`。
新增 `src/composables/useAnchoredPopup.ts`：把弹出层 `Teleport` 到 body，按触发器的
`getBoundingClientRect()` 定位，下方放不下就翻到上方，滚动 / 缩放时跟随（scroll 用捕获，
因为滚的可能是某个祖先容器）。配套给 `onClickOutside` 加 `ignore`——传送之后弹出层不再是
根元素的后代，不排除的话「先选小时再选分钟」会在选完小时那一下就被判成点了外面。

### 对照页与 macOS 缺陷同修（批 3）

`.sc-glass` 拆两档：整块玻璃（有轮廓，画镜面高光）与贴合子区域（只有 tint + blur）。
镜面高光挂到 `.sc-window` 上并跟着它的圆角走。同一处修复打进 `themes/macos/`——
高光画在方角子区域上、输入框比窗体底还暗，这两条是缺陷不是口味，参照实现不能知情不改。

### 设计语言文档（批 7）

`nb-ui/docs/design-language.md`，与 `authoring-themes.md` 并列，README 与 authoring-themes 都加了入口。
八节：论点 → 材料与层级 → 几何 → 排版 → 颜色角色 → 无障碍三个 media query →
**踩过的坑（20 条，每条「现象 → 根因 → 判据」）** → 给 UI agent 的检查表。

坑清单是这篇的重点。**多数坑之所以活很久，是因为当时用的判据本身是错的**，所以每条都把判据单独写出来。

## 验证

在 `nb-ui` 仓执行（typecheck 与 vitest 不并发跑，`nuxt prepare` 会重写 `.nuxt/tsconfig` 造成假失败）：

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 无输出 |
| `bun run test` | 11 files / **165 passed**（第三轮是 149；本轮删掉 lamplight 的用例、新增 select / 时间选择器 / SVG id 三组） |
| `bun run build:css` | `dist/nb-ui.css` 已重建（提交产物，必须一起提交） |

Chromium 探针（Playwright 只能用 Node 跑，Bun 下 CDP 握手超时），主题 × 配色两轴：

| 判据 | 结果 |
| --- | --- |
| 下拉不是原生的 | 弹出列表是页面内 DOM、传送出了 `.sc-panel`、5 个选项、关闭时显示当前标签 |
| 浮层材料随主题走 | nbook 圆角 20px + `url("#nbook-lens") blur(50px)`；Editorial 圆角 8px + `none`（非玻璃主题零回归） |
| 时间选择器 | 两个实现都是：**没被切 5/5**、页面跳动 **0px**、选中项偏离中央 **0px**、滚轮选中带对齐 **0px**、点外关闭 ✓、值不变 ✓ |
| **模糊真的渲染了** | 隐藏浮层自身内容后 A/B：折射配方抹掉背景细节 **77–86%**，纯 blur **90–93%** |
| 窗口四角高光 | 左上 / 右上高倍截图：描边沿圆弧连续，无斜切断口（nbook 夜 / macOS Dark 均是） |
| 输入框不比窗体底暗 | `sign(输入框 − 桌面)` 与 `sign(面板 − 桌面)` 同号，`nbook-dark` / `nbook-light` 两档都成立 |
| 未装主题时 | 五项里四项与改动前完全一致，圆角 8px→10px 是刻意的（见下） |

**探针本身出过两次错，两次都是判据的问题，值得单独记：**

1. **量模糊时读出「抹掉 0%」。** 菜单里的三行字、滚轮里的两列数字，在「有玻璃」和「关掉玻璃」
   两组里都在，贡献的方差一模一样，把背景那点差异淹没了。量之前把子元素 `visibility: hidden`
   之后，同一块玻璃的真实读数是 **86%**。
   为了排除「浏览器根本不画」这个可能，另拿一张最小页面（一段高频文字 + 一块玻璃）单独自证：
   默认 headless、SwiftShader、`--headless=old` 三种都会画，抹掉 95%。
2. **量「弹出层有没有被切」不能用 `getBoundingClientRect()`。** 它不反映裁剪——被面板切掉一半的
   滚轮，量出来的位置、尺寸、选中带对齐**全是完美的**。第一版探针就是这么报了全绿，
   而截图上它只露出一条边。改用在弹出层自己的矩形里取 5 个点做 `document.elementFromPoint`。

## 实施中踩到的

**「未装主题时零回归」这条判据抓出了本轮自己引入的真回归。** 批 1 把 `.nb-ui-popover-surface`
的阴影从颜色层的 `--shadow-panel` 换成主题层的 `--elevation-popover`，理由是「阴影是主题决策」。
但库默认的 `--elevation-popover` 是 `0 4px 12px` 的 **8% 黑**——那是按亮色写的，
压在暗色底上等于没有影子，一个主题都不装的消费方浮层直接失去层级
（改动前是 `0 1px 2px rgba(0,0,0,.5), 0 20px 48px rgba(0,0,0,.6)`）。

修法是让库默认值先取配色给的 `--shadow-panel`（33 个配色变量之一，任何配色都会给，
且各配色按明暗分别调过），写死的百分比只当兜底。装了主题仍由主题的取值覆盖（选择器特异性更高）。
`--elevation-dialog` 不跟着改：库内没有消费方，让两档取同一个值会抹掉「对话框压得比浮层重」这个分档。

**「一个主题都没装」不是边缘情况，是被支持的状态。** 这条纪律第三轮就写进了 README，
本轮是它第一次真的挡住东西。

**沿圆弧采样判断高光断口是个不成立的判据。** 半径 20px 的弧上采 24 个点，相邻点间隔约 2px，
必然跨过 1px 的描边——读到的最大跳变是抗锯齿，不是高光断口。三套主题全报「✗ 弧上有突变」，
但高倍截图上四角都是连续的。**报一个自己不信的判据比不报更糟**，所以回到计划里原本写的办法：
关掉高光拍一张对照图，两张并排看。

**`isolation: isolate` 不创建 backdrop root。** 我在对照页的注释里写反过一次。
按 Filter Effects Level 2 §3，触发清单是根元素、`filter`、`opacity < 1`、`mask*`、`clip-path`、
`backdrop-filter`、`mix-blend-mode`、`will-change`；规范特意注明它的触发面比层叠上下文窄，
`z-index`、`fixed/sticky`、`transform` 都不触发。真正会切断后代取样的是 `backdrop-filter` 本身。

**「子半径 = 父半径 − padding」不是 HIG 原文。** 也在注释里写错过一次。Apple 的官方落点是
UIKit 的 `containerConcentricRadius` 与 SwiftUI 的 `ConcentricRectangle`，那个减法公式只是够用的近似。

**举错了例子。** 我在 `workbench.vue` 的注释里说 `editorial` 会触发 chrome 归属的排序陷阱，
核对后发现 `editorial` 和 `aurora` 都没有重映射 `--toolbar-surface` / `--sidebar-surface`，
例子是假的。改成只陈述规则，并点名那个真的会触发它的主题已经被删了。

## 后续

**待用户**：浏览器走查。四套主题 × 各自配色，重点看组件画廊的右键菜单 / Dialog / 下拉三处、
主题对照页的窗口四角、时间选择器（nbook 下是列表、macOS 下是滚轮），暗色与亮色各一遍。

**本轮没冻结的一件**：`nbook` 的强调色仍是 System Blue，即产品主题在颜色上暂时和 macOS 一模一样。
是否换成 NeuroBook 自己的强调色，留给用户在走查时一并判断。

**仍然挂着的两项拍板**（阶段 1 遗留，与本轮无关）：`midnight` / `slate` 两套配色的观感确认；
`text-sm` 14px → 13px（nb-ui 内 22 处使用）——注意 `nbook` 已经明确选了 14px 并写了理由，
这项若要推进需要先解决与它的冲突。

**实现级后续**：

- `--window-backdrop` 现在被 `macos` / `aurora` / `nbook` **三套**主题各声明了一次。
  第三轮记的判据是「两套以上主题都要用 → 配色契约漏了一个角色」，三套只是让这个信号更强。阶段 2 收口。
- `useAnchoredPopup` 是自带的最小定位实现，不是 floating-ui：只做「下方放不下就翻上方」和
  「别冲出右边缘」。需要贴边翻转 / 箭头 / 自动更新监听链的组件应该直接用 Reka 的 Popper 原语
  （`FormSelect` 就是这么做的）；时间选择器之所以不用，是因为它的键盘与焦点行为写在契约里，
  换成原语等于把契约交给原语去实现。
- 阶段 2 重写其余组件时，把刻度从模板里挪进 token。`TimePicker` 与本轮的 `FormSelect` 是形态样板，
  但 `FormSelect` 仍留着 `h-9` / `px-3` / `text-sm` 三处硬编码——本轮只换实现不动契约，模板刻度没碰。
