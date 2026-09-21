# 用户 Assets 工作区

## 需求

用户维护 skill 或其他可覆盖 assets 时，不应修改仓库源码。系统需要提供一个全局用户 assets 目录，并让前端复用现有 Novel IDE 文件树、tab、Markdown/Monaco 编辑器和保存冲突处理。

> 迁移提示：本文记录的是较早的 `workspace/.nbook/assets` 方案和旧低代码 Profile 工作台设想。当前 user-assets 稳定形态已经改为直接挂载 `workspace/.nbook`，系统资源根是 `assets/workspace/.nbook`，Agent profile / skill 放到 `.nbook/agent/...`，workspace 模板放到 `.nbook/templates/...`。TSX Profile Workbench 的当前计划以 `docs/tasks/04-tsx-profile-workbench/README.md` 为准；旧正文中的 Zod Schema Builder、`profile-templates` / `user-profile-templates` API、`leader/subagent` 新建限制和 profile 可见性方案不再代表当前计划。Pi Agent runtime 和 assets root 以 `docs/tasks/02-pi-agent-harness-migration/README.md` 与 `reference/workspace/TERMS.md` 为准。

## 决策

- 用户 assets 固定放在 `workspace/.nbook/assets`。
- 覆盖优先级是 `workspace/.nbook/assets/...` > 仓库内置 `assets/...`。
- `agent/skills/<slug>/` 按整个 skill 目录覆盖；用户 assets 中存在同名目录时，不再混合读取系统同名 skill 目录内的文件。
- 其他 assets 默认按同路径文件覆盖；例如 `server/workspace/content-node-templates/...` 中同路径模板文件由用户版本优先。
- `server/workspace/content-node-templates` 和 `server/workspace/novel-directory-template` 都进入覆盖体系。新小说目录模板会先合成系统模板与用户模板，再只补目标 workspace 缺失文件，不覆盖小说 workspace 中已经写过的内容。
- novel workspace 不参与覆盖关系，避免把单本小说内容和全局工作法混在一起。
- 用户 assets 使用独立入口，但复用主页面；入口以 `/?workspace=user-assets` 进入，不放进小说下拉框。
- 用户 assets 页面和 novel 页面允许同时打开，workspace 编辑会话按 `novel:<id>` 与 `user-assets` 隔离。
- 用户 assets Agent 使用独立 profile `leader.assets`，与小说默认 profile `leader.default` 的线程列表和提示词隔离。
- 用户 assets Agent 直接复用普通文件工具编辑 profile TSX，不新增 profile 专用 Agent 工具。`leader.assets` 提示词需要介绍 TSX profile 系统、`defineAgentProfile` 契约、常用 ProfilePrompt 节点、编码规范、校验/预览/恢复流程。
- profile 覆盖采用渐进迁移：`workspace/.nbook/assets/agent/profiles/**/*.profile.tsx` 优先于 `assets/agent/profiles/**/*.profile.tsx`。用户覆盖 builtin key 时必须保留原 key、kind、InputSchema、OutputSchema，只允许调整 prompt 和工具列表等实现细节。
- `同步系统 assets` 只从仓库内置 `assets/` 复制缺失文件到用户 assets，不再从源码 builtin 生成 profile 覆盖文件。
- 动态 profile 是可信本地 TSX 代码，运行时用 esbuild 编译后加载，不做 sandbox；旧 thread 下次运行时会重新从 profile registry 读取当前 profile。
- 用户自定义 profile 的安全边界是“用户自己负责的可信本地代码”。不做 VM sandbox，不做权限隔离；工具白名单只限制模型可调用工具，不限制 `.profile.tsx` 模块自身的服务端代码能力。
- Profile TSX 允许 import 项目源码 API。系统 assets profile 是随项目发布的可信模块，不是完全独立插件；用户自定义 profile 也可 import 项目 API，但文档应推荐稳定 import surface，降低升级破坏。
- builtin key 的类型权威是静态 builtin contract registry。系统 assets 与用户 assets 中的 `.profile.tsx` 是实现权威，但不能改变 builtin key 的 `kind`、`InputSchema`、`OutputSchema`；不一致时 registry 拒绝加载并在 catalog 中展示错误，不回退源码 builtin。
- `allowedToolKeys` 是 profile 实现的一部分，不进入 builtin schema contract 锁定范围。用户覆盖 builtin profile 时可以自行增删工具权限，风险由用户负责；运行时只校验工具 key 是否存在，并继续受全局 app config 工具开关影响。
- Profile 文件保存与运行可用性分离。用户可以保存当前编译失败或 contract 校验失败的 TSX 文件；catalog 必须立即展示错误，运行同 key thread 时必须阻止执行并报告同一错误，不自动回退旧缓存或系统版本。
- Profile 工作台必须能打开坏 TSX 文件继续修复。源码编辑不依赖 profile runtime 加载成功；结构化 Inspector 和真实 prepare 预览按加载状态降级。

## 实现记录

- workspace-files API 增加 `workspaceKind: "user-assets"`，服务端固定解析到 `workspace/.nbook/assets`。
- skill catalog 同时扫描用户 skill 和内置 skill，同名时用户版本覆盖内置版本。
- SkillCatalog prompt 说明覆盖规则：用户 assets 优先、skill 目录整体覆盖、其他 assets 同路径文件覆盖。
- 内容节点模板创建和新小说目录模板复制支持用户 assets 覆盖。
- 写作风格与参考样例资源迁入 `assets/agent/profiles/builtin/`，用户可通过同路径 assets 覆盖。
- 动态 profile registry 扫描系统 assets 与用户 assets 中的 `.profile.tsx`，按同相对路径用户优先，并对 builtin override 做 schema contract 校验。
- `AgentSystem.createDefault()` 已停用源码 builtin profile 注册路径，只注册静态 builtin contract；运行实现来自系统或用户 assets 中的 `.profile.tsx`。
- `create_subagent.profileKey` 与 `invoke_subagent.input` 不再写死 builtin 枚举；`invoke_subagent` 绑定工具时会把当前可用 subagent profile 的 InputSchema 注入给模型，执行时仍由目标 profile 的 inputSchema 做最终校验。
- 新增 `leader.assets` profile，聚焦用户 assets、skill 覆盖、模板和资源编辑；`leader-default` 保持小说协作提示。
- 前端用户资产入口复用主页面、工作区文件面板、主编辑器和 Agent 抽屉。
- Agent thread 创建和列表支持按 leader profile 过滤，用户资产界面只使用 `leader.assets` 线程，小说界面继续使用 `leader.default`。
- `novel-ide` store 增加 workspace session 快照，避免两个浏览器界面互相覆盖 tabs 和当前文件。
- Markdown 预览保留原始 frontmatter 文本，避免模板中的 `{{title}}` 被 YAML 解析为对象键时触发 stringified warning。
- 用户资产模式顶部新增 Profile 工作台入口；工作台复用 TSX profile 可视化编辑器，使用系统 + 用户合成 catalog 展示 `.profile.tsx`，支持画布拖拽、源码编辑、catalog/detail 诊断、真实 prepare 预览、手动保存、恢复系统版本和新建自定义 profile。普通文件编辑器仍只负责自由编辑文件，不承担 profile 语义校验。
- 新增 `GET /api/agent/profiles/catalog`、`POST /api/agent/profiles/detail` 和 `POST /api/agent/profiles/preview-prepare` 对应的服务能力；profile 加载失败以 issue 形式进入 catalog/detail/preview，不阻塞源码继续编辑。
- 新增 `POST /api/agent/user-profile-templates/create`，从 Profile 工作台创建 `leader.*` / `subagent.*` 自定义 profile，并生成标准 `defineAgentProfile` TSX 骨架。
- 新增 `scripts/check-profile.ts <profile-file>`，用于 Agent 或开发者主动检查单个 `.profile.tsx`，不把用户 assets 自动加入主 `tsconfig.include`。
- 新增 workspace 级默认 leader profile 设置，读写 `workspace/.nbook/assets/.nbook/agent-profile-settings.json` 或普通小说 workspace 的 `.nbook/agent-profile-settings.json`；设置入口放在 Novel IDE 设置弹窗的“默认 Profile”，服务端创建线程时也会按同一 resolver 解析默认值。
- 系统 assets 下的四个 builtin profile 已改为 `defineAgentProfile` 模块契约，不再 default export `new XxxProfile()`；源码 builtin class 仅作为迁移期测试/复用 helper 保留。
- Profile 工作台新增 Schema Builder 第一版，可把简单对象字段局部替换到 `InputSchema` / `OutputSchema` 声明；复杂 Zod 继续源码编辑。
- 新增 `scripts/prepare-profile-types.ts` 和 `server/agent/profiles/dynamic-profile-types.generated.ts`，用于开发期生成用户自定义 profile 的 key/input/output 类型增强；运行时不依赖 prepare。

## 验证

- 已运行 `bun run typecheck`。
- 已运行 `bun scripts/check-profile.ts` 检查四个系统 assets builtin profile：`leader-default`、`assets-editor`、`writer`、`retrieval`。
- 已运行 `bun scripts/prepare-profile-types.ts`。
- 已运行 `bun run test server/agent/profiles/profile-registry.test.ts server/agent/profiles/profile-preview.service.test.ts server/agent/profile-templates/profile-template-service.test.ts server/agent/agent-system.test.ts server/agent/tools/builtin/invoke-subagent.tool.test.ts server/agent/services/thread-context.service.test.ts server/workspace-files/workspace-files.test.ts server/agent/skills/skill-catalog.test.ts server/agent/profile-settings/workspace-profile-settings.test.ts server/api/agent/threads/index.post.test.ts`，结果为 10 个测试文件、136 个用例通过。
- 已运行 `bun run test server/agent/profiles/profile-registry.test.ts server/agent/profiles/profile-preview.service.test.ts server/agent/profile-templates/profile-template-service.test.ts server/agent/profiles/builtin/assets-editor.profile.test.ts server/agent/profiles/builtin/writer.profile.test.ts server/agent/profiles/builtin/retrieval.profile.test.ts server/agent/tools/builtin/invoke-subagent.tool.test.ts`，结果为 7 个测试文件、61 个用例通过。
- 本轮新增验证目标：`server/agent/profile-settings/workspace-profile-settings.test.ts` 与 `server/api/agent/threads/index.post.test.ts` 覆盖 workspace 默认 profile resolver、拒绝 subagent 设为 leader 默认值，以及创建线程传递 client variables。
- 不做浏览器自动验证；如需确认页面交互，可后续手动打开 `/?workspace=user-assets` 或再请求浏览器验证。

## 后续

- 设计系统 assets 更新后的用户覆盖冲突提示。
- 如果未来需要单本小说专属 assets，应单独设计 `workspace/<novel>/.nbook/assets` 语义，不在当前版本隐式支持。
- 清理源码 builtin profile class：当前系统 assets profile 已不再 `new` 旧 class，但仍复用源码里的 prompt helper 函数；后续把 prompt helper 完全迁入 assets 或稳定公共 helper 后删除旧 class。
- 拆分 Profile 工作台内的导航、schema 低代码编辑与 catalog issue 展示，避免继续膨胀单个编辑器组件。
- 继续扩展 InputSchema / OutputSchema 低代码 schema DSL；当前第一版只支持简单对象字段、枚举、数组和默认值，复杂 Zod 仍需源码编辑。
- 暂不设计独立 `profile-components` assets 覆盖层；`renderPlanModeReminder` 这类自定义函数 / node 组件先保留在 profile TSX 源码中，后续有明确复用压力再考虑拆分。
- 扩展 prepare/codegen：当前已能生成类型索引骨架，后续补用户 assets 扫描参数的 UI/文档入口与更多静态校验。

## 完整实现计划

### 最终目标

用户 assets 不只是一个可编辑文件目录，而是 Neuro Book 的全局用户配置与 Agent 工作法覆盖层。最终用户应能在 `workspace/.nbook/assets` 中完成这些事情：

- 覆盖或新增 skill、workspace 模板、profile、写作风格、写作参考等系统资源。
- 编辑系统 profile 的提示词与工具配置；调坏后可以恢复系统版本。
- 新建 `leader.*` 与 `subagent.*` profile，并定义 InputSchema / OutputSchema。
- 在用户资产界面中看到 profile catalog、来源、覆盖状态、schema 锁定状态和加载错误。
- 保存 profile 后刷新运行时；旧 thread 下一轮运行立即使用最新 profile。
- 使用 VS Code 式 scope 配置默认 profile：系统默认 < 用户全局配置 < workspace 配置 < 显式 thread/query。
- 长期演进到任意 Agent 树结构，不再把运行拓扑永久绑定到 `leader` 管理 `subagent`。

### 已锁定决策

- 系统 profile 运行时主路径硬切到 `assets/agent/profiles/**/*.profile.tsx`，不再依赖源码 builtin profile fallback。
- 生产运行路径删除或停用源码 builtin profile class，只保留静态 builtin contract。系统 assets 中的 `.profile.tsx` 是 builtin profile 的生产 prompt 实现真相源；系统 assets 自身加载失败时暴露错误，不回退源码 class。
- profile 落盘格式保持 TSX 单文件。低代码编辑器读写可识别区域，高级用户仍可源码编辑。
- profile 模块必须使用 `defineAgentProfile` 契约导出：显式导出 `profileManifest`、`InputSchema`、`OutputSchema`，并以 default export 返回受约束的 profile 定义；不支持任意 class 作为用户 profile 模块形态。
- 用户可新建 `leader.*` 与 `subagent.*` profile。
- `leader` / `subagent` 暂时保留为角色 kind；长期替换为更通用的 agent role / capability，记录为 TODO。
- profile 保存后下一轮立即生效。thread 持久化 `profileKey`，不冻结 profile 源码版本。
- 旧 thread 不绑定 profile 源码版本快照。下一轮 run 会按 `profileKey` 读取当前 registry 中的最新 profile 实现；已持久化的 thread history 保持 append-only，不 retroactive 回写或迁移旧 system/context message。
- `同步系统 assets` 只补缺失，永不覆盖用户文件。系统更新冲突检测与三方合并暂不做，记录为 TODO。
- 系统新增 skill、profile、workspace 模板等 assets 后，继续通过“同步系统 assets”复制缺失文件到用户 assets。用户已存在的同路径文件或同名 skill 目录不被覆盖；恢复系统版本必须由用户显式触发。
- Profile 工作台的重点从大规模低代码编辑转为 TSX 展示、预览、校验、恢复与 Agent 辅助编辑。已经规划的 schema 低代码编辑保留，但作为新建 profile 的辅助入口，不作为覆盖全部 TSX 能力的目标。
- InputSchema / OutputSchema 低代码编辑第一版只支持对象字段子集：object、string、number、boolean、enum、array、nested object、required、description、default。复杂 Zod 和自定义函数保留源码编辑，由用户或 Agent 修改 TSX。
- Schema builder 第一版真实生成 Zod 源码片段，而不是保存独立 JSON schema。低代码表单状态只用于生成 `.profile.tsx` 中的 `InputSchema = z.object(...)` / `OutputSchema = ...`；运行时、预览变量面板和工具 schema 都以加载后的真实 Zod schema 为准。
- Schema builder 保存时只局部替换 schema 声明，不重写整份 profile 文件。目标边界是 exported const declaration：`export const InputSchema = ...;` 与 `export const OutputSchema = ...;`。
- Schema 编辑能力信息不放进 catalog 列表的重 DTO。Profile catalog 只返回列表、来源、加载状态、schema 是否锁定和编辑摘要；打开 Inspector 时再请求 profile detail，返回 InputSchema / OutputSchema 的 JSON Schema、编辑模式、原因和可选源码范围。
- Profile 加载、detail 与 prepare preview 的错误统一走 profile issue DTO。该 DTO 沿用现有 `ProfileTemplateIssueDto` 的 `severity/message/path/sourceText/sourceRange` 展示形状，并扩展 `code`、`profileKey`、`fileName`、`stack` 等运行时字段；不要让各入口继续解析裸字符串错误。
- profile 默认选择配置使用显式配置文件，不继续散落在前端硬编码里：user scope 写入 `workspace/.nbook/assets/.nbook/agent-profile-settings.json`；普通小说 workspace scope 写入 `workspace/<novel>/.nbook/agent-profile-settings.json`；用户 assets 工作区自身的 workspace scope 复用 `workspace/.nbook/assets/.nbook/agent-profile-settings.json`，先不再引入第二个 assets 内配置文件。
- Profile scope 设置第一版简化为系统设置 + workspace 设置。当前已存在的系统设置继续作为系统级默认；用户 scope 暂不做。workspace 设置用 JSON 存放到对应工作区 `.nbook` 文件夹下。Profile scope 设置 UI 归属现有 Novel IDE 设置弹窗，而不是 Profile 工作台。第一版已实现 leader 默认 profile 选择；subagent 偏好仍延期。
- 第一版不新增系统默认 profile 设置项；system default 仍写死为小说 `leader.default`、用户 assets `leader.assets`。后续如有需要再把系统默认 profile 暴露到系统设置。
- builtin profile 的静态类型不由 assets 覆盖改变。`leader.default` 等 builtin key 在源码开发中继续使用 builtin contract registry 的类型；用户自定义 profile 依赖运行时 Zod 校验，可选 prepare/codegen 再生成静态类型索引。
- 类型系统目标：源码开发者应能通过 profile key 静态指定一个 profile，并获得该 profile 的 InputSchema / OutputSchema 类型推导；同时 TSX Profile 低代码编辑器应能通过 runtime schema/detail 加载这些 schema 数据，提供表单编辑和预览输入能力。
- 低代码编辑器展示的类型/表单数据一律来自 runtime Zod schema，而不是 TypeScript 类型。TypeScript 类型、`typeof import` 与 prepare/codegen 只服务源码开发；UI 通过 profile detail API 获取 Zod 转出的 JSON Schema、field model 和 schema editMode。
- `allowedToolKeys` 不做 builtin 上限控制。用户 profile 文件声明的工具列表是能力请求值，registry 只检查工具 key 合法性；最终是否启用仍由全局工具配置过滤。
- 保存失败语义按源码编辑器处理：文件写入成功不代表 profile 可运行。保存后 registry/catalog 立即刷新；加载失败时保留文件、展示错误、禁止运行，恢复系统版本必须由用户显式触发。
- 动态 subagent schema 第一版全量注入当前可用 subagent profile 的 InputSchema，不做数量/大小限制；后续如果 schema/token 成本过高，再结合 profile 白名单、收藏或启用状态优化。

### 阶段 A：测试基线清理

目标：进入大改前先让验证基线可信。

- 更新 prompt fixtures，使 SkillCatalog 覆盖说明和当前 skill 文案一致。
- 修复 shell tool 测试与实际输出不一致的问题；优先恢复 `Working directory` 输出，方便 Agent 调试。
- 跑通 `bun run typecheck`、核心 profile/assets 测试与全量 `bun run test`。

### 阶段 B：系统 Profile 资产化硬切

目标：系统 profile 的唯一运行时来源变为 assets。

- 将生产 profile 迁入 `assets/agent/profiles/`：
  - `leader.default`
  - `leader.assets`
  - `subagent.writer`
  - `subagent.retrieval`
- `AgentSystem.createDefault()` 不再注册 `LeaderDefaultProfile`、`AssetsEditorProfile`、`WriterProfile`、`RetrievalProfile` 的运行时实例。
- 保留静态 builtin contract registry，只保存 builtin key 的 `kind`、`InputSchema`、`OutputSchema`、静态类型映射，不保存 prompt 实现。
- 保留 `KnownProfileKey` / `ProfileInputMap` / `ProfileOutputMap` 这类静态开发合同：
  - builtin key 可通过 key 获得静态 Input / Output 类型推导。
  - 用户覆盖 builtin key 不改变静态 schema contract。
  - 自定义 profile 运行时 key 仍是 string，依赖 Zod 校验；后续可通过 prepare/codegen 生成类型索引增强开发体验。
  - 不因为动态 profile 把整个 agent 系统退化成 `any`。
- 静态推导分三种场景：
  - builtin profile：可直接通过 key 推导 `ProfileInput<"subagent.retrieval">` / `ProfileOutput<"subagent.retrieval">`，不需要 prepare。
  - 用户自定义 profile 文件内部：通过 `defineAgentProfile` 从本文件 `inputSchema` / `outputSchema` 推导 `ctx.input` / 输出类型，不需要 prepare。
  - 其他源码文件通过用户自定义 key 推导类型：必须先运行 prepare/codegen 生成动态类型索引，否则只能退回 `JsonValue` / 宽类型。
- 调整 `defineAgentProfile` 类型签名，让自定义 profile 文件内部的 `ctx.input` / `ctx.output` 从传入的 `inputSchema` / `outputSchema` 推导，而不是只通过 `ProfileInputMap[TKey]` 查表。builtin key 仍由静态 contract 校验，用户自定义 key 则在文件内部获得 schema 推导类型。
- Profile 类型系统逐步演进为 key/input/output 三泛型，而不是继续只用 `TKey -> ProfileInput<TKey>` 查表。目标形态是 `AgentProfile<TKey extends string, TInput = ProfileInput<TKey>, TOutput = ProfileOutput<TKey>>`，让自定义 profile 在本文件内从 Zod schema 获得强类型，同时保留 builtin key 的查表类型。
- 删除或停用源码 builtin profile class：
  - `LeaderDefaultProfile`
  - `AssetsEditorProfile`
  - `WriterProfile`
  - `RetrievalProfile`
- 允许保留测试 stub / fixture，但它们不能进入生产 `AgentSystem.createDefault()` 注册路径。
- 用户覆盖 builtin key 时继续校验 contract：不能修改 key、kind、InputSchema、OutputSchema。系统 assets 中的 builtin profile 声明如果与静态 contract 不一致，也按加载错误处理。
- 动态 profile loader 只接受 `defineAgentProfile` 模块契约；manifest/schema/prompt/工具权限都从同一模块读取，方便运行时校验、UI 预览和 prepare 类型索引生成。
- `defineAgentProfile` 的开发期类型体验必须支持自定义 key：
  - `inputSchema: ZodType<TInput>` 推导 `buildPrompt(ctx).input`。
  - `outputSchema?: ZodType<TOutput>` 推导 profile 输出类型。
  - 不要求自定义 key 先进入全局 `ProfileInputMap` 才能在本文件内获得类型。
  - builtin key 覆盖仍在 registry / contract 层确认 schema 等价，不能改静态类型权威。
- 三泛型迁移范围：
  - `AgentProfile<TKey, TInput, TOutput>` 持有 `inputSchema: ZodType<TInput>`、`outputSchema?: ZodType<TOutput>`、`prepare(runtime: ProfileContextRuntime<TKey, TInput, TOutput, ...>)`。
  - `SimpleProfile<TKey, TInput, TOutput>` 与 `ProfilePromptContext<TKey, TInput, TOutput>` 使用 schema 推导出的 `TInput`，保证 `ctx.input`、`scope.input` 和 watched variable path 都能获得正确类型。
  - `ProfileContextRuntime<TKey, TInput, TOutput, TProfile>` 不再把 `input` 固定写成 `ProfileInput<TKey>`，而是接收显式 `TInput`。
  - `AgentVariableScope<TKey, TInput = ProfileInput<TKey>>` 允许显式传入 input 类型；builtin key 默认继续走 `ProfileInput<TKey>`。
  - `scope.input` 必须保留，并且与 `ctx.input` 使用同一个 `TInput`。否则 `ctx.input.xxx` 与 `ctx.var("scope.input.xxx")` / `Watch path="scope.input.xxx"` 会出现类型漂移。
  - registry / runtime 列表可以用宽类型 `AgentProfile<string, unknown, unknown>` 或 `AgentProfile<string, JsonValue, JsonValue | undefined>` 承接动态 profile，执行前仍通过 `profile.inputSchema.parse()` 得到运行时合法输入。
- 工具执行层不跟着全量强泛型化。`AgentToolContext` 可持有宽类型 `profile: AgentProfile<string, unknown, unknown>`；`report_result` 等工具依赖 runtime `outputSchema` 校验即可。后续如需静态 profile-aware helper，再提供 `AgentToolContextFor<TKey, TInput, TOutput>` 这类窄化类型，避免把整个 tool runtime 迁移成按 profile 泛型分发。
- 迁移原则：先让新泛型带默认值，避免一次性改爆所有调用点；再逐步把 `defineAgentProfile`、`SimpleProfile`、preview runtime、subagent invoke 等入口收敛到显式 input/output 泛型。
- 动态 profile loader 不做 sandbox。加载用户 `.profile.tsx` 等同于执行可信本地代码；不要把它描述成安全隔离的插件系统。
- assets profile 允许 import 项目源码中的稳定 API：
  - `defineAgentProfile`
  - prompt nodes / DSL components
  - builtin contract schema，例如 `LeaderInputSchema`
  - 稳定工具类型与共享 helper
- 不鼓励 import 旧源码 builtin profile class、迁移期 helper、测试 fixture 或深层私有实现。系统 profile 硬切到 assets 后，旧 builtin class 不能作为 assets profile 的依赖逃生口。
- 不对 builtin override 的 `allowedToolKeys` 做额外上限校验；用户可以通过覆盖 profile 自行开启或关闭工具。
- `restore system profile` 只从系统 assets 同路径恢复。
- 恢复系统版本第一版只恢复整份系统 assets 同路径 `.profile.tsx`，不做 prompt/schema/工具列表的局部恢复。
- `syncSystemAssetsToUserAssets()` 改为只从系统 assets 补缺失 profile 文件，不再从源码 builtin 生成覆盖文件。
- 清理或标注源码 builtin fallback 代码；不能立即删的开发辅助代码必须有 TODO 指向删除条件。

### 阶段 C：Profile Catalog 与加载错误可见性

目标：用户在 UI 中能明确知道每个 profile 的状态。

- 新增 `server/agent/profiles/profile-catalog.service.ts`，承载 runtime profile catalog、来源、覆盖状态、schema 锁定状态与加载错误；不把这些职责塞进 `profile-template-service.ts`。
- 新增 profile catalog API，返回合成后的系统/用户 profile 视图：
  - `profileKey`
  - `kind`
  - `name`
  - `fileName`
  - `source`
  - `overrideState`
  - `schemaLocked`
  - `schemaEditSummary`
  - `loadStatus`
  - `errorMessage`
- 新增 profile detail API，供 Inspector 使用：
  - `profileKey`
  - `manifest`
  - `allowedToolKeys`
  - `inputSchema.jsonSchema`
  - `inputSchema.editMode`
  - `inputSchema.reason`
  - `inputSchema.sourceRange`
  - `outputSchema.jsonSchema`
  - `outputSchema.editMode`
  - `outputSchema.reason`
  - `outputSchema.sourceRange`
- 新增共享 `ProfileIssueDto`，优先复用现有 profile 模板 issue 展示语义：
  - `severity: "error" | "warning"`
  - `code: "compile_error" | "manifest_error" | "schema_contract_error" | "tool_key_error" | "schema_source_error" | "prepare_error"`
  - `message`
  - `profileKey?`
  - `fileName?`
  - `path?`
  - `sourceText?`
  - `sourceRange?`
  - `stack?`
- `ProfileIssueDto.stack` 只在开发模式返回，生产默认不返回，避免泄露本机绝对路径和内部调用栈。`message/code/sourceRange/sourceText` 是用户界面和测试断言的稳定字段；后续如果需要完整调试信息，可单独加“显示开发诊断”设置。
- `ProfileIssueDto` 与当前 `ProfileTemplateIssueDto` 的关系是“同一 UI 展示语义、不同领域 DTO”。如果实现时可以无痛扩展 `ProfileTemplateIssueDto`，可合并到共享 base schema；否则新建 profile 专用 DTO，但字段命名保持一致。
- catalog 返回每个 profile 的 issue 摘要；detail 返回源码、issues 和能从 AST 解析出的结构信息；prepare preview 加载失败或 prepare 内部失败时返回同类 issue。
- 普通 HTTP 失败仍可继续用 `resolveApiErrorMessage()` 提取 `message/statusMessage`；profile 工作台内部错误列表优先读 `ProfileIssueDto[]`，避免每个入口重复解析错误字符串。
- Profile 工作台内的 profile 错误按业务结果返回，不作为 HTTP 异常：
  - catalog / detail 返回 `200 + issues[]`，因为坏 profile 文件是用户需要继续编辑和修复的正常状态。
  - prepare preview 返回 `200 + ok: false + issues[]`，便于 UI 在预览区域稳定展示错误。
  - 请求参数非法、路径越界、缺少必要字段等协议错误仍使用 400/404。
  - 真实 thread run 不改成 200 业务响应，继续走现有 Agent 错误事件 / 线程失败链路，但错误内容可复用 `ProfileIssueDto` 的 `code/message`。
- TypeScript typecheck 不进入工作台的自动保存/自动校验链路。工作台负责运行时加载诊断、schema contract、tool key、真实 prepare 预览等 profile 运行诊断；TypeScript 类型检查是 Agent 或开发者通过 shell 工具主动运行的验证步骤，类似项目开发时执行 `bun run typecheck`。
- Agent 类型检查复用项目 bun/package.json 环境，但不把用户 assets 自动加入主 `tsconfig.json`。新增 profile 专用检查脚本，用于单文件 profile TSX 验证；全仓 `bun run typecheck` 仍用于源码、系统 contract、loader 或共享类型改动。
- `schemaEditMode` 分为 `locked`、`builder`、`source-only`：
  - builtin key 的 InputSchema / OutputSchema 永远是 `locked`。
  - 自定义 profile 中可稳定定位的简单 exported const schema 是 `builder`。
  - helper、复杂 Zod、无法定位声明或无法 round-trip 的 schema 是 `source-only`。
- `jsonSchema` 来自运行时真实 Zod 转换，只用于展示、预览 input 表单和变量说明；保存仍以 TSX 源码里的 Zod 声明为真相源。
- registry refresh 收集所有动态 profile 加载错误，不只在 `get(profileKey)` 时抛出。
- profile registry 保留简单 lazy refresh：`get/list/listByKind` 每次读取前刷新动态 profile，旧 thread 下一轮运行自然使用最新文件。第一版不引入 watcher，也不强制做复杂增量缓存；如果后续发现性能问题，再按文件 mtime/hash 做 refresh skip 或 per-file cache busting。
- 线程只持久化 `profileKey`，不持久化 `profileVersion` / `profileSnapshot`。这保证用户保存 profile 后旧 thread 下一轮立即使用新实现；严格可复现性后续如有需要再显式设计。
- profile catalog API 每次请求都刷新 registry，并返回最新 loadStatus / errorMessage；前端不从本地缓存推断 profile 可用性。
- 用户资产界面展示 profile catalog：
  - 系统 profile
  - 用户覆盖
  - 自定义 profile
  - 加载失败
  - builtin schema contract 锁定提示
- Profile detail / Inspector 降级策略：
  - 源码 tab 永远可打开，只要文件能读。
  - runtime detail 加载失败时，manifest、schema、allowedToolKeys 等结构化区域展示加载错误。
  - 如果 TypeScript AST 仍能定位 `profileManifest` / `InputSchema` / `OutputSchema` 文本，可展示“源码解析信息”，但不能标记为运行时可用。
  - profile `loadStatus` 不是 ok 时禁用真实 prepare 预览。
  - 保存坏 TSX 仍允许；保存后刷新 catalog/detail，让用户继续在同一文件中修。
- 保存 profile 后立即 refresh registry/catalog。加载失败时保留文件并显示错误；旧 thread 下一轮运行同 key profile 时阻止执行并报告同一错误，不回退旧缓存。
- 允许保存半成品 TSX。编译错误、manifest 错误、builtin schema contract 错误、工具 key 不存在都进入 catalog issue；运行时遇到同 key profile 时复用 catalog 错误阻止执行。
- 新增 `server/agent/profiles/profile-preview.service.ts` 与 `POST /api/agent/profiles/preview-prepare`，专门负责真实 `profile.prepare()` 模拟运行。现有 `/api/agent/profile-templates/preview` 继续作为 AST 静态预览和结构编辑辅助。

### 阶段 D：Profile 工作台闭环

目标：Profile 工作台从固定 demo 入口变成真正的 profile 管理界面。

- `UserProfileWorkbenchDialog` 改为 catalog 驱动，不再固定 `leader.default`。
- 工作台支持选择并编辑：
  - `leader.default`
  - `leader.assets`
  - 系统 subagent profile
  - 用户自定义 profile
- 预览线程按当前 profileKey 过滤，不再固定 `leader.default`。
- 画布编辑只替换可定位的 `ProfilePrompt` JSX；`renderPlanModeReminder`、`Watch.render`、复杂条件和 helper function 保留源码编辑。
- Inspector 面板承担 profile 属性与 schema 的主要展示和编辑职责，包括 `profileKey`、`kind`、`name`、`description`、`allowedToolKeys`、InputSchema / OutputSchema、来源和加载状态。
- 预览界面更接近 profile prepare 模拟请求台：用户可以调整 input、thread history、scope / runtime 变量等请求上下文，然后观察当前 profile 真实 `prepare()` 后生成的 `Message[]` 和渲染错误，不重复承担 manifest/schema/catalog 展示职责。
- Message[] 预览以真实 `profile.prepare()` 为权威。现有 AST 静态 preview 只作为结构编辑辅助，不能替代最终 prepare 结果。
- 预览 API 使用临时 runtime 调用当前 profile 的 `prepare()`；允许执行 `buildPrompt()` 内部读取逻辑，例如 writer 读取 `lorebookEntries` 文件或通过 plot facade 展开 `plotPoints`。预览不调用 LLM、不执行模型工具调用、不创建真实 thread、不写真实 thread metadata。
- 预览结果主展示 `preparedRun.modelMessages`；`persistedMessages`、`immediateMetadata`、`completedMetadata` 可作为调试信息展示，但不提交。
- 预览 runtime 不是手搓 `ctx`。服务端从 registry 获取当前 profile，用 profile 的 `inputSchema` 校验 input，创建内存临时 thread，构造完整 `AgentVariableScope`，并通过 preview adapter 提供 `messageStore`、`threadRepository`、`variableStore` 等无写入副作用依赖。
- 预览请求由前端传入 `profileKey`、`input`、临时 `historyMessages`、`scopePatch`、`runOptions`。服务端默认从当前页面上下文填充 `studio.workspace`、`studio.novelId`、`workspaceKind` 等 scope；novel 页面默认当前小说 workspace，用户 assets 页面默认 `workspace/.nbook/assets`。
- 预览中的 `scope.agent.tools` 使用 `resolveEnabledToolNames(profile.allowedToolKeys, config.agent.tools)` 过滤后的结果；`skillCatalog` 使用真实 catalog provider，使 `ctx.skillCatalogText` 与真实运行一致。
- 真实 prepare 预览不扩展现有 `profile-template-service.previewProfileTemplate()`。`profile-template-service` 保持 AST 解析、结构编辑和静态 preview 职责；运行时预览走 `profile-preview.service.ts` 和 agent profile 语义 API。
- 工作台保存、恢复系统版本、同步系统 assets 后主动请求 profile catalog；preview prepare API 也先刷新 registry 再取 profile，确保预览刚保存的版本。
- 第一版不引入文件 watcher，也不把 mtime/hash 增量刷新作为必须项。若后续性能有压力，再考虑基于文件 mtime / hash 的 refresh skip 或 per-file cache busting。
- Agent 辅助编辑 TSX 时复用普通文件工具：`read_file`、`edit_file`、`apply_patch`、`write_file`。第一版不新增 `edit_profile_prompt`、`update_profile_schema` 之类 profile 专用工具，避免维护第二套编辑语义。
- 支持保存、校验、预览、恢复系统版本。
- 保存动作只保证写入文件；校验和预览展示当前 profile 是否可加载。加载失败的 profile 仍留在文件树中，方便用户继续用源码或 Agent 修复。
- 普通文件编辑器继续只负责自由编辑文件，不承担 profile 语义校验。

### 阶段 E：新建 Profile 与 Schema 低代码编辑

目标：用户能从 UI 创建一个可运行的新 profile。

- 新建 profile 写入 `workspace/.nbook/assets/agent/profiles/**/*.profile.tsx`。
- 新建 profile 文件采用固定模块骨架：`profileManifest`、`InputSchema`、`OutputSchema`、`Input` / `Output` 类型别名、`defineAgentProfile(...)` default export。
- 新建表单字段：
  - `profileKey`
  - `kind`
  - `name`
  - `description`
  - `allowedToolKeys`
  - `InputSchema`
  - `OutputSchema`
  - 初始 prompt 模板
- profileKey 校验：
  - `leader.*` 必须是 `kind: "leader"`
  - `subagent.*` 必须是 `kind: "subagent"`
  - 自定义 key 不允许破坏 builtin contract
- Schema 编辑器第一版支持对象字段子集；复杂 Zod 标记为源码定义，低代码不可完整编辑。
- Schema builder 第一版采用“结构化 schema builder -> Zod 源码片段”模式：
  - 支持 `string`、`number`、`boolean`、`enum`、`array`、`object`。
  - 支持 `required`、`description`、`default`。
  - 生成到 profile 源码中的 `InputSchema` / `OutputSchema` 定义。
  - 不保存独立 JSON schema，不让 JSON schema 成为第二真相源。
- 编辑简单 schema 时只局部替换 `export const InputSchema = ...;` / `export const OutputSchema = ...;` 的 initializer 文本。
- 如果 AST 无法稳定定位 exported const declaration，或 schema 定义依赖 helper / 复杂表达式，则禁止低代码保存并提示改用源码编辑。
- Schema builder 不重写 `buildPrompt()`、helper function、import 顺序或其他源码；新建 profile 才使用完整模板生成整份 `.profile.tsx`。
- 局部替换逻辑放在服务端，用 TypeScript AST 定位声明范围；前端只提交 schema builder DTO 和目标 schema 名称。
- 替换后立即刷新 profile catalog。加载失败保留文件并展示错误，不自动恢复系统版本。
- 已有复杂 Zod schema 只读展示为“源码定义，无法完整低代码编辑”。例如 `z.discriminatedUnion()`、`.transform()`、`.superRefine()`、自定义 helper 函数等都不尝试 round-trip。
- 预览变量面板加载当前 profile 的真实 InputSchema / OutputSchema。
- 低代码编辑器的数据来源分两层：
  - 开发时类型推导来自静态 contract / 可选 prepare 类型索引。
  - UI 表单、Inspector 与 preview input 表单来自 profile detail API 中运行时 Zod 转出的 schema 数据和 schema editMode。
- TypeScript 类型和 UI schema 不混用：prepare 生成的 `DynamicProfileInputMap` / `DynamicProfileOutputMap` 不作为前端表单数据源；前端表单只相信当前运行时加载的 Zod schema。
- `create_subagent.profileKey` 与 `invoke_subagent.input` 继续基于当前可用 subagent profile 动态生成 schema。

### 阶段 E2：用户 Assets Agent Profile 提示词更新

目标：让 `leader.assets` 能可靠协助用户编辑 TSX profile，而不依赖专用 profile 编辑工具。

- `leader.assets` 主提示词只放最小硬规则：profile 文件位置、`defineAgentProfile` 契约、builtin schema contract 限制、用普通文件工具编辑 TSX、修改后让用户校验/真实 prepare 预览。
- 新增系统 skill `assets/agent/skills/tsx-profile-editing/SKILL.md`，frontmatter `name: tsx-profile-editing`，用于按需向 `leader.assets` 渐进披露详细 profile 编辑知识。
- 当用户请求创建、修改、诊断 agent profile、TSX profile 或 `.profile.tsx` 时，`leader.assets` 应先启用或读取 `$tsx-profile-editing`，再编辑文件。
- `tsx-profile-editing` 介绍 `defineAgentProfile` 模块契约：`profileManifest`、`InputSchema`、`OutputSchema`、`allowedToolKeys`、`buildPrompt(ctx)`。
- `tsx-profile-editing` 介绍常用 prompt 节点：
  - `ProfilePrompt`
  - `HistorySet`
  - `DynamicSet`
  - `AppendingSet`
  - `Message`
  - `Reminder`
  - `Watch`
  - `SkillCatalog`
  - `ActivatedSkills`
  - `If`
- `tsx-profile-editing` 说明 builtin key 的限制：不能修改 `key`、`kind`、`InputSchema`、`OutputSchema`，但可以调整 prompt、helper function 和 `allowedToolKeys`。
- `tsx-profile-editing` 说明 profile 编辑工作流：读取文件 -> 最小修改 TSX -> 保存 -> 让用户在工作台校验/真实 prepare 预览 -> 如调坏可恢复系统版本。
- `tsx-profile-editing` 说明编码规范：保持 TSX 单文件、优先小改、不要把用户当前对话硬编码进提示词、复杂函数保留源码编辑、不要新增 profile 专用工具调用假设。
- `tsx-profile-editing` 说明验证职责：Agent 修改 `.profile.tsx` 后，应按变更风险主动运行合适的验证命令；不要假设工作台会在保存时替 Agent 完成 TypeScript typecheck。
- `tsx-profile-editing` 说明具体命令：
  - 修改单个用户或系统 profile 后，优先运行 `bun scripts/check-profile.ts <profile-file>`。
  - 修改共享源码、schema contract、loader、prompt DSL 或 generated type index 后，再运行 `bun run typecheck` 和相关测试。
- `tsx-profile-editing` 说明安全边界：用户 profile 是可信本地代码，不要直接运行陌生来源 profile；如需引入第三方 profile，应先审查源码。
- `tsx-profile-editing` 说明 import 边界：profile 可以 import 项目 API，但应优先使用 `defineAgentProfile`、prompt nodes、schema contract 和公开 helper，避免依赖旧 builtin class 或测试/迁移细节。
- `reference/agent/profile-guide.md` 继续作为开发者文档；skill 是面向 Agent 的可执行摘要，不直接把整份 reference 塞进 `leader.assets` 主 prompt。

### 2026-05-24 update

- 当前 active 系统 skill 路径已经迁到 `assets/workspace/.nbook/agent/skills/profile-system-guide/SKILL.md`，不再使用旧 `assets/agent/skills/tsx-profile-editing` 路径。
- `profile-system-guide` 面向 `leader.assets` 和用户资产编辑场景，介绍 harness、TSX profile、skill、user-assets 覆盖层、文档索引、profile compile、恢复系统版本和新建模板流程。
- `leader.assets` 现在在动态上下文中注入可见 skills，并在 profile 相关任务里优先引导启用 `profile-system-guide`。
- 已明确产品策略：指导优先于 CLI，CLI 优先于新增 Agent tools。恢复系统版本、新建模板第一版都通过说明 + 现有文件工具/现有 CLI 完成，不新增专用工具；编译需要区分 Workbench 手动编译和 Agent 文件编辑验证。
- Workbench 的“编译”指 `POST /api/agent/profiles/compile` + 后台 worker 的 runtime compile/prepare preview；`leader.assets` 协助普通用户编辑文件时，不要求用户手工调用 HTTP endpoint，优先指导使用 `bun scripts/compile-profile.ts <profile-file>` 做可见的 CLI 编译检查。`bun scripts/check-profile.ts <profile-file>` 保留为旧兼容别名。
- `leader.assets` 面向非专业用户：先用“profile 是 agent 的配方、harness 是运行器、skill 是说明书”这类通俗解释，再给 TSX 合同、路径和命令。
- 本轮扩展 `profile-system-guide`：`SKILL.md` 保持操作卡片和普通用户解释，新增 `references/harness-profile-system.md` 承载 harness/session/ProfileTurnPlan/TSX DSL/user-assets 覆盖/compile 预览/常见排障的详细参考；后续回答 harness/profile 架构问题时先读 reference，避免把过时的 v2 或旧 PreparedTurn 语义带回提示词。
- 后续调整：独立 `skill` 工具已禁用。`SkillCatalog` 现在只提供 key/name/description/when_to_use/location，Agent 使用 `read` 打开对应 `SKILL.md`；reference 由 `SKILL.md` 按需引导继续读取。
- 已将 `assets/agent-v2/skills` 下 12 个旧 skill 目录整体迁到 `assets/workspace/.nbook/agent/skills`，并修正关键迁移说明中的 v3 路径、TypeBox/ProfilePrompt/ModelContext/read 语义。

### 阶段 F：Profile Scope 设置

目标：多个 workspace、多个 leader profile 能自然共存。

- 增加 profile 默认选择配置，第一版只保留两层：
  - system default：第一版写死为小说 `leader.default`，用户 assets `leader.assets`；暂不新增系统设置项
  - workspace scope：普通小说写入 `workspace/<novel>/.nbook/agent-profile-settings.json`；用户 assets 工作区写入 `workspace/.nbook/assets/.nbook/agent-profile-settings.json`
  - explicit：已有 thread 的 `profileKey`、URL/query 或创建线程时指定值
- 用户 scope 先不做，避免第一版引入三层配置合并。
- workspace JSON 第一版只存 leader 默认 profile：
  ```json
  {
    "leader": {
      "defaultProfileKey": "leader.default"
    }
  }
  ```
- subagent 偏好第一版不进 workspace JSON，后续和 profile 白名单 / 收藏 / 启用状态一起设计。
- 解析顺序固定为：已有 thread / URL query / 创建线程显式参数 > workspace scope > system default。
- 前端新建 leader thread 时按 scope 解析默认 profile，但服务端 `AgentSystem.createLeaderThread()` 也必须接入同一 resolver；不能只依赖 `NovelAgentDrawer.vue` 的硬编码 `leader.default` / `leader.assets`。
- 设置界面允许配置：
  - novel workspace 默认 leader profile
  - user assets workspace 默认 leader profile
  - 可用 subagent profile 偏好
- UI 落点复用 `NovelIdeSettingsDialog.vue`：
  - 普通小说界面显示当前小说默认 leader profile、可用 subagent profile 偏好。
  - 用户 assets 界面显示用户 assets 工作区默认 leader profile、profile catalog / 加载错误入口。
  - `Agent Profile 模型` 继续只管理模型参数；默认 profile 选择新增独立设置分区，避免和模型 override 混在一起。
- Profile 工作台不承担默认选择配置；它只管理 `.profile.tsx` 文件、catalog 状态、真实 prepare 预览和恢复系统版本。
- Profile 工作台展示系统 + 用户合成 catalog；编辑动作只写用户 assets。系统项只读展示，并提供复制/覆盖到用户 assets 或恢复系统版本这类显式动作。
- 已有 thread 不因默认配置变化而改 `profileKey`。

### 阶段 G：Agent Graph 泛化

目标：从“leader 管理 subagent”演进为任意 Agent 树结构。

- 当前阶段保留 `leader` / `subagent` kind，但把运行拓扑从命名中解耦。
- 数据关系从 `managedSubagents` / `managingLeaders` 泛化为 parent / child agents。
- 仓储接口从 `leaderThreadId` / `subAgentThreadId` 逐步改为 `parentThreadId` / `childThreadId`。
- 工具从 `create_subagent` / `invoke_subagent` 逐步演进为更通用的 create / invoke child agent 语义。
- UI 从 “Subagents 管理” 改成 “Agent Graph / 协作节点”。
- 任意 agent 只要 `allowedToolKeys` 允许，就能创建和调用子 agent。
- 迁移期保留旧 API/tool 名称作为兼容层。
- Pi-based v3 已决定删除 `leader` / `subagent` 架构分层，统一为 agent；`leader.default` 和 `leader.assets` 只是系统内置 agent key/name。旧 `create_subagent` / `invoke_subagent` 命名迁移为 `create_agent` / `invoke_agent`：`create_agent` 使用目标 agent/profile 的 `InputSchema` 创建实例配置和空 session，`invoke_agent` 使用 `sessionId + message` 调用已有 agent session。

### 验收测试

- Registry：
  - 系统 assets profile 可加载。
  - 用户同路径 profile 覆盖系统 profile。
  - `AgentSystem.createDefault()` 不再注册源码 builtin profile class。
  - 系统 assets builtin profile 损坏时暴露加载错误，不回退源码 class。
  - 系统 assets 中的 builtin profile 修改 InputSchema / OutputSchema 会失败。
  - builtin override 修改 InputSchema / OutputSchema 会失败。
  - 非 `defineAgentProfile` 契约的 profile 模块会失败并进入 catalog issue。
  - 保存错误 profile 后 catalog 显示错误，运行同 key thread 会阻止执行。
  - 保存错误 profile 不会覆盖回旧缓存，也不会自动恢复系统版本。
  - 加载失败的 profile detail 仍能返回源码，Inspector 可继续编辑。
  - 加载失败的 profile 禁用真实 prepare 预览。
  - catalog、detail、prepare preview 对同一加载错误返回一致的 `ProfileIssueDto.code/message`。
  - 生产环境的 profile issue 不返回 stack；开发环境可返回 stack 辅助调试。
  - catalog/detail 对坏 profile 返回 200 并携带 issues；prepare preview 对加载失败返回 `ok: false` 和 issues。
  - 工作台不自动执行 TypeScript typecheck；Agent 编辑 profile 后应通过 shell 工具主动运行验证命令。
  - `bun scripts/check-profile.ts <profile-file>` 可检查用户 assets profile，不需要把用户 assets 加入主 tsconfig。
- Workspace assets：
  - 同步系统 assets 只复制缺失文件，不覆盖用户文件。
  - 恢复系统 profile 从系统 assets 同路径读取。
- Workbench：
  - 可编辑 `leader.default`。
  - 可编辑 `leader.assets`。
  - 可新建 `leader.custom`。
  - 可新建 `subagent.custom`。
  - 保存后预览变量使用当前 profile schema。
  - Inspector 可展示 profile 属性、工具列表和 InputSchema / OutputSchema。
  - 新建 profile 时 schema builder 可以生成简单 `InputSchema` / `OutputSchema` 源码。
  - 编辑简单 schema 只替换对应 schema 声明，不改变 prompt 或 helper 函数。
  - 手写复杂 Zod 后 Inspector 标记为源码定义，不破坏源文件。
  - 预览区可模拟一次真实 profile.prepare 请求，调整 input、thread history 和关键上下文变量，并展示生成的 Message[]。
  - writer 预览可通过调整 `input.lorebookEntries` 观察内容节点读取后注入到 Message[] 的结果。
  - 预览 runtime 使用临时 thread 和 preview adapter，不写入真实 thread、message store 或变量 store。
- Agent runtime：
  - 旧 thread 下一轮使用更新后的 profile。
  - 旧 thread history 保持 append-only，不因 profile 更新回写历史 system/context message。
  - thread 不需要 profileVersion/profileSnapshot 即可运行。
  - `create_subagent` 枚举动态 subagent profile。
  - `invoke_subagent` 使用目标 profile 的动态 InputSchema 校验。
  - 第一版动态 subagent schema 全量注入模型可见工具 schema；暂不做数量/大小限制。
- Scope settings：
  - workspace scope 覆盖 system default。
  - explicit query / create input 覆盖 workspace scope。
  - 服务端无 profileKey 创建 thread 时也使用同一 scope resolver，不回退到写死 `leader.default`。
  - Novel IDE 设置中切换默认 profile 后，新建 thread 使用新默认值；已有 thread 不改变。
  - Profile 工作台不会出现“设为默认”的隐藏副作用，默认选择必须走设置入口。
  - 已有 thread 保持原 profileKey。
- Future graph：
  - parent agent 可创建 child agent。
  - child agent 可继续创建下级 agent。
  - 旧 leader/subagent API 兼容可用。

### 延期 TODO

- 系统 assets 更新后的三方冲突检测与提醒；当前只补缺失，永不覆盖。
- 用户覆盖系统 profile 后，系统版本更新检测 / 三方 merge 暂不做；第一版只保留 TODO，不阻塞当前实现。
- skill catalog 白名单 / 启用控制：后续让 skill 像 tool 一样支持配置级白名单或禁用开关，避免所有可发现 skill 默认进入 catalog。
- profile 白名单 / 收藏 / 启用状态：后续用于限制动态 subagent schema 注入数量和模型可见 profile 集合；第一版先全量注入。
- 系统默认 profile 设置项：第一版不新增，system default 写死为小说 `leader.default`、用户 assets `leader.assets`；后续如需要再放到系统设置。
- `leader` / `subagent` kind 长期替换为更通用的 agent role / capability。
- 复杂 Zod schema 的可视化编辑。
- `profile-components` assets 覆盖层，用于 `renderPlanModeReminder` 这类自定义函数 / node 组件。
- 独立 `profile-components` assets 覆盖层。当前先把复杂函数留在 profile TSX 中，后续有复用压力再做。
- 单本小说专属 assets 覆盖层，例如 `workspace/<novel>/.nbook/assets`。
- prepare/codegen：为开发者生成动态 profile 的 key/schema 类型增强，但运行时不依赖 prepare 才能加载用户 profile。
- Known + Runtime profile key 类型：保留 builtin key 的静态类型推导，同时允许 runtime string profile key；后续 prepare/codegen 可为用户自定义 profile 生成 `DynamicProfileInputMap` / `DynamicProfileOutputMap`。
- prepare 类型索引只服务开发期类型增强，不参与运行时加载。运行时始终按当前 assets 中的 Zod schema 加载与校验 profile。
- prepare 默认只扫描项目内 `assets/agent/profiles/**/*.profile.tsx`，避免 repo typecheck 依赖本地 `workspace/.nbook/assets` 用户数据。
- prepare 支持显式参数扫描用户 assets：
  - `--system`：扫描系统 assets。
  - `--user`：扫描 `workspace/.nbook/assets/agent/profiles`。
  - `--all`：扫描系统 assets 与用户 assets。
- system generated 类型索引可提交进仓库；user generated 类型索引写入 `.agent/generated` 或用户 assets 下的生成目录，不进 Git。
- 自定义 profile 类型索引生成要求 profile 模块显式导出 `Input` / `Output` 类型别名；模板默认生成 `export type Input = z.infer<typeof InputSchema>` 与 `export type Output = z.infer<typeof OutputSchema>`。
- 新增 `scripts/check-profile.ts <profile-file>`：
  - 复用项目依赖、根 `tsconfig.json` 的 path alias、JSX 设置和 strict 规则。
  - 通过 TypeScript compiler API 或临时 tsconfig 只检查目标 `.profile.tsx` 及其 import 依赖。
  - 支持检查 `assets/agent/profiles/...` 与 `workspace/.nbook/assets/agent/profiles/...`。
  - 不修改主 `tsconfig.include`，不让用户本地 assets 污染仓库全量 typecheck。
  - 输出清晰 CLI diagnostics；后续可进一步映射成 `ProfileIssueDto`。
- `check-profile.ts` 第一版不依赖 prepare 生成的用户类型索引。它检查目标 `.profile.tsx` 文件自身及其 import 依赖；profile 文件通过自身导出的 `InputSchema` / `OutputSchema` / `Input` / `Output` 与 `defineAgentProfile` 获得类型检查。
- prepare 的职责是让其他源码通过 key 静态引用用户自定义 profile 时获得类型增强；check-profile 的职责是验证单个 profile 文件自身写得对不对。
- prepare 不是运行前置，也不是自定义 profile 文件内部类型推导的前置；它只解决“跨文件按自定义 key 静态推导 Input/Output”的开发体验。
- profile registry 性能优化：如 catalog/preview 频繁触发刷新造成明显卡顿，再引入文件 mtime/hash skip 或 per-file cache busting。
- profile 版本快照 / 可复现运行：当前阶段不做；如未来需要严格复现旧 run，再显式设计 `profileVersion` 或 `profileSnapshot`，不能隐式重写 thread history。
- 第三方 profile 审查 skill：后续如果支持用户加载外部 profile，可新增专门的审查 skill，帮助检查危险代码、工具权限、schema contract 和提示词行为；当前阶段不做 sandbox，用户自行负责。
- 推荐 profile import surface：在 `reference/agent/profile-guide.md` 中列出推荐导入面，减少用户 profile 依赖深层私有实现。
- profile 文档分层防漂移：`reference/agent/profile-guide.md` 是完整真相源；`tsx-profile-editing` skill 是 Agent 执行摘要；UI 只放短提示和链接/入口，不复制长规则。
- Agent Graph 泛化暂不进入当前实现，只保留 TODO。当前阶段只跑通动态 `leader.*` / `subagent.*` profile。
