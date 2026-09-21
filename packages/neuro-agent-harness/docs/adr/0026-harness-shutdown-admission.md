# ADR-0026: Harness Shutdown Admission

- Status: Accepted (standalone Harness shutdown-admission scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`NeuroAgentHarness.dispose()` 同时承担关闭新调用、终止 active Invocation、排空后台协调、关闭 Harness-owned Event Hub 和释放 Store Adapter。若并发或重入 caller 得到不同 completion Promise，或者已经进入的 public mutation 不属于同一 barrier，宿主可能在 durable commit/publication 仍进行时关闭 injected Event Hub 或其它资源。

已经复现的窗口包括：

- concurrent `dispose()` caller 之一在第一次 shutdown 仍进行时提前完成；
- Invocation 或 follow-up admission 停在 Store read/start commit 时，barrier 看不到其后续 mutation；
- public `write()` / `createSession()` 已进入不可取消 Store mutation，但 barrier 可以先关闭 publication/resource boundary；
- async commit observer 或错误报告器重入并等待同一 barrier，形成 `operation → callback → dispose → operation` 环。

这是宿主退出顺序可以依赖的稳定公共生命周期语义，不只是 `dispose()` 的内部实现。

## Decision

首次 `dispose()` 在关闭新 admission 前建立唯一 **Harness Shutdown Barrier**。并发、重复及 callback/listener 重入的 `dispose()` 返回同一个 Promise，并共享 completion 或 rejection。

Barrier 排空以下 **Shutdown Admission**：

- Invocation `invoke()` / `invokeAt()` / `retry()` start、approval `resume()` 和 public `resumeFollowUps()`；
- `createSession()`、`write()`、`steer()`、`followUp()`、pause/cancel/reorder follow-up 以及 local/durable `abort()`；
- 这些操作派生的 active Invocation completion 与 Harness background work。

Admission 采用副作用边界，而不是“所有 public Promise”：

- 已经进入不可取消 Store `create()` / `commit()` 的操作在 barrier 内完成 Harness durable publication；
- 仍停在可取消 Store read、Profile validation 或其它 mutation 前 seam 的操作在 shutdown recheck 后停止，不新增 durable 或运行期协调副作用；
- `snapshot()`、`followUpState()` 等 pure read 不承诺 drain；宿主若需要关闭与其共享的 borrowed resource，必须自行等待这些读操作；
- 新 public admission 在 shutdown gate 关闭后拒绝，并保持原有 async rejection 边界。

正常 commit 在 publication 前等待 `SessionCommitObserver` 和 `onObserverError`。若 callback 在 shutdown 开始后仍未完成，Harness 不再让该外部 Promise 阻塞 admitted durable publication；迟到 completion/rejection 继续被观察，错误继续交给 reporter。派生 view 必须可从 Snapshot/entries 重建，不能把 callback completion 当作 durable truth。

Barrier 最后关闭 Harness-owned Event Hub，再调用 Store `dispose()`。Injected Event Hub 属于宿主；宿主必须等待所有使用该 Hub 的 Harness barriers 后再关闭它。

## Alternatives

- **只等待 active Invocation**：拒绝。public create/write/follow-up control 已经可以产生 durable facts 或 Harness event，退出时同样需要 publication boundary。
- **等待所有 public read 与 mutation**：暂不采用。pure read 没有 Harness 副作用依据，全面 drain 会扩大长期 Store ownership/lease 合同；需要这一保证的宿主先持有自己的 request/resource lease。
- **shutdown 一律取消已经进入的 mutation**：拒绝。Store create/commit 成功后通常不可回滚，向调用者伪装为“未发生”会留下 durable acknowledgement 歧义。
- **让 Store/Event Hub 自己提供全局 drain 或 lease**：暂不采用。它会改变 borrowed/owned 默认并扩大所有 Adapter 的公共合同，应由单独证据和 ADR 决定。
- **继续同步等待所有 observer**：拒绝 shutdown 重入路径。外部 callback 可以合法调用并等待 `dispose()`，无条件等待会形成不可收敛环。

## Acceptance gate

以下是从 Proposed 升为 Accepted 的条件，不表示尚未运行的 gate 已完成；当前证据以 round 47 walkthrough 为准。

- concurrent/repeated/reentrant `dispose()` 共享同一 Promise、Store cleanup rejection 与 completion；
- delayed Invocation/resume/follow-up admission 不越过 barrier；
- delayed create/write 与 follow-up commit 在 barrier 内完成 durable publication；
- delayed read/validation mutation 在 shutdown recheck 后不写 Store、不修改 active queue、不发布迟到事件；
- observer/reporter 重入 shutdown 不死锁，publication 先于 barrier sentinel，迟到 rejection 被观察；
- Store `commit()` 同步触发 shutdown 时，barrier 仍等待 write/publication；
- pending 断言使用可回退 gate 与 event-loop task checkpoint，不以固定毫秒窗口判定；
- 在接受本 ADR 前完成 focused、`bun run verify`、`bun run pack:smoke`、独立审查，并对包含两个新文档的精确 checkpoint 暂存集合执行 `git diff --cached --check`；确认 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts` 三个受保护工作树文件不在暂存集合中。

## Out of scope

- shared closable Store/Event Hub 的 lease/refcount 或 borrowed/owned option；
- 永不结束或在自身 operation 内等待 Harness barrier 的 non-cooperative third-party Store；
- typed post-durable acknowledgement、跨进程 Event Hub、Outbox、delivery 与 exactly-once；
- HTTP/SSE Transport、process signal、真实 NeuroBook/Cosmos 退出和产品验收。
