# Monorepo Module 边界与迁移规范

## 目的

NeuroBook 以一个 monorepo 维护应用、共享合同、Product Runtime、Desktop 和可独立发布的包。`Module` 是逻辑所有权和依赖边界，不等于当前目录，也不要求每个 Module 立即成为 npm 包。

主应用当前已位于 `packages/neuro-book`；根只保留 workspace 编排、治理、产品、桌面和发布宿主入口。六个自治项目已收编到对应 `packages/*`，各自保留项目 docs、legacy Task 记录、状态和专属 `AGENTS.md`，默认继承根治理规则；current Work/Task 统一位于根 `.agents/works/`。

## 当前布局与目标布局

| 边界 | 当前真相源 | 当前入口或消费方 | 当前状态 |
| --- | --- | --- | --- |
| 主应用 | `packages/neuro-book/package.json`、`app/`、`server/`、`shared/`、`assets/`、包内 `scripts/`、legacy `.agents/tasks/`、`Dockerfile*`、`docker-compose.yml`、`.env.docker.example`、`.gitignore` 与 `config.example.yaml` | `bun --cwd packages/neuro-book ...`、Nuxt、应用 Vitest、Product 宿主 | 应用源码、专属脚本、legacy Task provenance、运行期参考书、分发资产和应用交付配置由应用包持有；current Work/Task 由根 `.agents/works/` 持有 |
| Source Dev | `packages/neuro-book/scripts/cli/source-dev.ts` | 应用 `dev` 命令 | 应用拥有启动编排；唯一允许的根 bridge 是只读复用 `scripts/utils/workspace-roots.ts` 定位 repository/application roots |
| 用户文档站 | `vitepress/locales/{zh-Hans,en-US}/`、`vitepress/public/`、`vitepress/.vitepress/` | 根 `docs:*` 命令与 docs workflows | 整个 monorepo 的中英文用户文档投影；公开 URL 固定为中文 `/`、英文 `/en/`，工程 Spec 留在 owner 文档根 |
| Agent Runtime | `packages/neuro-book/server/agent/`、相关 DTO 与 `packages/neuro-book/assets/reference/agent/` | Agent API、Harness、Profile runtime | 保持应用逻辑 Module；逻辑 `reference/**` 在 Source/Product 均解析到应用持有的只读书架 |
| Project / Workspace | `packages/neuro-book/server/workspace-files/`、State Root 的 `workspace/`、Project SQLite、Workspace 文件协议 | Project API、文件工具、Workspace CLI | `workspace/` 是运行时逻辑前缀；Source Dev 默认把物理 State Root 放在 Windows `%LOCALAPPDATA%/NeuroBook/data`、macOS `~/Library/Application Support/NeuroBook/data`、Linux `$XDG_DATA_HOME/NeuroBook/data`，不使用 checkout 根 `workspace/` |
| World Engine | `packages/neuro-book/world-engine/` 与 `packages/neuro-book/assets/reference/world-engine/` | Plot、Agent tools、写作流程 | 保持独立领域 Module；Product runtime 通过显式 runtime island 消费 |
| Product Runtime / Release | `packages/neuro-book/server/runtime/`、根 `scripts/build/`、`scripts/deploy/`、`scripts/release/` | Product、Portable、Container、Release | 共享验证和发布入口保持根宿主 owner；应用运行期书架投影到 Product `server/assets/reference/` |
| Workspace 自治包 | `packages/nb-history/`、`nb-workflow/`、`nb-memory/`、`nb-ui/`、`neuro-agent-harness/`、`llmlint/` | 各包公开 exports、包内测试和应用消费者 | 各包独立 owner；包级治理资产覆盖专属行为，统一文档站只投影用户入口 |
| Manager | `packages/neuro-book-manager/` | `@notnotype/neuro-book-manager`、`neuro-book` bin、Desktop 正式 subpath | 独立包；拥有 UAC client/broker 与 Product verifier，exports 的 types/runtime 条件必须同时覆盖真实消费者 |
| Desktop Envelope | `desktop/` 与 `packages/neuro-book-contracts/src/desktop*` | Electron/Tauri、Manager、Desktop Contract | 保持根级独立安装图；宿主实现通过 contracts 或 Manager 正式 subpath 消费，不深导入应用或 sibling 源码 |

所有 `packages/*` 默认继承根 Rule/Skill/Role、临时根、安全和 Git 规则。包可以保留自己的 `AGENTS.md`、`docs/`、legacy `.agents/tasks/` 和 `PROJECT-STATUS.md`，但 current Work/Task 只在根 `.agents/works/` 创建；`AGENTS.md` 必须引用 `../../AGENTS.md`。`.agent/.local` 必须被忽略且不得跟踪，`.worktree` 只允许迁移期间短暂存在并在 checkpoint 前清理。linked worktree 统一位于主 checkout 的 `/.worktree/` 下，主 checkout 是唯一目录外例外。

### 运行时路径与源码资产

- `packages/neuro-book/assets/` 是已跟踪的主应用分发资产：`assets/workspace/` 提供系统 `.nbook` 模板/profile/skill，`assets/reference/` 提供运行期 Reference。它不是用户 Workspace，也不应被启动进程写入。
- checkout 根 `assets/` 与 `workspace/` 仅是本机旧运行残留/用户数据隔离区；均不属于当前 Source owner。根 `workspace/` 被 `.gitignore` 忽略，不能通过目录搬家覆盖或删除其中的用户 SQLite、会话和 Project 文件。
- Source Dev 由 `packages/neuro-book/scripts/cli/source-dev.ts` 注入 `NEURO_BOOK_STATE_ROOT`；当前默认物理 Workspace 是平台用户数据根下的 `workspace/`。只有显式设置 `NEURO_BOOK_STATE_ROOT` 时才改变该位置。
- `.env` 与 `config.yaml` 是 State Root 的本机运行配置，不是源码包内的提交文件；仓库只提交 `packages/neuro-book/.env.example`、`.env.product`、`.env.typecheck`、`.env.docker.example` 和 `config.example.yaml`。
- Docker build context 仍是 monorepo 根，以便一次安装全部 workspace；因此根 `.dockerignore` 是交付宿主配置，Dockerfile 本身和 Compose/env 示例归主应用包。

根 `tsconfig.json` 和应用包配置中的 `nbook/*` alias 指向 `packages/neuro-book`；它是应用源码的绝对导入约定，不等于可供其他包深导入的内部路径。跨包依赖必须通过 workspace package 名和声明版本进入公开入口。

## Module 必须声明的合同

每个新 Module 或迁移中的 Module 在 Task/设计记录中至少声明：

1. **Owner**：谁拥有实现、持久化真相源、删除语义和失败恢复。
2. **Interface**：调用方能使用的类型、命令或 DTO；不把内部实现类型当作公开合同。
3. **依赖方向**：允许的运行时依赖、type-only 依赖、禁止的反向依赖和宿主 adapter。
4. **数据边界**：文件、SQLite、JSON、缓存、编译 artifact 和运行临时目录分别由谁创建、验证、清理。
5. **入口**：Source、Product、Manager、Desktop 和测试分别从哪里进入；不保留同义 fallback。
6. **验证**：Module focused tests、typecheck，以及需要真实 Product/安装/浏览器/Provider 证据的集成门禁。
7. **迁移撤销点**：中间产物、旧入口、journal、marker 和失败时的保留/恢复规则。

没有 Owner、Interface 和验证命令的目录拆分只是文件搬家，不得作为 Module 迁移开始条件。

## 允许的依赖方向

```text
领域 Module / 稳定合同
        ↑
应用编排与 HTTP/UI adapter
        ↑
Source / Product / Desktop / Release 宿主 adapter
```

- UI、HTTP route 和 CLI 负责解析输入、授权、错误映射和编排；领域 Module 负责业务规则和数据所有权。
- 根 `scripts/` 保持跨 workspace 的 CI、构建、部署、安装、发布和治理宿主；应用专属 smoke、seed、warmup 进入应用包。
- `packages/neuro-book/server/runtime/commands/` 只适配 Product Runtime Contract；Workspace CLI 的实现归 Workspace Module。
- Manager 通过稳定的 Product/Release/Installation/Desktop subpath 消费能力，不导入 Nuxt 页面、主应用特例或 `desktop/**` 源码。
- Desktop Envelope 只拥有宿主窗口、Supervisor、安装编排和退出协议；UAC 实现归 Manager，线协议归 contracts，不复制 Product Runtime 合同。
- 共享 DTO 或 verifier 只有在实际存在跨宿主复用且不会形成反向环时才下沉。当前依赖环和 type-only 环按 [ADR 0015](../../packages/neuro-book/docs/adr/0015-architecture-boundaries-and-deferred-structure.md) 保持记录，不为“看起来干净”提前抽包。

## 物理迁移步骤

1. **冻结基线**：读取根规则、相关 Task、Reference、包规则和入口；记录当前工作树、停工 worktree、生成物和未跟踪文件。不得 stash、prune、reset 或覆盖已有改动。
2. **绘制调用图**：用语言服务、测试配置、`package.json`、workflow 和脚本入口确认所有消费者。字符串搜索只能补充，不能替代符号引用和动态入口审计。
3. **先定 Interface**：为目标 Module 写输入/输出、错误、生命周期、数据所有权和依赖方向；公开合同变化先更新 ADR/Reference，再迁移实现。
4. **建立目标包骨架**：补齐 `package.json`、exports、bin、tsconfig、测试配置和生成物边界。目标包不得通过相对路径偷读应用根或根 `node_modules`。
5. **单次迁移一个 Module**：先迁实现和测试，再迁所有调用方、配置、workflow、文档和生成器。导入采用明确的目标入口；不保留旧路径 alias、deprecated re-export 或静默 fallback。
6. **隔离运行数据**：测试、验收、cache 和 scratch 使用 `NBOOK_AGENT_TEMP_ROOT` 及受控子目录；任何 fixture 不得写入仓库 `.agent/tmp/`、`.worktree/`、包级 `.worktree/` 或目标包源码树。
7. **完成验证后删除旧边界**：确认旧路径引用为零、目标包独立 typecheck/bundle/test 通过、应用级集成门禁通过，再删除旧实现和旧入口。删除前保留 provenance、manifest、migration journal 或 Task 证据。
8. **记录实际偏差**：Task walkthrough 写明未迁移的宿主、未运行的浏览器/真实 Provider/发布门禁和剩余风险；不要把 focused test 写成全仓或产品验收。

## 本轮不做的事情

- 不把主应用再次物理移动；当前应用 owner 已是 `packages/neuro-book`。
- 不把根 `package.json` 改成不含产品、治理、桌面和发布编排的空壳。
- 不批量重写已由应用包 alias 承接的 `nbook/*` 导入。
- 不新建 runtime contract 平行包、跨存储事务框架或跨语言生成层。
- 不把 `.agent/plan`、产品模板、用户内容或产品 Skill 路径改名为 `.agents/`。
- 不以发布、浏览器、真实 Provider 或数据迁移结果替代 Module focused verification。

## 目标应用包的完成条件

主应用物理迁移已完成；后续结构变更仍必须满足以下持续条件：

- 根 workspace orchestrator、`packages/neuro-book` 和所有现存包的依赖图无反向环；领域包不得依赖主应用。
- Source Dev、Nuxt、Vitest、Product build、Manager 和 Desktop Contract 都从明确入口工作。
- `nbook/*` 由应用包内 alias 或公开 exports 承接；应用 `#scripts/*` 只允许已登记的 root locator bridge，不形成通用 root runtime fallback。
- 生成的 Nuxt、Prisma、OpenAPI、Profile/Variable artifact、VitePress staging 和 Product staging 不回写错误的 owner 根。
- focused Module tests、应用集成测试、typecheck 和必要的平台门禁均有真实命令和证据。
- Task、ADR、运行期 Reference、CI workflow、包发布合同和回滚说明同步完成。

相关长期边界见根 [AGENTS.md](../../AGENTS.md)、[packages/AGENTS.md](../../packages/AGENTS.md)、[ADR 0015](../../packages/neuro-book/docs/adr/0015-architecture-boundaries-and-deferred-structure.md) 和 [ADR 0009](../../packages/neuro-book/docs/adr/0009-product-runtime-image-generation.md)。当前规范注册表继续以本文件为 Monorepo / Module 唯一正文，不创建 `docs/specs/architecture/monorepo-boundaries.md` 副本。
