# 第三十七轮：JSONL Session creation race

## 规划结论

第 37 轮选择第一方 `JsonlSessionStore.allocateId()` / `create()` 的跨 Store、跨进程竞争，不新增 Harness Core API。

三路独立只读规划结论：

- NeuroBook 当前没有 standalone 尚未覆盖的 portable Harness 修复；relation、Job、SSE shutdown 和产品 DTO 继续归宿主；
- Cosmos 当前没有真实 Agent/LLM 生产调用路径，现有 Profile/ModelRuntime/Capability/Session/Event seam 已能表达文档中的未来 Adapter，不能为推测新增 API；
- standalone reviewer 发现 `CommitWorkflowScheduler.dispose()` 对不合作 handler 可无限等待，公开 100ms 探针得到 `{result:"timeout", observedAbort:true}`；这是后续候选，但低于已经造成重复 ID、覆盖和不可恢复文件的 JSONL 数据正确性问题。

## Public red evidence

所有探针只使用两个独立 `JsonlSessionStore` 的公开 `create()` / `read()`，每轮使用隔离临时目录并在 `finally` 清理。

自动 ID，30 次：

```text
bothFulfilled: 30
duplicateIds: 30
distinctIds: 0
unreadable: 2
```

每次两个成功结果都返回 ID 1；可读样本只保留 first 或 second 的 initial，不可读样本由 `read(1)` 抛出 `SessionNotFoundError`。

显式 ID 7，30 次：

```text
bothFulfilled: 30
oneRejected: 0
unreadable: 4
```

当前 `session-seq.json` 若是 `"{broken"`，`allocateId()` 仍返回 1，证明 catch-all fallback 会把 corruption 当作初始目录。

## Root cause

- `sequenceTail` 只属于单个 Store 实例；不同实例同时读取旧 sequence 并写入同一个 next value；
- `allocateId()` 的 `.catch(() => 0)` 混淆 ENOENT、JSON corruption、权限和 I/O；
- `create()` 的 `existsSync → writeFile` 是 TOCTOU，默认 write 会截断已存在文件；
- ADR-0004 与现有 per-session commit lock 明确没有覆盖 allocation/create。

## Decision boundary

详见 [ADR-0020](../../../adr/0020-jsonl-cross-process-session-creation.md)。

- 目录级 sequence lock 保护严格 read/validate/advance/write；
- 显式 ID 推进 sequence，自动创建允许 gap、不得复用；
- per-session lock + `wx` 保护初始 Snapshot；
- 复用现有 lock wait/error/stale policy，不新增依赖；
- 不扩大到 read 线性一致性、自动 stale takeover、网络文件系统、fsync 或数据库替换。

新建 ADR-0020 而不直接重写 ADR-0004：0004 的 accepted commit-only 范围与历史证据保持可读，0020 单独冻结全局 sequence、显式 ID 和 create lock 的新取舍。

## TDD seams

只通过：

```text
JsonlSessionStore.allocateId()
JsonlSessionStore.create()
JsonlSessionStore.read()
SessionInvariantError
JsonlLock* taxonomy
```

测试不读取私有 queue/lock handle。文件字节只用于证明失败没有覆盖既有 Snapshot，以及构造 malformed sequence/进程 fixture。

执行顺序：

1. 两个独立 Store 自动创建 red → sequence lock green；
2. 两个独立 Store 显式同 ID red → per-session create lock + `wx` green；
3. malformed/非法 sequence red → strict fail-closed green；
4. 显式 ID/sequence gap、Bun/Node 子进程 vertical slices；
5. focused JSONL/lock/recovery → full/package → 独立审查。

## 非目标与未验证

- 不修改 NeuroBook、Cosmos 或三处受保护 dirty 文件；
- 不实现通用数据库 ID allocator；
- 不承诺网络文件系统、自动 stale takeover、fsync 或 syscall 中断原子性；
- 不把 Cosmos Job/Run/Step/Lease 或产品事件下沉 Store/Harness；
- Scheduler bounded shutdown 保留为后续候选，不混入本轮。

## Red → green

生产修改保持在第一方 JSONL Adapter：

- `allocateId()` 在实例内 `sequenceTail` 之外增加 `session-seq.json.lock`，sequence read/validate/advance/write 在同一 owner token 下完成；
- 只有 sequence 文件 `ENOENT` 返回 0；malformed、缺字段、string、负数、小数、不安全整数、耗尽值与其它 I/O 均 fail closed；
- 显式 ID 在创建前将 sequence 推进到 `max(current, explicitId)`；
- 初始 Snapshot 复用 per-session lock，并以 `writeFile(..., {flag: "wx"})` exclusive create；相同显式 ID 的失败方得到 `SessionInvariantError`；
- 自动创建遇到已存在 candidate 时继续分配，允许 gap 但不复用；
- 公共 lock helper 的双重失败消息由 commit-only 改为 operation，以覆盖 sequence/create 使用者。

新增八个 Store 行为：

1. 两个独立 Store 自动创建得到不同 ID 且都可恢复；
2. 两个独立 Store 显式同 ID 恰好一个成功且不会覆盖；
3. malformed sequence fail closed；
4. 非法与耗尽 sequence value fail closed；
5. 显式 ID 推进 sequence；
6. 自动创建跳过落后的 sequence candidate；
7. Bun/Node ESM 子进程自动创建；
8. Bun/Node ESM 子进程显式冲突。

测试 fixture 只通过公开 `JsonlSessionStore.create()` 竞争；Bun 直接运行 TypeScript worker，Node 使用临时 ESM bundle。没有新增运行时依赖。

## 当前验证

```text
bun run typecheck
exit 0

bun test tests/jsonl-store.test.ts tests/jsonl-lock.test.ts tests/jsonl-lock-crash-phases.test.ts tests/recovery.test.ts tests/memory-store.test.ts
38 pass
0 fail
198 assertions

bun run verify
211 pass
0 fail
1016 assertions

bun run pack:smoke
exit 0
101 files
100.5 kB package / 487.5 kB unpacked

git diff --check
exit 0
```

`git diff --check` 只有 Windows working tree 的 LF → CRLF 提示。

## Pre-acceptance review

独立只读 reviewer 逐项检查 sequence/per-session lock 顺序、auto retry、显式 ID 推进、malformed 与非 ENOENT fail-closed、`wx`、lock release `operationCompleted`、Bun/Node fixture 和文档承诺，结论为：

```text
No P0/P1/P2 findings.
```

Reviewer 在只读 sandbox 中重跑 JSONL Store/lock 为 29 pass / 0 fail / 133 assertions；sandbox 因 `package.json` 不可写而无法执行 full/package，所以该结果只作为独立代码审查，不替代主流程已经完成的全仓与包门禁。

保留边界：

- Windows 本地文件系统之外的 SMB/NFS 未验证；
- sequence 或初始文件写入遭遇进程崩溃仍可能留下 gap、损坏或需要人工清理；
- 无锁 `read()` 不承诺创建过程的线性一致；
- 不承诺自动 stale takeover、fsync 或 syscall 中断原子性；
- 未做 NeuroBook/Cosmos 真实接入、真实 provider、Transport、浏览器或产品验收。

## 当前状态

ADR-0020 已在 Windows 本地文件系统、第一方 `JsonlSessionStore.allocateId()` / `create()` 范围接受。实现、focused、full、package 与独立审查已完成；剩余动作只有本地 checkpoint commit 和回到下一轮规划。
