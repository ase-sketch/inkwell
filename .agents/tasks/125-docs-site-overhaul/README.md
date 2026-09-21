# Task 125 文档站体验走查与内容补全

## 用户需求

两轮：

1. 第一轮：列出相对于文档站的产品变化，考虑更新完善文档站。
2. 第二轮：做体验分析 + 优化 + 内容补充，派发子代理以初始用户视角浏览文档站。

用户拍板三点：**执行全部四批** / **首页定位对齐 README，RP 明确标注暂不可用** / **已实施的功能即可写入，标注状态**。

## 走查方法

派 5 个只读子代理并行走查，4 个用户视角 + 1 个机械审计：

| 视角 | 关注 |
| --- | --- |
| 完全不懂技术的网文作者 | 能不能装上、能不能写出第一章 |
| 技术型自部署用户 | 部署决策、命令可执行性、数据与隐私、可运维性 |
| Agent 扩展开发者 | 心智模型、从零写 profile 的可操作性、文档 vs 实现落差 |
| SillyTavern / RP 用户 | 站点承诺了什么、还能不能兑现 |
| 链接与事实一致性审计 | 孤儿页、死链、命令路径核对、站内自相矛盾 |

**子代理结论一律独立核实后才采纳**，下节记录了被推翻的一条。

## 关键发现

### 四视角共同命中

- 首页 7 张 feature 卡里 **World Engine 出现 0 次**，却有一整张卡在推销已归档的 `simulation/`。
- 产品定位有 **4 个互不相同的版本**（站点 hero / introduction / config description / README）。
- `docs/index.md:41,51`、`quick-start.md:63` 承诺教程"到第一次 RP""包含世界模拟"，实际教程叫"到前三章"，06 世界模拟教程已归档。
- 内置 profile 清单三页互斥，`world.engine` / `inline.editor` / `memory.curator` / `adhoc` 全站零登记。

### 各视角独有的致命项

**新手（五道关卡全在写下第一个字之前）**：全站无下载链接；`localhost` / 端口号零命中，装完不知道打开什么；Provider / API Key / 费用零解释；"Agent 抽屉""设置页""项目入口"从未说明界面位置，且 `02-first-project.md:29-33` 让"找不到入口就问 Agent"形成循环依赖；`docs/images/` 有 13 张截图站点零引用。

**技术用户**：`quick-start.md:39`「全站鉴权默认开启」与 `cli.ts:54` 相反且与同页 `:15` 自相矛盾；`bun run auth:create-admin` 在主推 GHCR 路径跑不通；Manager **无 `stop` 命令**却要求用户"先退出服务"；traces / history.sqlite / 可分享日志包三条隐私边界零覆盖。

**开发者**：`profile-tsx/examples.md` 唯一完整示例用了**不存在的 `VariableSchema` 节点**，粘贴即抛异常；`agent/tools.md` 变量工具小节是死面（14 个内置 profile 零绑定）；工具清单覆盖率 < 50%；`subject-rag-memory.md` 占 Agent 分区 45% 篇幅却是未接通系统。

**审计**：`reference/agent/harness.md` 与 `harness-black-box-contract.md` 不存在 → 3 处 GitHub 外链 404；3 条越界相对链接逃出 srcDir；5 个孤儿页会被构建上线（含 2 个 VitePress 脚手架页和 1 篇含项目剧透的内部日志）。

### 被推翻的子代理结论

审计代理推断"`docs:build` 当前极可能失败"。**核实后推翻**：`gh run list` 显示 Deploy Docs 最近 8 次全部 success。它据以推断的陈旧 `docs/.vitepress/dist/hashmap.json` 是本地产物，CI 每次重新构建。死链没拦住构建（越界链接逃出 srcDir 后被 VitePress 跳过），但**线上仍然 404**。

## 变更

**批次 0 阻断修复**：`profile-tsx` 三页的 `VariableSchema` / `Compaction` 幽灵节点（替换为 `leader.default` 实际使用的 `SqlSchemaSummary` 写法）；3 处 harness 404 外链；3 条越界相对链接；`reference/agent/README.md` 三条同源死链；`srcExclude` 补 5 个孤儿页；鉴权默认值按 Profile 分述；`auth:create-admin` 换成 `neuro-book admin create`；删除变量工具死面小节。

**批次 1 新手漏斗**：首页 hero + 7 卡片按 README 口径重写、主按钮改指快速开始；`quick-start.md` 重写（补 Release 下载链接、`http://localhost:3000`、截图、独立的「配置 AI 模型」小节含费用与隐私说明、State Root 限定的配置路径）；教程补顶栏导览表 + 2 张截图 + 界面方位；`themeConfig.search` 启用本地搜索。

**批次 2 信息架构**：新增「核心能力」sidebar 分区；Subject RAG 页加 `danger` 状态块并降至 Agent 分区末位；部署页移出「开始使用」新手分组，与新增的运维页合并为「部署与运维」。

**批次 3 内容补充**（12 个新页）：

- 核心能力：`core/world-engine.md`、`core/plot-workbench.md`、`core/markdown-studio.md`、`core/llmlint.md`
- Agent：`agent/workflow.md`、`agent/modes.md`
- Profile：`profile-tsx/authoring.md`
- 运维：`operations.md`
- 使用指南（第二轮补齐，新增 sidebar 分区）：`guide/settings.md`（四作用域 + 11 分区 + 成本四项计量 + trace 隐私）、`guide/theme.md`（8 套内置主题 + 36 变量 + 核心色派生）、`guide/file-history.md`（收件箱 + 按用户按路径接受位点 + history.sqlite 隐私）、`guide/account.md`（设备码流 + 云备份 + 恢复需停机手动替换）

`agent/tools.md` 补成完整清单表（14 分组）；profile 分区补齐 14 个内置 profile 并标注 RP 组已下线。

**创意工坊刻意不写完整页面**：站点未公开上线、客户端集成未接入，写成可用功能会重演本任务修掉的"文档说有、点进去没有"。只在 `guide/account.md` 里以「尚未开放」标注记录规划形态。

**RP 口径**（按拍板）：首页新增「关于 AI 角色扮演」段；`introduction.md`、`agent/index.md`、`profile/index.md`、`profile/leader.md`、`profile/other-profiles.md`、`blog-agent-rp-harness.md`、`tutorials/05` 七处统一加状态标注，其中教程 05 的转折**前置到开头**（原来埋在结尾）。

## 防回归门

新增 `server/agent/profiles/docs-tsx-examples.test.ts`（3 用例）：扫描 `docs/profile-tsx/*.md` 的 tsx 代码块，断言 ①用到的每个 JSX 标签都在 jsx-runtime 组件表里真实存在 ②从 profile-dsl 具名导入的每个符号都真的被导出。

组件表是 jsx-runtime 内部常量未导出，改用「渲染一次看认不认识」探测（未知节点抛「未知」，其他错误说明节点存在）。

**已验证这个门能抓住原 bug**：把 `VariableSchema` 放回文档后测试失败并精确报出「examples.md: `<VariableSchema>`」，恢复后 3/3 绿。这样 DSL 增删节点忘了同步文档时会直接失败，不再依赖人肉核对。

## 验证

- `bun run docs:build` 三次通过（38 个页面）。VitePress 未设 `ignoreDeadLinks`，构建本身就是死链门，刻意不加该选项。
- `docs-tsx-examples.test.ts` 3/3 通过，并做了失败注入验证。
- 工具面、DSL 节点表（28 项）、profile 清单（14 个）、CLI 命令面、默认端口 3000、8 套内置主题、设置分区与作用域均对着源码核实后写入，非转述子代理结论。

## 顺带发现

- 内置 workflow 实为 **7 个**（`parallel-brainstorm` / `write-review-loop` / `split-book` / `consistency-audit` / `chapter-write-review-revise` / `book-deconstruct` / `character-qa-fanout`），走查开始时本文档记的是 5 个；后两个在本任务进行期间由 Task 124 落地，`agent/workflow.md` 已按 7 个写。
- `.github/workflows/deploy-docs.yml:8` 的 `paths` 触发器含 `reference/**`，但 `reference/` 不在 `docs/` 下、不会被构建进站点，改它只会触发一次无内容变化的重新部署。
- 任务编号在执行期间与 Task 124（写作产品线第三批）撞号，本任务改为 125。
- `docs/public/official/index.html` 的 "写长篇，也该有个 IDE 了" 是全站最好的文案，此前只存在于「官网预览」，本轮提升为首页 hero。

## 浏览器验收（已执行）

Playwright 对 `docs:dev` 实跑：

- 首页 hero、7 张 feature 卡片、4 个按钮全部正确渲染，主按钮指向 `/quick-start.html`。
- **本地搜索可用**：输入「承诺账本」命中新页 `core/plot-workbench.html#承诺账本-伏笔当技术债管`，中文标题索引正常。
- 12 个新页面全部返回 200。
- sidebar 8 个分区全部就位（开始使用 / 基础教程 / 核心能力 / 使用指南 / Agent / Profile / Profile TSX / 部署与运维 / 设计文章）。
- 教程与快速开始的截图**真实加载**（2560×1305），非坏图占位。
- 跨页锚点 `/quick-start.html#配置-ai-模型` 解析成功。
- 对构建产物做全量站内链接扫描：**零断链**。
- 唯一 console error 是 `favicon.ico` 404，与本次改动无关（站点本来就没配 favicon）。

## 自审补漏轮

交付后按 5 份走查报告逐条回查，发现 7 处遗漏并补齐：

| 遗漏 | 严重度 | 处置 |
| --- | --- | --- |
| **`reference/agent/profile-guide.md` 的 5 处幽灵节点**（`WorkdirReminder` / `ProjectWorkspaceReminder` ×2 代码块 + import 列表 + bullet 清单，`Compaction` 顶层节点） | **高** | 全部改为实际存在的 `WorkspaceFocusReminder`；`Compaction` 改述为 `runtimeDefaults` 字段 |
| 防线只扫 `docs/profile-tsx/`，正好漏过上一条 | **高** | 扫描范围扩到 `reference/agent/`，扩展后仍 3/3 绿 |
| `deployment.md` 的 ```powershell 块 `.\Start Neuro Book.cmd` 复制即失败（文件名含空格，PowerShell 把 `.\Start` 当命令） | 中 | 改为「双击启动」+ 给出 `& '.\Start Neuro Book.cmd'` 正确写法 |
| `profile/writer.md` 缺「普通用户不用读」提示（sidebar 里「Writer」对作者最有诱惑力，点进去是 JSON 载荷） | 中 | 加 tip 并指向教程 04；顺带修掉该页残留的 `simulation/` 表述 |
| 16 个内置 Skill 站点无任何清单 | 中 | 新增 `agent/skills.md`（按写作流程 / 随时可用 / 导入 / 开发者向 / 历史五类列全，含三层覆盖、runnable package、白名单，以及 Skill vs Workflow vs 工具的分工） |
| Agent 分区无总览图 | 中 | `agent/index.md` 加流程图 |
| 新手报告里 4 个未答问题（只管设定不用 AI / AI 写的能不能直接发 / 已有稿子能否导入 / 电脑配置要求） | 中 | `introduction.md` 新增「常见疑问」段 |

**总览图刻意不用 mermaid**：`mermaid` 虽在 `package.json` 里，但 VitePress 没装渲染插件，产物实测是 `language-mermaid` 代码块——会把图源码原样显示给读者。不为一张图加构建依赖，改用纯文本图。

自审后复验：`docs:build` 通过（39 页），构建产物站内链接零断链，`docs-tsx-examples` + `profile-dsl` 37/37 通过。全站扫描 `simulation/` / `Plot Beat` / `StoryPlot` / `第一次 RP` / `全站鉴权默认开启` / `auth:create-admin` / `variable_read` / `harness.md` 八个过时标记，仅 `simulation/` 在两处显式标注为历史系统的页面中保留。

顺带把 `operator-bridge.md`（本轮从 srcExclude 放回站点）加了人类读者导语——它原文是写给 Agent 执行的，直接上站会让人不知道该怎么用。

## 第二轮：mermaid 渲染 + 全站英文化

用户要求三件事：修 mermaid（允许加依赖）、官网加 i18n 出英文、派子代理翻译文档站。

### mermaid：不加依赖，自建两个文件

上一轮判定「VitePress 没装 mermaid 渲染插件」是对的，但结论（退化成纯文本图）现在推翻。

**没有引 `vitepress-plugin-mermaid`**：它的 `peerDependencies` 只声明 `vitepress: ^1`，且会拖进 mermaid 9 时代的 `@mermaid-js/mermaid-mindmap@^9.3.0`。为一张图给产品仓引一个不声明支持当前大版本、还带远古传递依赖的包，不划算。

`mermaid@^11.16.0` 本来就是本仓依赖（`app/utils/workflow-preview/render-mermaid.ts` 在用），所以只需要：

- `docs/.vitepress/config.ts` 加 `markdown.config` 的 fence 规则：``` ```mermaid ``` → `<Mermaid code="<encodeURIComponent 后的图源>" />`。用 URI 编码是因为图源里的引号、尖括号和换行会直接破坏 HTML 属性。
- `docs/.vitepress/theme/Mermaid.vue`：`onMounted` 后惰性 `import('mermaid')`，SSR 阶段渲染图源占位（无 JS 也能读），语法错误收窄为「展示原始图源」，`watch(isDark)` 重渲染。
- `docs/.vitepress/theme/index.ts`：`extends DefaultTheme` + 注册全局组件。

新增 4 张图：`agent/index.md` 的 Agent 协作总览（替换上一轮的纯文本图）、`core/world-engine.md` 的 slice→reduce 概念图与写作主链图、`core/plot-workbench.md` 的两棵树交汇图。

**浏览器实测发现一个真 bug**：`<script setup>` 里的顶层 `let renderSeq = 0` 是**每个组件实例各一份**，同页两张图都拿到 id `docs-mermaid-0`。mermaid 用这个 id 生成 style 选择器和箭头 marker，重号会让第二张图引用第一张的定义。改为独立 `<script>` 块的模块级变量后，实测 id 变成 `docs-mermaid-0` / `docs-mermaid-1`。

### 文档站 i18n：root=zh-Hans + en

`config.ts` 重构为 `locales` 结构，nav / sidebar 拆成 `zhNav`/`zhSidebar` 与 `enNav`/`enSidebar`。顺带补了 root locale 的中文界面文案（`outline` / `docFooter` / `returnToTopLabel` / `darkModeSwitchLabel` 等默认是英文）和本地搜索的中文 UI 文案。首页的 English 按钮从外链 GitHub README 改成站内 `/en/`。

`docs/en/` 是 `docs/` 的同名镜像，37 页全部翻译。9 个子代理分批执行，共用一份翻译规范（语气、术语表、链接改写、不可改动清单）。规范里几条关键约束：站内绝对链接加 `/en` 前缀（相对链接不动）、图片相对路径多加一层 `../`（图片实体只有一份在 `docs/images/`）、mermaid 只译节点标签不动语法、不许发明 DSL 节点名。

最后一条当时是**假的**——`docs-tsx-examples.test.ts` 的 `scanDirs` 并不含 `docs/en/profile-tsx/`。已补上，并把标识从 `basename(dir)/name` 改成仓库相对路径（中英两份 basename 相同，否则报错指不到具体文件）。用注入 `<TotallyFakeNode />` 验证过：报错精确到 `docs/en/profile-tsx/nodes.md: <TotallyFakeNode>`，还原后 3/3 绿。翻译同样会抄错节点名，而英文读者一样会复制粘贴。

### 官网 landing 双语

sibling 仓 `agent-design-template` 的 `landing-v2` 加 `LocaleContext`，同一套组件出两份静态页：`official/index.html`（zh）与 `official/en/index.html`（en）。Vite 多入口 + `base: './'` 会按各自 HTML 的位置算相对资源路径，实测英文页正确产出 `../assets/`。

文案模式：每个组件在文件顶部用 `defineCopy(zh, en)` 声明自己的双语文案，不做全站集中字典。

**规范第一版给错了写法**：`const COPY = { zh, en } as const` 过不了类型检查（`as const` 让两边推出不同的字面量类型，`Record<Locale, T>` 直接报错）。子代理跑基线时用隔离 repro 复现后，改为 `i18n.ts` 导出的 `defineCopy<T>(zh: T, en: T)`——以中文为结构基准，英文形状对不上编译期就炸。

数据密集的组件还要再进一步写成 `defineCopy<Copy>(zh, en)`（显式声明 `interface Copy`）：COPY 里含格式化函数时参数会退化成隐式 `any`；`t.beats[beat.id]` 这种按 union key 取值时，推断出的对象字面量类型会变成 7 个异形成员的联合而取不到字段。显式类型同时校验两种语言，比「以中文为基准」更强。

**结构与文案分离**是这轮最关键的手法：`BEATS`、`DIRECTOR`、`SUBJECTS` 这类既含结构（顺序、章节号、延时、字段归属）又含文案的常量，拆成模块级的语言无关结构 + COPY 里按 id 索引的文案表。这样「因果树的槽位顺序」「演示脚本的时序」物理上不可能在两种语言间漂移，缺一条就是编译错误。

**把中文显示文案当类型/判据用的地方**是双语化真正的地雷，不是文案问题而是设计问题：

- `plot-trees-demo.tsx` 的 `type StoryLine = '复仇主线' | '情感支线'`，8 处样式分支拿它做比较。
- `world-engine-demo.tsx` 更重：`patches[].subject` / `.field` 是中文显示串却**当状态表的 key 用**，还有两处中文字面量当谓词——`p.field === '声望'` 和 `value.includes('失窃')` 决定强调色。

都改成语言无关的 id（`SubjectId` / `FieldId` / `SliceId` / `StepId` / `BeatId`），显示名走 COPY 映射。`includes('失窃')` 那处顺手换成真实数据：`reduceState` 本来就知道哪个 slice 写的值，改为返回 `{value, retro}`，不再靠嗅字符串。

### llmlint 英文页的诚信问题

子代理核对 `../llmlint/skill/rulesets/builtin/default/rules/`（360 条）后报告：**llmlint 规则库目前是纯中文的**——265 条 `cn.*`，其余非 `cn.*` 的（`inflation-*`、`story-deslop.*`）也全是针对中文的正则，没有英文规则集。

所以英文官网展示「英文句子被 `cn.*` 规则命中」会暗示 llmlint 能 lint 英文稿件。处理：demo 保留（它讲的机制对英文读者同样成立，且五条规则 ID 是产品标识不能改），但英文版脚注补一句说明规则库面向中文、英文例句只是演示每条规则抓什么。

顺带**把官网 llmlint 的例句逐条对着真实正则跑了一遍**，发现三处「展示的规则实际不会命中」——这是官网可信度最核心的 demo，展示假命中比不展示更糟：

| 位置 | 问题 | 处置 |
| --- | --- | --- |
| `PAIN_POINTS` 的 `✗ no-not-only-but-also · ✗ no-soul-cliche` | 两个规则 ID **都不存在**于 360 条规则库 | — |
| 改成 `inflation-not-only-but` 后**仍然不成立** | 该规则正则是 `这不仅仅?是[^，。！？\n]{0,24}(?:更是\|…)`，字符类**排除逗号**，而例句「这不仅仅是一场战斗**，**更是一次灵魂的洗礼」正好带逗号。node 实测：去掉逗号才 `true` | 换例句为 `他的嘴角勾起一抹意味深长的弧度。` + `cn.vocabulary.body.mouth-corner`（实测命中且默认启用） |
| llmlint demo 第 4 段挂 `cn.cliche.mid-sentence-summary` | 该规则**默认关闭**，而 demo 旁边写着「311 条默认启用」 | 换成同样命中该句、且默认开启的 `cn.cliche.vague-transition-phrase` |
| llmlint demo 第 5 段 `每个人都低着头，喉咙发紧。` 挂 `cn.cliche.trailing-sensory-clause` | **不命中**（该规则要求 `，带着(一种\|一丝\|…)…(感\|意\|无奈\|…)` 结构） | 换例句为 `他点了点头，带着一种说不清的无奈。`（实测命中） |

方法：直接加载 `../llmlint/skill/rulesets/builtin/default/rules/**/*.json` 的 360 条规则，用 `new RegExp(pattern,'u').test(sentence)` 逐条跑，只采纳「命中且 `enabled !== false`」的配对。中英两侧的规则 ID 保持一致（规则 ID 是产品标识）。

### 顺带修掉的源文档错误（子代理走查发现）

| 位置 | 问题 | 处置 |
| --- | --- | --- |
| `docs/guide/account.md` | 说云备份是「项目的完整备份」，实际产品备份**整个实例**含 `.env` / `config.yaml` 密钥（对照 `app/i18n/locales/zh-CN.ts:460`）。这是隐私边界页上的实质错误 | 中英双改：明确范围、列出含 API Key 与实例密码、补充恢复后配置回退 |
| `docs/core/plot-workbench.md` | MICE 写成「使命 / 询问 / 角色 / 事件」，实际 enum 是 `milieu / idea / character / event`（`shared/dto/plot.dto.ts:51`） | 改为「环境 `milieu` / 谜题 `idea` / 角色 `character` / 事件 `event`」 |
| `docs/agent/tools.md` | 「7 个 `save_story_*`」，实际是 6 个 `save_story_*` 加 `save_promise_beat` | 中英双改 |
| `docs/operator-bridge.md` | 更新流程代码块里 `neuro-book update` 重复两行 | 删重复行（没有编造 Manager 自更新命令） |

### 验证

- `bun run docs:build` 通过，76 页（39 zh + 37 en），dead link 检查是构建门（`ignoreDeadLinks` 未设）。
- **locale 泄漏扫描**：`docs/en/**` 的 markdown 绝对链接全部带 `/en/` 前缀，零泄漏；反向零泄漏。产物里英文页指向中文页的链接只有 VitePress 自动生成的 `rel="alternate" hreflang="zh-Hans"` 语言切换器。
- 浏览器实测（`docs:preview`）：英文首页 hero + 7 卡片正常、语言切换器在内容页正确指向对应中文页、英文页搜索按钮是 "Search" 而中文页是「搜索文档」、`en/core/world-engine` 两张 mermaid 图 id 唯一且标签为英文。
- 官网双语构建产出两份 HTML，资源路径各自正确。

### 未处理，交用户决定

**1. ~~「llmlint 340 条规则」这个数字对不上。~~ 已于 2026-07-31 拍板并全量订正。** 实测 `builtin/default` 有 **360 条**规则，其中 **94 条 `enabled: false`**，默认启用 **266 条**。而官网对比表和文档站（README ×2、`docs/index.md`、`docs/core/llmlint.md`）都写「340 条」，llmlint demo 里又写「311 条默认启用」——311 恰好是 `level: medium` 的条数，不是启用数。llmlint 自己的 `skill/README.md` 写的是「约 340 条」，所以 340 是当时的近似值、后来漂了。

用户拍板口径为 **总数 360 / 默认启用 266**，已在 README 重写任务中一并订正，覆盖三个仓共 17 处：

- NeuroBook：`README.md`、`README.en.md`、`docs/core/llmlint.md`、`docs/en/core/llmlint.md`、`docs/index.md`、`docs/en/index.md`、`docs/drafts/marketing-kit.md`（5 处）。
- llmlint sibling 仓：`skill/README.md`、`skill/README.en.md`（并补上「运行 `llmlint rules --format json` 查看实时统计」，避免下次再漂），已经 `sync-llmlint-skill.ts` 同步到 `assets/` 与 `workspace/` 两层副本。
- agent-design-template sibling 仓：`landing-v2.tsx`（2）、`landing.tsx`（2）、`launch-deck.tsx`（3）、`pitch-deck.tsx`（1）、`_components/llmlint-demo.tsx`（1）。**仅改源码未重建** `docs/public/official/`——该仓无 remote 且有 61 项未提交改动，重建会把无关改动一并烘进产物；官网线上仍显示 340，需人工确认后重建。

数字来源改为权威口径：`llmlint rules --format json` 的 `registry` 字段（`totalRules` / `activeRules` / `disabledRules` / `namespaces`），实测 360 / 266 / 94 / 71。`docs/tasks/77-llmlint-rule-registry/README.md` 中的 340/311 是当时的验证记录，属历史事实，未改动。

**2. llmlint 规则本身可能有个缺口。** `inflation-not-only-but` 的正则不匹配带逗号的「这不仅仅是 X，更是 Y」——而带逗号才是 AI 更常见的写法。要不要补，属于 llmlint 仓的事。

### 本轮遗留

- 官网英文版**尚未做窄屏走查**（页头多出语言切换按钮后的横向空间、英文文案在卡片里的换行）。桌面宽度已实测：中英两页各自零跨语言泄漏（英文页正文唯一中文是语言切换按钮的「简体中文」），语言切换往返正常，英文 llmlint demo 交互后改写段落排版正确。
- 重建 `docs/public/official/` 会把 sibling 仓**当前未提交的改动**一并烘进 neuro-book 的产物（该仓 12 个文件处于 `M` 状态且无 remote）。提交前需确认这些在途改动是否都想发布。

## 后续 TODO

- `favicon.ico` 404（既有问题，未处理）。
- **创意工坊**：站点公开上线且客户端集成接入后，补 `guide/workshop.md` 并把 `guide/account.md` 的「尚未开放」标注替换为实际使用说明。
- `deploy-docs.yml` 的 `reference/**` 触发器去留（当前会触发无内容变化的重新部署）。
- 中英两侧的收尾段落已各自统一（中文 24 处「继续阅读」+ 首页「更多入口」，英文全部 Keep Reading）。教程页的「下一步 / 下一步行动建议」语义不同，刻意保留。
