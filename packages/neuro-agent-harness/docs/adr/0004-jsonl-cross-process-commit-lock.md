# ADR-0004: JSONL Cross-process Per-session Commit Lock

- Status: Accepted (Windows local filesystem, commit-only scope)
- Date: 2026-08-08
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`JsonlSessionStore` 当前用实例内 `Map<number, Promise<void>>` 串行化 `read → reduceSessionWritePlan → appendFile`。同一个 Store 实例内，`expectedVersion` CAS 可以阻止重复提交；但不同 Store 实例或进程各自拥有一份队列，可能同时从 version 0 读取并追加两个 version 1 record。

只追加重复 version 会让尾部损坏看起来像可忽略的 crash 尾行；当后面继续追加后，重复 version 位于中间，恢复会报 `JSONL commit 无效` 或 `version 不连续`。这会破坏 Workflow anchor 和普通 Session commit 的恢复真相。

本 ADR 只解决第一方 JSONL Adapter 的 commit 互斥，不把它扩展为整个 JSONL Store 的多进程安全保证。

## Decision

为每个 Session 的 JSONL commit 增加跨进程 per-session lock，锁覆盖完整的：

```text
acquire → read snapshot → reduce/CAS → append one record → release
```

初始实现约束：

- 锁位于该 Session JSONL 文件旁，使用原子目录创建竞争；
- 保留现有进程内队列，跨进程锁包在其外层；
- lock owner 使用随机 token；释放时只能删除自己持有的 token，不能递归删除整个 lock root；
- lock heartbeat、owner 丢失和锁结构异常必须有明确的错误/诊断；
- `JsonlLockBusyError`、`JsonlLockCorruptError`、`JsonlLockLostError` 和 `JsonlLockIoError` 分别表达 contention、结构损坏、owner 消失/替换和底层 I/O；公开 Adapter 子路径导出错误 taxonomy，但不公开内部 lock handle；
- 第一版默认不自动 stale takeover；无法安全证明 fencing 时宁可拒绝写入并要求宿主人工处理；
- 若宿主人工清理 stale lock，必须先确认旧 owner 已终止；当前实现可以检测旧 owner 的 lock ownership 丢失并 fail closed，但不把“删除 lock 目录”宣称为系统级 fencing；
- `SessionConflictError` 继续只表示 version/leaf 或 Invocation reducer 冲突；锁忙、锁损坏和锁丢失不能伪装成 CAS 冲突；
- 不引入 `proper-lockfile` 作为本 ADR 的默认实现；其依赖、Bun/Node ESM、Windows 行为和 stale takeover 语义另行 spike。
- Reader 可以把最后一个 JSON `SyntaxError` 当作 crash residue 恢复旧 Snapshot；后续 plan 只有通过 reducer/CAS 后才能按原始 byte offset 截断该 residue，再追加新 record。合法但缺 final newline 的完整 record 必须保留并补 separator。

## Scope

### In scope

- `JsonlSessionStore.commit()` 的跨 Store 实例/跨进程互斥；
- Windows 本地文件系统；
- Bun 1.3.14 与 Node 22+ 的子进程竞争测试；
- Bun 与 Node ESM 子进程 fixture 直接检查 `[0, 1, 2]` version 序列的恢复证据；不将该证据外推为整个 JSONL Store 已 process-safe；
- 原 owner 晚释放不能删除 contender 锁的测试。
- crash malformed tail 的 byte-level repair、完整无 newline record 和 truncate 后/append 前退出的恢复语义。

### Out of scope

- 自动 stale takeover，除非另有 fencing 设计和回归证据；
- 网络文件系统、SMB/NFS 和其它平台；
- `allocateId()` 的全局序列锁；
- `create()` 相同显式 ID 的跨进程合同；
- `read()` 的无锁线性一致性；
- `fsync`、文件轮转和 crash durability 强化；
- Prisma、SQLite、Workflow、SSE、sidecar 或 Cosmos 改动。

## Alternatives

- **继续只使用实例内队列**：拒绝；已由跨实例/跨进程竞争复现数据损坏。
- **只用 `appendFile`、临时文件或 `rename`**：拒绝；这些操作本身不携带 `expectedVersion` 条件，仍可能让两个 writer 同时通过 version 检查。
- **直接引入 `proper-lockfile`**：暂缓；需要单独验证依赖体积、CommonJS/ESM、Bun、Node、Windows、heartbeat、stale takeover 和 fencing。
- **把 JSONL 改为 SQLite/数据库**：拒绝；这是替换 Store Adapter，不是本轮修复 JSONL 合同。
- **接受单进程限制**：暂缓；Cosmos/Workflow 可能由多个 Harness 进程共享同一持久目录，当前应先修复明确的 corruption window。

## Verification plan

- 两个独立 `JsonlSessionStore` 实例竞争同一 `expectedVersion`，重复运行并证明每轮恰好一个成功；
- 两个 Bun 子进程和两个 Node ESM 子进程竞争同一 Session，证明失败方得到明确的锁/冲突结果，并直接检查 JSONL 的 `[0, 1, 2]` version 序列；
- 后续 `v1 → v2` commit 后，新 Store 能完整恢复；
- 合法 lock root、owner token 和 heartbeat 的获取/释放路径不泄漏 lock；
- lock root 为文件、包含未知条目或多个 owner 时返回独立的 lock corruption 错误；
- owner 在创建 lock root、创建 token、heartbeat 或 append 前后退出时，锁状态和尾行恢复行为可解释；
- contender 接管或清理失败时，原 owner 的 `finally` 不能删除 contender 的锁；
- `withJsonlSessionLock()` 在 release 抛出非 `JsonlLockError` 时也必须归一化错误，并按 commit task 是否完成设置 `operationCompleted`；
- 只有在这些证据完成后，才考虑把 ADR 状态改为 `Accepted`。

## 2026-08-09 implementation note

2026-08-09 已实现第一版内部 lock helper，当前行为为：

- `JsonlSessionStore.commit()` 在现有进程内队列外层获取 per-session lock，锁住完整的 `read → reduce/CAS → append`；
- 使用 `<session>.jsonl.lock/owner.<random-token>/`，以原子 `mkdir` 竞争，owner metadata/heartbeat 用于所有权校验和诊断；
- 只删除自己的 owner 目录，再用非递归 `rmdir` 删除空 lock root；默认不自动 stale takeover；
- 锁忙、结构损坏和所有权丢失不伪装为 `SessionConflictError`；
- `tests/jsonl-store.test.ts` 已覆盖 Bun 与 Node ESM 子进程竞争、version 恢复和损坏 lock 错误区分；`tests/jsonl-lock.test.ts` 与 `tests/jsonl-lock-crash-phases.test.ts` 已覆盖 acquire 后进程崩溃、root/owner/metadata/heartbeat/append phase fail-closed、busy、corruption shape、owner 晚释放/fencing、人工删除 lock 后 ownership loss 和 owner 丢失分类；
- 两个独立 `JsonlSessionStore` 实例竞争同一 `expectedVersion` 已有 focused 回归；release 原始错误会归一化为 `JsonlLockError`，并保留 `operationCompleted=true/false`；正常 `release()` 可幂等调用；
- 当前全量 `bun run verify` 为 70 tests / 0 failures / 369 expect calls；`bun test tests/jsonl-lock.test.ts` 为 6 tests / 0 failures / 22 expect calls；本轮没有公开包边界变化，未重复 `bun run pack:smoke`。

本轮 acceptance review 后 ADR 继续保持 `Proposed`，原因不是已列出的 crash phase 测试缺失，而是以下边界仍未被当前决策冻结：

- crash fixture 在文件操作完成后退出，不能模拟 syscall 内部被中断；
- 正常 acquire/release 已有直接回归，但 release 原始错误的归一化只覆盖了可控注入，Windows `EPERM`/`EACCES`/`EBUSY` 等真实 I/O 分类仍需 spike；
- 若宿主人工删除 stale lock 后旧 owner 仍继续执行，`commit()` 只有 append 前一次 ownership check，不能宣称跨进程 fencing；本轮已把“先确认旧 owner 已终止”冻结为人工清理的操作前提；
- `lstat/readFile/writeFile` 的非 `ENOENT` I/O 错误目前可能被归为 `JsonlLockLostError`，Windows sharing/permission/disk failure 的分类仍需 spike。

自动 stale takeover、网络文件系统、`allocateId()`、`create()`、无锁 `read()` 线性一致性、`fsync`/轮转和整个 JSONL Store 的 process-safe 保证仍是明确 out of scope。

## 2026-08-10 hardening and acceptance

最终 acceptance review 发现并修复了两个此前未覆盖的真实缺口。

### Partial-tail recovery

公开 red fixture 在 Session 尾部写入 `"{broken"`。旧实现的 `read()` 正确恢复 version 0，但下一次 `commit()` 虽返回 version 1，新 Store 仍只能恢复 version 0；新 record 被直接粘在无换行残片后并作为 malformed tail 整体忽略。

修复后的 `readSnapshotState()` 在同一次 Buffer 解析中保留每行原始 byte offset，不增加第二次整文件读取：

- 只有最后一个非空行的 `SyntaxError` 才是可修复 residue；
- reducer/CAS 先执行，stale/invalid plan 不修改文件；
- plan 通过后，在 owner check 下 truncate 到最后合法 record 后，再次确认 owner 并 append；
- 完整但没有 final newline 的合法 record 不截断，只在新 record 前补 separator；
- truncate 后、append 前退出留下合法旧前缀；下一实例可以继续 commit；
- 中文 metadata fixture 证明 repair 使用 byte offset，不使用 JS 字符索引。

该修复不把 append 变成 crash-atomic，也不承诺 fsync。append 内部中断仍可能留下新的 malformed tail，由下一次经过人工 stale-lock 前置处理后的 commit 重复同一恢复流程。

### Windows I/O taxonomy

真实 Windows `FileShare.None` fixture 证明 metadata 与 heartbeat 被独占时，Bun 返回 `EBUSY`。旧实现把 metadata `EBUSY` 误报为 ownership lost；初版修复后，heartbeat timer 又会把 `JsonlLockIoError` 二次降级为 `JsonlLockLostError`。

最终实现：

- 只有 lock root/owner/metadata 的 `ENOENT` 或 token mismatch 表示 `JsonlLockLostError`；
- lock shape 异常表示 `JsonlLockCorruptError`；
- contention/stale owner 保持 `JsonlLockBusyError`；
- 其它 acquire/assert/heartbeat/release 文件系统错误表示 `JsonlLockIoError`，保留 `operation`、errno `code` 和 `cause`；
- heartbeat timer 保留已有 taxonomy，不再把 I/O 错误包装成 Lost；
- `storage/jsonl` 公开五个错误类，内部 `JsonlSessionLock` / `withJsonlSessionLock` 仍不属于包 API；
- release cleanup failure 通过 `operationCompleted` 告知 commit task 是否已经完成，遗留 lock 需要宿主人工处理。

### Evidence

- 首条 partial-tail focused red：commit 返回 version 1，restart 实际收到 version 0。
- metadata `FileShare.None` red：实际 `EBUSY` 被包装成 `JsonlLockLostError`。
- heartbeat `FileShare.None` red：内部 `JsonlLockIoError(EBUSY)` 被 timer 再包装成 Lost。
- 最终 focused：`tests/jsonl-store.test.ts`、`tests/jsonl-lock.test.ts`、`tests/jsonl-lock-crash-phases.test.ts`、`tests/recovery.test.ts` 共 27 pass / 0 fail / 140 expect calls。
- `bun run verify`：127 pass / 0 fail / 635 expect calls，包含 typecheck、build 和 32 个测试文件。
- `bun run pack:smoke`：通过；prepack 同为 127/635，tarball 的 Bun 与 Node ESM TypeScript consumer 均验证公开 error exports。
- 独立只读 reviewer 的第一轮发现 heartbeat taxonomy P1；修复与补测后，post-fix review 未发现 P0/P1，确认 partial-tail、byte offset、CAS-before-repair、Windows I/O 与公开 error seam 可以在限定范围接受。

因此 ADR-0004 在 **Windows 本地文件系统、第一方 `JsonlSessionStore.commit()`、无自动 stale takeover** 的范围内接受。

Residual 保持不变：人工删除 stale lock 前必须确认旧 owner 已终止；owner check 不是 syscall 级 fencing；acquire/release cleanup 失败可能留下需人工处理的 lock；不承诺自动 takeover、网络文件系统、`allocateId()` / `create()` 多进程安全、无锁 `read()` 线性一致性、fsync/轮转、syscall 原子性或整个 JSONL Store process-safe。
