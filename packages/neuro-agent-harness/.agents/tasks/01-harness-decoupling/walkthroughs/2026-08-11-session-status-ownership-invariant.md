# 第四十四轮：Session Status Ownership Invariant

## 规划取证

本轮从三个方向重新选择问题。

### NeuroBook parity

2026-08-08 之后唯一触及 Harness 的提交只为 turn transaction fixture 补相同 timestamp，没有实现或公共合同变化。桌面安装、Manager、Job/relation、UI、HTTP/SSE 与 Pi 运行时差异继续属于 NeuroBook。

### Cosmos consumer

Cosmos 当前文档继续要求：

```text
Cosmos:
  Workflow / Run / Step / Job / Lease / Outbox / DomainEvent / Transport

Harness:
  Session / Invocation / Model Runtime / Profile / Tool / Capability
```

已有 Cosmos compatibility tracer 覆盖 Capability、structured output、JSONL recovery 与 cursor event。package smoke 可以增加行为覆盖，但本轮没有 packed consumer 失败，不能把缺测试当成 production correctness red。

### Standalone Core

三个只使用公开合同的 spike：

```json
{
  "status": {
    "status": "idle",
    "activeInvocationId": "<running invocation>",
    "invocationStatus": "running"
  },
  "publication": {
    "error": "event_hub_closed",
    "status": "running",
    "activeInvocationId": "<running invocation>",
    "invocationStatus": "running"
  },
  "mixedApproval": {
    "waiting": "waiting",
    "completed": "completed",
    "normalExecutions": 1
  }
}
```

`setStatus` 矛盾状态不依赖 hostile Store、Provider 或内部 helper。Session event 会公开 idle，但 abort、follow-up admission 和 recovery 继续看到 running owner。

publication failure 也真实，但当前稳定复现依赖宿主在 Harness 活跃期关闭 injected EventHub；ADR-0024 又明确 publication error 保留给调用方，需要单独冻结 durable-success/unknown 合同，不能顺手修改。

NeuroBook mixed approval 使用 first barrier；standalone ADR-0022 已接受一次 waiting Snapshot 的多 approval exact-set resolution。两者是不同 batch policy，本轮不把产品语义误报为 portable bug。

## 选中范围

Canonical term：

```text
Session Status
```

合同：

- Session Status 是 durable active Invocation 生命周期的 projection，不是独立运行真相；
- active running owner：只允许 `running` 或 `aborting`；
- active waiting owner：只允许 `waiting` 或 `aborting`；
- 无 active owner：只允许 `idle`、`interrupted` 或 `archived`；
- 不一致的 `setStatus` 在 commit 前以 `SessionInvariantError` 拒绝，Snapshot/version 不变。

`startInvocation`、`waitInvocation`、`resumeInvocation` 和 `finishInvocation` 已自动维护一致投影，本轮只收紧低层 `setStatus` admission。

## 为什么不建立 ADR

该变更恢复 `SessionStatus` 现有注释与 durable owner 的单一真相，不增加公共类型、持久格式或不可逆集成模式。它没有需要长期保留的替代架构取舍，因此记录在 Context、Task 与 walkthrough 即可。

## TDD 顺序

Public seam 为 `SessionStore.create/commit/read`，复用 `verifyNumericStore()` 同时覆盖 Memory 与 JSONL：

1. active running owner 后提交 `setStatus(idle)`：当前应成功并制造矛盾；目标是拒绝且 version/status/owner 不变；
2. terminal owner 清除后提交 `setStatus(running)`：目标是拒绝且不伪造 active 状态；
3. active owner 的 `aborting` 与 inactive Session 的 `archived` 保持可用；
4. 扩大到 Store/recovery/events/Harness focused、typecheck、full gate。

每条先单独 red，再做最小实现或护栏，不直接测试 reducer 私有逻辑。

## 未验证边界

- active Harness 期间关闭 injected EventHub 的 durable-start/publication failure；
- mixed approval first-barrier 与 exact-set batch policy 的产品选择；
- third-party Store 返回已经矛盾的 malformed Snapshot；
- NeuroBook/Cosmos 真实接入、HTTP/SSE、浏览器与产品 projection；
- Cosmos Job/Lease/Outbox、跨进程 EventHub 与 exactly-once。

## 执行记录

### Slice 1：active owner 不能投影 idle

Memory Store public contract formal red：

```text
Expected promise that rejects
Received promise that resolved

0 pass
1 fail
6 assertions
```

旧 Snapshot 实际成为：

```text
Session.status = idle
activeInvocationId = inv-1
Invocation.status = running
```

active owner 下的 `idle` admission guard 后，单条 Memory contract 为 1/0/13。

### Slice 2：无 owner 不能投影 running

terminal Invocation 已清除 owner 后，`setStatus(running)` formal red 同样意外 resolve：

```text
0 pass
1 fail
13 assertions
```

no-owner 对称 guard 后为 1/0/17。

### Slice 3：投影匹配而非枚举特判

running owner → `waiting` 的 formal red 为 0/1/10，证明 active 侧不是只禁止 idle。实现改为读取 durable active Invocation：

```text
active running -> running | aborting
active waiting -> waiting | aborting
```

转绿为 1/0/18。

无 owner → `waiting` 的 formal red 为 0/1/18；no-owner 侧收敛为：

```text
idle | interrupted | archived
```

转绿为 1/0/19。

### 正向护栏

共享 Store contract 还验证：

- inactive Session 可以进入 `archived`；
- running owner 可以进入 `aborting`，Invocation 仍保持 running；
- waiting owner 可以进入 `aborting` 并恢复 `waiting`；
- waiting owner 不能伪装成 running；
- 所有拒绝都不推进 version，status/owner 保持原值。

Memory 与 JSONL 同一 contract：

```text
2 pass
0 fail
58 assertions
```

## 局部验证

```text
bun test \
  tests/memory-store.test.ts \
  tests/jsonl-store.test.ts \
  tests/recovery.test.ts \
  tests/invocation-ownership.test.ts \
  tests/events.test.ts \
  tests/harness.test.ts

81 pass
0 fail
356 assertions

bun run typecheck
exit 0
```

## 完整验证

```text
bun run verify
244 pass
0 fail
1188 assertions
```

Package：

```text
bun run pack:smoke
exit 0
105 files
109.6 kB package
526.6 kB unpacked
Bun and Node ESM consumers passed
```

`git diff --check` exit 0。pack prepack 再次执行同一 244/0/1188 全仓门禁。

## 独立审查

Reviewer 对状态矩阵、合法 multi-operation ordering、Memory/JSONL 原子拒绝、waiting/resume/finish/reconcile/abort、custom Store 与文档边界做只读审查，并复跑：

```text
bun test tests/memory-store.test.ts tests/jsonl-store.test.ts
26 pass
0 fail
158 assertions
```

最终结论：

```text
No P0/P1/P2 findings.
```

本轮在 standalone first-party Store/reducer Session Status ownership scope 接受。third-party malformed Snapshot、publication-failure orphan 与真实产品 projection 继续属于已记录边界。
