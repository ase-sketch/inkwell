# 阶段 1 实现报告：nb-ui 框架替换

日期：2026-08-10。工作仓：sibling `nb-ui`，分支 `refactor/t146-reka-tailwind-base`（起点 `291b2d6`）。
主仓本轮只改文档（本任务 README + 本报告），**零业务改动**。

状态：阶段 1 出口全部达成。改动**未提交**，等用户看过 playground 配色后再定。

## 出口达成情况

| 出口条件 | 结果 |
| --- | --- |
| typecheck 全绿 | 通过（`vue-tsc --noEmit` 无输出） |
| vitest 全绿 | 62 passed / 6 files（基线 54 passed / 5 files） |
| playground 能跑 | `bun run build` 成功，产物可预览 |
| 5 套主题可切换 | Chromium 实测通过，见「主题验证」 |
| 组件行为与替换前一致 | 逐类比对，见「差异清单」；1 处回归已修，1 处刻意保留 |

基线在动手前先测过，不是假定：`main` 分支 `291b2d6` 上 typecheck 干净、54 passed / 5 files。

## 做了什么

- 依赖：移除 `@unocss/nuxt` / `unocss`；加入 `reka-ui 2.10.3`、`class-variance-authority 0.7.1`、
  `clsx 2.1.1`、`tailwind-merge 3.6.0`（dependencies）与 `tailwindcss 4.3.3`、`@tailwindcss/vite 4.3.3`、
  `@tailwindcss/cli 4.3.3`、`@iconify/tailwind4 1.2.3`（devDependencies）。版本切 `0.2.0-alpha.0`（D9）。
- 新增库 CSS 构建：`src/tailwind.css` → `bun run build:css` → `dist/nb-ui.css`（33,876 字节）。
  `exports["./styles.css"]` 与 `src/module.ts` 的注入都改指产物。
- 图标按 D7 接入，`iconSelector` 对齐现有 `i-lucide-*` 写法；按 D8 删除 `src/uno-safelist.ts`、
  其测试与 `exports["./uno"]`。
- 主题：颜色契约 20 → 33 个键；预设阵容换成 D10 的 `sepia` / `light` / `dark` / `midnight` / `slate`；
  新增 `src/tokens.css` 承载草案 §4 的五组 token（D11）；新增 `retiredThemeAliases` 别名层。
- playground 迁到 `@tailwindcss/vite`，删 `playground/uno.config.ts`，新增主题切换器。
- **未做**（按计划移到阶段 2 第 2 批）：删除 `src/utils/focus-trap.ts`。删它必须同时把 `Dialog.vue`
  换成 Reka 内核，那属于行为改动，与「阶段 1 只动地基」冲突。`reka-ui` 已装但**本轮一个组件都没换内核**。

## 与计划的三处出入

### 1. `@source inline` 在 nb-ui 是多余的（实测推翻计划写法）

计划 S1.4 要求用 `@source inline("i-lucide-{...15 个}")` 显式登记图标。实测：**去掉这个块，产物仍是
同样的 15 条规则**——因为 nb-ui 的 15 个图标类都是模板里的字面量，`@source` 扫描就能命中。

`@source inline` 只在「类名不出现在源码里」时才必需，也就是主仓图标选择器全量渲染与 frontmatter
自定义图标名那两种情况（阶段 4 的事）。因此本轮删掉了这个块，不留一个会漂移的第二登记处。

配套地，原 `uno-safelist.test.ts` 那条「组件新增图标忘记登记」的兜底也换了守卫对象：现在真正会漏的
是**图标名在图标集里根本不存在**（静默渲染成空白），所以 `src/icon-registration.test.ts` 改为逐个
校验图标名能在 `@iconify-json/lucide` 里解析，外加一条「禁止运行时拼接图标类名」的断言。

顺带发现：`loader-2` / `check-circle-2` / `alert-triangle` 这 3 个在 `@iconify-json/lucide` 里是
**alias 不是 icon**。已实测确认预生成模式会为 alias 输出规则——这条不确认的话，Spinner 与 Notification
的图标会静默变空白。

### 2. 五组新 token 不进颜色契约（计划写法会导致每套预设重复声明）

计划 S1.5 写的是把草案 §4 的五组 token 并进 `nbThemeVarKeys`。但那是**每套主题一份**的记录类型，
而排版 / 间距 / 圆角 / 动效不随主题变化，放进去等于 5 套预设各抄一遍。

改成：颜色契约（`theme/theme-contract.ts`，33 个键）与设计 token（`src/tokens.css` + `theme/tokens.ts`，
33 个 token）分开。交界处只有 `--elevation-*`——它是常量公式，但公式里引用随主题变的 `--shadow-color`，
`theme/tokens.test.ts` 有断言守住这一点。

### 3. 新增 `retiredThemeAliases`（计划未列，但不加就是一个真 bug）

`createThemeStore` 对未知 id 静默回退默认主题。本轮删掉了 `catppuccin` / `dracula` / `tokyo-night`，
消费方（`nb-fullstack-template` / `neuro-book-site`）里存着这些 id 的用户会毫无提示地变成米黄纸——
和草案 §5.2 给主仓 `resolve-theme.ts:44` 标的是同一个坑。既然是本轮删的 id，就本轮补上别名层，
映射口径与草案一致。这一层同时是阶段 4 主仓要用的同款实现。

## 差异清单：UnoCSS(presetWind3) → Tailwind v4

这是实测，不是迁移表推演，补上了任务 README 里欠的「图标以外的类名差异」（nb-ui 侧）。

方法：把 `src/components` 里用到的 249 个非图标类名同时喂给 UnoCSS 生成器（主仓 `node_modules` 里的
`unocss 66.6.2` + `presetWind3`）和 Tailwind v4 产物，在 Chromium 里逐个探针读**全部计算样式属性**做比对。
用计算样式而不是比 CSS 文本，是为了让 `--un-*` / `--tw-*` 变量间接层自动被解析掉。

结果：**249 个里 222 个计算样式完全一致**，27 个有差异。逐条判读：

| 差异 | 判读 | 处置 |
| --- | --- | --- |
| `shadow-sm` v3 `0 1px 2px 0 rgb(0 0 0/.05)` → v4 `0 1px 3px 0 rgb(0 0 0/.1), 0 1px 2px -1px rgb(0 0 0/.1)` | **真回归**，v4 的 `shadow-sm` 等于 v3 的 `shadow`，阴影明显变重。3 处（全在 `SegmentedControl.vue`） | 改为 `shadow-xs`，实测其值 `0 1px 2px 0 rgb(0 0 0/.05)` 与 v3 `shadow-sm` 逐字相同 |
| `text-sm` 14px → **13px** | **刻意改动**，见下节。22 处 | 保留，需用户过目 |
| `font-mono` 少了 `"Courier New"` 回退 | 刻意改动（草案 §4.1 的取值）。2 处 | 保留 |
| `outline-none` v3 `outline:2px solid transparent; outline-offset:2px` → v4 `outline-style:none` | 真差异但更正确：8 处全部与组件自己的 focus ring 配对使用，v4 语义才是本意（要旧行为得用 `outline-hidden`） | 保留 |
| `rounded-full` 9999px → `calc(infinity*1px)` | 视觉等价 | 保留 |
| `rotate-*` / `translate-*` 从 `transform` 改走独立的 `rotate` / `translate` 属性 | 单独使用等价；与 `transform` 混用时组合方式不同。nb-ui 当前 `rotate-`/`translate-` 用量为 0 | 记录 |
| `transition*` 的属性列表变长（含 `translate`/`scale`/`rotate`/`outline-color`） | 不是回归，是与上一条配套的必需变化 | 保留 |
| `border*` / `blur` / `shadow*` / `ring-1` 在 uno 侧算出 `none` 或 `0px` | **探针假象**：我关掉了 preflight，UnoCSS 这些类依赖 reset 提供 `border-style: solid` 与 `--un-*` 默认值。真实工程两边都有 reset | 无 |
| `fixed` / `sr-only` 的 top/bottom 偏移 | 探针假象：前置元素尺寸不同导致的布局累积偏移 | 无 |

另外单独查过：**没有任何一个用到的 utility 在 v4 下不生成规则**（249 个全部有产出）。

### 需要你过目的一处：`text-sm` 从 14px 变成 13px

`src/tokens.css` 按草案 §4.1 定义了 `--text-sm: 13px`，而 Tailwind v4 的 `text-sm` 工具类正是读
`--text-sm`。也就是说 token 层一落地，`text-sm` 的含义就跟着变了——这是 Tailwind v4 装自定义字号
刻度的惯用做法，但它让阶段 1 **不再是纯粹的视觉中性**。

实际影响面（已数过）：`text-sm` 22 处受影响；`text-lg` / `text-xl` / `text-2xs` 在 nb-ui 用量为 0，
所以只有这一条真的动了。方向与草案一致（控制区默认正文 13px），但它属于设计语言改动，本来该在阶段 3
发生，所以在这里单独标出来请你确认，而不是混在「框架替换」里悄悄带过。

不接受的话，退路是把 token 换成 `--nb-text-*` 之类不与 Tailwind 刻度重名的名字，阶段 3 再切。

## 主题验证

Chromium 实测（Node 跑 Playwright；Bun 下 Chromium CDP 握手超时，是阶段 0 记过的坑）：

```
主题按钮数: 5
  Sepia Paper      bg=#f4ecd8   accent=#d97743   scheme=light stored=sepia    icon=resolved
  Light Editorial  bg=#f6f8fa   accent=#3b82f6   scheme=light stored=light    icon=resolved
  Default Dark     bg=#18181b   accent=#f59e0b   scheme=dark  stored=dark     icon=resolved
  Deep Ink         bg=#0d0d10   accent=#c89a5b   scheme=dark  stored=midnight icon=resolved
  Cold Stone       bg=#14171c   accent=#6aa3d8   scheme=dark  stored=slate    icon=resolved

不同的 --bg-main 取值数: 5 / 5
pageerrors: none
console.error: none
```

覆盖的是**功能**：5 套都能切、变量真的换、`color-scheme` 跟着换、localStorage 持久化、图标 mask 解析成功、
无报错。**配色好不好看没验**——`midnight` / `slate` 是 D13 的第一版取值，需要你在 playground 里看。

playground 的主题切换器刻意只用原生元素 + 主题变量写成，不消费任何 nb-ui 组件：阶段 2/3 要逐批重写
那些组件，切换器不能跟着一起坏。

## 顺带补上的 TODO

任务 README 欠的「在真实 Nuxt 4 + `@tailwindcss/vite` 工程里复验 `@source inline`」已补：阶段 0 只用
`@tailwindcss/cli` 独立构建过，本轮 playground 走的是 Vite 插件，`bun run build` 产物 `entry.*.css`
里有 25 条 `i-lucide-*` 规则（src 的 15 + playground 自己的 10）、遮罩垫片、preflight、6 个 nb-ui 基座类、
以及 token 声明，自动源码探测在真实工程里成立。

## 已知缺口

- 改动未提交。`dist/nb-ui.css` 需要提交（消费方走 `github:` / `link:` 安装，没有 publish 步骤给它构建），
  已在 `.gitignore` 里用 `dist/*` + `!dist/nb-ui.css` 放行。
- **没有做主仓反向验收**，按 D12 推迟到阶段 3。本轮所有结论都只在 nb-ui 内成立。
- 两套样式引擎共存的问题一次都没碰到——它在阶段 3 主仓 `link:` 接入时才第一次暴露。
- `nb-fullstack-template` 走 `link:`，本轮的破坏性变更（删 `./uno`、换预设 id、默认主题从 `dark` 变
  `sepia`、`text-sm` 变 13px）会立刻影响它。按 Non-goals 不承诺同步跟进，只记录。
- `--shadow-panel` 与新的 `--elevation-popover` / `--elevation-dialog` 职责重叠，`.nb-ui-popover-surface`
  仍在用前者。阶段 3 收敛。
- 组件一个都没换 Reka 内核，`reka-ui` 目前是装了没用。阶段 2 才开始用。
