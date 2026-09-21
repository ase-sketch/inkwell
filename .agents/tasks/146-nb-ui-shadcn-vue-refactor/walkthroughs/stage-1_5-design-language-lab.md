# 阶段 1.5 实现报告：设计语言实验室

日期：2026-08-10。工作仓：sibling `nb-ui`，分支 `refactor/t146-reka-tailwind-base`（承接阶段 1，仍未提交）。
主仓本轮只改文档，**零业务改动**。

状态：5 套风格原型可切、实测生效。**等用户选定风格**，选定后才写设计语言文档并进入阶段 2。

## 为什么插进这一阶段

用户本轮定的顺序是「先定设计语言，再重写组件」，与原计划相反（原计划阶段 2 先重写 28 个组件、
阶段 3 才定风格）。新顺序更省：阶段 2 要逐个重写 28 个组件，设计语言没定就重写等于注定返工。
因此在阶段 1 与阶段 2 之间插入本阶段，**只做探索与决策，不动任何 nb-ui 组件**。

同一轮里用户还决定：Tabs 标签栏那条 1px 纵向滚动条**不单独修**，留到阶段 2 重写时一起处理。

## 交付物

### 1. playground 重写为「设计实验室」

原来是单页组件画廊，现在是双轴对照工具：

| 页面 | 内容 |
| --- | --- |
| `/` 风格对照 | 同一份界面在 5 套风格下的呈现，风格 × 主题两轴独立切换 |
| `/components` 组件画廊 | 原来那页，作为「改造前」对照面保留 |
| `/manual-import` | 原样保留 |

外壳（顶栏 + 两个切换器）刻意**既不消费风格变量、也不消费 nb-ui 组件**：
不吃风格变量，切风格时外壳不动，变化才能全部归因到内容区；不吃 nb-ui 组件，阶段 2/3 逐批重写时
切换器不会跟着坏。只消费主题颜色变量，所以切主题时外壳仍然跟着走。

对照页分三段：**① 界面切片**（写作工作台：工具栏 + 章节列表 + 属性表单 + 状态面板，判断风格主要看这段）、
**② 元素对照**（按钮 5 态 3 尺寸 / 输入 / 键帽 / 气泡）、**③ 数据与浮层**（表格 / 菜单 / 空态 / 对话框）。
顶部有实时读数条，切风格时把圆角、控件高、字号、描边、行高、字距直接显示出来。

### 2. 风格层（skin）

`playground/app/assets/css/skins.css`。每套风格是一块 CSS 变量覆盖，靠 `<html data-nb-skin>` 切换。

### 3. 对照页元素层

`playground/app/assets/css/showcase.css`。**手写标记，不是 nb-ui 的真组件**——这一点必须说清楚：
现有 28 个组件把尺寸刻度硬编码在模板里（`Tabs.vue` 里是 `h-8` / `px-2.5` / `gap-1.5` / `text-xs`），
不消费 token，五套风格里有四套会被这些裸值顶回去。所以本轮先用手写标记验「风格能不能表达」，
选定后再把取值搬进 `src/tokens.css`，在阶段 2 重写组件时消费。

代价写在明处：**本阶段证明的是风格契约够用，不是组件已经能换肤。** 后者要等阶段 2。

## 换肤机制的结论（D14）

三层，一层比一层贵，按需要停在哪层：

| 层 | 表达什么 | 代价 | 现状 |
| --- | --- | --- | --- |
| 颜色 | 33 个主题变量 | 已具备 | 阶段 1 完成，自定义配色现在就能做 |
| **风格** | 形状 / 节奏 / 装饰 / **角色映射** | 一块 CSS 变量 | 本轮建立，契约见下 |
| 结构 | 组件解剖差异（红绿灯按钮、不同 Dialog 布局） | 变体或第二套组件集 | 不做，等真实需求 |

**「角色映射」是容易被忽略的一层**，也是本轮最重要的发现：控件的面用哪个主题色、描边用不用色、
分隔靠线还是靠底色——这些是**风格决策，不是颜色决策**。quiet 风格的按钮默认无边框无底色、
terminal 风格的面板靠 `--border-strong` 硬分层，都属于这一层。没有它，「低 chrome」这类风格
根本表达不出来，只能靠改组件。

风格契约（约 30 个变量，颜色仍然只来自主题的 33 个）：

```
排版   --font-ui / --font-display / --font-mono / --text-2xs…xl / --leading-* / --weight-* / --tracking-ui
尺寸   --control-h-sm/md/lg / --control-px / --space-1…8 / --panel-p / --stack-gap
形状   --radius-control/panel/pill / --border-w
表面   --surface-raise（装饰渐变，可 none） / --inset-shadow / --elevation-flat/raised/popover/dialog
角色   --control-surface / --control-outline / --button-surface / --button-outline
       --panel-surface / --panel-outline / --divider
焦点   --focus-ring / --focus-outline
动效   --motion-fast/base/enter / --ease-standard
```

其中 `--font-display` / `--tracking-ui` / `--control-h-*` / `--control-px` / `--border-w` /
`--surface-raise` / `--inset-shadow` / `--elevation-raised` / 7 个角色映射变量 / `--focus-ring` /
`--focus-outline` 是**阶段 1 的 `tokens.css` 里没有的**，选定风格后要补进去。

## 五套候选风格

| id | 名字 | 定位 | 圆角 | 控件高 | 正文 | 装饰 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `editorial` | 编辑室 | 纸感克制，靠边框和底色分层 | 4 / 8 | 32px | 13px | 无渐变无阴影 |
| `macos` | 透明玻璃 | Apple Liquid Glass：导航层折射，内容层实心 | 10 / 18 | 32px | 13px | 磨砂 + 边缘折射 + 镜面高光 |
| `quiet` | 低 chrome | 界面退场，按钮 hover 才显形 | 6 / 8 | 38px | 14px | 无，靠留白 |
| `terminal` | 高密度 IDE | 信息密度优先，近乎直角 | 3 / 4 | 26px | 12px | 无阴影几乎无动效 |
| `aurora` | 现代精致 | 不透明的面 + 真正看得见的多层阴影 | 8 / 12 | 34px | 13px | 顶部环境光 + 双层焦点环 |

## 第二轮：macOS 重做为 Liquid Glass（2026-08-11）

用户指出两件事：第一版 macOS 不对，要的是 Apple 最新的 **Liquid Glass**（WWDC 2025 / iOS 26 /
macOS 26 Tahoe）；以及没走 `/frontend-design` skill。查证走 `codex exec -c tools.web_search=true`
外部检索（不用内部子代理），结论落在 `$CLAUDE_JOB_DIR/tmp/liquid-glass-answer.md`。

### 第一版错在哪（两条都在 Apple 的「常见错误」清单上）

1. **只做 `blur + 白色半透明`** —— 得到的是 2013 年式 frosted glass。Liquid Glass 与旧式
   vibrancy（`NSVisualEffectView`）的区别不是「更透」，而是旧材料把背景**均匀散焦**，
   Liquid Glass 会在边缘**弯曲、挤压并集中光线**（lensing / refraction），轮廓由折射和
   镜面高光画出来，不是由一条固定白边画出来。
2. **所有容器都玻璃化** —— 第一版给 `.sc-panel`（内容层）也套了磨砂。Apple 的规则是
   Liquid Glass 属于**导航 / 控件层**，浮在内容之上，内容从下面透出来；页面背景、卡片、
   表格、正文面板、普通输入框都不该套，也不该出现 glass-on-glass。

顺带修正的还有：第一版把按钮和输入框做成半透明，实际上 macOS 的控件是**实心**的，
玻璃只属于容器；以及圆角——Tahoe 放大了一档，且 Large 控件走 capsule（半径 = 高度一半），
但 Mini/Small/Medium 仍是圆角矩形，全部 pill 化在桌面密集界面上会显得松散。

### 现在的实现

一块玻璃 = 四层，缺一层就退回毛玻璃：

| 层 | 变量 | 说明 |
| --- | --- | --- |
| ① 半透明 tint | `--toolbar-surface` / `--sidebar-surface` / `--overlay-surface` | 不透明时 blur 完全看不见 |
| ② backdrop-filter | `--glass-blur` / `--glass-blur-strong` | `blur(22px) saturate(180%) brightness(1.06)` |
| ③ 边缘折射 | `--glass-lens` / `--glass-lens-strong` | SVG `feDisplacementMap` 进 `backdrop-filter` |
| ④ 镜面高光 | `--glass-rim` / `--glass-rim-inset` | `::after` 上的渐变描边，mask 挖空内部只留 1.5px 环 |

折射的位移图是一张 data-URI SVG：中间留 128（不动）、四边推到 0/255，位移因此**只集中在边缘**。
R 通道管 x、G 通道管 y，两个渐变分别只画红/只画绿再用 `screen` 合成（screen 对 0 是恒等，
所以能干净地把两个通道装进一张图）。滤镜本体放在 `app.vue`，因为它是**资源**不是样式——
风格层只决定用不用。

分层按 Apple 的规则重排：`.sc-window`（窗口，不铺底色，让窗体底纹透上来）→
`.sc-toolbar` / `.sc-sidebar`（导航层，玻璃）→ `.sc-content`（内容层，实心）。
`.sc-popover` / `.sc-dialog` 走 strong 档。

### 三处边界，写在明处

- **`backdrop-filter: url(#...)` 只有 Chromium 支持**（WebKit bug 245510 / Firefox 均不支持），
  所以折射是 `@supports` 渐进增强，退化后仍有磨砂 + 镜面高光。
- **backdrop-filter 糊不到操作系统桌面。** 要糊真桌面得由桌面壳开窗体级 vibrancy
  （Electron 的 `vibrancy` / `backgroundMaterial`，Tauri 的 `window-vibrancy`），纯 Web 拿不到。
  主仓 `shared/desktop-contract.ts:10` 的 envelope 是 `["electron", "tauri"]`，两者都支持，
  但那是阶段 4 之后的事。
- **Apple 没有公开 blur 半径、圆角、折射率的具体数值。** 上面的取值是视觉近似，不是官方参数。

### 一个 CSS 陷阱（已修）

折射档最初写成拼接：`backdrop-filter: var(--glass-refraction) var(--glass-blur)`。
非玻璃风格下两者都是 `none`，会拼出非法的 `backdrop-filter: none none`，整条声明作废——
只是因为「作废后恰好退回初始值 `none`」才没出事。改成两套**完整配方**（`--glass-lens`
是含 `url()` 的完整值，不是前缀），隐患消失。

### 可访问性

Apple 给 Liquid Glass 配了 Reduce Transparency / Increase Contrast 两个系统开关
（iOS 26 早期正因通透过头挨了可读性批评）。只抄视觉不抄这两条等于只复制了表面，所以
`skins.css` 补了 `prefers-reduced-transparency` 与 `prefers-contrast` 两个媒体查询，
把玻璃整套关掉并换回实心 + 强描边；`prefers-reduced-motion` 下额外关掉 `--glass-lift`。

**注意 `prefers-reduced-transparency` 的浏览器覆盖不如 `prefers-reduced-motion`**，
真要交付还得在产品里自带一个开关。

## 两个实测发现（都是真 bug，已修）

### 1. `src/tokens.css` 按主题宿主重复声明 token，导致任何根级覆盖失效

第一次跑风格切换时，控件高、装饰渐变、阴影都变了，但**圆角、字号、字体三项 5 套完全一样**
（一律 6px / 13px / system-ui）——恰好就是 `tokens.css` 也定义的那几个键。

根因：`applyNbTheme` 给每个主题宿主加 `.nb-ui-theme`，而 **`html` 和 `body` 都是宿主**；
`tokens.css` 原写法 `:where(.nb-ui-theme), :root` 于是在 `body` 上把同一批 token 又声明了一遍。
CSS 里「元素自身的声明」永远压过「从祖先继承的值」，与特异性无关——`html` 上的风格覆盖被
`body` 的重声明整个遮住。

实测证据（切到 editorial 时逐层读同一个变量）：

```
html: --radius-control = 4px    ← 风格生效
body: --radius-control = 6px    ← 被 tokens.css 在 body 上重新声明
btn : --radius-control = 6px    ← 继承自 body
```

修复：`tokens.css` 的选择器改为只用 `:root`。token 不随主题变化，靠继承下发就够，没有理由按宿主
重复声明。同时加了一条测试守住它（`tokens.test.ts` 断言 tokens.css 的选择器里不出现
`.nb-ui-theme`，注释里提到不算）。

这条对阶段 4 主仓接入同样成立：**任何想让用户自定义 UI 风格的设计，都不能把 token 按宿主重复声明。**

### 2. `--accent-text` 不是「填充面上的文字色」

填充按钮原本用 `--accent-text` 当文字色，结果 sepia 主题下「删除」和「放弃修改」两个按钮
几乎看不见字。查主题表才发现 `--accent-text` 是**强调色的文字版本**（sepia `#b85a2a`、
light `#2563eb`、dark `#fbbd23`），不是反白文字——用在填充面上就是深色压深色。

主题合同的 33 个变量里**没有「填充面上的文字」这个角色**。当前只能借 `--text-inverse`
（sepia/light 是 `#ffffff`，dark `#000000`，midnight `#0d0d10`），5 套预设下都成立，
但这是巧合不是保证：亮色主题恰好都配白色 inverse、暗色主题恰好都配深色 inverse。

**记为待补 token**：应该有 `--accent-on` / `--danger-on` 之类明确表达「这个填充面上放什么颜色的字」。
留到设计语言定稿时一起补，届时也要回写主仓的变量总表。

## 验证

| 项 | 结果 |
| --- | --- |
| typecheck | 通过（`vue-tsc --noEmit` 无输出） |
| vitest | 63 passed / 6 files（阶段 1 是 62 / 6，本轮 +1 条守卫） |
| 5 套风格真的作用到元素上 | Chromium 实测通过，见下 |
| 玻璃只在导航层 | 内容层泄漏检测 5 / 5 通过 |
| 边缘折射真的在渲染 | 像素对比通过（同一菜单，开/关折射 md5 不同） |
| 无报错 | pageerror 0 / console.error 0 |

风格生效的判据刻意**读真实元素的计算样式，不读变量**——变量对了但元素没吃到是最常见的假成功，
上面那个 tokens.css 的坑正是这样才暴露的。第二轮又加了两条判据：玻璃必须「有 backdrop-filter
且面本身半透明」（只给 blur 不给透明＝零效果），以及**内容层不许出现 backdrop-filter**
（面板也套玻璃＝层级被抹平）。

```
  Editorial btn=32.0px/4px  /13px 渐变=none     输入=none  面板圆角=8px   玻璃=无            底纹=none 内容层=ok/ok system-ui
  macOS     btn=32.0px/10px /13px 渐变=gradient 输入=inset 面板圆角=18px  玻璃=折射+模糊@0.34 底纹=yes  内容层=ok/ok -apple-system
  Quiet     btn=38.0px/6px  /14px 渐变=none     输入=none  面板圆角=8px   玻璃=无            底纹=none 内容层=ok/ok system-ui
  Terminal  btn=26.0px/3px  /12px 渐变=none     输入=none  面板圆角=4px   玻璃=无            底纹=none 内容层=ok/ok Segoe UI
  Aurora    btn=34.0px/8px  /13px 渐变=gradient 输入=none  面板圆角=12px  玻璃=无            底纹=yes  内容层=ok/ok Inter

不同的元素级签名数: 5 / 5
内容层泄漏: 无
玻璃风格: macOS —— 折射=yes 底纹=yes 面透明度=0.34
RESULT: PASS
```

折射另有一次**像素对比**验证：`CSS.supports('backdrop-filter','url(#nb-lens)')` 返回 `true`
只说明声明被接受，不说明渲染正确。所以把菜单截图两次——一次带 `url(#nb-lens)`，一次只留
`blur(32px) saturate(190%) brightness(1.08)`——比对 md5：

```
acd3f18f6efa37193b8b781e2b631262  lg-menu-off.png   （只有模糊）
6941a922e47ea4d095b0d8399173ff58  lg-menu-on.png    （模糊 + 折射）
```

两张不同，折射确实在渲染。**但第一次对比是在对话框上做的，肉眼几乎看不出差别**——
折射只有在**背后有细节**时才成立，浮在平滑渐变上接近于零。因此对照页把菜单改成压在表格上，
这既是真实的浮层场景，也是唯一能看出折射的摆法。

探针踩过一次假象记在这里：第一版等待 120ms 就读，正好卡在 quiet 的 `--motion-fast: 120ms` 上，
读到了 `box-shadow` 过渡的中间态，误报 quiet「有阴影」。等待放宽到 500ms 后与 CSS 一致。

## 已知缺口

- **风格未选定**，设计语言文档还没写。选定前不进阶段 2。
- 对照页是手写标记，**不能替代「组件能换肤」的验收**——组件消费 token 是阶段 2 的事。
- 五套风格里的「装饰渐变」和 Liquid Glass 的镜面高光用了 `rgb(255 255 255 / .x)` 这类与主题无关的
  叠加层。镜面高光是物理白光，这样写站得住；但装饰渐变要不要补一个主题变量来承载，选定后再定。
- `--accent-on` / `--danger-on` 这类「填充面上的文字色」尚未进契约，当前借 `--text-inverse`。
- **Liquid Glass 只做到了「静态材料 + lift」**：Apple 的 gel / morph（控件按下时从触点扩散光、
  toolbar 按钮直接膨胀成菜单、跨页面 shape-shift）都没做，CSS 变量层也做不了——那要粒子或着色器。
- **Clear 变体没做。** Apple 定义 regular / clear 两个变体，clear 面向照片/视频等媒体背景，
  且亮背景下要在玻璃后垫一层 35% 黑色 dimming layer。当前只实现 regular。
- **`prefers-reduced-transparency` 的浏览器覆盖不足**，产品侧还需要自带开关。
- 玻璃的性能账没测：`backdrop-filter` 每个实例都是一层 GPU 合成，`feDisplacementMap` 更贵。
  当前只挂在 4 类容器上（工具栏 / 侧栏 / 菜单 / 对话框），但 NeuroBook 有 Monaco 和 TipTap
  这种重编辑器，真接入前要单独测滚动帧率。
- Tabs 那条 1px 纵向滚动条按用户决定不单独修（根因见任务 README 的记录），留到阶段 2 第 3 批。
- 改动仍未提交，与阶段 1 的改动在同一分支上累积。
