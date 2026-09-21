# NeuroBook 测试规范

本文件是仓库测试、临时根、环境和验收约定的真相源。所有 Vitest 配置、测试编写、fixture 和验收脚本遵守这里；规则冲突时先更新本文件，不在 `AGENTS.md` 维护第二份正文。

## 用户视角人工评测

[`manual-eval/README.md`](manual-eval/README.md) 是测试体系中的人工验收子系统：`criteria.md` 定义判定与证据合同，`journeys/` 保存用户旅程用例，`agent-guide.md` 定义一次评测的执行步骤，`report-template.md` 约束结果格式。它不属于 `packages/neuro-book/docs/runbooks/`，因为整套资产不仅包含操作步骤，还包含测试判据、用例和报告合同。

1. **测试临时根统一在 `<系统Temp>/neuro-book/vitest/<runId>/`**：
   - 由 `@notnotype/neuro-book-test-support/vitest` 在每个 Vitest worker 启动时把
     `TMPDIR`/`TEMP`/`TMP` 指向该目录；测试里 `os.tmpdir()` / `mkdtemp(tmpdir()...)`
     运行期自动收敛；
   - 受控根不放在仓库 `.agent/tmp`：worktree 深路径叠加测试内部 UUID 目录名会超过
     Windows MAX_PATH（git 对象与 release staging 报 "Filename too long" /
     ENAMETOOLONG），系统 Temp 路径最短且 OS 会定期清理；
   - 每次 run 结束由 `@notnotype/neuro-book-test-support/vitest` 的 teardown 删除
     本 run 目录；并行 run 因 runId（8 位 hex）互不干扰；进程被强杀时由下一次 run 的
     setup 按 24 小时超窗兜底回收；
   - 所有 Vitest 配置的 `setupFiles` 第一项必须是该 setup 文件、`globalSetup` 必须包含
     该 globalSetup（含独立包配置）。
2. **测试自身必须清理自己创建的目录**：`afterEach` 收集并 `rm`。清理失败视为测试问题，
   不依赖全局清理兜底。
3. **进程被强杀等异常残留**由 `@notnotype/neuro-book-test-support/tmp` 的
   `sweepStaleTmpRoots()` 在每次 run 起点回收：只删除带合法 owner marker、超过 24 小时且
   owner 进程已死的真实目录；无 marker、symlink/reparse point、普通文件、窗口内目录和活跃
   owner 一律保留并报告。新增测试根使用 `createTestTmpRoot(name, purpose)`。
4. **禁止在仓库根、`.worktree/`、快照目录或系统 Temp 根直接创建业务临时数据**；仓库根下的
   `cache/`、`workspace/`、`logs/` 等业务目录不能被测试写入。
5. **脚本（非测试）的临时数据**使用 `@notnotype/neuro-book-test-support/paths` 分配的系统 Temp
   子目录，并且必须在 `finally` 中清理。
6. **验收/沙盒脚本**默认输出到 `<系统Temp>/neuro-book/acceptance/` 或 task/run 专用子目录，
   禁止把用户公共目录写为默认值；需要仓库外路径时通过参数显式传入，并打印实际路径。
7. **公开环境键由测试支持包拥有**：

   | 环境键 | Owner 与约束 |
   | --- | --- |
   | `NBOOK_HOST_SYSTEM_TEMP_ROOT` | `neuro-book-test-support` 的宿主 Temp locator；只供隔离测试或验收宿主注入绝对路径 |
   | `NBOOK_AGENT_TEMP_ROOT` | Agent 测试、fixture、cache、scratch 与 acceptance 的共同父根；必须是宿主 Temp 内的绝对真实路径 |
   | `NBOOK_AGENT_WORKTREE_ROOT` | governance/worktree 工具的 repo-relative locator；默认 `.worktree`，不得指向包源码或运行数据根 |
   | `NBOOK_TEST_TMPDIR` | Vitest global setup 为单次 run 写入；必须包含在 `NBOOK_AGENT_TEMP_ROOT` 内，普通测试不得长期覆盖 |

## 测试文件组织

- 测试文件与被测源码同目录，命名 `<module>.test.ts`；服务端需要 JSX 时用 `.test.tsx`。
- 每个 Vitest 配置显式声明 `root`（仓库根或包根），不依赖 `process.cwd()`；include 覆盖
  该作用域内全部测试文件。
- 全量测试统一 `bun run test`（node 运行时）。`bun --bun` 直接运行 vitest 时部分依赖
  （如 zod）的 CJS/ESM interop 与 node 不同，过滤单文件可能误报
  `zod does not provide an export named 'z'`；以 node 运行时为准。
- 新增测试目录（如新 `scripts/<area>/`）必须同步加入对应配置的 `include`，否则测试
  永远不运行——「写了但从不跑」比没有测试更危险。
- 测试导入使用与源码一致的 `nbook/*` / `#manager/*` 别名，不使用跨项目相对路径。

## 平台与 CI

- 依赖 Windows 路径语义的测试用 `it.runIf(process.platform === "win32")`，其余平台跳过；
  POSIX 独有的信号语义测试用 `it.skipIf(process.platform === "win32")`。
- 测试不得依赖本机用户目录、`Program Files`、`C:\t145-*` 等机器特定路径；需要真实目录
  时全部使用 `mkdtemp(tmpdir()...)`（受控根）。
- CI 与本地跑同一套配置：clean-runner 不生成 `.nuxt/tsconfig.json` 时，相关配置使用独立
  esbuild transform（`oxc: false`），不依赖 Nuxt prepare 产物。

## 验收脚本（Task 145 及后续 Desktop 任务）

- `prepare-host.ps1` 等宿主机准备脚本：输入/证据默认落在系统 Temp 下的 Agent 受控目录，
  所有路径可参数化；`.wsb` 等模板文件不得写死本机路径，运行说明要求按脚本输出修改。
- 面向用户的下载产物（如最终 ZIP）不属于测试临时数据：放用户指定目录，并同时给出
  SHA-256 与构建身份（revision/imageId），不与其他 quick 构建混放。

## 验证门禁

- 纯文档或治理修改检查链接、结构和规则语义；不运行产品测试、typecheck、产品构建或浏览器。修改 VitePress 投影时仍按 [`docs/AGENTS.md`](../AGENTS.md) 的目录合同运行 `bun run docs:build`。
- 实现变化运行受影响测试；类型表面受影响才运行对应 typecheck。UI、迁移、集成和发布继续遵守各自合同及授权。
- 长期测试覆盖可观察行为与可能回归，不为措辞或实现镜像增加测试。Bug 有合适切入点时保留复现为回归测试，否则用聚焦 smoke 并说明缺口。
- 所需检查通过后，仅因后续改动使证据失效、出现失败或具体未解风险才重跑或扩大。仅叙事文档形成新 revision 不自动使代码测试证据失效。
- 提交前运行 `git diff --cached --check`。既有失败与本次失败分开报告，不能把“focused 通过”写成“全量通过”；远端登记 Issue 仍需授权。

## 应用包真实模型 smoke（`test:real-model`）

`bun run test:real-model`（等价 `bun run --cwd packages/neuro-book test:real-model`）是应用包唯一会真实调用
Provider 的测试入口：独立配置 `packages/neuro-book/vitest.real-model.config.ts` 只收集
`packages/neuro-book/scripts/smoke/real-model/**`，默认门禁（`bun run test`）显式排除该目录，常规测试零模型调用。

- **凭据**：从仓库根 dotenv（`.env`，含 `.env.local` / `.env.real-model*` 变体）白名单注入测试进程（`DEEPSEEK_API_KEY`，可选 `DEEPSEEK_API_BASE`）；缺凭据的用例 skip 并在证据中记为「未验证」，不得写成通过。`REAL_MODEL_SMOKE_MODEL` 可覆盖模型（默认 `deepseek/deepseek-flash`）。
- **隔离**：测试使用独立 State Root 与临时 workspace；写入的全局配置只落在本 run 的隔离根内（缺少 `NEURO_BOOK_STATE_ROOT` 时直接拒绝写入），POSIX 下收紧为 0600，随 run teardown 删除。
- **外部前置**：HTTP 与写作 workflow 用例需要已启动的 dev server（`AGENT_HTTP_BASE_URL`，默认 `http://localhost:3000`），仅网络层不可达时 skip，已监听但接口失败按测试失败暴露；workflow 用例还需 `REAL_MODEL_SMOKE_PROJECT` 与 `REAL_MODEL_SMOKE_CHAPTERS`（缺一即 skip），写盘场景仅在显式设置 `REAL_MODEL_SMOKE_WRITE_CHAPTER` 时执行。
- **与 smoke CLI 的关系**：`smoke:agent`、`smoke:agent-http`、`smoke:writing-workflow` 面向手工单次执行、失败即退出；测试命令提供统一入口与 skip 语义。两者共用 `packages/neuro-book/scripts/smoke/` 的装配与运行函数。
- **CI**：默认工作流不运行该命令（无外部凭据）；发布或人工验收需要时手动执行。
