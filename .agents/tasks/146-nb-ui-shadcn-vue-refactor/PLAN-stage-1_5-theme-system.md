# PLAN 阶段 1.5（第三轮）：主题系统与主题包契约

状态：**已收口**（见 [walkthroughs/05-leader-2026-08-15_23-02-stage-1_5-rounds-5-13-closeout.md](walkthroughs/05-leader-2026-08-15_23-02-stage-1_5-rounds-5-13-closeout.md)）。工作仓：sibling `nb-ui`，分支 `refactor/t146-reka-tailwind-base`，当前收口提交 `a8ae8fe`；主仓本轮只追加 Task 文档，**零业务改动、未提交主仓**。

> **2026-08-13 方向变更（第四轮）：产品默认主题从 `lamplight` 改为 macOS 衍生。**
>
> 本计划第三轮交付了五套主题包，其中 `lamplight`（灯下）是当时的产品候选。用户看过对照页后改了方向：
> 「算了，还是基于 MacOS 这个主题改吧。我觉得目前 主题对照 这里的 MacOS 系列组合比较好看。」
> 并指出现有 `macos` 主题「其实不能算是 MacOS 主题了。应该只能算是衍生」——那是对命名诚实度的判断，
> 不是要求做得更像。
>
> 于是第四轮新建 `nbook` 主题（从 `macos` 衍生）、删掉 `lamplight`，主题阵容从五套收到四套：
> `nbook`（产品默认）/ `macos`（格式参照）/ `editorial` / `aurora`。
> 本文其余部分记录的是第三轮的设计与取舍，仍然有效——变的是**哪一套是产品主题**，
> 不是主题系统本身。第四轮的实现与验证见
> [walkthroughs/stage-1_5-product-theme.md](walkthroughs/stage-1_5-product-theme.md)。
> **2026-08-15 第 5–13 轮收口：** 已完成用户走查与工程收口。`a8ae8fe` 包含本轮半透明浮层高亮、控件圆角 token 接通、Dropdown / Combobox 内层滚动，以及设计语言与主题作者文档勘误；`dist/nb-ui.css` 已随源码提交。
>
> nb-ui 门禁为 `bun run test` 11 files / 173 tests 全过、`bun run typecheck` 无诊断、`bun run build:css` 成功；真实 playground 几何与昼夜高亮探针通过。正式阶段 1.5 已收口，正式阶段 2 尚未开始；本轮提前完成的组件债务不改变阶段边界。

承接 [walkthroughs/stage-1_5-design-language-lab.md](walkthroughs/stage-1_5-design-language-lab.md)。本轮**推翻 D15 第三层「结构：不做」的结论**（见 README 新增的 D17）。

## 为什么变

用户本轮把方向从「换肤」抬到「主题系统」，并给了两条要求和一个前提：

1. 主题开发者能做**组件级**自定义（例：时间选择器在不同主题里是不同控件）。
2. 主题插件提供：组件 + CSS 变量声明 + 几套 CSS 变量定义。
3. **打算做主题市场**，先用这个方案做两套主题试水。

第 3 条决定了后面所有取舍：写主题的人和改库的人不是同一个人，因此契约版本、逐项回退和审核边界从「可选」变成「必需」。

调研见 `.agent/tmp/theme-plugin-research-7c41e9d2/answer.md`（每条带来源 URL）。三条对本计划有直接约束的结论：

- **没有主流 Web 组件库支持「主题包提供组件实现」**。PrimeVue / Vuetify 3 / Ant Design 5 / Nuxt UI v3 / Chakra v3 / Radix Themes / Material Web 全部把主题限定在 token + variant + slot class。Ant Design 的 `components: {Button: …}` 覆盖的是 token 不是组件。**我们是在开路，不是在抄。**
- **手机主题引擎也不换控件实现**。Android RRO 明确禁止代码（manifest 必须 `android:hasCode="false"`，不能含 DEX）；三星 Galaxy Themes Studio 官方定位是 "without coding"；MIUI `.mtz` / EMUI `.hwt` 均未查到官方支持携带可执行代码。**用「手机主题系统」类比时要小心：它是「只换资源」的典型。**
- **真正做到「主题替换 UI 实现」的产品级先例只有 WordPress classic theme 与 Discourse theme components**，两者都伴随一条硬规则：主题可以替换渲染，**但切换主题不应让用户丢失核心功能**（WordPress 官方原话）。

## 目标与非目标

### 目标

1. 术语与类型从「主题 = 一组颜色变量」重定义为三层：**配色 / 主题 / 插件**。
2. 主题包契约（manifest）定稿，且 **manifest 必须是纯数据**——市场要能在不执行代码的前提下索引主题。
3. 主题加载器：装变量、注册配色、挂资源、注册组件覆盖，逐项回退到内置实现。
4. 组件覆盖机制 + 一个真实探针（时间选择器），含契约测试。
5. 两套主题包跑通，作为格式的下限与上限证据。

### 非目标

- 不冻结可覆盖组件白名单（28 个组件还没重写，冻了就是冻空气）。
- 不做沙箱、签名、审核——那是市场的事，不是格式的事。第三档（任意 JS）本轮不开。
- 不建分发管道，两套主题先放 `playground/themes/` 目录内。
- 不动主仓（阶段 3 之前照旧零改动），不重写 28 个组件（阶段 2）。
- 不解决 SSR 下的主题选择（playground 与主仓都是 `ssr: false`，见「开放问题」）。

## 三档能力

分层取自调研的推荐边界，与 VS Code（theme / extension 分离）、WordPress（theme / plugin 分离）同构。

| 档 | 能提供 | 门槛 | 加载 | 本轮 |
| --- | --- | --- | --- | --- |
| **① 声明式主题** | 变量声明 + 取值 + 配色 + 静态资源 | 无 | 运行期 | **完整做** |
| **② 组件实现包** | ① + 覆盖白名单内的组件 | 声明 `hostVersion` + `contractVersion` | 构建期 | **做一个探针** |
| **③ 插件** | ② + 任意 JS | 单独安装、单独授权 | 构建期 | **不做** |

市场第一版只应开放第一档。

## 术语重命名（批 1）

破坏性改名。趁 `neuro-book-site` 钉死在 `291b2d6`、主仓完全不依赖 nb-ui 时做，成本最低。`nb-fullstack-template` 走 `link:` 会立刻受影响，按 D9 记录不承诺同步跟进。

| 旧 | 新 | 位置 |
| --- | --- | --- |
| `NbThemeVars`（33 个颜色变量） | `NbColorwayVars` | `src/theme/theme-contract.ts` |
| `nbThemeVarKeys` | `nbColorwayVarKeys` | 同上 |
| `NB_UI_THEME_HOST_CLASS` | `NB_UI_COLORWAY_HOST_CLASS` | 同上 |
| `NbThemePresetId` | `NbColorwayId` | `src/theme/presets.ts` |
| `nbThemePresets` | `nbColorways` | 同上 |
| `nbThemePresetMeta` | `nbColorwayMeta` | 同上 |
| `NB_DEFAULT_PRESET_ID` | `NB_DEFAULT_COLORWAY_ID` | 同上 |
| `retiredThemeAliases` | `retiredColorwayAliases` | 同上 |
| `applyNbTheme` | `applyColorway` | `src/theme/apply-theme.ts` → `apply-colorway.ts` |
| `createThemeStore` | `createColorwayStore` | `theme-store.ts` → `colorway-store.ts` |
| playground `useTheme`（现在是配色） | `useColorway` | `playground/app/composables/` |
| playground `useSkin`（现在是风格） | `useTheme`（新语义） | 同上 |
| `data-nb-skin` | `data-nb-theme` | `skins.css` → `themes/` |
| `<html data-nb-skin>` 的持久化键 | `nb-ui-playground-theme` / `-colorway` | 两个 key 都要改，注意别互相踩 |

**目录同步**：`src/theme/` 拆成 `src/colorway/`（配色）与 `src/theme/`（主题系统）。`exports["./theme"]` 保留，新增 `exports["./colorway"]`。

### 同批附带：`data-nb-appearance`

`colorway-store.ts:84` 现在只写 `document.documentElement.style.colorScheme`，CSS 选不了它。补一行 `document.documentElement.dataset.nbAppearance = meta[id].appearance`，主题才能写：

```css
:root[data-nb-theme="macos"][data-nb-appearance="dark"] { … }
```

这是上一轮查出的真缺陷的修法：玻璃配方的 `brightness(1.06)` 和白色高光 alpha 是照亮色调的，暗色下方向是反的。**主题必须响应配色的「明暗属性」，而不是绑定配色的「身份」**——绑定身份对用户自定义的配色无效。

## 主题包契约（批 2）

### 结构

```
playground/themes/<id>/
  manifest.ts     # 纯数据。市场索引它，不执行代码
  vars.css        # 变量取值，可按 data-nb-appearance 分档
  colorways.ts    # 【可选】自带配色
  assets/         # 【可选】字体、壁纸、SVG 滤镜
  index.ts        # 【可选，第二档才有】绑定组件实现
```

**manifest 与 index 必须分开**，理由是市场要在不执行代码的情况下索引、校验和展示主题——这是 VS Code 的做法（`package.json` 的 contributions 与 extension entry 分离）。

### 类型

```ts
/** 纯数据。可 JSON 序列化，不含任何函数或组件对象 */
export type NbThemeManifest = {
    id: string;
    name: string;
    tagline?: string;
    version: string;
    author?: string;
    /** 兼容的宿主版本范围（semver range）。装载时校验，不匹配直接拒绝 */
    hostVersion: string;
    /** 本主题新增的 CSS 变量。每项必须自带 fallback */
    declares?: NbThemeVarDeclaration[];
    /** 自带配色 id；不给则用内置 5 套 */
    providesColorways?: string[];
    /** 推荐默认配色，按明暗给。是默认值不是约束 */
    defaultColorway?: {light: string; dark: string};
    /** 声明覆盖了哪些组件，**只写契约 id，不写实现** */
    overrides?: Record<string, string>;   // 组件 key → 契约 id，例 {"time-picker": "time-picker@1"}
};

export type NbThemeVarDeclaration = {
    name: `--${string}`;
    /**
     * 必填。必须能从配色契约派生（字面值或 color-mix），保证任意配色下都成立。
     * 这条是「派生型 vs 要求型」的分界：主题不能要求每套配色为它填一个新变量，
     * 否则用户新建配色时要面对一堆「给我没在用的主题的变量」。
     */
    fallback: string;
    description?: string;
};

/** 运行期入口。第二档才需要 */
export type NbThemeModule = {
    manifest: NbThemeManifest;
    colorways?: Record<string, NbColorwayVars>;
    components?: Record<string, Component>;
};
```

### 加载器

`src/theme/theme-loader.ts`：

1. 校验 `hostVersion` 对当前 nb-ui 版本的 semver range，不匹配**拒绝装载并报错**，不半装。
2. 校验 `declares` 每项都有 `fallback`，缺则拒绝。把 fallback 写进 `:root` 兜底层，保证主题即使漏写取值也不塌。
3. 校验 `overrides` 的 key 都在契约登记表里，且契约 id 版本匹配；不在名单里的直接拒绝并列出原因。
4. 写 `<html data-nb-theme>`，插入 `vars.css`，挂资源。
5. 把 `components` 灌进覆盖 registry。

**四条校验必须都是「拒绝 + 明确报错」，不能静默降级。** 市场场景下静默半坏比直接失败更糟——用户会以为是产品的 bug。

## 组件覆盖机制（批 4）

### 解析顺序

```ts
const impl = themeRegistry[key] ?? builtinRegistry[key] ?? DefaultImpl;
```

用 `provide/inject` 传 registry，**不用 `app.component('TimePicker', ThemeTimePicker)` 全局覆盖**。调研给的五条理由：可能覆盖用户自己的组件、不支持局部主题、依赖注册顺序、SSR 与客户端容易不一致、无法表达契约版本。

```ts
// src/theme/component-registry.ts
export const NB_THEME_COMPONENTS: InjectionKey<Ref<Record<string, Component>>>;

export function useThemeComponent(key: string, fallback: Component): ComputedRef<Component> {
    const registry = inject(NB_THEME_COMPONENTS, null);
    return computed(() => registry?.value?.[key] ?? fallback);
}
```

库侧的可覆盖组件是一层**解析壳**，用 Reka 的 `useForwardPropsEmits` 原样转发 props 与 emits：

```vue
<!-- src/components/form/TimePicker.vue —— 解析壳，不含任何 UI -->
<script setup lang="ts">
const props = defineProps<TimePickerProps>();
const emits = defineEmits<TimePickerEmits>();
const forwarded = useForwardPropsEmits(props, emits);
const impl = useThemeComponent("time-picker", TimePickerDefault);
</script>
<template><component :is="impl" v-bind="forwarded" /></template>
```

### 契约登记表

```ts
// src/theme/contracts.ts —— 库侧唯一真相源：哪些组件可被覆盖、契约是什么
export const NB_COMPONENT_CONTRACTS = {
    "time-picker": "time-picker@1",
} as const;
```

本轮**只登记一个**。白名单铺开等阶段 2 组件重写完。

### 时间选择器契约 v1

用户举的例子，且 nb-ui 与主仓**都没有**日期/时间选择器（已查证）。因此为探针写的实现不是一次性投入——阶段 2 本来就要新建它。

```
props    modelValue?: string     "HH:mm" 24 小时制，唯一格式
         min?: string  max?: string
         step?: number           分钟
         disabled?: boolean  invalid?: boolean
         placeholder?: string
         id?: string             与 label 关联
emits    update:modelValue(value: string | undefined)
slots    无 —— 契约不含 slot，避免把布局锁死
键盘     ↑↓ 调整、Enter 确认、Esc 关闭并回滚、Tab 移焦
a11y     触发器 role=combobox + aria-expanded + aria-controls；关闭后焦点回到触发器
```

**`modelValue` 用字符串不用 `Date`**：一天中的时刻没有日期，用 `Date` 要编一个假日期；字符串跨契约边界也天然可序列化。

**DOM 结构不进契约。** 调研给了直接反例：Radix Themes 的公开 props 一个没改，内部 HTML 重构照样破坏了依赖它的覆盖。

### 契约测试

`src/components/form/time-picker.contract.test.ts`：一份用例，对**每个注册的实现**跑一遍（默认实现 + macOS 的滚轮实现）。这就是市场要的验收面——主题作者跑这份测试来自证。

覆盖：`v-model` 双向、min/max 夹取、step 步进、disabled 不响应、键盘四项、关闭后焦点归位。

## 两套主题（批 3 / 批 5）

刻意选成两个极端。若格式能同时装下这两个，就能装下中间的绝大多数。

| | `editorial` 编辑室 | `macos` Liquid Glass |
| --- | --- | --- |
| 定位 | 内置默认主题 | 模拟第三方主题，压满每个扩展点 |
| 档 | ① | ② |
| 变量声明 | 不新增 | 玻璃那一组（`--glass-*` / `--window-backdrop`），每项带 fallback |
| 自带配色 | 复用内置 5 套 | 自带亮 / 暗两套 |
| 资源 | 无 | SVG 折射滤镜（现在硬编码在 `app.vue`，本轮移进主题包） |
| 组件覆盖 | 无（全部回退默认） | 覆盖 `time-picker` → iOS 滚轮式 |
| 验证什么 | **最小主题能不能只写十几行就成立** | **格式的天花板够不够高** |
`quiet` / `terminal` / `aurora` 一并转成主题包——它们本来就是五个平级的变量块，拆到一半反而要维护两条路径。**全部五套都走 `installTheme`，包括内置默认的 `editorial`，没有任何一套享受特殊待遇**：格式因此先在自己身上被验证一遍，全仓也只有一条代码路径。**「从 5 套里选一套」这个卡点因此消失**：选 `editorial` 当默认，其余四套是示范主题。

## 批次与顺序

| 批 | 内容 | 依赖 |
| --- | --- | --- |
| 0 | 提交现存改动（阶段 1、阶段 1.5 前两轮各一个 commit） | — |
| 1 | 术语重命名 + 目录拆分 + `data-nb-appearance` | 0 |
| 2 | manifest 契约 + 加载器 + 四条校验 | 1 |
| 3 | 五套主题包的第一档部分（变量 / 配色 / 资源） | 2 |
| 4 | 覆盖机制 + 契约登记表 + TimePicker 默认实现 + 契约测试 | 1 |
| 5 | macOS 的滚轮实现 + 覆盖/回退实测 + 主题开发者文档 | 3, 4 |

批 0 单独拆出来的理由：批 1 的 12 项改名会把三轮改动搅进同一个 diff，回归时无法二分定位。

**批 1–3 自成一个可交付整体**：做完就有一个能用的第一档主题系统。批 4–5 是探针，砍掉不影响前三批。

## 验证

| 项 | 判据 |
| --- | --- |
| typecheck | `vue-tsc --noEmit` 无输出 |
| vitest | 不低于当前 63 passed |
| 主题 × 配色两轴 | Chromium 实测 2 主题 × 亮/暗 = **4 组**，**读真实元素的计算样式，不读变量** |
| 玻璃只在导航层 | 内容层泄漏检测（沿用现有探针） |
| 暗色下的玻璃配方 | 亮暗两组的 `brightness` 与高光 alpha 必须不同 —— 这是上一轮的洞 |
| 覆盖生效 | macOS 下 `time-picker` 渲染的是滚轮实现 |
| 未覆盖回退 | editorial 下渲染的是默认实现；macOS 下其他组件仍是默认实现 |
| 契约测试 | 同一份用例对 2 个实现都通过 |
| **坏主题被拒绝** | 三个负例：`hostVersion` 不匹配 / `declares` 缺 `fallback` / 覆盖了不在登记表里的组件 —— 都必须**拒绝装载并给出可读原因**，不是静默半坏 |

沿用上一轮的两条方法论：判据读元素计算样式而非变量（`tokens.css` 那个坑正是这样才暴露的）；探针等待时间要远大于 `--motion-fast`（120ms 会读到过渡中间态）。

## 风险与开放问题

**风险**

1. **契约版本号是自创的，无业界标准可抄。** 调研明确：未查到任何主流 Vue/React 组件库为第三方替代组件定义过契约版本协议。最接近的参照是 VS Code 的 `engines.vscode`。
2. **市场做起来后，可覆盖组件的 API 就不能随便改了。** 这是这个方向真正的长期成本。缓解手段是白名单极小起步——本轮只登记 1 个。
3. **第三方 JS 无成熟沙箱。** 调研原话：「在同一个 Vue/Nuxt app context 中安全执行第三方 Vue 组件，未查到可被视为强安全沙箱的成熟方案」。VS Code 靠 publisher trust + marketplace 扫描 + 签名 + block list，那是一整套运营。**因此市场第一版只能开放第一档。**
4. 批 1 是破坏性改名，`nb-fullstack-template` 的 `link:` 会立刻断。按 D9 记录、不承诺同步跟进。

**开放问题（本计划不冻结）**

- **分发形态**：nb-workshop 的包分发（zip + 平台生成 manifest，Task 88 已建成）还是 npm？前者适合第一档（纯数据 + CSS，无需构建），后者适合第二档（要打包 Vue 组件）。可能两条并存。
- **审核与签名**：第二、三档上市场前必须解决，不在本计划。
- **SSR**：playground 与主仓都是 `ssr: false`，本轮不解决。若将来有 SSR 消费方，运行期切换主题组件会带来 hydration 不一致，届时要限制成只在页面边界切换。
- **可覆盖白名单**：等阶段 2 组件重写完再定。初判适合覆盖的是数据契约清晰的那批（FormSelect / Combobox / TagInput / Pagination / SegmentedControl / SwitchField / FormNumberInput + 未来的 DatePicker / ColorPicker）；Dialog / Panel / Tabs / ContextMenu / Table 这类契约是 slots 和布局的不适合；Button / Badge / Spinner 这类太薄，变量层就够。
