# Task 115：Workspace Root Agent 路径合同硬切

> 当前状态：路径合同与整体审查均已确认，Phase 0 inventory及Task 118 Phase 1–5已完成。Project Identity/Lifecycle/Manifest Persistence/Lock现已接入ProjectSession；唯一控制面Facade、最终DTO/schema、HMR稳定typed error边界以及内部Project数据面的exact-generation operation合同均已落地。Phase 6 的 session 离线迁移引擎已收口：新 codec、字段级 ledger、dry-run/apply/resume/rollback、真实499份基线与隔离副本全量演练、CLI 入口齐备；但其 fail-closed gate 接线已确认与 session header 消费面原子耦合，改随 Phase 4B + Phase 7 同批执行。Phase 4B仍未切换公开Product；Agent path hard cut尚未开始。
>
> 本任务是 [Task 109](../109-agent-workspace-path-runtime/README.md) 的后续硬切。Task 109 建立的 `RuntimePaths`、通用路径类型、真实路径 containment、Project 生命周期和 Product/Portable 验证继续作为底座；本任务只重做 Agent 与 Project 调用方可见的路径 Interface，不回退到 cwd、State Root 或字符串 heuristic。
>
> 2026-07-22整体审查发现的stale Project session、structured path migration、`workspaceKey`、绝对路径归属与ProjectListSnapshot失效问题，已由用户在[Task 118联合执行计划](../118-project-catalog-snapshot-path-integration/README.md)中全部确认；2026-07-23 inventory及Phase 1–4A Interface、2026-07-25 Phase 5内部数据面迁移均已完成，hard cut仍需完成Phase 6 migration staging。
>
> 最新决定：不允许外部Project；cwd永远是Workspace Root；不引入trusted/untrusted，Workspace Root内默认可信；启动扫描不修改损坏manifest，用户打开Workspace Root内一级目录时才执行IDE式幂等`workspace project ensure`。ProjectSession持有长期Occupancy Lock；required Database/History/File Index并行建立最低ready，lazy Plot/World Engine façade与Agent SQL按需激活，全部由同一generation-scoped Module registry关闭。
>
> 术语收口：最终合同不再使用 `managed Project`。本文仅在“旧 managed session”中保留该词，专指旧 schema 中 `workspace/<slug>` 这一迁移来源类别。

> 2026-07-23统一决策：Project Workspace只能是Workspace Root的一级物理子目录，Project root symlink/junction/reparse point拒绝；显式“打开目录”入口负责把空目录/损坏manifest先ensure再纳入列表。除同进程ready generation直接复用外，新建session统一按mutation → prospective Occupancy → resolve/fingerprint → ensure → root revalidate → snapshot publish → mutation release → 最终同步门禁 → fulfilled handoff → Module ready执行；`prepareOpen()` Promise成功履行就是Occupancy所有权提交点，不增加adopter handshake。ProjectModule原位替代全部ResourceOwner，required Module达到最低ready后才完成open，重扫描与维护留在可取消warm-up。本任务不新增Project rename，只保留运行中`PROJECT_IN_USE`合同。

## Relative documents refs

- [Task 118 联合执行计划](../118-project-catalog-snapshot-path-integration/README.md)：统一 ProjectListSnapshot/Project identity 与 Task 114 snapshot lifecycle 的 seam、执行顺序和用户决策门禁。
- [Project status](../../../PROJECT-STATUS.md)
- [Workspace terms](../../../reference/workspace/TERMS.md)
- [Agent Project Workspace guide](../../../reference/agent/project-workspace-guide.md)
- [Agent workspace tool use](../../../reference/agent/workspace-tool-use.md)
- [Task 11：Portable Project Workspace](../11-portable-project-workspace/README.md)
- [Task 15：Agent Session Management](../15-agent-session-management/README.md)
- [Task 43：Subject RAG Memory](../43-subject-rag-memory/README.md)
- [Task 60：Agent Profile Home](../60-agent-profile-home/README.md)
- [Task 90：Agent Mode System / Plan Mode](../90-agent-mode-system/README.md)
- [Task 91：Operation Log / File History](../91-operation-log-file-history/README.md)
- [Task 92：Project Resource Lifecycle](../92-project-resource-lifecycle/README.md)
- [Task 94：Project Lifecycle Model](../94-project-lifecycle-model/README.md)
- [Task 105：统一安装与 Manager](../105-unified-installation-manager/README.md)
- [Task 108：Agent 图片附件引用与 session migration](../108-agent-image-attachment-references/README.md)
- [Task 109：File Scope、File Address 与 Product Runtime 路径合同](../109-agent-workspace-path-runtime/README.md)

## User Request / Topic

- 恢复并精简 `RuntimeLocationReminder`，向 Agent 提供仅能可靠用绝对路径访问的 Application/Source Root、源码 `reference/`、system Agent assets 等真实运行位置。
- Agent 文件工具和 bash 的 cwd 统一调整为 **Workspace Root**，使同一个 Agent 能直接访问 Workspace Root `.nbook`、任意 Project Workspace、Project `.nbook`、Project `.agent` 和全局 session 目录；Project 创建、ensure、校验和内容节点管理统一使用稳定 `workspace` CLI。
- 文件输入只保留两种地址：**Workspace Root-relative path** 与 **absolute filesystem path**。
- 删除 `workspace/<project-slug>` 这种独立的 Project Path 字符串语法；Project Workspace 自身也用上述两种路径表示。
- 删除 `workspace/<project-slug>/<relative-path>` 这种文件工具专用 Project File Address；文件工具与 bash 必须让同一字符串指向同一物理目标。
- 允许任意绝对路径；本任务不重新讨论绝对路径能力风险，也不恢复“Project 中的绝对路径只能指向当前 Project Workspace”一类限制或提示。
- Project 身份不能随 Project Path 字符串一起消失。Workspace Root-relative 文件地址的第一段通过轻量 **ProjectListSnapshot** 匹配已知 Project；命中时附加结构化 Project 归属，未命中时保持普通 Workspace Root 文件地址。
- 删除 user-assets 路径 scope。user-assets 只作为 UI 入口和 `leader.assets` profile 职责存在；其 session 与普通 Workspace Root session 使用同一个 cwd 和路径合同。
- 删除 external Project session / external Project 完整数据面概念。Workspace Root 外的目录和文件只通过普通绝对路径访问，不自动获得 ProjectSession、Project Config、History、SQLite、RAG、Plot 或 World Engine 身份。
- 新合同实施前必须审计所有 prompt、profile payload、tool schema、HTTP DTO、session metadata 和持久化状态中的路径，不能只修改 cwd。

## Goal

完成后应同时满足以下结果：

- Agent 只需要学习两种文件地址：Workspace Root-relative path 与 absolute filesystem path。
- 所有 Agent invocation 的文件工具与 bash 始终使用 `RuntimePaths.workspaceRoot` 作为 cwd；不再存在 user-assets 或 external Project 专用 cwd。
- 同一个相对地址在文件工具、bash、`workspace node ...`、Plan Mode 和提示词中指向同一个物理目标，不存在工具专用 alias。
- Project Workspace 只能使用 Workspace Root 的一级单段 relative root，例如 `my-novel`；不支持嵌套 Project root。
- Agent 和 HTTP 的 Project-scoped 调用方不再传 `workspace/my-novel`；字段改用语义明确的 `projectRoot` / `currentProjectRoot`，值只接受 Project Workspace 的单段相对 root。
- 当前 Project 已由 session 决定时，Project-scoped Agent 工具默认使用 session Current Project Workspace；只有跨 Project 操作才显式传可选 `projectRoot`。
- Project Lifecycle Module 通过纯解析、snapshot 解析和存在性/manifest 门禁等分层操作产出绝对 root、内部 Project key 和 relative root。ProjectSession、History、Config、SQLite、RAG、Plot、World Engine 不再自行剥离 `workspace/` 或调用 `normalizeProjectPath()`。
- `RuntimeLocationReminder` 从显式 `RuntimePaths` 和 system assets Adapter 获取真实存在的位置，不依赖 `process.cwd()` 猜 Application Root。
- 旧 session、custom state 和必要的持久化记录通过一次性迁移进入新 schema；runtime 不长期保留双读、alias 或 legacy 分支。
- Windows Portable 完整移动 State Root 后，Project session 仍按新的 Workspace Root-relative `currentProjectRoot` 解析到新位置。

验证证据包括：路径与 Project Workspace Resolver 单元测试、Project 生命周期/History/Config/SQLite/RAG 聚焦回归、Agent Harness 与 session migration 测试、profile compile/metadata/check、`workspace node` 测试、Plan Mode 测试、Product runtime smoke 和 Windows Portable State Root 移动测试。浏览器验收不自动执行，可在实现完成后交由用户决定。

## Target contract

### 1. Agent-visible path Interface

Agent 文件工具、bash、Plan Mode 文件路径、`workspace node ...` 的路径参数只接受同一套两类地址：

```text
<workspace-root-relative-path>
<absolute-filesystem-path>
```

典型地址：

| 目标 | 新地址 |
| --- | --- |
| 当前或任意 Project 内容 | `my-novel/lorebook/world.md` |
| 另一个 Project 内容 | `other-novel/manuscript/001.md` |
| Workspace Root `.nbook` | `.nbook/config.json` |
| Workspace Root Agent profiles/skills | `.nbook/agent/profiles/...`、`.nbook/agent/skills/...` |
| 全局 session JSONL | `.nbook/agent/sessions/775.jsonl` |
| Project Workspace `.nbook` | `my-novel/.nbook/...` |
| Project Workspace `.agent` | `my-novel/.agent/...` |
| Project manifest | `my-novel/project.yaml` |
| Workspace Root 外的任意目录或文件 | 绝对文件系统路径；只保留普通文件系统语义 |
| Application/Source、源码 reference | `RuntimeLocationReminder` 提供的绝对路径 |

以下字符串不再是任何公开文件或 Project 定位合同：

```text
workspace/my-novel
workspace/my-novel/lorebook/world.md
```

这里不保留 compatibility alias。`workspace` 是 CLI 名称和 Workspace Root 领域术语，不再是 Agent 路径字符串的固定首段。

### 2. Project Workspace reference

Project-scoped 调用只接受 Project Workspace 的单段 Workspace Root-relative root：

```text
my-novel
```

公开字段命名：

- `projectRoot`：一次 Project-scoped 调用显式指定的 Project Workspace root。
- `currentProjectRoot`：session、UI focus 或 runtime context 中的 Current Project Workspace root；为空表示 Workspace Root session。
- 不再新增 `projectPath`、`projectId`、`novelId` 的同义字段。

`projectRoot` 必须是 Workspace Root 下的一级单段目录名：不得包含路径分隔符，不得等于 `.` 或 `..`，不得以点/空格结尾，并遵守跨平台保留名与非法字符规则；`foo..bar` 这类中间含点名称仍可合法。“打开任意目录”只表示任意一级已有物理目录，不表示递归嵌套 Project 或链接根。绝对路径不是 `projectRoot` 的另一种编码，但绝对文件地址落入 `ProjectListSnapshot` 已知 root 时会附加同一 Project 归属；未知绝对目录中的 `project.yaml` 不会被扫描或自动导入。

### 3. ProjectListSnapshot and internal identity

Project Path 字符串删除后，内部仍需要结构化身份。目标 Module 形态在实施阶段以类型设计复核为准，但至少表达：

```ts
type ResolvedProjectWorkspace = Readonly<{
    root: AbsoluteFsPath;
    key: ProjectWorkspaceKey;
    relativeRoot: WorkspaceRelativePath;
}>;
```

不变量：

- `root` 是文件、Project Config、Project SQLite、History 和运行时资源的真实绝对根。
- `key` 只作为进程内 ProjectSession、资源 owner、cache、presence 和串行锁的 canonical key；它不是 Agent-facing 第三种路径。
- `ProjectWorkspaceKey` 绝不进入 session JSONL、HTTP DTO、localStorage、Operation Journal、数据库列或持久化索引；持久化只保存可重新解析的 `currentProjectRoot` 或普通文件地址。
- Project key必须跨Lifecycle实例与HMR稳定：冻结hash输入为`canonical Workspace Root realpath + NUL + platform-normalized single-segment projectRoot`，再由版本化namespace与`Symbol.for(...)`或等价进程级owner派生；symbol描述不得包含裸路径。它天然不是JSON值，也不得转成string持久化。跨进程锁文件名由Lock Module从同一locator语义独立派生，两者不是同一个identity载体。
- canonical Project locator不要求目录已经存在；Windows按case-insensitive产品合同折叠，POSIX保留大小写。case-only物理collision返回`PROJECT_ROOT_CASE_COLLISION`，相关目录全部排除出Project/candidate snapshot并进入diagnostics。目录删除后同名重建可复用key，旧资源仍必须由session generation与root fingerprint隔离。
- Project 改名/移动会改变 locator 和 key；当前设计仍不引入不可变 Project UUID。
- Lifecycle内部Identity Module提供`locate(ref)`与`resolve(ref)`：前者只依赖canonical Workspace Root并可处理不存在目标，后者追加物理root、唯一spelling、link/reparse与fingerprint校验。调用方不得自行组合realpath、大小写规则、hash、symbol或fingerprint。
- Workspace Root 一级目录与 `project.yaml` 是 discovery 真相源；`ProjectListSnapshot` 只是 Project 列表和文件归属共用的可重建 metadata 缓存，不存在额外的 Project 注册表或成员关系。
- snapshot 识别 Workspace Root 下具有合法 manifest 的 Project。缺失/损坏 manifest 的目录在用户打开前仍只是普通目录；启动扫描只诊断，打开时 ensure 后才进入 snapshot。
- `/api/projects` 只返回 snapshot 中的合法 Project；另设轻量候选目录入口枚举 Workspace Root 一级普通目录。用户从书架或路由打开候选目录时先调用 open/ensure，成功后刷新 snapshot，不要求目标先在 Project 列表中。
- 列表为空时不再自动创建默认 Project；空状态明确提供“新建 Project”和“打开目录”两种动作。
- Project root 目录项本身必须是 Workspace Root 下真实的一级物理目录；POSIX symlink、Windows junction/reparse point 一律拒绝，不能 canonicalize 成另一个 Project alias，也不能借此逃逸 Workspace Root。
- 普通相对 File Address 首段命中 snapshot 时，File Address Resolver 附加该 Project 的 `key` 与 Project-relative path；未命中时保持普通 Workspace Root 文件地址。
- Current Project 与跨 Project `projectRoot` 都必须通过同一个 snapshot/Project open gate 解析；调用方不能从 basename、`workspace/` 前缀、cwd 或任意祖先扫描反推身份。

### 4. Agent cwd

Agent runtime 中所有 session 的文件工具和 bash cwd 都是：

```text
RuntimePaths.workspaceRoot
```

- Project-bound session：cwd 不再下沉到 Current Project Workspace。
- Workspace session：维持 Workspace Root。
- user-assets 不再是 session 路径 scope；`leader.assets` 与普通 Workspace Root session 使用同一 cwd，通过 `.nbook/...` 访问用户资产。
- 不再创建 external Project session；Workspace Root 外目标只能通过绝对文件地址访问。
- cwd 只决定相对路径起点；Current Project、profile home、Config scope 和 Project 生命周期不能从 cwd 推断。

### 5. Current Project and Project-scoped tools

- Agent session 保存 `currentProjectRoot?: string`，不再保存 `workspaceRoot + projectPath` 的组合。
- session codec 只要求 `currentProjectRoot` 是合法单段 relative root，以保留 Project 已缺失的历史 session；新建、重绑和实际 invocation 必须通过 `ProjectListSnapshot` 解析。缺失时 session 仍可读取/搜索/归档，继续运行返回 typed `current_project_missing`，控制面提供“重新绑定 Project”和“清除 Current Project”。为空统一表示 Workspace Root session。
- `leader.assets` 的资产职责由 UI 入口与 `profileKey` 表达，不再持久化 `workspace/.nbook` 路径 scope。
- Runtime Workspace Root 始终从当前 `RuntimePaths.workspaceRoot` 注入，不持久化 Project 绝对 cwd。
- Plot、World Engine、Project SQLite、Subject/RAG 等工具默认消费 `context.currentProject`。
- 工具需要跨 Project 时才暴露可选 `projectRoot`；snapshot 解析后再执行 Project open/能力检查。
- session 当前 Project 与显式 `projectRoot` 不一致时，以显式值为目标，但工具必须在返回值和变更归属中保留目标 Project 身份。
- 只读 session JSONL 可以通过 `.nbook/agent/sessions/...` 访问；继续、调用、审批、恢复和分支仍通过 Agent 控制面，不通过直接改写 JSONL 实现。

### 6. Runtime reminders

恢复精简的 `RuntimeLocationReminder`：

```text
Runtime Locations:
- Workspace Root / cwd: <absolute path>
- Application Root: <absolute path>
- Application Reference Root: <absolute path, when present>
- System Agent Assets Root: <absolute path, when present>
```

要求：

- `Workspace Root / cwd` 来自 `RuntimePaths.workspaceRoot`。
- Application Root 来自 `RuntimePaths.applicationRoot`，不能使用 profile prepare 进程的 `process.cwd()`。
- Application Reference Root 和 system assets root 通过明确 Adapter 解析；Source/Product 可返回不同真实路径。
- 仅注入运行时确认存在且 Agent 可以实际读取的位置；不存在的源码目录不制造承诺。
- 首轮注入；只有 location 变化时重新注入，不按固定短周期重复。
- Reminder 只报告物理位置，不承担 Current Project、selected file 或长篇路径教学。

`WorkspaceFocusReminder` 只报告动态焦点：

```text
Current Project Workspace: my-novel
Current Project prefix: my-novel/
Current selected file: my-novel/manuscript/001.md
```

没有 Current Project 时明确为 `none`。所有 selected file 和 payload path 都必须已经是 Workspace Root-relative 或 absolute，不能再注入裸 `lorebook/...`。

### 7. Absolute paths

- `read`、`write`、`edit`、`apply_patch` 接受任意绝对文件系统路径。
- 不出现“Project中的绝对路径只能指向当前Project Workspace；跨Project请使用workspace/...”。
- 本任务不引入新的绝对路径限制、警告或审批分类。
- 相对路径仍必须 canonicalize 并留在 Workspace Root；绝对路径保持绝对语义。
- 绝对地址先 canonicalize，再按 `ProjectListSnapshot` root containment 附加已知 Project 归属；命中时与相对地址共享 ProjectSession、History、Inbox 和 Context Access 语义。
- 不扫描 Workspace Root 外祖先，也不从未知绝对目录发现 Project；Workspace Root 外目标永不升级为 Project。

### 8. Project lifecycle 与 `workspace` CLI

- Agent 管理 Project 必须调用稳定入口 `workspace project ...`，不直接编辑 `project.yaml`，也不直接初始化 Project SQLite 或进程内 Project 列表缓存。
- `workspace project ensure <project-root> --json` 是打开目录和 Agent 自助管理的幂等入口：目标合同要求目录不存在时也只创建一级目录与最小合法 manifest；已有空/普通目录时只 ensure/修复 manifest，不物化 Bundled Workspace Template。当前Phase 1实现仍先`resolve()`，尚不能创建不存在root，必须在transactional staging切片补齐。可解析 manifest 保留未知字段、注释和仍合法的核心值，只逐字段修复非法项；损坏 manifest 先逐字节备份到 `.nbook/recovery/` 再恢复。
- `.nbook/recovery/**` 是只追加、不可重建的恢复资料：File Index与History忽略，但完整Project归档必须原样保留。Lifecycle transaction temp只按精确、版本化命名matcher忽略；禁止用`*.tmp`等宽泛规则隐藏用户文件。
- `workspace project create <project-root> [--template <name>] --json` 专门负责新 Project 的默认/指定模板物化，要求目标目录不存在；目标已存在（包括空目录）返回 `PROJECT_EXISTS` 并提示改用 `ensure`，不得把模板文件静默合并进用户目录。
- `workspace project validate`只读校验指定一级root与manifest，不扫描祖先、不检查SQLite，也不把可修复问题暴露为Broken Project。Project Database、History、File Index等运行资源由各自Module幂等初始化，不增加要求Agent手工排序调用的`init-db`流程。
- `--json` stdout 固定只输出一个 versioned envelope：成功为 `{schemaVersion, ok: true, project, actions, diagnostics}`，失败为 `{schemaVersion, ok: false, error}`；日志与人类诊断写 stderr。成功 exit code 为 0，typed failure 为非 0；至少冻结 `INVALID_PROJECT_ROOT`、`PROJECT_ROOT_LINK_UNSUPPORTED`、`PROJECT_ROOT_CASE_COLLISION`、`PROJECT_IN_USE`、`PROJECT_EXISTS`、`PROJECT_NOT_FOUND`、`PROJECT_MANIFEST_IO`、`PROJECT_MANIFEST_CONFLICT`、`PROJECT_TEMPLATE_FAILED`、`PROJECT_IMPORT_FAILED`、`PROJECT_VALIDATION_FAILED`、`PROJECT_PUBLISH_FAILED`、`PROJECT_ROLLBACK_FAILED`、`PROJECT_LOCK_RELEASE_FAILED`。
- 内容节点统一使用`workspace node ...`，现有顶层`workspace schema`迁为`workspace node schema`。node输入只保留Workspace Root-relative与absolute filesystem path；absolute只按已知snapshot containment附加Project归属，不通过祖先manifest发现external Project。Agent runtime只调用PATH中的`workspace`，不提示项目根目录下的`scripts/workspace.ts`。
- hard cut必须同步Bundled真相脚本、真实user runtime、Product assets/`.output`实现、三套`workspace`/`workspace.cmd` wrapper与preflight/sync/build/deploy入口；旧自定义副本不获得compatibility分支，版本/preflight不匹配时fail closed并提示重新同步。
- 服务启动只扫描、缓存和诊断 Project manifest，不改写损坏文件；只有用户真正打开目录或显式执行 ensure 时才备份恢复。
- 除同进程ready generation直接复用外，所有新建session都按mutation → prospective Occupancy → resolve/fingerprint → ensure → root revalidate → snapshot publish → mutation release → 最终同步门禁 → fulfilled handoff获取与移交锁，Occupancy fail-fast。Promise履行前handle归Lifecycle并由其负责失败清理；履行后ProjectSession必须先同步保存handle，再开始任何异步Module初始化。open/grace期间保持Occupancy Lock，全部Module关闭后释放。本任务不新增rename，任何现有或未来rename控制面在运行中返回`PROJECT_IN_USE`。
- required Project Database、History、File Index作为内置Project Module并行初始化；`openProject()`等待Database schema、History open/purge、File Index event seam/cache/watcher三个最低ready。lazy Plot/World Engine façade与Agent SQL按需激活但由同一registry关闭。本轮不建设面板级部分ready UI；完整tree build、D15对账和maintenance作为可取消warm-up。

## Current State

- Task 109 当前把 Project-bound File Scope root 设置为 Current Project Workspace；相对路径使用 `lorebook/...`、`manuscript/...`。
- `ProjectPath` 是 branded string，固定为 `workspace/<slug>`，同时充当 HTTP locator、ProjectSession key、session metadata 和多个业务 Module 参数。
- File Address Module 对 `workspace/<slug>/<relative-path>` 做文件工具专用解析；bash 在 Workspace Root cwd 下不能自然消费同一字符串。
- session 同时保存 `workspaceRoot` 与可选 `projectPath`；每次 invocation 将它们投影为 File Scope。
- Plan Mode 的工具目录和 `switch_mode.planFilePath` 使用 Project-relative `.agent/plan/...`。
- `workspace node ...` 最终从 Workspace Root 解析 Workspace Root-relative 地址；不依赖 Project Workspace cwd。调用前由 `workspace project ensure` 保证目标 Project manifest 存在。
- `openProject()`现统一经过Project Lifecycle：mutation → prospective Occupancy → resolve/fingerprint → manifest ensure → root revalidate → snapshot publish → mutation release → fulfilled handoff。required Database/History/File Index达到最低ready后才发布generation，Plot/World与Agent SQL按需激活；HTTP route不再负责吞错式fire-and-forget。
- 空目录/损坏manifest在任何Module启动前由Lifecycle静默ensure；原始损坏bytes写入Project内recovery。ProjectSession持有跨进程Occupancy直到grace/close完成，运行中delete及未来协作rename统一返回`PROJECT_IN_USE`。
- Phase 4A composition root会跨HMR复用唯一Service/Lifecycle；版本化global nominal Project error base与exact kind确保旧generation抛出的typed error仍被新mapper/guard识别，不通过重建Service逃避资源所有权。
- 2026-07-23真实session inventory为499个全部可解析：265个旧Project、233个Workspace Root、1个user-assets、0个external，其中24个Project root已缺失；499个header全部含旧`workspaceKey`且尚无`currentProjectRoot`。该快照仅作迁移基线，apply前重新扫描。
- 当前Bundled `workspace` CLI尚无`project ensure`，仍接受`workspace/<slug>` alias、任意`--target`、`--no-db`与祖先manifest发现；`validate`还检查SQLite，JSON输出也没有统一versioned envelope。
- Profile、Reference、Writer/RP payload 和文件工具说明广泛注入裸 `lorebook/...`、`manuscript/...`、`.agent/...`、`.nbook/...`、`project.yaml`。
- `RuntimeLocationReminder` 已在 Task 109 的 2026-07-21 切片中删除；`WorkspaceFocusReminder` 暂时承担 cwd 和绝对路径说明。
- 任意绝对路径授权已经落地并有聚焦测试；本任务保持该行为。

## Decisions / Discussion

### D1. 两种是输入地址类别，不是删除领域身份

删除的是 `workspace/<slug>` 这套独立字符串语法，不是 Project Workspace 领域概念。ProjectSession、History、Config、SQLite、RAG、Plot、World Engine 仍需要同一个解析后的 Project 身份。

### D2. `projectRoot` 替代 `projectPath`

`projectPath` 当前既像 API identifier，又像文件路径，迫使调用方记住固定 `workspace/` 前缀。新字段直接表达 Project Workspace 的 Workspace Root-relative root；绝对路径不进入 `projectRoot`。

### D3. cwd 与 Current Project 分离

cwd 永远是 Workspace Root；Current Project 是 runtime context 中的结构化字段。任何需要 Project Config、Project SQLite、Profile Home 或 History 的 Module 都显式消费 Current/Resolved Project，不能读取 cwd 猜测。

### D4. 文件工具与 bash 必须字面一致

`my-novel/lorebook/a.md` 在文件工具与 bash 中都由 Workspace Root 解析。文件工具可以额外附加 History/Context Access 领域语义，但不能改变物理目标。

### D5. 不保留 alias 和长期双读

项目处于快速开发阶段。本任务采用 schema migration + hard cut，不让 `workspace/<slug>` 与 `<slug>` 长期并存，也不让 tool schema 同时接受 `projectPath` 与 `projectRoot`。

### D6. 先迁移数据，再切 runtime

旧session对跨session能力有真实价值，不能通过“新schema不再读取”静默丢弃。实现从Task 108抽取通用offline migration runner，复用dry-run/apply/resume/rollback、manifest/journal、backup/stage、source/target checksum、全库复扫和Manager install/update/start前置门禁。Attachment专用path迁移逻辑不直接复用；现有Agent Session Store`runtime.lease`则泛化为runtime与离线migration唯一互斥锁。新runtime遇到旧header返回稳定`migration_required`，不执行路径/schema读时迁移或长期双读，也不引入新的control-plane maintenance lease。

一次性runner使用一个store lock + 一个恢复状态机：

- 正常runtime全生命周期持有Agent Session Store lock；offline migration只有在runtime退出后才能取得同一把锁。无需第二把migration writer lock，因同一store lock已经同时阻止运行进程与其他migration writer。
- versioned migration manifest/sentinel 记录 `pending | applying | complete | rollback_required`、目标 session schema、backup/stage路径、source/target checksum和 journal cursor。
- Manager start、开发启动和全部session append owner先取得store lock，再要求sentinel为当前目标schema的`complete`；`pending/applying/rollback_required`一律fail closed并返回明确恢复指令。
- apply 在写入前标记 `applying`，完成原子发布与全库复扫后才标记 `complete`；进程崩溃留下 `applying` 时，下次只能显式 resume 或 rollback，不能自动猜测成功。
- rollback 恢复 backup、复核 checksum并把 sentinel恢复到上一 schema的可运行状态；恢复失败标记 `rollback_required`，新旧 runtime都不得继续 append。

迁移映射固定为：

- 旧 managed `workspace/<slug>` session → `currentProjectRoot: "<slug>"`。
- 旧 `workspace/.nbook` user-assets session → Workspace Root session，删除路径 scope，保留原 `profileKey`（通常是 `leader.assets`）。
- 旧 external Project session → Workspace Root session，删除 Current Project 身份；结构化相对文件地址按旧 external root 转换为 absolute filesystem path，只用于保留历史语义。无论转换是否完整，旧 external session 默认可读但不可直接继续，必须由用户清除 Current Project语义或重新绑定 Workspace Root 内 Project。
- `plot.selection.projectPath` 等 custom projection → Project root slug；绝对 external Project 值删除或按该 projection 的无焦点状态重建，但其中独立、可证明来源的文件地址仍按上一条转换为 absolute。
- waiting approval、pending write/edit/apply_patch、Plan pending、follow-up/steer 中未执行操作全部取消；不得在新 cwd 下继续批准旧操作。
- pending call若缺少tool result，migration必须向active branch追加明确的“因路径合同迁移而取消”result，清空`agent.pendingUserResolution.*`与持久化follow-up queue；纯内存RunFrame/steer不属于离线rewrite。
- 字段级migration ledger覆盖header、tool call/result、`apply_patch` move、custom state、workflow、linked child与ambiguous details；attachment ref本身无路径，不做无意义rewrite。不能只做概括性session header转换。
- 迁移后 `currentProjectRoot` 指向已缺失 Project 时不清空 header：session 保持可读，invoke 返回 `current_project_missing`，由控制面执行 rebind/clear。
- 当前`migrateSessionJsonlModels()`若继续作为模型安全脱敏gate存在，必须明确标为唯一非路径读时例外；本任务不得借它保留path/schema兼容迁移。

### D7. Runtime reminder 与 focus reminder 分工

`RuntimeLocationReminder` 报告稳定物理位置；`WorkspaceFocusReminder` 报告动态 Project/selected-file 状态。两者不重复解释路径政策。

### D8. ProjectListSnapshot 提供 Project 归属

相对/绝对只决定文件定位方式；Project 归属由 `ProjectListSnapshot` 提供。Workspace Root 一级目录与 `project.yaml` 是磁盘真相源，snapshot 是可重建的进程内 metadata 缓存，不新增 App SQLite Project index、额外注册表/成员关系或不可变 Project ID。Project 列表、Current Project 解析和 File Address 归属必须消费同一个 snapshot Interface。

- 已完成 `workspace project ensure` 的 Project 具有合法 manifest，随后进入 snapshot。
- manifest 缺失或损坏时，ensure 先创建/备份恢复，再使 snapshot 失效；snapshot 不长期保存 `manifestError` 或 Broken Project 状态。
- 未打开且没有 manifest 的普通一级目录不进入 snapshot；打开入口和 Agent 使用 Project Lifecycle Module/CLI ensure，不靠 File Address Resolver 猜测。
- `/api/projects`与`/api/projects/candidates`分离：前者只列合法Project，后者只列合法单段、一级物理、尚未成为合法Project的目录；missing/broken manifest不以状态暴露。除同进程ready generation复用外，`POST /api/projects/open`固定mutation→prospective Occupancy→resolve/fingerprint→ensure→root revalidate→snapshot publish→mutation release→最终同步门禁→fulfilled Occupancy handoff→Module ready；列表为空不自动创建默认Project。
- 当前进程的 lifecycle 写操作主动使 snapshot 失效；另一个进程或 `workspace` CLI 的变化由单个 Workspace Root 一级目录/manifest watcher与有界 TTL fallback 收敛，不要求 CLI 原子更新 Nitro 进程内存。watcher失败允许短暂 stale-read，但 TTL 到期必须重建并记录诊断。
- shallow watcher是Lifecycle专用薄控制面：一个Workspace Root一个逻辑watcher，只观察一级目录和`*/project.yaml`，事件约120ms合并后触发完整浅重扫；不复用File Index `SnapshotCache`，默认5s read-time TTL且没有周期扫描timer。bounded diagnostics不进入公开Project DTO。
- Lifecycle公开只保留`ensure/create/validate/delete/importProject`意图式Interface；transaction/staging path不外露。`ensure-missing/create/import`在`.nbook/lifecycle/staging/v1-<token>/`完成同卷materialize与验证，短事务内mutation→prospective Occupancy→单次rename→root复核→snapshot publish；`delete`原子移动到token化tombstone后发布absence。所有ignore/cleanup都按精确版本与owner token，不能用宽泛glob。
- File Address Resolver 只按第一段精确查询 snapshot，不递归扫描、不逐次读取 manifest、不根据 basename 猜测。
- 最终列表DTO只含`projectRoot/kind/title/summary/manifestUpdatedAt?`；删除旧`id/projectPath/workspaceSlug/updatedAt/manifestError`与统计字段。`/api/novels`镜像控制面随hard cut删除，canonical OpenAPI只登记真实Project路由。

### D9. user-assets 与 external Project 不再是路径 scope

- user-assets 是 Studio/UI 入口与 `leader.assets` profile 职责；session metadata 不再保存 `workspace/.nbook`，文件地址显式使用 `.nbook/...`。
- Workspace Root 外的目录只是绝对文件系统目标。即使存在 `project.yaml`，本任务也不向它提供 ProjectSession、Project Config merge、Profile Home、Variables、History、SQLite、RAG、Plot 或 World Engine 数据面。

### D10. ProjectSession 占用与运行中 rename

- ProjectSession open 成功前必须取得 Workspace Root 内统一位置的跨进程 Occupancy Lock；锁覆盖 open、presence、grace 和 Module close，最后一个 Module 关闭后才释放。
- prepare-open、create/ensure-mutation/delete/import或manifest metadata更新等短时磁盘变更另取Workspace Root mutation lock。需要同时持有两把锁时，固定顺序为mutation lock → prospective Occupancy Lock；Occupancy获取失败即释放mutation lock并返回`PROJECT_IN_USE`，不得持有全局锁等待。prepare-open在snapshot发布后释放mutation，立即执行无`await`最终门禁，再以Promise履行提交Occupancy handoff；ProjectSession继续长期持有Occupancy Lock。未来rename必须同时保护源、目标与snapshot发布，单锁旧slug不成立。
- canonical locator的冻结输入是`canonical Workspace Root realpath + NUL + platform-normalized single-segment projectRoot`，Windows大小写不敏感、POSIX保留大小写。Occupancy lock文件名使用该输入的opaque SHA-256，但不得使用进程内`ProjectWorkspaceKey`；二者是不同identity carrier。locator可在目标不存在时派生，属于可删除runtime artifact，不是durable Project ID。Windows case-only物理碰撞返回`PROJECT_ROOT_CASE_COLLISION`并只进入diagnostics。
- Lock handle Interface固定为`compromised`、同步`assertHealthy()`与`release()`，并在manifest atomic rename前后、snapshot commit前、mutation release前与Occupancy handoff前检查。ProjectSession收到fulfilled结果后必须在首个`await`前同步保存精确handle并接管sticky compromised；失锁后不能进入ready。
- `proper-lockfile` release失败后底层closure已可能进入`ERELEASED`，不能宣称可重试。底层release最多调用一次，并发调用共享Promise；失败缓存同一个`ProjectLockReleaseFailedError(code=PROJECT_LOCK_RELEASE_FAILED, kind, projectRoot?, cause, staleMs=30000)`，重复调用返回同一错误。sidecar文件名包含owner token，成功只删除自己的精确路径；release_failed保留诊断并等待stale协议，旧generation不得手工删除锁目录或猜测清理新owner metadata。
- resolve后捕获root fingerprint，并在manifest rename前后、snapshot commit前与handoff前复核，防止外部rename/delete/recreate造成同路径ABA replacement。fingerprint至少组合canonical realpath与平台可用的`dev/ino/birthtimeNs`等不透明事实，只属于进程内generation，不持久化。
- Lifecycle使用`running → closing → closed`、共享AbortSignal与generation-scoped in-flight。Promise履行前Occupancy归Lifecycle，失败/abort/close时由Lifecycle单次释放；Promise履行即完成handoff，此后Lifecycle不得释放。删除占用中Project返回`PROJECT_IN_USE`；当前Project只能在显式close成功并释放锁后删除，close失败不得继续物理删除。
- `ProjectLockAdapter`只包外部`proper-lockfile.acquire(file, options)`，用于controlled compromised/release故障注入；测试仍穿过`ProjectLockModule` Interface，不mock自有Module或建立通用filesystem Adapter。
- 本任务不新增 NeuroBook rename UI或 `workspace project rename`；任何现有或未来 rename 控制面都必须尊重 Occupancy Lock，运行中稳定返回 `PROJECT_IN_USE`，不尝试在活动 session 上 rekey File Index、History、SQLite 或 Project key。
- 当前身份仍是路径型 locator，不引入不可变 Project UUID。未来若要求 rename 后旧 session 无感跟随，必须作为独立设计决定；本任务不隐式重写全部 session。
- Occupancy Lock是协作协议，不是操作系统强制沙盒；Explorer/PowerShell仍可能绕过它。由Lifecycle Module唯一的Workspace Root浅层watcher发布root removed/replaced revision并通知旧session fail-closed、关闭全部Module；不为每个Project再建一套root watcher。
- manifest mutation同样只对协作writer提供串行化。portable `expectedRaw → recheck → rename`是best-effort外部冲突检测而非真正CAS；检测到变化返回`PROJECT_MANIFEST_CONFLICT`，不为本轮引入平台专用强制锁/no-replace实现。

### D11. 内置 Project Module 与 readiness

- 内置`ProjectModule` registry原位深化并最终替代全部`registerProjectResourceOwner()`，不得形成两套close/readiness真相源。required Module为Project Database、History、File Index；lazy Module至少覆盖Plot/World Engine façade与Agent SQL client。此处只铺插件式边界，不做动态第三方插件系统。
- 默认加载顺序固定为：core identity/lock/manifest ready → required Module共享AbortController并行启动 → `openProject()`等待三个最低ready。Database最低ready是schema gate；History最低ready是库打开与路径清理；File Index最低ready是raw event seam/cache/watcher ready。
- 完整 File Index build、History D15扫描、auto-accept/prune是共享、可取消的warm-up，不阻塞最低 ready；数据面需要时等待同一 Promise。不得由HTTP route另起fire-and-forget后吞错。
- 首个最低ready失败后先abort其他启动，再`allSettled`等待收尾，按固定依赖逆序关闭成功handles；不能用裸`Promise.all`提前释放锁。opening状态对strict-open数据面不可见。
- 每个session generation持有精确Module handles；HMR registry replacement只影响未来generation。shutdown先拒绝新open并abort opening/warm-up。close失败保留旧handles与Occupancy并进入`closing_failed`，不能按key查询最新registry猜测旧资源。
- Plot、World Engine与Agent SQL必须等待Database schema gate；History raw event listener在File Index watcher激活前注册，raw batch在rebuild前分发且builder失败也保留reconcile机会，SSE只在stable commit后发布。
- `scanWorkspaceTree()`与递归visitor必须贯穿AbortSignal；只隔离late commit而不能停止I/O不算可取消warm-up。

## Impact inventory

实施前必须完成并落盘逐项 inventory，至少覆盖：

| 领域 | 当前热点 | 目标 |
| --- | --- | --- |
| Project Lifecycle Module / ProjectListSnapshot | `server/workspace-files/project-path.ts`、Project list/index | 用单段 `projectRoot` 解析 Project；可重建 snapshot 为列表和文件归属提供统一 metadata |
| File Scope / File Address | `file-scope.ts`、`authorized-file-operation.ts` | cwd 固定 Workspace Root；相对与绝对地址都按 snapshot containment附加已知 Project 归属；Workspace Root外绝对地址保持普通文件系统语义 |
| Agent session/runtime | session types/repo、RunFrame、Harness、HTTP | `currentProjectRoot` + runtime-injected Workspace Root |
| Project lifecycle | ProjectSession/open guard/resource owners | 内部 `ProjectWorkspaceKey`，不接收裸 `projectPath`；长期 Occupancy Lock 拒绝运行中 rename |
| Project Module readiness | Database、History、File Index、Plot/World façade、Agent SQL、HTTP open route | required/lazy registry同批替代全部ResourceOwner；shared abort + allSettled，generation handles与close failure合同 |
| Config/Profile Home/Variables | Config service、Profile Home、variable storage | Project显式消费Resolved Project；global/user-assets回归Workspace Root `.nbook`，删除external Project分支 |
| History/Inbox/Context Access | Agent recorder、History routes、change notices | 消费 Resolver 的 Project 归属和 Project-relative path |
| Project SQLite/Plot/World Engine/RAG | facades、Agent tools、HTTP routes | 默认 Current Project；跨 Project 用可选 `projectRoot` |
| Plan Mode | `plan-mode-path.ts`、`switch_mode`、approval preview | 写入地址与 preview 参数使用同一相对/绝对地址 |
| CLI | bundled `workspace.ts` 与 bin 注入 | 从 Workspace Root 接受 `<slug>/...`；删除 `workspace/...` alias |
| Profiles/prompts | DSL、builtin profiles、compiled artifacts、reference imports | 全部路径改成 Workspace Root-relative 或真实绝对路径 |
| Frontend | Novel IDE store、Project queries、workspace/history/plot/world-engine | `projectRoot`；Project UI 值使用 slug |
| Persistence | session JSONL、custom state、可能的数据库/缓存字段 | Task 108式发布迁移；user-assets/external session折叠到Workspace Root session；无读时迁移或长期旧字段读取 |
| Product/Portable | RuntimePaths、system assets、Manager smoke | cwd 与物理位置不依赖 Installation Root 或启动 cwd |

## Implementation plan

当前唯一可执行顺序以Task 118为准；本Task只维护路径/session workstream，避免与Task 114重复编排Project lifecycle。Task 118 Phase 1–8属于同一release train，Phase 8总门禁完成前不可发布。Phase 4已拆为4A控制面groundwork与4B Product切换：4A不翻转公开DTO/store，4B必须等待Phase 5/6并与Phase 7原子合流。

| Task 118阶段 | Task 115负责内容 | 本Task退出证据 |
| --- | --- | --- |
| Phase 0 | 路径/持久化/CLI inventory与migration ledger | inventory、测试矩阵与首个Interface tracer已完成 |
| Phase 1 | `projectRoot`结构化identity、Lifecycle snapshot、manifest/locks合同 | portable rename best-effort合同、最终preflight与stale/case/race证据已收口；110 passed / 1 skipped，Windows reparse 1/1 |
| Phase 2 | 配合Task 114冻结File Index所需activation/raw-event/AbortSignal | 不在Task 115复制cache实现 |
| Phase 3 | ProjectSession/全部built-in Module迁到结构化identity | required/lazy handles、strict-open、shutdown/close failure测试通过 |
| Phase 4A | 唯一Lifecycle Facade、最终Project DTO/schema、typed error与控制面Interface | 已完成；HMR同root复用/异root拒绝/旧error识别/资源单次关闭通过，不翻转公开Product |
| Phase 5 | Config/Profile/History/Plot/World/RAG/Workflow等数据面 | 业务Module不再解析`workspace/`或从cwd猜Project |
| Phase 6 | Session Store lock、offline migration、new codec与fixtures | 499份基线dry-run可重现；resume/rollback/竞争fail closed |
| Phase 4B + Phase 7 | Project HTTP/UI/open/空态/删除与cwd/File Address/session/Plan/CLI/DTO/prompt原子hard cut | `/api/novels`和旧identity/统计/key/alias/双读零生产命中 |
| Phase 8 | 删除旧合同、Product/Portable验证和稳定文档收口 | 生产零命中与完整验证报告 |

Phase 4B开始前保留两项用户决策门禁：Settings是否只编辑Current Project（建议是）；其他标签仍有user presence或active Agent时显式close是否返回`PROJECT_IN_USE`而不强制断开（建议是）。无论选择如何，Product都不得用`projectRoot -> workspace/${root}`构造器、双字段store、DTO双读或route alias维持旧身份。

<details>
<summary>2026-07-23 inventory前的旧阶段拆分（已废弃，不执行）</summary>

以下内容仅保留计划演进记录。它把轻量列表/open放在Occupancy/ProjectModule与cache Interface之前，会产生无锁open和临时双生命周期；不得据此调度实现。

### 已废弃 Phase 0：冻结合同与建立完整 inventory

- [ ] 只在本 Task/Task 118 记录目标合同；`CONTEXT.md` 与稳定 `reference/workspace/TERMS.md` 在 hard cut 完成前保持当前实现事实，避免把计划写成已实现行为。
- [ ] 全仓枚举 `projectPath`、`ProjectPath`、`workspace/<`、`File Scope`、裸 Project-relative path、Plan Mode path 和 `process.cwd()` 路径热点，按“公开 DTO / 持久化 / runtime / prompt / test fixture”分类。
- [ ] 审计 session JSONL、custom state、History SQLite、Project SQLite、Global Config、localStorage/route query 中真实持久化形状，决定每一类迁移或可丢弃 projection。
- [ ] 建立字段级 migration ledger；明确 external structured path 转 absolute、pending operation取消、read-only fallback与通用 offline migration gate。
- [ ] inventory 所有 `openProject()`、Project open guard 与 Task 94 strict-open 调用方，记录其对 Database schema、History open、File Index watcher/cache与后台warm-up的依赖；本轮不设计面板级部分ready。
- [ ] inventory空/损坏一级目录的书架、路由、候选目录与`ensureDefaultNovel()`调用面；冻结“先open+ensure、再刷新列表”的交互。
- [ ] inventory全部`registerProjectResourceOwner()`属主并定义迁移到ProjectModule后的init/warm/close/generation责任。
- [ ] 已落Lifecycle/Lock首个Interface tracer；继续按行为RED→GREEN，最终证明同一地址在文件工具、bash、CLI与Plan Mode中一致。
- [ ] 在 Task 115 walkthrough 记录 inventory、实际迁移范围和任何与本计划不同的发现，再开始生产实现。

退出条件：不存在未分类的 `projectPath` 使用面；一级Project root、无rename范围、最低ready、候选目录交互、迁移字段表和测试矩阵已确定。

### 已废弃 Phase 1：建立 Project Lifecycle、轻量列表与打开目录 vertical slice

- [ ] 新增 `WorkspaceRelativePath`、`ProjectWorkspaceRef`、`ResolvedProjectWorkspace`、`ProjectWorkspaceKey` 类型；新 Interface 不接受旧 `workspace/<slug>`，`ProjectWorkspaceKey` 只存在于进程内。
- [ ] 将纯解析/定位、snapshot 查询、目录存在性门禁、manifest ensure/备份恢复和创建目标分配收口到同一 Project Lifecycle Module 的分层 Interface。
- [ ] `ProjectListSnapshot` 只缓存具有合法 manifest 的 Project；打开未记录一级目录时先执行幂等 ensure，缺失 manifest 生成最小合法文件，可解析 manifest 保留未知字段，损坏 bytes 备份后恢复，不进入 Broken/Repair 状态。
- [ ] snapshot 支持按单段 relative root 精确查询，不逐次扫描磁盘、不从 cwd/basename 推断，也不创建 App SQLite Project index。
- [ ] 明确 Workspace Root 一级目录与 `project.yaml` 是磁盘真相源；进程内 snapshot 仅为可重建缓存。当前进程生命周期命令主动失效，其他进程/`workspace` CLI 变化由单个一级 watcher与有界TTL fallback收敛，不要求CLI原子更新Nitro内存。
- [ ] 建立候选目录API/Adapter和书架“打开目录”入口；目标不必先在列表中，ensure成功后刷新snapshot。删除空列表自动创建默认Project与路由缺失时直接回退其他Project的行为。
- [ ] `/api/projects` 本阶段删除全部文件/Plot/session统计、旧5s统计cache、预热，以及 `manifestError`/broken/repair/统计诊断字段，并同步 shared DTO、OpenAPI、前端 store 与书架卡片。
- [ ] manifest写入使用精确命名temp+atomic replace；recovery由Index/History忽略但Archive保留。现有故障注入已证明rename失败不覆盖原文件，backup/temp其余故障点继续补齐。
- [ ] 不建立可发布的旧路径 compatibility Adapter。开发分支若需要临时构造器，只能存在于 test/staging seam，必须带删除断言，不能进入 route、codec、Product bundle 或任何可运行中间版本。
- [ ] 测试 ensure 空目录、缺失/损坏 manifest 的备份恢复、Windows/POSIX slug、Portable移动、非法 segment、Project root symlink/junction/reparse point 拒绝、不存在 Project 与 ensure/create 目标语义。

退出条件：新 Lifecycle Module/Snapshot 与打开目录交互通过 Interface 测试，`/api/projects` 已轻量化；任何 branch-local 旧路径构造器均不进入可运行 Product，尚未开始 session/cwd hard cut。

### 已废弃 Phase 2：先迁内部 Project 生命周期与业务 Module

- [ ] ProjectSession、presence、resource owner、locks、History cache 和 Project database client 改用 `ProjectWorkspaceKey` / `ResolvedProjectWorkspace`。
- [ ] 历史方案曾让健康Project纯open跳过mutation；该分支已废弃。当前所有新generation统一走mutation → prospective Occupancy → resolve/fingerprint → ensure/revalidate → snapshot → mutation release → fulfilled handoff，open/grace全程持有Occupancy，全部Module close后释放。
- [ ] 建立最小 built-in Project Module registry并替代`registerProjectResourceOwner()`；Project Database、History、File Index分别拥有最低ready、共享warm-up Promise、generation/AbortSignal、重试、diagnostics与幂等close，删除HTTP open route的吞错式fire-and-forget预热。
- [ ] 三 Module 并行启动，open等待最低ready；完整tree build、D15与maintenance后台运行但可取消。最低ready失败逆序回滚资源并释放锁。
- [ ] Config/Profile Home/Variables 的 Project分支消费结构化 Project；global/user-assets归一到 Workspace Root `.nbook`；删除新的 external Project能力设计。
- [ ] Plot、World Engine、Project SQLite、Subject Memory/RAG、Workflow 内部默认接收结构化 Current Project。
- [ ] History、Inbox、Context Access 接收 Resolver 给出的 Project key 和 Project-relative path，不从绝对路径或目录名反推。
- [ ] 迁移后的业务 Module 只接受新结构化身份，不认识 `workspace/` 前缀。DTO/session 尚未 hard cut 的阶段不得发布或标记为可运行；若开发分支使用临时入口构造器，只能服务测试并在 Phase 4 前删除。
- [ ] 历史方案曾按manifest健康度决定是否取mutation；该分支已废弃。当前open线性化顺序由Task 118统一，Module仍各自幂等创建运行目录，不向绝对目录扩展这些能力。

退出条件：所有 Project 数据面都已消费新结构化身份；mutation/Occupancy Lock、Module最低ready/warm-up/error/retry/close与owner删除有测试；旧字符串只允许留在尚未切换的持久化数据、migration fixture/decoder 与历史代码，不存在可发布的双语法 Adapter。

### 已废弃 Phase 3：建立 session hard-cut migration 与新 codec

- [ ] 定义新 session header：保留 profile 等非路径字段，删除 durable `workspaceKey`，只用可选 `currentProjectRoot` 表达 Current Project；无值表示 Workspace Root session。codec只校验单段语法，不要求 Project 当前存在；`ProjectWorkspaceKey` 不得持久化。
- [ ] 按 D6 字段级 ledger 固定 managed、user-assets、external、stale 四类旧 session 的迁移映射，并审计 custom state、session filter、linked agent inheritance、attachments、Plan、pending approval/operation 与 workflow metadata；external 默认不可直接继续，stale 保留 root并走 `current_project_missing` + rebind/clear。
- [ ] 从 Task 108 抽出共享 offline migration runner，实现 dry-run/apply/resume/rollback、manifest/journal、backup/stage、checksum 和全库复扫；这是一次性迁移脚本，不直接复用 Attachment 专用 gate，也不引入 control-plane maintenance lease。
- [ ] 实现独占 migration lock与 `pending/applying/complete/rollback_required` sentinel；Manager/start/append只接受当前目标 schema的`complete`，崩溃后必须显式resume/rollback，rollback恢复backup与上一schema sentinel。
- [ ] 新 runtime codec 对旧 `workspaceRoot/projectPath` header 返回 `migration_required`；禁止 read-time rewrite。
- [ ] 在隔离 Workspace Root 复制真实 session 形状执行完整 apply/rollback，证明 JSONL 逐文件验证、损坏 session 报告和失败恢复。
- [ ] 把 migration 接入 Manager install/update/start、开发启动入口和全部 session append owner 的 Operation Journal/fail-closed计划，但此阶段不切生产 session schema。

退出条件：迁移工具和新 codec独立完成，能够在 hard cut 发布窗口内把全部旧 session 转为新 header 或明确失败并回滚。

### 已废弃 Phase 4：单一 hard-cut 集成切片

以下改动可以分补丁开发，但在同一个发布切片中一次切换；任一项未完成都不得把中间状态标记为可运行或进入 Product：

- [ ] Session metadata、RunFrame、ToolExecutionContext、Profile context、attachments、linked agents、create/invoke inheritance 同时切到 `currentProjectRoot` / structured Current Project。
- [ ] 删除 user-assets 路径 scope；UI 仍默认创建 `leader.assets`，session 为普通 Workspace Root session，文件显式使用 `.nbook/...`。
- [ ] 删除 external Project session 创建/继承/Config/Profile/Variable路径；绝对目录只通过文件地址访问。
- [ ] Agent 文件工具与 bash cwd 同时切为 `RuntimePaths.workspaceRoot`。
- [ ] 相对 File Address 从 Workspace Root解析并按第一段查询 `ProjectListSnapshot`；命中时附加 Project key/relative path，未命中时保持普通文件地址。
- [ ] 绝对 File Address 继续允许任意目标；命中 `ProjectListSnapshot` root 时附加同一 Project 归属，Workspace Root外保持普通文件系统语义；删除 `workspace/<project>/<relative-path>` Project File Address 分支。
- [ ] Agent Project-scoped 工具删除必填 `projectPath`，默认使用 Current Project；跨 Project 才接受可选单段 `projectRoot`。
- [ ] Project Database、History、File Index 的 HTTP/前端调用方只消费 Module 最低 ready/共享 warm-up；不得重新引入路由级 fire-and-forget 或让每个调用方重复初始化资源。
- [ ] HTTP/DTO/前端 store 从 `projectPath`/混用 `novelId` 一次收口为 `projectRoot`；Project list 返回 slug。
- [ ] Plan Mode 同时切换：Project session 使用 `<projectRoot>/.agent/plan/<slug>.md`，Workspace Root session 使用 `.nbook/agent/plan/<slug>.md`；`switch_mode.planFilePath` 与文件工具地址完全一致。
- [ ] Project 生命周期命令统一由 `workspace project ensure/create/validate ...` 管理；删除绝对 `--target`、祖先 Project发现、`workspace/<slug>` compatibility、`init-db` 与 `--no-db`。本任务不新增 rename；`workspace node ...` 从 Workspace Root 接受 `<project-slug>/...`。
- [ ] 固定 `workspace project ... --json` versioned envelope、stdout/stderr、exit code 与 typed error contract；同步源码、Bundled Workspace Template、Product bundle、真实 user runtime wrapper和测试，旧自定义副本版本不匹配时 fail closed。
- [ ] 恢复精简 `RuntimeLocationReminder`，精简 `WorkspaceFocusReminder`；所有 builtin profiles、brief、workflow payload、reference、skill 和 tool descriptions 同步切换路径。
- [ ] 运行 migration apply 后再启动新 runtime；新代码不得在未迁移 header 上启动。

退出条件：session、cwd、File Address、Project工具、Plan、CLI、DTO、前端与prompt作为一个新合同整体运行，不存在半迁移组合。

### 已废弃 Phase 5：删除过渡 Adapter 与旧合同

- [ ] 删除 `ProjectPath` brand、`normalizeProjectPath()`、Project File Address kind、Workspace Root Reference 中 user-assets/external分支和全部旧 DTO/codec。
- [ ] 删除 external Project Config/Profile/Variable runtime分支；保留任意绝对文件访问本身。
- [ ] 删除或重写只证明旧 `workspace/<slug>`、Project-bound cwd、`workspace/.nbook` session scope 或 external Project session 的测试。
- [ ] 生产零命中审计：`workspace/<slug>`、`projectPath`、旧裸 Project-relative prompt 只能留在 Task历史、migration fixture/decoder和迁移报告中。
- [ ] 按顺序执行 system profile `compile --all --system` → `profile:metadata` → `check --all --system`，不得并行。

退出条件：最终 runtime 没有旧 Adapter、双读、alias 或读时迁移；模型可见文本只出现两种文件地址。

### 已废弃 Phase 6：完整验证与文档收口

- [ ] 运行 Project Lifecycle Module/ProjectListSnapshot、File Address、Agent Harness、session migration、Project lifecycle、History、Config、Profile Home、Variables、Plot、World Engine、RAG、Plan Mode、CLI 聚焦测试。
- [ ] 运行根 typecheck 与相关独立 runtime/manager typecheck。
- [ ] 在无根 `node_modules` 的 Product runtime 执行 Agent read/write/edit/apply_patch/bash 与 `workspace node` smoke。
- [ ] 在 Windows Portable 完整移动 State Root 后继续由旧 managed 类别迁移的 Project session；确认旧 user-assets session 可继续，旧 external session 的可证明结构化地址已转为 absolute但整体默认不可直接继续，stale Project session保留 header并通过 rebind/clear恢复。
- [ ] 验证 Application Root 没有生成影子 `workspace/`；源码/Product 的 RuntimeLocationReminder 都不承诺不存在路径。
- [ ] 更新 `CONTEXT.md`、稳定 reference、Task 109 前向说明、Task 115 walkthrough 和 `PROJECT-STATUS.md`；记录实际结果与本计划出入。

退出条件：所有正式入口只剩两种文件地址输入，Project身份只来自 `ProjectListSnapshot`，旧前缀零生产命中，Product/Portable证据完成；缺任一平台证据则保持 Implementing。

</details>

## Test matrix

| 场景 | 必须证明 |
| --- | --- |
| Current Project | `slug/lorebook/a.md` 在 read 与 bash 指向同一文件 |
| cross Project | `other-slug/...` 的 open gate、History、Inbox、Context Access 归属正确 |
| unopened Workspace Root directory | 列表读取不强制初始化；打开时 `workspace project ensure` 后进入 Project 生命周期 |
| missing/corrupt manifest | ensure 自动生成合法 manifest，损坏原文备份到 `.nbook/recovery/`，不出现 Broken/Repair 状态 |
| Workspace Root `.nbook` | `.nbook/agent/...` 可读，且不误归属 Current Project |
| Project `.nbook/.agent` | `slug/.nbook/...`、`slug/.agent/...` 不落到 Workspace Root 控制区 |
| former user-assets session | 迁移为 Workspace Root session，保留 `leader.assets` profile并通过 `.nbook/...` 工作 |
| former external Project session | 迁移为 Workspace Root session，不再加载绝对目录的 Project Config/SQLite/History；可证明来源的结构化相对地址按旧 external root 改写为 absolute filesystem path，但 session 默认可读不可继续，等待 clear/rebind |
| stale Project session | header 保留合法单段 `currentProjectRoot`；历史可读/可搜索/可归档，invoke 返回 `current_project_missing`，rebind/clear 后恢复 |
| arbitrary absolute file/directory | 命中 `ProjectListSnapshot` root 时获得一致 Project归属；Workspace Root外目标保持普通绝对文件语义 |
| Plan Mode | 写入路径与 `switch_mode.planFilePath` 字符串一致，preview 命中真实文件 |
| CLI | `ensure` 只创建/修复最小 Project，`create` 只物化不存在目标的模板，`validate` 只读；`--json` 单 envelope、stdout/stderr、exit code和 typed errors稳定，随后 `workspace node ... slug/...` 命中正确 Project |
| session migration | 旧managed/user-assets/external/stale按D6映射；store lock阻止runtime/migration竞争；pending call追加取消result；新codec无path/schema双读，model redaction仅作明确安全例外 |
| Project occupancy | rename/delete占用中返回`PROJECT_IN_USE`；prepare-open无缝移交handle；close failure继续持锁，关闭全部Module后才可重新获取 |
| Identity / HMR | 两个Lifecycle/HMR generation解析同locator得到同一进程key；不同Workspace Root不碰撞；同名重建由generation/root fingerprint隔离旧handle |
| Lock failure | prospective locator在root不存在时仍命中旧holder；compromised阻断commit/handoff；release失败进入terminal状态，旧closure不重试且不误删新owner |
| Manifest conflict | 协作writer串行；非协作外部编辑只做best-effort检测，命中时`PROJECT_MANIFEST_CONFLICT`且原文件/revision不变，不把portable rename描述为CAS |
| Lifecycle discovery | 一个浅watcher的ready/error/close、120ms事件合并、5s TTL fallback、bounded diagnostics；unsafe link/reparse只进diagnostics，不进candidate |
| Lifecycle transaction | ensure-missing只生成manifest；create/import同卷staging原子发布；delete tombstone；并发、crash leftover、rollback与owner-token cleanup可验证 |
| Module readiness | required Database/History/File Index shared abort + allSettled；lazy Plot/World/SQL按需；generation handles、shutdown与closing_failed可验证，完整tree/D15/maintenance为真实可取消warm-up |
| linked agent | 继承 Current Project；显式跨 Project override 使用 `projectRoot` |
| Portable move | Project relative root 重新绑定新 State Root，未持久化旧绝对 cwd |
| Source/Product reminder | Workspace/Application/reference/system-assets 路径与真实布局一致 |

## Constraints / Non-goals

- 不重新讨论任意绝对路径的能力风险，不增加新的绝对路径限制。
- 不引入不可变 Project UUID；Project Workspace 仍由 root locator 标识。
- 不通过 Workspace Root 下创建 `workspace/` symlink、junction 或虚拟目录兼容旧地址。
- 不让 bash 与文件工具使用不同 cwd。
- 不从 `process.cwd()` 推断生产 Application Root、State Root、Workspace Root 或 Current Project。
- 不自动扫描任意绝对路径的祖先来发现未知 Project。
- 不把 Workspace Root 外的绝对目录升级为 external Project session 或完整 Project 数据面。
- 不保留 user-assets 路径 scope；用户资产职责由 UI/profile 表达。
- 不长期保留 `workspace/<slug>`、`projectPath`、`novelId` 与新字段并存。
- 不用提示词补丁代替类型、Resolver 和 tool schema 的系统性约束。
- 不自动执行浏览器验证；实现完成后可以建议并等待用户授权。

## Risk controls

1. **半迁移风险**：先用 inventory 和 failing tests锁住所有入口，再切 cwd；禁止只改 `authorizeProcessCwd()`。
2. **session 数据风险**：迁移必须备份、原子发布、校验；失败时停止，不能静默跳过 session。
3. **Project 归属丢失**：History、Inbox、Context Access 必须消费 ProjectListSnapshot/Resolver 结构化结果，不能从最终绝对路径临时猜测。
4. **Global/Project `.nbook` 混淆**：测试同时覆盖 `.nbook/...` 与 `<slug>/.nbook/...`。
5. **Product 路径漂移**：RuntimeLocationReminder 和 imports 使用 RuntimePaths/system assets Adapter，不使用 cwd。
6. **测试失真**：删除只验证旧路径前缀的 fixture；新增 Interface-level 组合测试和真实 Product/Portable smoke。
7. **兼容代码回流**：迁移结束后做生产零命中审计，任何 `workspace/<slug>` 只能留在本 Task/Task 109 历史说明或 migration fixture。
8. **半迁移发布**：Phase 4B + Phase 7 的 session/cwd/File Address/Plan/CLI/DTO/prompt 是一个发布原子切片；开发中可分补丁，但中间状态不得标记可运行或进入 Product。
9. **最低 ready 误判**：Phase 0 必须逐项 inventory strict-open 假设，并把 Database schema、History open/purge、File Index watcher/cache 固定为 open 的最低 ready；完整 tree/D15/maintenance 不阻塞 open，但数据面只能等待 Module 持有的共享 Promise。禁止用未声明的 fire-and-forget 规避 Interface 设计。
10. **锁泄漏与外部移动**：Occupancy Lock 必须覆盖 open失败、初始化中close、grace、HMR和shutdown；外部强制 rename/delete 触发旧 session fail-closed，不继续使用失效绝对 root。

## Verification / Test

- Task 118 Phase 0–4A已完成；ProjectSession与全部built-in ProjectModule已经接线，稳定reference与持久化session仍未hard cut，公开Project Product继续使用旧合同。
- 实现验证按Task 118 Phase 0–8顺序推进；每阶段必须记录实际命令、通过数、失败原因和下一阶段是否可开始。
- Phase 4A独立聚焦证据为Lifecycle watcher / Session Runtime / Service / production Facade / HMR与最终DTO/error共7 files / 68 passed；受影响route/guard组合修正陈旧Workspace Root mock后为9 files / 32 passed，根`bun run typecheck`通过。
- `profile-compile-worker`完整测试本轮在Vitest transform/import阶段进入测试body前触及Node约4GB heap并退出，因此不记为通过；叶子错误模块与旧route mock回归已独立验证。
- Profile 修改后的固定顺序：`compile --all --system` → `profile:metadata` → `check --all --system`。
- 若 typecheck 暴露无关既有错误，必须记录精确错误和与本任务的关系，不能用它掩盖路径切片本身的失败。

## Implementation Walkthrough

### 2026-07-22：合同讨论与计划冻结

- 用户确认 Agent cwd 统一为 Workspace Root。
- 用户确认 Agent/Project 输入只保留 Workspace Root-relative 与 absolute filesystem path 两种。
- 用户确认删除 `workspace/<slug>` Project Path identifier 语法；内部保留结构化 Project Workspace identity。
- 用户确认任意绝对路径风险暂不讨论，继续允许。
- 本轮创建 Task 115，建立与 Task 109、90、91、92、94、43、60、105、108 的引用和分阶段实施计划。
- 本轮未进入生产实现，也未修改稳定 reference；Task 109 仍描述当前运行实现，Task 115 描述下一次 hard cut 目标。

### 2026-07-23：Phase 1 首个 identity / Lifecycle / Lock tracer

- 开始Phase 1 tracer-bullet实现：新增结构化`ProjectWorkspaceRef`、最小`ResolvedProjectWorkspace`与当时的实例内branded symbol key；Lifecycle覆盖canonical spelling、同代snapshot、YAML逐字段修复、逐字节recovery、原子故障、manifest link拒绝与generation竞态；Lock覆盖opaque hash、mutation串行、sidecar与Occupancy fail-fast。`prepareOpen()`基本锁序和同handle返回已落测试但尚未接入ProjectSession。当时2个测试文件、16项聚焦测试通过；该数字和实例级key已被后续checkpoint取代。

### 2026-07-22：整体审查后的合同补充

- 用户确认相对文件地址仍只是一条普通相对路径；Project身份由轻量 `ProjectListSnapshot` 按第一段精确匹配后在系统内部附加，不新增第三种Agent路径。
- 用户确认删除user-assets路径scope：旧`workspace/.nbook` session迁为Workspace Root session，`leader.assets`由UI入口和profileKey表达，文件显式使用`.nbook/...`。
- 用户确认删除external Project session与完整数据面：Workspace Root外目录只作为普通绝对文件系统目标，不自动加载Project Config/History/SQLite/RAG/Plot/World Engine。
- 计划按审查结论重排：先建立 Project Lifecycle Module/ProjectListSnapshot并迁内部业务，再准备Task 108式session migration；session schema、cwd、File Address、Plan、CLI、DTO/前端与prompt在同一个hard-cut发布切片中切换，最后删除旧Adapter。

### 2026-07-22：与 Task 114 建立联合执行计划

- 新建 Task 118，确认 Project Lifecycle Module/`ProjectListSnapshot` 拥有 Project discovery/identity，Task 114 snapshot cache 只消费已解析的 `ProjectWorkspaceKey`。
- `/api/projects` 目标改为 `ProjectListSnapshot` + manifest metadata 轻量组合，不读取 file/Plot/session statistics，也不建立 statistics projection。
- 真实 session 审查与路径一致性问题形成的 G1–G5 已全部拍板；statistics projection相关G6/G7已随Project列表统计删除而撤销。本 README 中与最终拍板冲突的早期条款，将在 Phase 0 后统一修订。
- 用户确认不允许外部Project、cwd固定Workspace Root、默认全trusted；打开 Workspace Root 内目录先由 `workspace project ensure` 静默生成/修复 manifest，之后直接进入完整 Project 数据面；各 Module 自己 ensure 目录，产品不再暴露 Broken/Repair 状态。
- Agent Project 管理统一经稳定 `workspace` CLI：`workspace project ensure/create/validate` 管生命周期，`workspace node` 管内容节点；不直接调用根目录脚本或编辑 manifest 绕过 Project Lifecycle Module。
- 用户确认运行中的 Project 禁止 rename。ProjectSession 将持有跨进程 Occupancy Lock，open/grace全程占用，所有 Module 关闭后释放；NeuroBook CLI/界面返回 `PROJECT_IN_USE`，外部程序绕过锁时由 watcher关闭旧 session。
- 用户确认内置 Project Database、History、File Index 采用插件式 Module边界。本轮只做内置 registry，不建设第三方插件系统；当日仍保留“模块级部分 ready 或全部 ready”的实施分支，该分支已由 2026-07-23 统一决策取代。
- 启动阶段遇到损坏 manifest 只扫描和诊断；打开时才备份恢复。ensure失败不会建立 ProjectSession，并会释放已取得的 Occupancy Lock。

### 2026-07-23：整体合同统一

- Project Workspace 固定为 Workspace Root 一级物理子目录；Project root symlink/junction/reparse point 一律拒绝。`/api/projects` 只列合法 manifest Project，普通一级目录由独立候选入口显式 open+ensure，成功后刷新 `ProjectListSnapshot`。列表为空不再自动创建默认 Project。
- ProjectModule registry 原位替代 `registerProjectResourceOwner()`；Project Database、History、File Index 并行启动，`openProject()` 固定等待 Database schema、History open/purge、File Index watcher/cache 三个最低 ready。完整 tree、History D15、auto-accept/prune/maintenance 是共享、可取消 warm-up，不建设面板级部分 ready UI。
- Workspace Root mutation lock保护prepare-open、ensure mutation/create/delete/import与snapshot发布；新建session固定按mutation → prospective Occupancy获取，Occupancy fail-fast。ensure/root复核/snapshot完成后释放mutation，再执行最终无`await`门禁并以Promise履行提交handoff。Project Occupancy Lock继续覆盖open/grace/Module close。本任务不新增rename UI/CLI；任何现有或未来协作式rename在占用期间返回`PROJECT_IN_USE`，rename的源/目标锁和session重绑另立任务。
- session migration 以 Task 118 G2/G3 为唯一映射：旧 managed session 绑定 `currentProjectRoot`，旧 user-assets/external session 折叠为 Workspace Root session；external 的可证明结构化相对地址按旧 root 改为 absolute，但 external session整体默认可读不可继续。stale Project session保留合法 root，invoke 返回 `current_project_missing`，由 rebind/clear恢复。自由文本不改写，全部未执行 approval/write/edit/apply_patch/Plan/follow-up/steer 取消。
- CLI 与 runtime 同一 hard-cut 发布：`ensure` 只创建/修复最小 Project，`create` 只向不存在目标物化模板，`validate` 只读；只保留 PATH 中稳定的 `workspace project ensure/create/validate ...` 与 `workspace node ...`。`--json` 使用单一 versioned envelope，源码/模板/Product/user runtime wrapper同步切换；删除绝对 `--target`、祖先 Project 发现、`workspace/<slug>` compatibility、`init-db` 与 `--no-db`，数据库由 Project Database Module 初始化。

### 2026-07-23：Phase 0 inventory 后的统一修订

- Task 118已成为唯一执行顺序；本README旧Phase 0–6拆分归档为历史，不再调度。新顺序先做Lifecycle/manifest/locks，再深化Task 114 cache Interface，然后同代接入ProjectSession/全部built-in Module，最后才落Project HTTP/UI vertical slice。
- ProjectModule迁移范围从“三个required Module”扩为全部现有owner：File Index、History、Plot façade、Agent SQL；Plot/World与SQL保持lazy，不阻塞open，但必须返回generation-scoped handle并由同一session关闭。
- 模块并行启动冻结为shared AbortController、首错abort、allSettled收尾与固定依赖逆序回滚；补HMR旧handle、shutdown gate、`closing_failed`与delete fail-closed。
- session migration改为复用/泛化现有Agent Session Store`runtime.lease`，作为runtime与offline migration唯一互斥锁；sentinel只负责schema和恢复，不新增maintenance lease或第二把migration lock。
- 真实session基线为499个全部可解析、24个stale；字段ledger补齐tool call/result、apply_patch move、custom state、pending取消、linked child和无需迁移的attachment/内存steer边界。
- 最终Project控制面固定为轻量`/api/projects`、`/api/projects/candidates`和原子`/api/projects/open`；删除`/api/novels`镜像、重列表query、旧列表identity/统计、自动默认Project与route静默fallback。

### 2026-07-23：Phase 1 安全审查统一

- 该轮审查把`ProjectWorkspaceKey`目标从单Lifecycle实例intern改为跨Lifecycle/HMR稳定的opaque-hash symbol，并把跨进程锁从依赖已存在realpath改为canonical Workspace Root + normalized `projectRoot` prospective locator。exact digest、HMR reload与Lifecycle prospective事务现已由公开Interface tracer证明。
- `prepareOpen()`已补Lifecycle close/in-flight gate、lock compromised commit gate、root fingerprint/ABA revalidate与release-failure terminal状态；但Phase 1其余门禁完成前仍不接入ProjectSession。
- manifest portable合同收窄为协作writer串行、逐字节recovery、best-effort外部冲突检测和atomic publish；非协作编辑器compare→rename窗口不冒充CAS，检测到变化返回`PROJECT_MANIFEST_CONFLICT`。
- 生命周期mutation采用私有同卷staging/tombstone与owner token；公开只保留意图式Interface。`validate`完全只读，watcher是单Workspace Root薄控制面，120ms事件合并、5s TTL与bounded diagnostics，不复用File Index cache。
- “拒绝全部Windows reparse root”仍是目标合同，但当前只证明symlink/junction；通用reparse detector与真实Windows smoke是Phase 1退出门禁。

### 2026-07-23：Identity / Lock 深化与生命周期所有权统一

- 已删除Lifecycle实例级key Map，改用opaque-hash `Symbol.for`；Lock改收`ProjectWorkspaceRef`并可在目标不存在时预占，删除Lock→Lifecycle类型反向依赖、`ResolvedProjectWorkspace`参数与handle上的`projectKey`。`vi.resetModules()`现已证明HMR reload后仍为同一symbol。
- identity公式已修正为`canonical Workspace Root realpath + NUL + platform-normalized single-segment projectRoot`，exact digest同时验证Project key与Occupancy artifact；Windows真实case-only目录碰撞仍未实现。
- `prepareOpen()`现按mutation→prospective Occupancy→resolve/fingerprint→ensure→root revalidate→snapshot publish→mutation release→最终无`await`门禁→fulfilled handoff执行。
- handoff不增加adopter handshake。Promise履行前handle归Lifecycle；履行后ProjectSession必须在首个`await`前保存精确handle并接管sticky compromised，Lifecycle不得再释放。
- Lock handle统一为`compromised/assertHealthy/release`，release只调用底层一次并缓存typed failure；fixed sidecar已改为tokenized filename。`ProjectLockAdapter`只包proper-lockfile外部Seam，测试继续穿过ProjectLockModule Interface。
- Lifecycle现具备`running/closing/closed`、共享abort、generation-scoped in-flight、root fingerprint/ABA、manifest/snapshot/handoff commit gates及履行即所有权转移；manifest外部变化返回`PROJECT_MANIFEST_CONFLICT`。
- Phase 1最终聚焦状态为6 files passed、110 passed / 1 skipped；Windows Bun reparse smoke 1/1。根typecheck本轮被`neuro-agent-harness.test.ts`的并行语法错误阻塞，不属于Lifecycle/File Snapshot改动面。

### 2026-07-24：Phase 3与Phase 4A路径前置完成

- ProjectSession现持有结构化identity、Occupancy及全部required/lazy Module generation handles；空目录/损坏manifest先由Lifecycle ensure，再启动Database/History/File Index。外部root replacement/delete、HMR、shutdown与close failure均fail closed。
- Phase 4A建立唯一Lifecycle Facade、最终Project DTO/schema与typed HTTP mapper，但按release-train边界没有切换公开`/api/projects`、store、session或Agent path合同。
- HMR审查发现旧Service跨reload复用时，新构造器`instanceof`无法识别旧typed error；新增版本化global nominal Project error base与exact kind，并把跨模块consumer改为稳定predicate。回归覆盖同root复用、异root拒绝、旧error由新mapper/guard识别及底层资源单次关闭。
- Phase 5 inventory已拆为Config/Profile、Variables/Context、History/Inbox、Database/World/RAG、Plot、Workflow六个内部切片。它们只能迁内部identity；公开DTO/session/tool schema/UI/File Address留给Phase 4B + Phase 7原子hard cut。

## TODO / Follow-ups

- [x] Task 118 G1–G5与Phase 0只读inventory已完成并统一回写；session与持久化数据未修改。
- [x] Task 118 Phase 1主体实现已落地：exact identity/HMR、lock terminal状态、prospective事务、close/in-flight、root/compromised/handoff、manifest conflict、transactional mutations与watcher/TTL均有聚焦证据。
- [x] Project root publish采用portable rename的best-effort外部writer合同；stale lock、最终preflight、publish-window exact/case/non-empty target与POSIX空target characterization已完成。
- [x] ProjectSession/全部built-in ProjectModule与File Index同代接入完成；旧ResourceOwner与按path全局facade生产零命中。
- [x] Phase 4A唯一Facade、最终DTO/schema、typed HTTP mapper与HMR稳定错误协议完成；公开Product仍保持旧合同。
- [x] Phase 6 session 迁移引擎与 store-lock 竞争、失败恢复演练已完成。新 codec 产出 `currentProjectRoot?` + `schemaVersion: 2` 并删除 `workspaceRoot`/`workspaceKey`/`projectPath`；真实 Workspace Root dry-run 为 499/499（managed 241 / workspace_root 233 / stale 24 / user-assets 1 / external 0），与本文件记录的 2026-07-23 基线一致。基线数字的来源已澄清：真实盘上另有 38 份 2026-05 旧布局子目录 Session（运行时不递归读取，产品里不可达），本轮按用户拍板移入 `session-backups/legacy-nested-2026-07-26/`，清理后回到 499。
- [ ] Phase 6 剩余的 fail-closed gate 接线随 Phase 4B + Phase 7 执行：`SessionMetadata` 目前必需 `workspaceRoot`/`workspaceKey`，与 v2 header 互斥；只挂启动 gate 会让 Nitro 因缺 sentinel 起不来，先 apply 又会让当前 runtime 读不出 Session。两把 lease 归一另受 Harness 同步构造限制（Session Store 侧无同步租约）。
- [ ] Phase 4B必须与Phase 7原子切换，Phase 8前不可发布。
- [ ] 每个实施切片继续更新本 README，不新建碎片任务。
- [ ] 实现完成时同步 `PROJECT-STATUS.md`、稳定 reference 和 Task 109 的最终 successor 状态。
