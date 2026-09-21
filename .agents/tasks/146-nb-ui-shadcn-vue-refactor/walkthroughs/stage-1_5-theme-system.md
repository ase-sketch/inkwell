# 阶段 1.5（第三轮）实现报告：主题系统与主题包契约

日期：2026-08-11。工作仓：sibling `nb-ui`，分支 `refactor/t146-reka-tailwind-base`。
主仓本轮只改文档，**零业务改动**。

状态：计划的批 0–5 全部实施完毕，7 个 commit 落在分支上（`291b2d6` 之后），未合并、未开 PR。
`bun run test` 149 passed、`vue-tsc --noEmit` 无输出、Chromium 探针 10 组全过。
**等用户浏览器走查**，走查通过再进阶段 2（重写 28 个组件）。

## 与计划的出入

计划见 [`../PLAN-stage-1_5-theme-system.md`](../PLAN-stage-1_5-theme-system.md)。三处偏离，都是往上加不是往下砍：

| 计划 | 实际 | 为什么 |
| --- | --- | --- |
| 两套主题包（`editorial` + `macos`），另三套「留着不动」 | **五套全部转成主题包** | 五个本来就是平级的变量块，拆一半反而要维护两条路径。转过去零成本，还白得三个示范主题 |
| 加载器四条校验 | **九条** | 见下「多出来的五条校验」 |
| 契约测试放在库的测试文件里，用 `describe.each` 跑两个实现 | 抽成 `src/testing/` 的导出函数，由**主题**调用 | 依赖方向。库不该知道存在哪些第三方实现；主题作者要的正是「拿套件套自己的实现」 |

计划里没写、实施中补上的两件：`svgDefs` 资源通道（否则 macOS 的折射滤镜只能留在 app 外壳里，
主题包就不完整）、`reduced-motion` 的 `!important`（见下「无障碍那条必须赢」）。

## 交付物

### 术语三层落地（批 1，commit `c2020e6`）

`src/theme/` 拆成两个目录，破坏性改名一次做完：

| 旧 | 新 | 含义 |
| --- | --- | --- |
| `src/theme/`（颜色） | `src/colorway/` | **配色**：33 个颜色变量的取值 |
| playground 的 `skins.css` | `src/theme/` + `themes/` | **主题**：形状 / 节奏 / 装饰 / 角色映射 |

两处易错点当时就踩到：playground 原来的 `useTheme` 是配色、`useSkin` 是风格，改完
`useColorway` 和 `useTheme` **同一个名字换了含义**；两个 localStorage 键也一起换。
改名是个**互换**，直接 sed 会撞车，实际用了一遍带占位符的三步替换。

同批补上 `data-nb-appearance`：配色 store 原来只写 `document.documentElement.style.colorScheme`，
而 **CSS 选不了 `color-scheme`**，主题想按明暗分档就无从下手。

### 主题包契约与加载器（批 2，commit `bb23b04`）

`NbThemeManifest` 是**纯数据**，与运行期入口 `NbThemeModule` 分开。这是硬要求：市场要能在
**不执行第三方代码**的前提下索引、校验、展示主题（VS Code 的 `package.json` contributions
与 extension entry 就是这么分的）。

`hostVersion` 用自写的 `semver-range.ts`（约 40 行）匹配，支持 `*` / 精确 / `^` / `~` / `>=`，
**不支持复合范围**——写 `>=1.0.0 <2.0.0` 会被拒绝并说明不支持，不猜。不引 `semver` 包：
它现在只是传递依赖，升成直接依赖会让每个消费方都背上它。

#### 多出来的五条校验

计划的四条是 `host-version`、`declaration-missing-fallback`、`unknown-component`、`contract-mismatch`。
实施中补了五条，每条都对应一个「不拦就会以别的形式爆出来」的场景：

| reason | 拦什么 | 不拦会怎样 |
| --- | --- | --- |
| `declaration-collides` | 主题重复声明配色契约或设计 token 已有的变量 | 主题悄悄改了别人的合同 |
| `override-mismatch` | manifest 与入口对不上（声明了没实现 / 实现了没声明） | **市场索引到的能力是假的** |
| `colorway-mismatch` | 自带配色对不上、与内置 id 重名、`defaultColorway` 指向不存在或明暗不符的配色 | 「切到 dark」在装不装这套主题时是两种颜色 |
| `unsafe-svg-defs` | 资源里有白名单外的标签、`on*` 属性、外部 `href` | 注入第三方标记等于给了它一块 DOM |
| `duplicate-id` | 同 id 装两次 | 后者静默覆盖前者 |

全部是「**拒绝 + 明确报错**」，一条都不静默降级。理由是市场场景：写主题的人和改库的人不是
同一个人，一个半装成功的主题在用户眼里就是产品的 bug，而且没有任何线索指回主题。

#### 装载 ≠ 激活

`installTheme` 只做登记，哪一套生效由 `theme-store.ts` 决定——市场形态下「装了 N 套、激活 1 套」
是常态。配套加了 `collectThemeColorways()`：主题自带的配色要与内置五套合并，而配色 store 的表
在创建时就定死了，合并只能由消费方做，给个 helper 免得每个消费方各写一遍。

### 五套主题包（批 3，commit `c71ad9f`）

```
themes/<id>/
  manifest.ts     纯数据
  vars.css        取值，选择器 :root[data-nb-theme="<id>"]
  index.ts        运行期入口，自己 import "./vars.css"
  colorways.ts    仅 macos
  assets/lens.ts  仅 macos
  components/     仅 macos（批 5 加）
```

`editorial` 是**最小主题**的实物证据：12 行 manifest + 一份 vars.css，零新增变量、零配色、
零资源、零覆盖。它是一方默认主题，但走**和第三方完全相同的装载路径**——格式因此先在自己身上
被验证一遍，全仓也只有一条代码路径。

`macos` 是天花板：8 个新变量（各带 fallback）、自带亮暗两套配色、SVG 资源、覆盖一个组件。

#### 「一个主题都没装」是受支持的状态

这句话决定了主题层基线该放哪。原来它在 playground 的 `:root[data-nb-theme]` 里——挂在主题
选择器下，零主题时角色映射全空、界面直接塌。现在挪进库的 `src/tokens.css` 裸 `:root`，
主题的 `:root[data-nb-theme="x"]`（0,2,0）稳压它（0,1,0），与两者的引入顺序无关。

8 个玻璃变量刻意**不**放进基线，逼 macOS 去 `declare` 它们——这是「派生型 fallback」这套机制
唯一一次真实演练。fallback 大多是 `none`：正确的兜底不是「差一点的玻璃」而是「没有玻璃」，
半透明糊在纯色上只会得到一层脏膜。

#### 无障碍那条必须赢

主题块是 `:root[data-nb-theme="x"]`（0,2,0），而 `tokens.css` 的
`@media (prefers-reduced-motion: reduce) { :root {…} }` 是（0,1,0）。主题一旦搬进独立文件、
引入顺序随打包器变，**减少动效就会静默失效**。

修法是给三个时长加 `!important`。系统级无障碍偏好压过任意主题是唯一正确的裁决方向，而主题
来自第三方、选择器还能再往上加，靠特异性或顺序都没有稳赢的写法。边界写在注释里：只覆盖库的
三个时长，主题自己新增的动效变量（macOS 的 `--glass-lift`）由主题在自己的 vars.css 里关掉——
库不知道它们叫什么。

macOS 的 `prefers-reduced-transparency` / `prefers-contrast: more` 两块留在主题包自己的文件里，
写在主题块之后：同特异性靠源码顺序取胜，而同一个文件的顺序是确定的。

#### 暗色玻璃：上一轮那个洞的修法

上一轮实测查出整套玻璃配方只按亮色调过。三处方向是反的：Apple 的暗色 Liquid Glass 是**压暗**
不是提亮；白色镜面高光在暗底上会过曝成一圈灰边；面的透明度要收一点。

补的分档挂 `[data-nb-appearance="dark"]` 而**不是** `[data-nb-colorway="dark"]`——主题要响应的是
配色的**明暗属性**，绑配色身份对用户自定义的暗色配色一律失效，且失效时不报任何错。

### 组件覆盖（批 4–5，commit `9152d53` / `b0d3681`）

解析走 `provide/inject`，**不用 `app.component()` 全局覆盖**。调研给的五条理由：可能覆盖用户
自己的同名组件、不支持局部主题、依赖注册顺序、SSR 与客户端易不一致、全局注册表达不了契约版本。

解析顺序只有两层：**主题实现 → 库默认实现**，没有第三层。「切换主题不应让用户丢失核心功能」
（WordPress 原话）在这里的落法是：主题只能替换实现，不能取消——解析永远返回一个可渲染的组件。

`TimePicker` 拆成三份：

| 文件 | 是什么 |
| --- | --- |
| `time-picker-contract.ts` | props / emits / 键盘 / a11y + 三个实现共用的时间算术 |
| `TimePicker.vue` | 解析壳，无 UI，`useForwardPropsEmits` 原样转发 |
| `TimePickerDefault.vue` | 库默认实现：输入框 + 下拉时间列表 |
| `themes/macos/components/TimePickerWheel.vue` | 主题实现：iOS 式双滚轮 |

两个实现刻意做成最大反差——一个能打字、候选是竖列表，一个不能打字、小时分钟是两根独立滚轮——
却跑同一份契约用例。这正是要证明的事：**契约定在数据层，交互形态归主题**。

三条设计口径：`modelValue` 是 `"HH:mm"` 字符串不是 `Date`（一天中的时刻没有日期，用 `Date`
得编一个假日期）；契约**不含 slot**（slot 会锁死布局，主题就换不了形态）；**DOM 结构不进契约**
（Radix Themes 的直接反例：公开 props 一个没改，内部 HTML 重构照样破坏了依赖它的覆盖）。
所以契约测试只从 `role="combobox"` 和 v-model 下手。

契约套件放在 `src/testing/`，走 `@notnotype/nb-ui/testing` 子路径导出。主题作者的自证方式：

```ts
import {runTimePickerContract} from "@notnotype/nb-ui/testing";
runTimePickerContract("my-wheel", MyTimePicker);
```

登记表本轮**只登记一个**（`time-picker@1`）。28 个基础组件还没在阶段 2 重写，现在冻白名单等于
冻空气；而且市场一旦跑起来，登记过的组件 API 就不能随便改了——这是这个方向真正的长期成本，
缓解手段就是极小起步。

## 验证

在 `nb-ui` 仓执行：

| 项 | 结果 |
| --- | --- |
| `bun run test` | **149 passed / 11 files**（基线 63） |
| `bun run typecheck` | `vue-tsc --noEmit` 无输出 |
| `bun run build:css` | 已重出并提交 `dist/nb-ui.css`（消费方走 `github:`/`link:`，无 publish 步骤） |

Chromium 探针（`.agent/tmp/nbui-theme-probe-5d1a7c33/theme-check.mjs`，**Playwright 只能用 Node 跑，
Bun 下 CDP 握手超时**），5 主题 × 亮/暗共 **10 组全过**：

| 判据 | 实测 |
| --- | --- |
| 两条属性通道 | `data-nb-theme` 与 `data-nb-appearance` 都写上了 |
| 主题真落到元素上 | 5 套主题产出 **5 种**控件形状（高度/圆角/字号三元组互不相同） |
| 玻璃只在导航层 | 内容层与面板层 `backdrop-filter` 全部为 `none` |
| 暗色玻璃与亮色不同 | `brightness` **1.06 → 0.82**、高光 alpha **0.6 → 0.22** |
| 非玻璃主题不误吃 | 其余四套 `backdrop-filter` 为 `none` |
| 资源与兜底层真注入 | SVG 容器在文档里且含两档滤镜；兜底层写入 **9 条**声明 |
| 覆盖生效 | macOS 的 2 组渲染滚轮实现 |
| 未覆盖回退 | 其余 8 组回退到库默认实现，两个实现都保留 `role=combobox` |
| 控制台 | pageerror 0 条、console.error 0 条 |

方法论沿用上一轮两条，都是踩过的坑：**读真实元素的计算样式而不是读变量**（变量对了但元素没吃到
是最常见的假成功，`tokens.css` 按宿主重声明那个 bug 正是这样才暴露的）；**等待 ≥500ms**
（120ms 会读到 `--motion-fast` 过渡的中间态，上一轮误报过 quiet「有阴影」）。

坏主题的负例走单测，九条 reason 各有用例，都必须拒绝装载并给出可读原因。

## 实施中踩到的

**只测「覆盖生效」不够。** 第一版探针只查了 macOS 下渲染滚轮，后来补上「其余主题必须是库默认
实现」——只测前者的话，一个把所有组件都换掉的实现也会通过，而那正是「切换主题不应让用户丢失
核心功能」要防的情况。

**镜面高光画在 `::after` 上**，探针第一次读 `.sc-toolbar` 本身的 `background-image` 拿到 `null`，
要读伪元素的计算样式才拿得到。

**dev server 会带着旧的 `.nuxt` 跑。** 中途 `nuxt prepare` 重写过 `.nuxt/`，老进程的 entry 模块
直接 404，探针误报五条失败。重启后全过。Nuxt 有 dev lock，重启前要先 `taskkill /PID <pid> /F`。

**两个测试断言被自己的注释绊倒。** `tokens.css` 与 `macos/vars.css` 的注释里出现了
`:root[data-nb-theme]` 和 `[data-nb-colorway]`（正是用来解释为什么不能那么写），
按字符串切分的断言把注释也算了进去。改成先剥注释再看选择器。

## 后续

**待用户**：浏览器走查五套主题 × 七套配色，以及 macOS 下的滚轮时间选择器。

**仍然挂着的两项拍板**（阶段 1 遗留）：`midnight` / `slate` 两套新配色的观感确认；
`text-sm` 14px → 13px（nb-ui 内 22 处使用）。

**实现级后续**：

- `--window-backdrop` 被 `macos` 和 `aurora` 各声明了一次。按 `NbThemeVarDeclaration` 上写的判据，
  两套以上主题都要用的变量说明**配色契约漏了一个角色**，该在阶段 2 上升为契约的一项。
  现在先各自 `declare`，把这个信号留在代码里。
- 阶段 2 重写 28 个组件时，把可覆盖白名单按数据契约清晰度逐个放开；现有组件把刻度硬编码在模板里
  （`FormSelect.vue` 是 `h-9` / `px-3` / `text-sm`），那是阶段 2 要还的债。`TimePicker` 是新写法的样板。
- 批 1 是破坏性改名，`nb-fullstack-template` 的 `link:` 已断（按 D9 记录，不承诺同步跟进）。
  `neuro-book-site` 钉死在 `291b2d6`、主仓完全不依赖 nb-ui，所以现在做成本最低。
