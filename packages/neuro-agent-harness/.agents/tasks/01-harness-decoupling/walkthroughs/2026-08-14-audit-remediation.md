# 第一百一十七轮：审计整改与 Harness 生命周期收口

## 状态

- 日期：2026-08-14。
- 状态：`accepted`（代码、验证与本地 checkpoint 已完成；提交 `06f706c`）。
- 目标：修复 workflowz 整体审查确认的六项 Harness 缺陷，补充回归测试，完成文档与门禁记录。
- 范围：只修改 `neuro-agent-harness`；不修改 llmlint、Cosmos 或 NeuroBook，不运行真实产品写入，不 push、发布或部署。

## 问题与决策

### 1. approval `resume` admission 竞态

旧路径在 durable `resumeInvocation` claim 之后才登记本地 active attempt。`SessionCommitObserver` 在 claim 成功后同步重入 `abort()` 时，可以让新的 resume 在进入 Capability、prepare 或 Tool 工作前失去 owner，但旧路径仍可能继续执行 Tool。

决定：`resumeOnce()` 在 durable claim 前创建本地 active reservation、AbortController 和不可复用 attempt。claim 失败时回收 reservation；observer/abort 使 attempt 立即失效，`run()` 在 Capability、prepare、Tool 及后续写入前均受 attempt/owner fence 保护。普通 `startOnce()` 保持原有 durable start commit 后再登记 active 的生命周期，避免改变 shutdown barrier 语义。

### 2. `SessionEventHub` 重入顺序

旧路径通知 subscriber 时允许 AbortSignal listener 同步重入 `publish()`，嵌套事件先分配并交付较大的 seq，造成 `[3, 2]` 乱序；慢订阅者也可能先收到 nested event。

决定：一次 batch 先完整 stage（detach、序列化、seq、replay 安装），再 dispatch。dispatch 期间的嵌套 publish 进入 FIFO `pendingBatches`，当前 batch 所有 subscriber 通知完成后再按入队顺序交付。保留 explicit close 的 graceful drain、overflow fail-closed 与 durable version guard。

### 3. 自动 compaction 与 follow-up 并发 CAS

自动 compaction 在同一 Invocation 运行期间遇到 follow-up durable append 时，直接使用旧 Snapshot commit，导致 session version conflict，且后续 queue 被误暂停。

决定：Invocation 路径使用 `commitWithFollowUpRebase()`。只有原 entries 前缀未变化、新增尾部全部是 `harness.followUp.*`、并且尾部仍由同一 active owner/attempt 持有时允许 rebase；其它并发修改继续 fail closed。rebase 保留 summary、`firstKeptEntryId`、`tokensBefore`、`phase=compaction` 和 owner fence，不扩大为通用 merge。

### 4. watcher 队首错误归因

自动 watcher 处理队首 follow-up 时，队首可能在 admission race 期间被 cancel/reorder 替换。若 catch 路径按当前队首写入 `pausedBy`，旧 item A 的失败会错误暂停新 item B。

决定：新增内部 `FollowUpAdmissionError`/`FollowUpAdmissionRaceError` 携带实际尝试的 item ID。watcher 仅在实际 item 仍是当前队首且队列未暂停时写入自动 pause；stale watcher 只发布对应错误，不归因给新队首。手动 `resumeFollowUps()` 保持 `SessionConflictError` 等公共错误原样抛出。

### 5. fork 对 `Parsed` initial 的重复解析

fork 继承源 Session 已经 durable admission 的 initial，却按 raw input 再调用 `profile.parseInitial()`。非幂等 parser 会改变 fork 的 initial。

决定：`createSessionOnce()` 增加内部 `initialAdmission: "raw" | "parsed"`。普通 create 与显式 fork override 仍走 raw parser；默认 fork 使用 `validateResolvedProfileInitial()` 只验证已解析值，不重复转换。未扩大 public API。

### 6. 默认测试脚本入口

Windows 下 `scripts/test-with-timeout.ts` 作为默认入口会产生停滞；它仍保留作显式 wrapper。

决定：`package.json` 恢复默认 `"test": "bun test --parallel=1"` 与直接执行全量测试的 `"verify"`；`test:bounded` 继续显式调用 wrapper。

## 红测与实现证据

审查阶段先用公开 API probe 复现：

- EventHub nested publish：outer seq `2`，消费者收到 `[3, 2]`，事件名为 `nested → outer`，slow subscription 关闭原因 `queue_overflow`。
- approval observer claim→run：`toolExecutions=1` 但没有对应 `toolResult` entry，最终 Invocation `aborted`，说明失效 attempt 仍越过副作用边界。
- 自动 compaction + concurrent follow-up：Invocation `failed`，`phase=compaction`，`Session 1 version conflict expected=6, actual=7`，随后 queue paused。
- fork 非幂等 initial：source revision `11`，default fork revision `12`，证明二次 parse。

正式新增/修改红测覆盖：

- `tests/commit-observer.test.ts`：approval claim 后 observer 重入 abort 不得放行 Tool。
- `tests/events.test.ts`：queue overflow 的 abort listener 重入 publish 不得倒置 seq。
- `tests/compaction.test.ts`：自动压缩期间 follow-up 写入允许受限 rebase，Invocation 不得因合法 follow-up 尾部变更失败。
- `tests/follow-up-auto-pause.test.ts`：自动 watcher admission 过期时不得暂停替换后的新队首。
- `tests/canonical-schema-value-admission.test.ts`：fork 默认继承 Parsed initial，不重复执行 initial parser。
- `package.json`：默认测试入口回归 direct serial Bun test。

旧实现下新增核心红测分别得到：approval `Expected 0 / Received 1`、EventHub 收到 `[1, 3, 2]` 而非 `[1, 2, 3]`、compaction 期望 `completed` 实际 `failed`。实现后均转绿。

## 验证

### 聚焦行为回归

```text
bun test --parallel=1 tests/events.test.ts tests/commit-observer.test.ts tests/compaction.test.ts tests/compact-session.test.ts tests/follow-up-auto-pause.test.ts tests/follow-up-admission-race.test.ts tests/approval.test.ts tests/abort-boundary.test.ts tests/invocation-ownership.test.ts tests/invocation-result-durability.test.ts tests/fork-session.test.ts tests/canonical-schema-value-admission.test.ts tests/harness-dispose.test.ts
145 pass
0 fail
534 expect() calls
13 files
```

新增的 watcher stale 回归单独运行结果为 `1 pass / 0 fail / 3 expect() calls`。整改前的既有聚焦矩阵为 `123 pass / 0 fail / 448 expect() calls`；本轮补强测试后聚焦数字相应增加。

### 类型、构建与默认门禁

```text
bun run typecheck
exit 0

bun run build
exit 0

bun run test
529 pass
0 fail
2204 expect() calls
94 files

bun run verify
内部 typecheck/build/default serial test 均通过
529 pass / 0 fail / 2204 expect() calls / 94 files
```

### 包 smoke

首次包 smoke 已在本轮源码与脚本收口后通过：生成 `notnotype-neuro-agent-harness-0.1.0.tgz`，临时 Bun/Node ESM consumer 成功安装、编译、运行；该次 prepack 的完整测试为 `528 pass / 0 fail / 2201 expect() calls`。

随后把 `bun run verify && bun run pack:smoke` 放在同一 720 秒命令窗口内，重复 prepack 的 `bun test` 已到达 `529 pass / 0 fail / 2204 expect() calls / 94 files`，但包 smoke 在重复 prepack 阶段停滞并超时；该次不计为通过，也不把超时误报成 pack 成功。终止遗留命令进程后单独重试 `bun run pack:smoke`，最终通过：prepack `529 pass / 0 fail / 2204 expect() calls / 94 files`，tarball 安装与 Bun consumer smoke 成功。由于本轮没有 public export、manifest 或依赖变化，包边界没有新增合同。

### 差异与受保护文件

最终核对：

- `git status --short --branch`：`master...origin/master [ahead 120]`；当前 20 个变更文件：本轮整改源码/测试、任务 walkthrough/README 与相关 ADR，另含受保护文档 `docs/architecture.md`、`docs/pi-adapter-design.md`、既有 dirty `tests/context.test.ts`，以及批准脚本 `package.json`。
- `git diff --check`：无 whitespace error；Git 仅报告 Windows 工作树的 LF→CRLF 警告。
- 受保护 dirty 内容未被本轮复写；`tests/context.test.ts` 的本轮可见变更为既有 `modelContextAppending` 对应断言，保持与 `src/context.ts` 一致。
- 提交前工作树基于 `f1b8572 docs: record llmlint consumer acceptance`；用户随后授权创建本地整改 checkpoint；提交 `06f706c` 不包含四个受保护 dirty 区域。

## 独立复审

整改后独立只读 `AuditRemediationReview` 复核了 approval reservation、`startOnce`、`requestAbort`/`forceAbort`、compaction/rebase、watcher/fork、EventHub、publication/transcript 与新增测试，结论：

```text
No P0/P1/P2 findings.
overall_correctness: correct
confidence: 0.84
```

复审确认：observer abort 会 invalidate attempt/controller；EventHub nested publish 按 staged seq + FIFO pending dispatch；compaction 仅对 follow-up-only 尾部 rebase；watcher 只对带 item ID 的 admission error auto-pause；fork 默认校验 Parsed initial；未发现本轮引入的 P0/P1/P2。复审未运行全仓命令，也未深入非本轮目标的 storage/jsonl-lock 存量问题，主流程门禁已单独完成。

## ADR 增量决定

本轮没有新增 public API、durable schema、Store operation、外部 exactly-once 承诺或新的独立架构决策，因此不新增 ADR。现有 ADR 的合同已在实现与测试中补足：

- ADR-0007：run-attempt fence 扩展到 approval claim 前的本地 reservation 窗口。
- ADR-0018：自动终态 pause 之外补充 watcher stale item 不得错误归因；follow-up coordination namespace 不变。
- ADR-0019：EventHub 保持 graceful close/overflow 合同，并在已有 batch atomic staging 基础上补 FIFO reentrant dispatch。
- ADR-0022：pre-Tool durable claim 的获胜者必须在 claim/observer 重入窗口已有 active owner reservation。
- ADR-0024：durable publication batch 的 staged-before-dispatch 边界继续保持，嵌套直接 publish 延后通知。
- ADR-0036：fork 默认 initial 是已 admission 的 Parsed durable value，override 仍按 raw input 处理。
- ADR-0037：自动 compaction 仅允许合同覆盖的 follow-up-only rebase，不改变手动 compact 的 idle-only 语义。

这些是既有决定的实现澄清与回归证据，不改变其 standalone、provider-neutral、host-neutral 范围；因此未机械改写 ADR 正文。

## 未验证边界与下一步

- 未运行真实 provider、真实 Pi 网络调用、浏览器、生产 HTTP/SSE Transport、llmlint 产品真实凭据 smoke 或真实数据库写入。
- 未验证跨进程 EventHub 排序、第三方 Store Adapter 的全部并发语义；现有 ADR 仍明确这些边界不属于 Core 保证。
- 合并 `verify && pack:smoke` 的 720 秒命令窗口曾在重复 prepack 阶段停滞；该次不计为通过。随后已终止遗留进程并单独重试 `bun run pack:smoke`，最终通过，因此不再将 pack smoke 作为未解决阻塞。
- 整改 checkpoint 已创建为 `06f706c`；提交仅包含本轮批准的源码、测试、任务文档和相关 ADR，不包含受保护 dirty 内容，也不 push、发布或部署。
