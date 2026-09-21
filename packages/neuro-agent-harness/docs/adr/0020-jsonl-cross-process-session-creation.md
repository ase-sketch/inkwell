# ADR-0020: JSONL Cross-process Session Creation

- Status: Accepted (Windows local filesystem, first-party allocate/create scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

ADR-0004 只接受 `JsonlSessionStore.commit()` 的 per-session 跨进程互斥，明确没有覆盖 `allocateId()` 和 `create()`。当前 `allocateId()` 只通过 Store 实例内的 Promise tail 串行；两个实例可以同时读取旧 `session-seq.json` 并返回相同 ID。`create()` 又使用 `existsSync → writeFile`，两个 writer 可以同时通过检查并截断、覆盖或损坏同一个 Session 文件。

公开 Store 探针重复 30 次：

- 两个独立 Store 自动 `create()`：30/30 双方都 fulfilled 且都返回 ID 1；2/30 随后的 `read(1)` 抛出 `SessionNotFoundError`；
- 两个独立 Store 显式 `create({sessionId: 7})`：30/30 双方都 fulfilled；4/30 随后的 `read(7)` 抛出 `SessionNotFoundError`，其余只保留其中一个调用方的 initial。

这不是无锁 read 的线性一致性问题：两个已成功返回的创建操作声称拥有同一身份，并可能没有任何可恢复 Session。

## Decision

在 Windows 本地文件系统、第一方 `JsonlSessionStore` 范围扩展创建互斥：

- `session-seq.json` 的读取、校验、推进和写入由实例内 sequence tail 与目录级跨进程 lock 共同串行；
- 只有 `ENOENT` 表示初始 sequence 0；malformed JSON、缺失/非法 value 和其它 I/O 不得回退为 0，必须 fail closed；
- 自动创建先持久推进 sequence；创建失败允许留下 ID gap，但后续不得复用已经分配的 ID；
- 显式 Session ID 也在 sequence lock 下把 sequence 推进到 `max(current, sessionId)`，避免后续自动创建从旧 sequence 撞向已存在 Session；
- Session 初始文件创建复用与 commit 相同的 per-session lock，并使用 `writeFile(..., {flag: "wx"})`；相同显式 ID 至多一个成功，`EEXIST` 归一化为 `SessionInvariantError`，不得覆盖已有字节；
- 自动创建遇到一个已存在的 sequence candidate 时，可以推进到下一个 ID 重试；该兼容路径不放宽显式 ID 冲突；
- 继续复用 ADR-0004 的 owner token、heartbeat、五类 lock error、5 秒有界等待、无自动 stale takeover和人工清理前置条件。

全局 sequence 与 per-session create lock 不改变 Session/Entry/Invocation append-only 模型，也不进入 Harness、Workflow 或宿主产品合同。

## Implementation evidence

- `allocateId()` 保留单 Store 的 FIFO tail，并在 `session-seq.json.lock` 内严格读取、校验、推进和写回 sequence；
- `create({sessionId})` 先推进 sequence，再在既有 per-session lock 内用 `flag: "wx"` 写入初始 Snapshot；`EEXIST` 对显式 ID 归一化为 `SessionInvariantError`；
- 自动创建先持久分配 ID，若该 ID 已有合法 Session 文件则继续分配，因此 crash 或兼容旧目录可留下 gap，但不会复用；
- sequence 只有 `ENOENT` 解释为 0；malformed JSON、缺字段、string、负数、小数、不安全整数、耗尽值和其它 I/O 均 fail closed；
- Bun 与 Node ESM fixture 使用两个真实子进程同时进入公开 `create()`，不读取内部 lock 或 queue。

验证证据：

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
```

Package smoke 的 prepack 同为 211/0/1016，tarball 安装后的 Bun 与 Node ESM consumer 均通过。独立只读 pre-acceptance review 重跑 JSONL/lock 29/0/133，并返回 `No P0/P1/P2 findings.`；其只读 sandbox 无法运行 full/package，不替代上述主流程门禁。

本决定只在 Windows 本地文件系统、第一方 `JsonlSessionStore.allocateId()` / `create()` 范围接受。sequence/初始文件写入遭遇进程崩溃仍可能留下 gap、损坏或需要人工清理；无锁 read 线性一致、自动 stale takeover、网络文件系统、fsync 与 syscall 中断原子性继续不承诺。

## Alternatives

- **只给 create 使用 `wx`**：拒绝作为完整修复。它能阻止覆盖，却会让两个正常自动创建中的一个因重复分配失败，sequence 本身仍可能回退或损坏。
- **只加全局 sequence lock**：拒绝作为完整修复。显式相同 ID 仍有 `existsSync → writeFile` 的覆盖窗口。
- **为每个 ID 建立永久 reservation 文件**：暂缓。它会增加新的持久布局、清理和迁移合同；当前 sequence + lock 已足够。
- **改为随机/string ID**：拒绝。本轮不改变公开 Session ID 策略，也不把存储 bug 变成 API 迁移。
- **直接改用 SQLite/Prisma**：拒绝。这是可替换 Adapter 选择，不是第一方 JSONL 实现可以静默损坏的理由。

## Verification gate

- 两个独立 Store 自动创建得到两个不同 ID，两个 Session 均可恢复；
- 两个独立 Store 显式竞争同一 ID 时恰好一个成功，失败方是 `SessionInvariantError`，获胜文件保持完整；
- Bun 与 Node ESM 子进程分别覆盖自动创建和显式冲突，证明使用真实 OS lock 而非只依赖实例队列；
- 显式高 ID 后自动创建不会重新分配已占用 ID；
- malformed/非法 sequence fail closed，既有 Session 和 sequence 不被重置；
- sequence advance 后的创建失败只留下 gap，不复用 ID；
- 现有 commit lock、partial-tail、Windows I/O taxonomy、recovery 和 Store contract 回归保持通过；
- focused、`bun run verify`、适用的 `bun run pack:smoke`、`git diff --check` 与独立审查。

## Out of scope

- 网络文件系统、SMB/NFS；
- 自动 stale takeover 或人工删除仍存活 owner；
- syscall 级 fencing、fsync、文件轮转和 crash-atomic rename；
- 无锁 `read()` 对创建中间态的线性一致性；
- 绕过 Store 直接写数据目录的外部进程；
- SQLite、Prisma、Workflow、Job/Lease/Outbox、SSE、NeuroBook 或 Cosmos 修改。

本 ADR 独立扩展 ADR-0004，不改写其已接受的 commit-only 历史范围。
