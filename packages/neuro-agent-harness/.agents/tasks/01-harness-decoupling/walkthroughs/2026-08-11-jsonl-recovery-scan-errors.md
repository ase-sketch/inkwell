# 第四十二轮：JSONL Recovery Scan Error Preservation

## 规划结论

本轮选择 `JsonlSessionStore.reconcileInterrupted()` 的目录扫描错误语义，而不是扩展 portable package exports：

- `src/storage/jsonl.ts` 当前对 `readdir(<root>/sessions)` 使用 catch-all，任何失败都返回空列表；
- 这会把真实 recovery 基础设施故障伪装成“没有 running Invocation 需要恢复”，调用方无法告警或停止启动；
- `readSessionSequence()` 和其它 JSONL 非锁读取已采用“只有 `ENOENT` 表示缺失，其它 errno 原样上抛”的相邻惯例；
- ADR-0004 的 `JsonlLockIoError` 明确属于 lock acquire/assert/heartbeat/release taxonomy，字段和语义都不适合普通目录扫描。

因此本轮不增加公共错误类、不修改 `SessionStore` 接口，也不建立 ADR。预期修复是局部错误过滤，但必须通过 public Store seam 证明。

## Public seam 与 TDD 顺序

测试只调用根已存在的 Adapter API：

```ts
new JsonlSessionStore({directory}).reconcileInterrupted()
```

不 mock `readdir()`，使用隔离临时目录观察真实文件系统行为。

垂直切片：

1. 全新 root 下 `sessions` 不存在，结果保持 `[]`；
2. `<root>/sessions` 是普通文件时，调用必须拒绝，并保留底层 `ENOTDIR`；
3. 只实现 `ENOENT → []`，其它错误直接上抛；
4. 扩大到现有 JSONL recovery / Invocation ownership 回归。

第一条是兼容性护栏；第二条必须在旧实现上成为 red，不能先修改生产代码。

## 平台证据

2026-08-11 在当前 Bun/Windows 环境直接调用：

```text
readdir(<temp>/sessions, {withFileTypes: true})
```

其中 `sessions` 是普通文件，得到：

```json
{
  "name": "Error",
  "code": "ENOTDIR",
  "errno": -20,
  "syscall": "scandir"
}
```

这证明正式 red 可以断言 `code === "ENOTDIR"`；不使用 Windows 上不稳定的 chmod/ACL fixture 推测 `EACCES` 或 `EPERM`。

## 范围

本轮包含：

- 缺失 `sessions` 目录的既有空恢复行为；
- 非 `ENOENT` 目录扫描错误的 fail-closed 行为；
- 原始 Node/Bun errno 的保留；
- focused、full、package 和独立审查证据。

本轮不包含：

- 单文件枚举后的 TOCTOU 重试或跳过；
- 损坏 Session 的产品级 issue projection；
- `JsonlStoreIoError` 公共 taxonomy；
- 自动迁移、目录修复、权限修改；
- 网络文件系统或真实 ACL matrix；
- NeuroBook/Cosmos 修改、Job/Run/Step/Lease/Outbox、HTTP/SSE DTO。

## 执行记录

先加入“`sessions` 不存在返回空列表”的兼容护栏：

```text
1 pass
0 fail
1 assertion
```

随后加入普通文件 fixture。旧实现的正式 red：

```text
Expected promise that rejects
Received promise that resolved

0 pass
1 fail
1 assertion
```

最小实现把 catch-all 改为：

```ts
const files = await readdir(sessionsDirectory, {withFileTypes: true}).catch((error: unknown) => {
    if (readErrorCode(error) === "ENOENT") {
        return [];
    }
    throw error;
});
```

没有新增 helper、错误包装或公共导出。filtered green：

```text
2 pass
0 fail
2 assertions
```

完整 `tests/jsonl-store.test.ts`：

```text
23 pass
0 fail
106 assertions
```

## 验证

Focused：

```text
bun test tests/jsonl-store.test.ts tests/recovery.test.ts tests/invocation-ownership.test.ts

48 pass
0 fail
197 assertions
```

类型与全仓：

```text
bun run typecheck
exit 0

bun run verify

236 pass
0 fail
1109 assertions
```

包边界：

```text
bun run pack:smoke

exit 0
105 files
107.9 kB package
520.1 kB unpacked
Bun and Node ESM consumers passed
```

格式：

```text
git diff --check

no whitespace errors
CRLF conversion warnings only
```

## 独立审查

首次独立只读 reviewer：

- 复核仅 `ENOENT` 归一为空列表，其它错误对象原样上抛；
- 复跑两条 `reconcileInterrupted` public test：2/0/2；
- 未发现代码、跨平台 errno、TOCTOU 或测试敏感性的 P0/P1/P2；
- 发现 1 个 P2：本 walkthrough 的执行、验证与下一步仍写成计划态。

执行证据回写后的第二次 reviewer 未发现 P0/P1；唯一剩余 P2 是本节、Task acceptance 和 TODO 仍保留“等待复核”状态。第二次审查已经完成，因此这些跟踪字段在本次收尾中关闭；生产代码和测试自 full/package gate 后没有变化。

最终没有遗留 P0/P1/P2 finding。

## 未验证边界

- Windows ACL / sharing violation 在目录枚举上的具体 errno；
- Linux/macOS 与网络文件系统行为；
- 真实 NeuroBook/Cosmos recovery startup 和产品错误呈现；
- 枚举完成后单个 Session 文件消失或被替换的并发窗口。

## 下一步

创建精确本地 checkpoint，然后按 Task 中的第四十三轮候选重新进行三路规划。
