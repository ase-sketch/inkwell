# Frontend I18n

> Active task directory format: `NN-kebab-case-name/`. Archived tasks move to `docs/tasks/archived/<task-slug>/`.

## Relative documents refs

- `nuxt.config.ts`：Nuxt 4 前端配置入口，后续接入 `@nuxtjs/i18n` 模块。
- `package.json`：依赖与脚本入口，已加入 `@nuxtjs/i18n`。
- `app/i18n/i18n.config.ts`：Vue I18n 配置，提供中文默认语言与中文 fallback。
- `app/i18n/locales/zh-CN.ts`：中文源语言 locale message。
- `app/i18n/locales/en-US.ts`：英文第一版 locale message。
- `app/plugins/i18n-locale.client.ts`：前端语言选择的 localStorage 持久化入口。
- `app/app.vue`：前端根组件，当前挂载全局 Dialog / Notification。
- `app/components/common/Dialog.vue`：通用对话框，含默认确认/取消文案。
- `app/composables/useDialog.ts`：全局 alert / confirm / prompt / choose 入口，适合作为首批迁移杠杆。
- `app/composables/useNotification.ts`：全局通知入口，后续需要支持调用方传入已翻译文案。
- `app/utils/api-error.ts`：前端 API 错误兜底文案入口。
- `app/pages/index.vue`：主 IDE shell 聚合页，硬编码文案较多，适合第二阶段迁移。

## User Request / Topic

- 为项目的前端添加 i18n 支持。
- 中文为主，先暂时支持英语。
- 采用评估方案二：使用 `@nuxtjs/i18n`，但不做多语言路由。

## Goal

为 NeuroBook 前端建立 Nuxt i18n 基础设施，默认语言为中文，暂支持英语，缺失翻译时回退中文；先覆盖通用组件、全局反馈入口和主界面关键 UI 文案，再按模块逐步迁移。

完成标准：

- 安装并配置 `@nuxtjs/i18n`，使用 `strategy: "no_prefix"`，不改变现有 URL 结构。
- 提供 `zh-CN` 与 `en-US` locale message 文件，中文作为源语言与 fallback。
- 增加一个轻量语言切换入口，语言选择持久化在浏览器状态中，不写入 Project Workspace。
- 首批迁移 Dialog、全局 JS Dialog API、API 错误 fallback、登录/管理员入口和主 IDE shell 的关键文案。
- 英文包允许阶段性不完整，但不能出现裸 key；缺失时应显示中文。
- 不翻译用户创作内容、workspace 文件内容、AI 生成内容、Project 标题、小说正文和 lorebook/manuscript 文档内容。

## Current State

- 前端技术栈是 Nuxt 4 / Vue 3 / Pinia，`ssr: false`，更像本地工作台，不需要 SEO 型多语言路由。
- `package.json` 已引入 `@nuxtjs/i18n@^10.4.0`。
- `app` 下约 273 个前端文件，约 248 个文件包含中文。
- 排除测试和 preview 后，`app` 内仍有约 4995 行中文命中。
- 文案分布较散：主 IDE shell、Novel IDE、Agent、Markdown Studio、Workspace、Plot、RAG、Profile Template Editor、设置页、登录页和管理员页都有硬编码文案。
- 通用迁移杠杆点明确：`Dialog.vue`、`useDialog.ts`、`useNotification.ts`、`api-error.ts`。
- `nuxt.config.ts` 已加入 `@nuxtjs/i18n`，使用 `strategy: "no_prefix"`，不改变现有 URL 结构。
- `nuxt.config.ts` 的 `vueI18n` 使用绝对路径指向 `app/i18n/i18n.config.ts`；`@nuxtjs/i18n` v10 的相对路径默认从项目根 `i18n/` 目录解析。
- `app/i18n/i18n.config.ts` 配置 `locale: "zh-CN"` 与 `fallbackLocale: "zh-CN"`。
- `app/plugins/i18n-locale.client.ts` 使用 `localStorage["nbook.locale"]` 保存显式语言选择，不写入 Project Workspace 或后端配置。
- `app/components/novel-ide/NovelIdeSettingsDialog.vue` 已有 `frontend` 与 `editor` 两个 Browser State 分区，适合作为语言切换入口。
- `app/stores/novel-ide.ts` 已通过 Pinia persisted state 将主题、默认视图、Markdown/Monaco 编辑器偏好保存到 `novel.ide.local`。语言设置不建议塞入 Novel IDE 业务 store，优先使用 Nuxt i18n 自己的 locale 状态与持久化能力。
- Monaco “行号”等编辑器偏好已在 `shared/editor-workbench.ts` 和设置页中形成“本地 UI 偏好、即时生效、不写文件”的模式；语言切换可复用同一类设置卡片交互心智，但不复用编辑器偏好的数据结构。
- 只读查询确认 `@nuxtjs/i18n` 当前最新版本为 `10.4.0`。

## Decisions / Discussion

- 采用 `@nuxtjs/i18n`，而不是轻量自研字典或完整产品级一次性国际化。
- 使用 `strategy: "no_prefix"`，不引入 `/en`、`/zh` 路由前缀，避免影响现有本地产品 URL、workspace query 和用户书签。
- 中文是源语言，`zh-CN` 是默认 locale 与 fallback locale。
- 英语使用 `en-US`，作为第一批非中文 locale。
- locale message 建议按模块分组，例如 `common`、`dialog`、`auth`、`admin`、`ide`、`agent`、`markdownStudio`、`workspace`、`plot`、`rag`、`settings`。
- 迁移策略采用“基础设施 + 通用入口 + 模块渐进迁移”，不尝试一次替换所有硬编码中文。
- API 返回的服务端中文错误第一阶段保留；前端只处理 fallback 文案。后续如要完整英文错误，需要另建错误 code / message contract。
- preview 页、测试文案、mock 小说内容、注释不作为第一阶段必须迁移范围。
- 语言切换入口放在前端设置页，不放在主工作区显眼位置。
- 英文第一阶段采用“可用英文”目标：优先保证按钮、标题、空状态、错误兜底等 UI 能读懂；核心术语保留一致性，后续再做产品级润色。
- 默认不启用浏览器语言自动切换，避免英文系统用户首次打开产品时自动进入英文；语言由用户在设置页显式选择。
- 语言状态不写入 Project Workspace，也不写入后端 Global / Project Config。
- 首轮实现范围控制在“基础设施 + 设置入口 + 通用组件 + 登录/管理员/Header”，暂不直接迁移 Agent、Plot、Markdown Studio、Workspace 等大模块。

## Implementation Plan

### Implemented file changes

- `package.json`：已新增 `@nuxtjs/i18n` 依赖。
- `nuxt.config.ts`：已在 `modules` 中加入 `@nuxtjs/i18n`，配置 `strategy: "no_prefix"`、`defaultLocale: "zh-CN"`、关闭浏览器语言自动切换，并通过绝对路径加载 Vue I18n 配置。
- `app/i18n/locales/zh-CN.ts`：已新增中文源语言 locale message，并扩展 `settings.scope`、`settings.section`、`settings.editor`、`settings.version` 和 `ide.shell`。
- `app/i18n/locales/en-US.ts`：已新增英文第一版 locale message，并通过 `satisfies LocaleMessages` 对齐中文结构。
- `app/i18n/i18n.config.ts`：已配置 Vue I18n composition mode、默认中文和中文 fallback。
- `app/plugins/i18n-locale.client.ts`：已新增 localStorage 持久化，不进入 Project Workspace；插件内通过 `nuxtApp.$i18n` 访问运行时 i18n，避免在 Nuxt plugin 初始化阶段调用 `useI18n()`。
- `app/components/novel-ide/NovelIdeSettingsDialog.vue`：已在 Browser State / 前端设定中新增语言选择卡片，复用 `FormSelect`；设置页 scope / section / Frontend / Editor / version 主要固定文案已迁入 i18n。
- `app/components/common/Dialog.vue`：默认 footer 的“取消/确定”已改为 i18n。
- `app/composables/useDialog.ts`：默认标题“提示/确认/输入/请选择”已改为 i18n，并让动态创建的 Dialog app 继承 Nuxt 主 app 的 i18n 注入。
- `app/components/common/form/FormSelect.vue`：默认 placeholder “选择项”已改为 i18n。
- `app/utils/api-error.ts`：默认 fallback “请求失败”已改为可翻译 fallback；服务端返回的中文错误第一阶段仍原样展示。
- `app/pages/login.vue`：已迁移登录页关键 UI 文案。
- `app/pages/admin/users.vue`：已迁移管理员用户页关键 UI 文案。
- `app/components/novel-ide/NovelIdeHeader.vue`：已迁移顶部 Header / 用户菜单 / 工作区入口文案。
- `app/pages/index.vue`：已迁移主 IDE shell 的保存/同步/打开引用/欢迎页创建文件等通知、确认框、prompt、Inline AI shell 文案与少量 fallback 文案。
- `app/components/novel-ide/agent/**`：已迁移 Agent 抽屉、Composer、Session 管理、消息气泡、工具卡片、approval / request_user_input / Plan Mode 展示与 client variable patch fallback。
- `app/components/novel-ide/workspace/**`：已迁移 Workspace 文件树、冲突弹窗、文件详情、Lorebook / Character / Location / Rule 档案表单及相关 frontmatter helper fallback。
- `app/components/novel-ide/settings/**`：已迁移模型、Embedding、费用、Web 工具、默认 Profile 和 Agent Profile 模型设置子面板主要固定文案。
- `app/components/markdown-studio/**` 与 `app/composables/useMarkdownStudio*.ts`：已迁移 Markdown Studio toolbar、欢迎页、选择菜单、教程 Agent 占位、工作台状态和同步失败 fallback。
- `app/composables/**`：已迁移主流程中用户可见的 composable fallback；结构化引用菜单继续展示服务端/用户数据本身。

### Completed steps

1. 已安装依赖：`@nuxtjs/i18n@^10.4.0`。
2. 已配置 Nuxt i18n：不加路由前缀，默认中文，暂不启用浏览器语言自动切换。
3. 已建 locale 文件：首批分组为 `common`、`settings.frontend`、`dialog`、`auth`、`admin`、`ide.header`、`api`。
4. 已在设置页加语言选择：放入 `frontend` section，选项为“简体中文 / English”，调用 `setLocale()` 即时生效。
5. 已迁移通用入口：`Dialog`、`useDialog`、`FormSelect`、`api-error`。
6. 已迁移首批业务入口：登录页、管理员用户页、顶部 Header、设置页自身的新增语言卡片。
7. 已验证：类型检查通过；静态 key 查询确认首批直接 `t("...")` key 都存在于 locale message。
8. 已完成 Settings + Main Shell 阶段：设置页剩余主要固定文案和主 IDE shell 通知 / 确认 / prompt 已迁入 i18n。
9. Settings + Main Shell 阶段当时未迁移 Inline AI 和 Markdown Studio slash/reference/skill 菜单，避免提前扩大范围；后续模块扩展阶段已继续收口对应 UI 文案。
10. 已完成模块扩展阶段：Agent、Workspace、Settings 子面板、Markdown Studio、`pages/index.vue` 剩余 shell 文案和相关 composable fallback 已接入 i18n。
11. 已修复设置页刷新后左右目标不一致问题：设置弹窗默认进入 Browser State，并在 scope 变化时强制对齐右侧 active section。

## Verification / Test

- 运行类型检查，确认 i18n 配置、locale message 和组件调用类型正确。
- 手动切换中文/英文，检查首批迁移页面不会出现裸 key。
- 检查中文默认体验不变。
- 检查缺失英文翻译时回退中文。
- 后续需要用户明确要求后，再进行浏览器验证。

## Implementation Walkthrough

- 2026-06-18：完成前端 i18n 方案评估，确认采用方案二：Nuxt i18n + no prefix route + 中文 fallback。
- 2026-06-18：创建本任务 walkthrough，记录范围、边界、迁移顺序和验证口径。
- 2026-06-18：完成现有代码只读调研，确认语言入口复用设置页 Browser State / 前端设定区域，语言状态不进入 Project Workspace；拟定首轮文件范围与分步实现计划。
- 2026-06-18：用户确认依赖已安装；接续实现并确认 `@nuxtjs/i18n@^10.4.0` 已在 `package.json`。
- 2026-06-18：修正 `vueI18n` 配置为绝对路径，解决 `@nuxtjs/i18n` v10 从项目根 `i18n/` 目录解析相对路径导致的配置未加载警告。
- 2026-06-18：补齐动态 `useDialog()` 创建的 Vue app 对 Nuxt 主 app i18n 注入的继承，避免 `Dialog.vue` 的 `useI18n()` 在独立 app 中缺少插件上下文。
- 2026-06-18：完成首批迁移：通用 Dialog、JS Dialog API、FormSelect、API fallback、登录页、管理员用户页、Novel IDE Header、设置页语言入口。
- 2026-06-18：运行 `bun run typecheck` 通过。
- 2026-06-18：完成 Settings + Main Shell 阶段迁移：设置页 scope / section / Frontend / Editor / version 文案改为 i18n；`app/pages/index.vue` 的保存、同步、打开引用、未保存确认和欢迎页创建文件提示改为 i18n。
- 2026-06-18：静态扫描确认 `NovelIdeSettingsDialog.vue` 剩余中文仅为注释；`app/pages/index.vue` 剩余中文集中在注释、Inline AI 与 Markdown Studio slash/reference/skill 菜单，符合本阶段排除范围。
- 2026-06-18：再次运行 `bun run typecheck` 通过；`en-US.ts` 继续通过 `satisfies LocaleMessages` 对齐中文源语言结构。
- 2026-06-18：修复前端初始化崩溃：`i18n-locale.client.ts` 不再在 Nuxt plugin 初始化阶段调用 `useI18n()`，改为依赖 `i18n:plugin` 并使用 `nuxtApp.$i18n` 读取 `locale` / `setLocale`；恢复 localStorage locale 时先 `await setLocale()` 再挂载持久化 watcher，避免默认语言覆盖已保存语言；`bun run typecheck` 通过。
- 2026-06-18：完成模块扩展迁移：Agent、Workspace、Settings 子面板、Markdown Studio、`pages/index.vue` 和相关 composables 的主要用户可见文案进入 locale message；普通 TS helper 使用 `useNuxtApp().$i18n` runtime fallback，避免在非 setup 上下文调用 `useI18n()`。
- 2026-06-18：补齐 Agent client variable patch 错误 fallback 的 i18n，并把 theme 合法值提示改为根据 `themeTokens` 动态生成；`bun run typecheck` 通过。
- 2026-06-18：静态扫描确认扩展范围内未过滤的裸中文用户文案为 0；剩余中文主要是注释、已接 i18n 的中文 fallback、console 调试文案、用户/服务端数据拼接，以及 Markdown 生成模板中的 `<inline-comment body="评论">`。
- 2026-06-18：修复普通 Vitest 直接实例化 composable 时的 i18n 回归：`useAgentSessionStream` 与 `useStructuredReferenceMenu` 不再直接调用 `useI18n()`，改用 Nuxt i18n 可用时翻译、不可用时回退中文源文案；对应 13 条窄测试通过，`bun run typecheck` 通过。
- 2026-06-18：修复 Vue I18n message compiler 初始化错误：locale 文案中的字面量 `@` 需要写成 `{'@'}`，否则会被解析为 linked message；已转义 Agent placeholder 与引用菜单说明，实际中英文 locale 全量 message 编译通过，`bun run typecheck` 通过。

## TODO / Follow-ups

- 继续按模块迁移 Plot、RAG 和 Profile Template Editor；服务端返回中文错误仍需后续错误 code/message contract 才能完整英文化。
- 评估是否需要 i18n key 静态扫描脚本，避免后续出现裸 key 或未使用 key。

## Completed Settings + Main Shell Phase

### Scope

本阶段只做 “Settings + Main Shell”：

- `app/components/novel-ide/NovelIdeSettingsDialog.vue`
- `app/pages/index.vue`
- 必要时补少量 shared locale key 到 `app/i18n/locales/zh-CN.ts` 和 `app/i18n/locales/en-US.ts`

未进入 Agent、Markdown Studio、Workspace、Plot、RAG、Profile Template Editor 的内部模块 UI。这些留到第三批。

### Goals

- 设置页剩余固定 UI 文案已进入 i18n，包括 Config File / Browser State 区域、section label/description、Project selector、保存按钮、版本卡片、Frontend / Editor 偏好标题与说明。
- `app/pages/index.vue` 的用户可见通知、确认框、prompt 标题、dialog 动作文案已进入 i18n。
- 保持 `zh-CN` 为源语言与 fallback，英文仍按“可用英文”质量目标推进。
- 不翻译用户内容、Project 名称、小说标题、workspace 文件内容、AI 输出和服务端返回的 message。

### Implementation Steps Completed

1. 扩展 locale 分组：
   - `settings.scope`
   - `settings.section`
   - `settings.frontend`
   - `settings.editor`
   - `settings.version`
   - `ide.shell`
2. 迁移 `NovelIdeSettingsDialog.vue`：
   - 把 section / scope options 改成 computed，通过 `t()` 生成 label 和 description。
   - 把保存按钮、Project selector placeholder、版本卡片、GitHub title、未保存/读取/保存提示改成 i18n。
   - 把 Frontend 与 Editor 区域中固定标题、说明、按钮、placeholder 迁入 locale。
3. 迁移 `app/pages/index.vue`：
   - 只处理用户可见 UI 文案，不碰注释、mock 数据、用户内容和 API 返回文本。
   - 优先迁移 `notification.*`、`choose()`、`prompt()`、`confirm()`、`Dialog title`、空状态和操作结果提示。
   - 复杂模块传入的子组件 props 文案先保持原状，避免把第三批模块提前卷进来。
4. 执行静态检查：
   - 搜索新增 `t("...")` key。
   - 确认 `en-US.ts` 继续 `satisfies LocaleMessages`。
   - 确认没有新增裸 key 风险。
5. 验证：
   - 运行 `bun run typecheck`。
   - 不自动做浏览器验证；需要真实 UI 检查时单独执行。

### Acceptance Criteria

- 设置页 Browser State / Config File 框架和 Frontend / Editor 区域主要固定文案可随语言切换。
- `app/pages/index.vue` 中首批主 shell 通知、确认和弹窗文案可随语言切换。
- 中文默认显示不变。
- 英文缺失时仍回退中文，不出现裸 key。
- `bun run typecheck` 通过。
