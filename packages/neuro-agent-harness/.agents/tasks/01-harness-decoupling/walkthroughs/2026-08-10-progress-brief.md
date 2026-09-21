# 阶段进度简报：第一至第十九轮

> 本文是新 Goal 启动前的历史快照；后续进展见 [第二十轮 Context lifecycle walkthrough](2026-08-10-context-lifecycle.md)。
>
> 截止时间：2026-08-10
> 当时 Goal 状态：`paused`，停在第二十轮规划入口
> Git 状态：`master` 相对 `origin/master` ahead 19，未 push、发布或部署

## 结论

**已验证**：独立 Harness 已不再只是 NeuroBook 代码的搬运候选。十九个本地 checkpoint 已建立一组宿主无关且可恢复的 Core 合同，重点补齐了 Workflow 组合、上下文注入、JSONL 并发、Invocation 取消/所有权、message identity 和 follow-up 恢复。

**已验证**：当前不能宣称 NeuroBook 与独立 Harness 行为一致，也不能宣称 Cosmos 已接入。真实 NeuroBook/Cosmos consumer、真实 provider/tool、HTTP/SSE Transport、跨进程 EventHub 和生产验收均未完成。

**正式状态**：11 个 ADR 中 8 个已接受，3 个仍为 `Proposed`。当前 Goal 已暂停；第十九轮已经完成代码、测试、文档、checkpoint 和重新审查，第二十轮只完成了候选调查，尚未选择或执行实现切片。

## 已经获得的能力

| 能力 | 当前结果 | 使用者得到什么 | 仍未覆盖 |
| --- | --- | --- | --- |
| Cosmos/Workflow 边界 | 已接受 | Harness 管 Session、Invocation、Model Runtime 和 Capability；Job、Lease、Outbox 与业务事实留在宿主 | Cosmos 真实接入、通用 Workflow Runtime |
| 旁路 Agent 组合 | 已接受 | 使用 `snapshot → createSession → invokeAt → write` 完成可检测冲突的旁路运行和结果回写，不需要 sidecar Core API | 跨 Session 事务、自动 rebase、exactly-once |
| Context 生命周期基础 | 已接受 | 固定 `history → transcript → modelContext → modelContextAppending → appending` 顺序；每轮可基于最新 Snapshot 解析动态上下文 | NeuroBook `HistorySet`/`AppendingSet` 的 durable settlement、TSX DSL |
| JSONL 跨进程提交保护 | 已实现，ADR 仍 Proposed | Bun/Node 多进程争用同一 Session 时，commit 不再允许重复 version；崩溃后默认 fail closed | Windows 真实 I/O 错误分类、自动 stale takeover、网络文件系统 |
| Invocation 所有权与取消 | 有界 abort 已接受；ownership ADR 仍 Proposed | 取消后迟到的 Model、Tool、Hook、ContextProvider、Compactor、Approval 和 Capability 结果不能继续写入；非合作式调用也能有界结束 | 跨进程 EventHub fencing、真实 provider/tool |
| `ReadCapability` | 已实现，ADR 仍 Proposed | 宿主可注入 opaque reference、分页、provenance 和截断信息，Core 不绑定文件系统 | 默认 `read` Tool、Workspace/cwd、真实权限和二进制 |
| Caller 与 message identity | 已接受 | caller 来源和 `user/system` 身份分离，Invocation、queue、Session entry 和 JSONL 重启均保留；旧记录默认 `"user"` | system identity 权限/审计、真实消费者 |
| SSE | 仅完成边界审查 | `SessionEventHub` 已提供 cursor、replay、subscription 和 `snapshot_required` seam | HTTP/SSE encoder、鉴权、heartbeat、重连、慢消费者策略 |

## 里程碑 walkthrough

### 2026-08-07：先建立协作与消费者边界

- 建立 active Task、ADR 索引和“规划 → 计划/ADR → 执行 → walkthrough → 收尾 → 审查 → 回到规划”的持续开发流。
- 保持 `AGENTS.md` 为简洁索引，把详细协作规则放到 `docs/tasks/README.md`。
- 用 Cosmos 风格的 deterministic fixture 证明现有 Harness 能承载 Agent Action；同时冻结职责边界：Cosmos 保留 Job/Run/Step/Lease/Outbox，sidecar 不回到 Core。

### 2026-08-08：补 Workflow、Context、Store 与 read seam

- 新增 strict `invokeAt({anchor})`：Workflow 观察到的 `version + activeLeafId` 只有仍为当前状态时才能启动 Invocation，冲突诊断来自同一 Store 边界。
- 新增 provider-neutral Context sections 和 per-turn ContextProvider；动态上下文只进入当前模型请求，不自动持久化。
- 复现并修复 JSONL 多进程同 version 提交窗口；补 Bun/Node worker、crash phase、ownership loss、busy/corruption 和 late release 回归。
- 定义 host-neutral `ReadCapability`；没有把路径、Workspace、权限策略或默认文件系统实现塞进 Core。
- SSE 调研结论是保留 EventHub seam，HTTP/SSE 行为留给 Transport Adapter。

### 2026-08-09：补所有权、取消完成和 Workflow 回写

- Invocation-owned write 增加 owner fence；abort 先失效 run attempt，隔离各类迟到结果。
- 新增有界 abort completion boundary：即使 Model/Tool 不响应取消，Invocation 仍能 durable 结束、释放 admission 并只发布一个 terminal event。
- 独立审查发现 forced abort owner-CAS、sealed write fence、waiting conflict retry 和 JSONL recovery 缺口；修复并补回归后才接受 ADR-0008。
- 证明现有公开 API 足以完成旁路 Agent 的 CAS 结果回写，因此没有增加 `writeAt()`、sidecar、跨 Session 事务或 Job API。
- ContextProvider 增加 `modelContextAppending` 当前请求分区；没有决定 NeuroBook 的 durable/settlement 语义。
- 建立 caller/message identity 分离，并将 follow-up consume 与 Invocation start 合并为一个 durable CAS commit。

### 2026-08-10：修复 follow-up 并发与旧记录恢复

- 独立审查发现旧队首 admission 与 cancel/reorder 并发时可能启动已取消或已重排项，原 ADR-0011 acceptance 因此撤回。
- 新增 Memory 与两个独立 JSONL Harness 的竞态回归：旧 admission 使用观察到的 Snapshot version 提交，队列已变化时以 `SessionConflictError` 失败。
- 新增 raw legacy JSONL fixture，证明缺失 identity 的 Invocation、message 与 queue projection 默认恢复为 `"user"`，且可以实际继续运行。
- 重新完成 focused、全仓、包 smoke 与独立审查后，ADR-0011 才最终接受。

## 正式 ADR 状态

已接受：

- ADR-0001：Cosmos consumer 与 Workflow ownership 边界。
- ADR-0002：strict Workflow Invocation anchor。
- ADR-0003：provider-neutral Context sections。
- ADR-0005（A1）：per-turn ContextProvider 与 run-attempt-scoped Capability。
- ADR-0008：bounded abort 与 terminal completion。
- ADR-0009：Workflow anchored result writeback。
- ADR-0010：provider-neutral `modelContextAppending`。
- ADR-0011：caller 与 durable message identity。

仍为 `Proposed`：

- ADR-0004：JSONL lock 已有大量实现和回归，但 Windows I/O 分类与人工 stale 清理验收尚未最终冻结。
- ADR-0006：`ReadCapability` 的 Core shape 已实现，真实 NeuroBook/Cosmos consumer、权限策略和默认 Tool 尚未验证。
- ADR-0007：owner CAS、late-result fence、Memory/JSONL recovery 已实现；正式 acceptance 仍未落盘，跨进程 EventHub 不在当前证据内。

## 验证证据

本次整理对当前工作树重新运行：

- `bun test tests/context.test.ts`：7 pass / 0 fail / 51 expect calls。
- `bun run verify`：118 pass / 0 fail / 571 expect calls；包含 TypeScript typecheck、build 和 31 个测试文件。
- `git diff --check`：通过；只有 Windows 工作树的 LF/CRLF 转换警告。

第十九轮 checkpoint 已记录：

- 5 个 message identity/follow-up 相关测试文件：11 pass / 0 fail / 60 expect calls。
- `bun run pack:smoke`：通过；包含 prepack、tarball 安装、Bun consumer 和 Node ESM consumer。
- `git diff --check`：通过。

本次没有公共包边界变化，因此没有重复运行 `bun run pack:smoke`。

## 当前工作树与边界

本次整理前已有以下未提交修改，继续保留，不自动纳入 checkpoint：

- `docs/architecture.md`
- `docs/pi-adapter-design.md`
- `docs/tasks/01-harness-decoupling/README.md`
- `tests/context.test.ts`

本次只新增本阶段简报，并更新 Task 的索引、当前状态和 walkthrough 入口。没有修改 NeuroBook 或 Cosmos 仓库，也没有 push、发布、部署或生产操作。

以下内容仍不能从当前绿灯外推为“已经完成”：

- NeuroBook Harness 的完整 parity、迁移或真实 consumer acceptance。
- Cosmos 从 `pi-ai` 切换到 Harness。
- 真实 provider、真实 Tool 外部副作用、浏览器或产品验收。
- Job/Run/Step/Lease/Outbox、delivery、exactly-once 或 sidecar。
- HTTP/SSE Transport、跨进程 EventHub、第三方 Store 和网络文件系统。
- TSX Profile DSL、Profile Home、Workbench、Reminder/Watch 与 durable context settlement。

## 第二十轮恢复入口

**从代码和文档推断，尚未执行**：最窄且风险最低的下一步是 Context lifecycle adapter-only spike。先用测试验证现有 `PreparedRun.context`、ContextProvider、RuntimeEffect 和 `SessionWritePlan` 能否表达 NeuroBook 的 History/ModelContext/Appending 生命周期；不立即新增公共 API，也不提前建立 ADR-0012。

如果红测证明现有合同不足，再建立一个只处理 durable context contribution 边界的 ADR。不要在同一轮混入 ADR-0004 Windows lock 验收、真实 Cosmos Workflow、SSE 或 sidecar。
