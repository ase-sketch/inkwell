# 第四十五轮：Concurrent Interrupted Reconciliation

## 规划取证

本轮从三路只读审查收口：

1. durable Store commit 成功后 injected Event Hub publication 失败是真实窗口，但当前稳定触发依赖宿主在 Harness 活跃时关闭自己管理的 Hub。typed post-commit error 与严格 host lifecycle 两种合同仍有架构分歧，需要单独补充 ADR-0024，不能顺手修改。
2. Event Hub attachment lease/refcount 会改变同步 `close()`、共享 Hub、subscription drain 和 shutdown ordering，当前没有足够消费者证据支持。
3. 普通公开 Store 消费者可并发调用 `reconcileInterrupted()`。两个调用都读取同一 running owner 后，一方完成 transition，另一方会收到 version/owner CAS 冲突并中断整个 recovery sweep。

第三路还复核了 package smoke、mixed approval、create/write acknowledgement、JSONL normalization 和 Cosmos adapter 边界：

- packed Bun/Node consumer 当前通过，没有 package-only runtime red；
- mixed approval 行为属于 ADR-0022 已接受的 exact-set batch policy；
- Snapshot Replay Cut 和 terminal reread 已覆盖现有 acknowledgement；
- malformed third-party Snapshot migration 继续 out of scope；
- Tool 的多个 `writePlans` 只保证单 plan 原子性，是否增加 batch seam 需要独立 ADR，不能先当作既有合同 bug。

因此选择更普通、更高置信且不扩张 Core 领域边界的并发恢复缺口。

## 选中范围

Canonical term：

```text
Interrupted Reconciliation
```

合同：

- `reconcileInterrupted()` 是启动恢复操作，把观察到的 active running Invocation 收口为 interrupted；
- 返回集合只包含本次调用实际提交的 transition；
- 多个 reconciler 竞争同一 owner 时，winner 提交一次；loser 回读到该 Invocation 已不再 active running 后跳过并继续扫描；
- 若冲突后同一 owner 仍为 active running，则以最新 Snapshot 做有界重试；
- 不吞掉无关的 Store、I/O、lock、malformed Snapshot 或 invariant 错误；
- 不增加 Job、Lease、Outbox、跨进程 Event Hub 或 exactly-once。

## 为什么不建立 ADR

该变更让公开的启动恢复操作在既有 owner/version CAS 下幂等收敛，不增加公共类型、持久格式、技术选型或不可逆集成模式。真正需要长期权衡的 Event Hub post-commit acknowledgement 与 Tool multi-plan batch 语义继续留作独立候选。

## TDD 顺序

Public seam 为 `SessionStore.create/commit/reconcileInterrupted/read`：

1. 同一 `MemorySessionStore` 上两个并发 reconciliation 都应 fulfill，恰好一个返回 interrupted transition，最终 Snapshot 只推进一次 terminal commit；
2. 两个指向同一目录的 `JsonlSessionStore` 重复同一合同，证明 first-party cross-instance lock/CAS loser 收敛；
3. 冲突后同一 owner 仍 running 时刷新 Snapshot 并重试；冲突后 owner 已 terminal 时跳过；
4. 一个 Session 的 benign recovery race 不得阻止 sweep 继续处理后续 running Session；
5. 非竞争错误继续原样上抛。

每条先通过公开 API 建立 red，再做最小实现；不直接调用 reducer、lock helper 或私有恢复函数。

## 计划验证

- focused：Memory/JSONL Store、recovery、Invocation ownership；
- `bun run typecheck`；
- `bun run verify`；
- 公共行为和 package 文件若变化则 `bun run pack:smoke`；即使类型未变，审查可要求重跑；
- `git diff --check`；
- 独立只读审查并回写发现、修复和未验证边界。

## 未验证边界

- 活跃 Harness 期间关闭 injected Event Hub 的 post-durable publication ambiguity；
- Tool 多 `writePlans` 的跨 plan 原子性或 partial acknowledgement；
- 第三方 Store Adapter 是否实现同一并发恢复合同；
- 真实多主 startup coordinator、网络文件系统和进程崩溃风暴；
- NeuroBook/Cosmos 真实接入、Provider、HTTP/SSE、浏览器与产品验收。

## 执行记录

### Slice 1：Memory owner-race convergence

同一 `MemorySessionStore` 上并发调用两次公开 `reconcileInterrupted()` 的 formal red：

```text
InvocationOwnershipError:
Session 1 Invocation owner 冲突：expected=active, actual=null

0 pass
1 fail
```

两个 caller 都先观察到 running owner；winner 提交 interrupted 后，loser 的 owner CAS 正确拒绝重复 terminal commit，但旧实现把这个 benign race 作为整个 sweep failure 暴露。

第一条最小实现只捕获 `InvocationOwnershipError`，回读同一候选 Invocation；只有确认它已经 terminal 时才跳过。候选仍 running 或其它错误继续原样上抛。

Memory 单条 green：

```text
1 pass
0 fail
6 assertions
```

### Slice 2：JSONL cross-instance owner-race convergence

两个独立 `JsonlSessionStore` 指向同一临时目录并同时调用公开 recovery seam。真实 per-session lock 串行 winner/loser 后，formal red 同样为：

```text
InvocationOwnershipError:
Session 1 Invocation owner 冲突：expected=active, actual=null

0 pass
1 fail
```

JSONL 使用与 Memory 相同的窄规则：只对 owner CAS loser 回读，候选已 terminal 才跳过；返回集合仍只有 winner 实际提交的一个 interrupted transition。

### Slice 3：same-owner version movement

Memory public seam 在 reconciliation 已读取 version 1 后，让普通 `commit()` 先追加一个 Invocation entry，把 version 推进到 2 但保持同一 running owner。formal red：

```text
SessionConflictError:
Session 1 version 冲突：expected=1, actual=2

0 pass
1 fail
```

这不是“已由另一 reconciler 完成”的 owner race。恢复者必须回读最新 Snapshot：同一 owner 仍 running 时最多重试 3 次；观察到 terminal 则跳过；冲突耗尽仍把最后一个原始错误暴露给调用方。

Memory 两条并发 slice green：

```text
2 pass
0 fail
12 assertions
```

独立 JSONL Store 的同一场景也建立 `expected=1, actual=2` formal red；JSONL 随后采用同一 bounded refresh/retry 合同。

### Acceptance guards

补充两个公开护栏：

- 两个 running Session + 两个 concurrent reconciler：第一项上的 benign loser 仍继续扫描，最终恰好返回两个由 winner 实际提交的 transition，两个 Snapshot 各只推进一次 terminal version；
- 一个测试 Store 在每次 recovery commit 前通过普通 `commit()` 推进同一 running owner 的 version：reconciliation 恰好尝试 3 次后保留最后的 `SessionConflictError`，不伪造成功，Snapshot 仍 running。

JSONL 既有 `ENOTDIR` public test 继续证明非竞争目录错误不会被恢复逻辑吞掉。

## 收尾实现

Memory 与 JSONL 最终复用内部 `reconcileInterruptedSession()`，统一：

- 最多 3 次 owner/version CAS attempt；
- conflict 后回读当前 Snapshot；
- 候选已不再 active running 时返回 `undefined`，因此 loser 不冒充本调用 transition；
- 同一 running owner 时刷新 version 并重试；
- owner 形状不一致、重试耗尽或非 CAS 错误保留原异常。

`SessionStore.reconcileInterrupted()` 的公开 JSDoc 与 `CONTEXT.md` 已明确返回集合只包含本调用实际提交的 transition。没有新增 root export、持久格式或第三方 Adapter 默认实现；内部 helper 虽进入 tarball，但受 package `exports` 封闭，不能作为公开 subpath 导入。

## 验证

Store 单文件：

```text
Memory: 7 pass / 0 fail / 57 assertions
JSONL: 25 pass / 0 fail / 138 assertions
typecheck: exit 0
```

Focused：

```text
bun test \
  tests/memory-store.test.ts \
  tests/jsonl-store.test.ts \
  tests/recovery.test.ts \
  tests/invocation-ownership.test.ts \
  tests/abort-boundary.test.ts

69 pass
0 fail
338 assertions
```

完整门禁：

```text
bun run verify
250 pass
0 fail
1225 assertions
```

Package：

```text
bun run pack:smoke
exit 0
109 files
110.7 kB package
529.4 kB unpacked
Bun and Node ESM consumers passed
```

`git diff --check` exit 0。

## 独立审查

只读 reviewer 检查了 conflict 分类、waiting/new-owner 竞态、3 次 attempt 上限、返回集合、multi-session continuation、JSONL cross-instance lock/TOCTOU、测试稳定性、ESM/package 与文档一致性，结论：

```text
No P0/P1/P2 findings.
```

本轮在 standalone first-party Memory/JSONL Store Interrupted Reconciliation 范围接受。第三方 Store、多主 startup coordinator、网络文件系统、真实 NeuroBook/Cosmos 恢复以及 Event Hub post-durable acknowledgement 仍属于明确未验证边界。

## 后续测试确定性补记（第四十七轮）

后续 package prepack 在高 contention 下证明“同一 owner 写入后刷新 Snapshot 并重试”的 JSONL 测试没有真正固定 write-before-reconcile 顺序：reconciliation 偶尔先 terminalize，导致 concurrent write 自己以 `expected=1, actual=2` 失败。四路各 200 次最初分别复现 3、6、2、5 次。

测试现以 public `JsonlSessionStore` subclass 在首次 recovery commit 进入真实 Store 前 gate，先确认独立 write durable version 2，再释放 reconciliation。生产 retry 上限临时降为 1 时该测试确定性 red；恢复后 targeted 100/0、四路 contention 合计 800/0。没有修改 `reconcileInterruptedSession()` 生产逻辑；原 public contract 和本轮 acceptance 结论不变。
