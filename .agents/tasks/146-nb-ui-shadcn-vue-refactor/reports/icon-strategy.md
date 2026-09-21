# 阶段 0 报告：图标方案实测

状态：已完成，结论可用于 O1 定案。数据生成于 2026-08-10。

本报告是实测结果，不是推演。所有数字可复跑，失败原文原样保留。临时根为
`.agent/tmp/icon-strategy-6fec27d0/`（按 AGENTS.md 约定，不在仓库内）。

## 结论先行

**O1 推荐：Tailwind v4 + `@iconify/tailwind4` 预生成模式 + `@source inline(...)` 全量登记 + 一段 9 行 CSS 垫片。**

它是唯一同时满足以下四条的候选：

1. 保留现有 `i-lucide-*` 类名，主仓 1,342 处用法**零改动**；
2. 运行时动态图标名可用，已在 Chromium 里验证渲染，不是推演；
3. 不存在的图标名静默降级，不报错；
4. 产物与今天同量级（gzip 97,848 vs 88,817）。

代价是两条，都已实测确认，不是估计：

- 每条图标规则只输出 `--svg`，遮罩属性在公共选择器上，需要自写 9 行垫片（原因见下）；
- 构建期把全量图标写进 CSS，产物里始终带着 ~98 KB gzip。

**同时有一个量级发现改变了任务排期**：nb-ui 自身只用 15 个图标，全量 1,805 图标的成本属于主仓的图标选择器与 frontmatter 图标功能，**阶段 1–3 完全碰不到它**，只在阶段 4 接入时才付账。详见「量级修正」。

## 硬约束的真实来源

任务 README 记的是「3 处运行时拼接」，实测后这个描述不完整。真正的约束有两层：

**第一层：frontmatter 图标名是用户自己写的。** `app/utils/workspace-reference-menu.ts:31` 与
`app/pages/index.vue:789` 都是 `node.icon ? \`i-lucide-${node.icon}\` : ...`，`node.icon`
读自 workspace 文件的 frontmatter。构建期无法枚举用户会写什么。

**第二层（成本主因，README 未记）：`LucideIconPickerDialog.vue` 一次渲染整个图标集。**
`app/utils/lucide-icons.ts:10` 把 `Object.keys(lucideIcons.icons)` 全量展开成
`lucideIconOptions`，选择器把它们全部渲染成网格再前端过滤。这才是
`uno.config.ts` 里全量 safelist 的真正原因——不是那 3 处拼接。

主仓 `@iconify-json/lucide` 为 `1.2.116`，含 **1,805** 个图标，`icons.json` 为 567,017 字节。

## 基线：今天在付什么

UnoCSS 66.6.2 + `presetUno()` + `presetIcons()` + 全量 safelist，直接调用生成器测得：

| 项目 | 原始 | gzip |
| --- | ---: | ---: |
| 全量 1,805 图标 | 1,102,646 | 88,817 |
| 仅 309 个（主仓实际用到的数量级） | 188,568 | 15,163 |
| `@iconify-json/lucide` 的 `icons.json` | 567,017 | 85,899 |

生成耗时 5,062 ms。

**这里有个反直觉的点：全量 CSS（88,817 gzip）和 iconify JSON 原始数据（85,899 gzip）
gzip 后几乎一样大。** 因为图标选择器要渲染全部 1,805 个，无论走哪条路都得把全量图标
数据发到前端。换方案换不掉这个体积，只能换它的**形态**——CSS 进主样式包永远加载，
JS 模块可以 `await import()` 按需加载。

## 候选 A：Tailwind v4 + @iconify/tailwind4（推荐）

版本：`tailwindcss 4.3.3`、`@tailwindcss/cli 4.3.3`、`@iconify/tailwind4 1.2.3`、
`@iconify-json/lucide 1.2.123`（1,836 个图标）。

`@iconify/tailwind4` 的 README 只有 3 行（指向官网，官网返回 HTTP 403），API 由读
`lib/plugin.js`、`lib/plugins/preparsed.js` 源码确定。它有两种模式：

- **动态模式** `matchComponents({icon: ...})` → 类名 `icon-[lucide--home]`，依赖 Tailwind 扫描到字面量；
- **预生成模式** `prefixes: lucide` → 遍历整个图标集，按 `iconSelector` 模板逐个生成规则。

### 发现 1：类名可以完全对齐现有写法

`preparsed.js` 的 `iconSelector` 默认为 `.{prefix}--{name}`（即 `.lucide--home`），
但模板可配置。设成 `".i-{prefix}-{name}"` 就生成 `.i-lucide-home`——**与主仓现有类名逐字相同**。

实测确认生成的规则为 `.i-lucide-home { --svg: url("data:image/svg+xml,...") }`。

### 发现 2：预生成模式仍受扫描约束，必须显式登记

这是与 UnoCSS 的关键差异。UnoCSS 的 `safelist` 无条件输出；Tailwind v4 的
`addUtilities` 只在类名被扫描到时才落地。第一次实测中 `probe.html` 只写了两个类名，
产物就**只有 2 条规则**。

解法是 Tailwind v4 的 `@source inline(...)`，配合花括号展开一次登记全部：

```css
@import "tailwindcss";
@plugin "@iconify/tailwind4" {
  prefixes: lucide;
  iconSelector: ".i-{prefix}-{name}";
  prefix: false;
}
@source inline("i-lucide-{a-arrow-down,a-arrow-up,...}");   /* 1,836 个名字 */
```

实测生成 **1,837 个唯一 `.i-lucide-*` 选择器**，机制成立。

### 发现 3：需要一段垫片，`maskSelector` 选项走不通

预生成模式下每条图标规则只设 `--svg`，`display` / `mask-image` / `background-color`
等公共属性挂在单独的 `.iconify` 类上。也就是说元素要同时带两个类
（`class="iconify i-lucide-home"`），主仓 1,342 处用法都得改。

插件有 `maskSelector` 选项可改公共规则的选择器，尝试设成属性选择器直接失败，原文：

```
Error: `addUtilities({ '[class*=\"i-lucide-\"]' : … })` defines an invalid utility selector.
Utilities must be a single class name and start with a lowercase letter, eg. `.scrollbar-none`.
```

Tailwind v4 只接受单个类名做 utility 选择器。因此公共规则只能自己写成普通 CSS：

```css
@layer components {
  [class*="i-lucide-"] {
    display: inline-block; width: 1em; height: 1em;
    background-color: currentColor;
    -webkit-mask-image: var(--svg); mask-image: var(--svg);
    -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
    -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
  }
}
```

9 行，一次性成本，之后所有用法零改动。

### 产物与耗时

| 配置 | 原始 | gzip | 构建 |
| --- | ---: | ---: | ---: |
| `@source inline` 全量，无垫片 | 832,111 | 97,723 | 2,233 ms |
| 加垫片（最终形态） | 832,446 | 97,848 | 2,360 ms |

与基线不是严格同条件对比——图标数不同（1,836 vs 1,805，包版本差异）。按每图标归一：

| | 原始/图标 | gzip/图标 |
| --- | ---: | ---: |
| UnoCSS 1.2.116 | 610.9 B | 49.2 B |
| Tailwind v4 1.2.123 | 453.2 B | 53.2 B |

Tailwind 原始体积小约 26%，gzip 后大约 8%，构建快约一半。**两者同量级，体积不构成选型理由。**

### 浏览器渲染验证

用 Playwright 1.62.1 + Chromium 加载真实产物 CSS，三个用例：

| 元素 | 类名来源 | display | 尺寸 | `--svg` 长度 | mask 解析 |
| --- | --- | --- | --- | ---: | --- |
| `#static` | 源码字面量 `i-lucide-home` | inline-block | 16×16 | 404 | `url(...)` ✓ |
| `#dynamic` | **JS 运行时拼接** `"i-lucide-" + pick` | inline-block | 16×16 | 406 | `url(...)` ✓ |
| `#bogus` | 不存在的图标名 | inline-block | 16×16 | 0 | `none` |

`pageerrors: none`，`console.error: none`。

`#dynamic` 模拟主仓 `toLucideIconClass()` 的真实路径——类名由页面加载后的 JS 从数组
取值拼出，源码扫描完全看不到它。它与静态用例结果**逐项相同**，这是 O1 的决定性证据：
`@source inline` 登记后，运行时动态图标名与今天的 UnoCSS 行为一致。

`#bogus` 说明非法图标名静默降级为空图标，不抛错——与主仓
`normalizeLucideIconName()` 的合法性校验叠加后行为可接受。

**避坑（已实测）**：Playwright 在本机 **Bun 下无法启动 Chromium**，进程能起来但 CDP
管道握手超时，原文 `TimeoutError: launch: Timeout 180000ms exceeded.`（`<launched> pid=4144`
之后卡住）。换 Node v24.13.0 立即通过。另外脚本放在主仓目录内时，Bun 会解析到主仓的
`playwright-core@1.61.1` 而非探索仓的 `1.62.1`，浏览器版本对不上，需用绝对路径导入。

## 候选 B：@iconify/vue（组件式，唯一支持按需加载）

版本 `@iconify/vue 5.0.1`。有 `.` 和 `./offline` 两个入口：

| 入口 | 导出 | 原始 | gzip |
| --- | --- | ---: | ---: |
| `@iconify/vue` | `Icon, _api, addAPIProvider, addCollection, addIcon, buildIcon, ...` | 50,742 | 13,874 |
| `@iconify/vue/offline` | `Icon, addCollection, addIcon` | 20,972 | 6,355 |

`offline` 入口不含 API 拉取代码，配合 `addCollection(lucideIconSet)` 完全离线——
这对 NeuroBook 是硬要求（`ssr: false` 的本地 SPA，还有 Electron 桌面壳）。

总成本约 6,355 + 85,899 ≈ 92 KB gzip，与候选 A 同量级。

**它唯一的独占优势**：图标数据是 JS 模块，可以代码分割。主包里只放常用图标，
`icons.json` 用 `await import()` 在图标选择器打开时才加载。候选 A 的 CSS 做不到这件事——
CSS 只能整包加载。按实测数据，这能把常驻成本从 ~98 KB gzip 压到 ~15 KB（309 个图标那档）。

**它的代价**：`<Icon icon="lucide:home" />` 组件式写法，主仓 1,342 处 `i-lucide-*` 类名
用法全部要改写，168 个文件。这是阶段 4 的一大笔账。

## 候选 C：@lucide/vue（不推荐）

版本 `1.31.0`，探索仓 shadcn-vue fixture 用的就是它。安装体积 3,564 个文件 / 20,716,899 字节。

| 项目 | 原始 | gzip |
| --- | ---: | ---: |
| 桶文件 `lucide-vue.mjs`（只是 re-export 清单） | 236,870 | 28,405 |
| 全部 1,768 个图标模块合并 | 1,351,322 | **171,180** |

按名字取图标必须引入整个桶，摇树失效，**171 KB gzip 是三个候选里最差的**，接近候选 A 的
两倍。它适合「图标集合固定且已知」的项目，不适合 NeuroBook 的 frontmatter 自定义图标。

## 候选 D：unplugin-icons（不满足硬约束）

版本 `23.0.1`。它把 `~icons/lucide/home` 这类 import 在构建期解析成虚拟模块。
运行时才知道的名字无法作为 import 说明符——这是语言层面的限制，不是配置问题。

置信度：从机制推断，未单独实测。但该机制不存在支持动态名的路径，除非退回全量桶引入
（等价于候选 C 的成本）。

## 量级修正：nb-ui 的图标面比想象中小得多

这是本轮最影响排期的发现。实测 nb-ui 仓：

| 范围 | 出现次数 | 不同图标 |
| --- | ---: | ---: |
| `src/`（随包发布） | 39 | **15** |
| `playground/`（不发布） | 187 | 25 |

且 `src/` 用到的图标与 `NB_UI_ICON_SAFELIST` 逐项比对**无缺口**，登记是完整的。

对照主仓：1,342 处 / 309 个不同图标 / 168 个文件 / 全量 safelist 1,805 个。

**结论：全量图标的成本属于主仓的图标选择器与 frontmatter 图标功能，不属于 nb-ui。**
阶段 1–3 在 nb-ui 内只需处理 15 个图标，用任何候选方案都是小事。真正的选型压力在
阶段 4，而且届时会与「`LucideIconPickerDialog` 是否搬进 nb-ui」这个问题绑定
（任务 README 已标注它「与 O1 图标方案强耦合」）。

## 建议的分层结论

1. **阶段 1–3（nb-ui 内部）**：采用候选 A。15 个图标，`@source inline` 登记一次即可，
   垫片 9 行。nb-ui 自己产出编译后的 `styles.css`，消费方不需要再登记任何图标——
   这正好让 O2「删掉 `./uno` 导出」成立，不留兼容壳。
2. **阶段 4（主仓接入）**：候选 A 是零改动路径，1,342 处类名和 3 处动态拼接全部原样可用，
   建议作为默认方案。
3. **若之后要压首屏**：候选 B 是唯一能做按需加载的路线，可把常驻成本从 ~98 KB gzip
   降到 ~15 KB，但要付 168 个文件的改写。**这是独立的优化决策，不应与本次框架替换捆绑。**

## 复跑方式

```bash
# 基线（主仓根目录）
bun -e "…createGenerator({presets:[presetUno(),presetIcons()], safelist})…"

# 候选 A（临时根）
bun add -d tailwindcss@4 @tailwindcss/cli@4 @iconify/tailwind4 @iconify-json/lucide
./node_modules/.bin/tailwindcss -i in-shim.css -o out-shim.css --content probe.html

# 渲染验证：必须用 Node，不能用 Bun
node render-check.mjs "file:///…/render-probe.html"
```

## 未验证 / 边界

- 未在真实 Nuxt 4 工程里跑候选 A，只用 `@tailwindcss/cli` 独立构建。Vite 插件
  （`@tailwindcss/vite`）下 `@source inline` 的行为假定一致，**未实测**。
- 未测 UnoCSS 与 Tailwind v4 在**图标以外**的类名差异（任务 README 的已知缺口，仍未补）。
- 未测候选 B 的实际代码分割效果，`~15 KB 常驻` 是按 309 图标档的实测数据推算，非直接测量。
- 候选 D 未实测，结论由机制推断。
- 基线与候选 A 的图标包版本不同（1.2.116 vs 1.2.123），已按每图标归一后比较。
- 垫片的 CSS 层级与主仓现有样式的叠加顺序未验证；接入时需确认不被 reset 覆盖。
