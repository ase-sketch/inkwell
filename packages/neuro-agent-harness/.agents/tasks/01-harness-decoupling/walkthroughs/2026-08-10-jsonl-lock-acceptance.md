# 第二十四轮：JSONL lock hardening and acceptance

## 结论

ADR-0004 已在以下范围接受：

- Windows 本地文件系统；
- 第一方 `JsonlSessionStore.commit()`；
- per-session `read → reduce/CAS → recoverable-tail repair → append` 互斥；
- 默认不自动 stale takeover。

本轮修复了一个会让成功 commit 静默丢失的 partial-tail P1，并把真实 Windows I/O 从 ownership lost 中分离。它不把整个 JSONL Store 宣称为多进程安全。

## P1：partial tail 后的成功 commit 静默丢失

Reader 原本允许忽略 crash 留下的最后一段 malformed JSON，例如：

```text
<valid version 0 record>\n
{broken
```

但下一次 commit 直接 append：

```text
{broken<valid version 1 record>\n
```

Red 结果：

```text
commit result version: 1
restart restored version: 0
```

如果再写一次，malformed line 会变成非尾行，Session 随后永久恢复失败。

## Partial-tail 修复

`readSnapshotState()` 现在从同一个 Buffer 解析 records，并保留原始 byte boundary：

- 空行可以存在；
- CRLF 的 `\r` 不进入 JSON 文本；
- 只有最后一个非空行的 `SyntaxError` 可视为 crash residue；
- 有效但 version 不连续或 shape 错误的 record 继续 fail closed；
- 中文 metadata 不会让 byte offset 漂移。

Commit 顺序：

```text
acquire
  → owner check
  → read Snapshot + append boundary
  → reduce/CAS
  → owner check
  → truncate malformed tail（若有）
  → owner check
  → append record
  → release
```

Stale/invalid plan 在 reducer 失败，不会借机修改文件。完整 JSON record 如果只缺 final newline，不截断，只在下一 record 前补 separator。

测试还冻结了 truncate 已完成、append 尚未发生时的 crash 状态：此时文件是合法旧前缀，下一实例可以继续 commit。该行为是可恢复，不是 crash-atomic 或 fsync 保证。

## Windows I/O taxonomy

最初尝试用一条 inline shell spike 获取 Windows errno，但被本地执行策略拦截，没有执行或留下临时文件。第一版 PowerShell holder 又因参数传递方式未生成 ready signal，测试按 5 秒 timeout 失败；改为环境变量传参后稳定运行。

`FileShare.None` 真实证据：

```text
metadata read → EBUSY
heartbeat write → EBUSY
```

旧实现把 metadata `EBUSY` 包装成 `JsonlLockLostError`。初版修复新增 Io 分类后，独立 reviewer 又发现 heartbeat timer 会把内部 `JsonlLockIoError` 二次包装成 Lost；第二条 red 精确复现后修复。

最终 taxonomy：

- `JsonlLockBusyError`：已有 owner / fail-closed contention；
- `JsonlLockCorruptError`：lock root/owner 结构异常；
- `JsonlLockLostError`：root/owner/metadata 消失或 token mismatch；
- `JsonlLockIoError`：其它 acquire/assert/heartbeat/release I/O，保留 operation、errno code 和 cause；
- `JsonlLockError`：公共基类与 `operationCompleted`。

这些错误类从 `@notnotype/neuro-agent-harness/storage/jsonl` 导出。内部 `JsonlSessionLock` 与 `withJsonlSessionLock` 仍不公开。

## 验证

Focused：

```text
bun test \
  tests/jsonl-store.test.ts \
  tests/jsonl-lock.test.ts \
  tests/jsonl-lock-crash-phases.test.ts \
  tests/recovery.test.ts

27 pass
0 fail
140 expect() calls
```

全仓：

```text
bun run verify

127 pass
0 fail
635 expect() calls
Ran 127 tests across 32 files.
```

包边界：

```text
bun run pack:smoke
```

Prepack 同为 127/635；npm tarball、Bun runtime consumer 和 Node ESM TypeScript consumer 通过，并检查五个公开 lock error exports。

## 独立审查

第一轮 reviewer：

- 确认 partial-tail byte parser、CAS-before-repair、合法无 newline 和公开 error seam 没有 P0/P1；
- 发现 heartbeat timer taxonomy 二次降级这一项 P1；
- 建议补 truncate 后/append 前 crash characterization。

修复和补测后，post-fix reviewer 未发现 P0/P1，确认可以在限定范围接受。

## Residual

- 自动 stale takeover 不存在；人工清理前必须先确认旧 owner 已终止。
- owner check 不是 syscall 级 fencing；外部绕开 lock 或错误清理仍可能形成竞态。
- acquire/release cleanup 是 best-effort；权限/占用失败可能留下需要人工处理的 lock。
- 不承诺 `allocateId()` / `create()` 多进程安全、无锁 `read()` 线性一致性、网络文件系统、fsync、轮转或 syscall 原子性。
- 不宣称整个 `JsonlSessionStore` process-safe。

下一轮回到 NeuroBook 最新 Harness bug-fix parity 与 Cosmos structured action 需求审计。
