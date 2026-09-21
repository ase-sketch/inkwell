# Task 01：Workflow Kernel 稳定化

> 状态：Merged via PR #1（2026-08-12）
>
> 开始日期：2026-08-11
>
> 分支：`codex/feat-t01-kernel-stabilization`
>
> Walkthrough：[`walkthrough.md`](walkthrough.md)

## 1. 目标

把当前面向 NeuroBook Agent 场景的脚本执行 Spike 收敛为可被 Cosmos、NeuroBook
和其它宿主复用的通用 Workflow Kernel：

```text
Workflow script
  -> deterministic Activity identity / fingerprint
  -> journal replay / suffix invalidation
  -> bounded map/all
  -> wait/signal/timer/child/cancel
  -> Backend Port + capability negotiation
  -> Memory Backend conformance
```

Kernel 只拥有脚本执行语义。持久化是可选 Backend 能力；Cosmos 的 Prisma、
TaskStore、Job/Attempt/Lease、Outbox 和领域事务继续由 Cosmos Host 拥有。

## 2. 当前输入

### 2.1 已发布基线

- `origin/master@cf34d1567181f77b49f12721648f8f73c3385120`。
- 13 个测试、78 个 assertion 通过。
- `bunx tsc --noEmit` 通过。
- 当前实现已经探索 Activity journal、fingerprint、稳定 `map/all`、ask/resume、
  Session cursor、Agent 场景和投影。

### 2.2 候选修复

`fix/i46-nb-workflow-contract@c071ad55b2cd1c8efeb044a956483574835fd3b2`
在基线上补充：

- 跨 Runner 唯一 Run ID；
- `cancelled` 终态；
- 取消传播到 Agent invocation；
- 迟到成功不写 journal；
- 完整 Agent usage；
- ask description。

该分支已有 18 个测试、97 个 assertion 和 TypeScript 通过，但在进入 Task 基线前
仍需按通用 Kernel 边界逐项审查，不能机械合并。

### 2.3 用户 dirty worktree

`nb-workflow` 主工作区保留 6 个未提交文件。其内容基本等同候选修复，但没有
`AskSpec.description` 及对应 assertion。Task 不修改、提交、清理或覆盖这些文件；
所有实施只在本 Task worktree 中进行。

## 3. 稳定合同

### 3.1 Kernel 所有权

Kernel 负责：

- Workflow Definition 与输入快照；
- Activity identity：`path + sequence + kind + fingerprint`；
- journal replay、局部失效和确定性检查；
- 稳定并发分支；
- wait/signal/timer、Child Workflow 和取消传播；
- 受控 Clock、ID 和随机数；
- Backend capability 在 Run 启动前协商；
- 不依赖具体存储的 conformance suite。

Kernel 不负责：

- Cosmos Job、Attempt、lease、Worker、Outbox 或领域事务；
- Prisma、SQLite、PostgreSQL、Redis 或 S3 的具体实现；
- NeuroBook Session 文件格式、Profile 或 Model Runtime；
- HTTP、SSE、NestJS、React 或产品 DTO。

### 3.2 Port

首版稳定 Port：

- `WorkflowBackend`
- `BackendCapabilities`
- `ActivityExecutor`
- `DefinitionRegistry`
- `ValueStore`
- `EventSink`
- `Clock`
- `IdGenerator`

具体物理 package 在行为合同稳定前不冻结。Memory Backend 必须明确声明不支持
跨进程恢复，不能伪装成 durable backend。

### 3.3 Agent Extension

Agent、Session 和 Profile 能力保留为可选 Extension。Core 不导入 Harness，也不把
Agent Session 当成所有 Workflow 的必需状态。现有 Agent 场景必须继续工作，但
实现会通过 Extension/Port 组合，而不是扩大 Kernel 所有权。

## 4. 实施顺序

1. 固定现有行为和候选修复的取舍。
2. 定义 Backend capability、Run/Activity/Journal 的公共合同。
3. 将 Memory 状态移入显式 Backend。
4. 建立可复用 conformance suite。
5. 固定 replay、fingerprint 与 suffix invalidation。
6. 固定 `map/all` branch identity 和有界并发。
7. 实现通用 wait/signal/timer、Child Workflow 和 cancel。
8. 增加受控 Clock、ID、random 与 ValueRef。
9. 把 Agent/Session API 收敛为可选 Extension。
10. 提供 Node-compatible build/dist 和最小使用文档。

每一步先补失败场景和行为测试；不以类型通过代替 replay/recovery conformance。

## 5. 非目标

- 不实现 Cosmos Prisma Backend 或 Worker。
- 不复制 Task 04 Cosmos Runtime。
- 不接入 `neuro-agent-harness`、`nb-memory` 或真实模型。
- 不实现 Graph/Comfy UI 或第二套执行器。
- 不实现 Redis、PostgreSQL、S3 或远程 Worker。
- 不在本 Task 决定 Cosmos Attempt 物理表。
- 不保留 sidecar 作为 Kernel 原语；需要旁路时使用普通 Workflow/Activity 组合。

## 6. 验收

### Kernel

- 相同定义、输入和 journal 重放不重复执行已完成 Activity。
- fingerprint 变化只失效同一路径后缀。
- 并发完成顺序不改变 branch identity 或结果顺序。
- cancel 后迟到成功不能写 journal 或改变终态。
- wait/signal/timer/child 可恢复，重复 signal 有明确幂等语义。
- 非确定性只能通过受控 Port。

### Backend

- Memory Backend 通过完整 conformance。
- capability 不足在 Run 启动前拒绝。
- Backend API 不包含 Cosmos、Harness 或产品类型。
- conformance suite 可以由后续 Cosmos Prisma Backend 直接复用。

### 工程

- focused tests、全量 `bun test`、strict TypeScript 和 Node build 分开通过。
- public export 有行为测试。
- README 明确当前 durability 能力和非目标。
- 用户 dirty `master` 与外部 worktree 在 Task 全程保持不被覆盖。

## 7. 停止条件

出现以下任一情况时停止重构并记录证据：

- 必须把 Cosmos 领域或 Prisma 类型引入 Kernel；
- 必须同时维护两套 authoritative journal；
- Memory 与后续 durable Backend 无法运行同一 conformance；
- 现有 RP、写作、拆书场景无法通过 Extension 保持；
- 为兼容 Spike API 需要隐藏双重状态或类型逃逸。

## 8. 当前实现结果

截至 2026-08-11，本 Task 已完成：

- Core `WorkflowContext` 与显式 `AgentWorkflowExtension` 分离；
- `WorkflowBackend`、完整 capabilities 和 CAS revision；
- exact Definition key/version/manifest identity；
- `ActivityExecutor`、journaled Query、EventSink、ValueStore；
- Run input、Activity output、checkpoint 和 terminal result 的
  inline/ValueRef 边界；
- SHA-256 fingerprint，不在 journal 复制 Activity 参数正文；
- stable `map/all`、有界并发和确定性错误选择；
- ask/resume、Signal、Timer、Child Workflow、取消和 child cancel propagation；
- Memory Backend、ValueStore 和 Runner/Backend reusable conformance；
- Extension 启动上下文跨 Runner 恢复；
- 创建期取消、ValueStore 写入期取消和 checkpoint 原子投影；
- Backend 持久化错误与纯观察回调的隔离；
- Bun 开发构建、NodeNext declaration consumer 和纯 Node runtime smoke。

Memory 组合仍明确不支持：

- 进程重启；
- 多 Worker 或 lease；
- durable Signal/Timer/Child；
- external Receipt 或 Outbox。

这些能力由后续 Cosmos Host Adapter 提供，不能由本 Task 的同进程跨 Runner 测试
冒充。

## 9. 当前验证

```text
bun test
  -> 13 files / 76 tests / 220 assertions / 0 failures

bun run typecheck
  -> passed

bun run verify:package
  -> Bun bundle passed
  -> NodeNext declaration consumer passed
  -> pure Node package smoke passed

bun build demo/generate.ts --outfile .agent/tmp/demo-compile/generate.js \
  --target bun --format esm
  -> passed

npm pack --dry-run --json
  -> 63 package entries / 95,104 bytes
```

尚未完成：

- Cosmos Prisma Backend conformance；
- 真实进程重启、多 Worker、Harness 或 Cosmos Worker 验收。

0.1.1 已发布（MIT license 经 PR #3）；0.1.1 的发布产物缺陷与后续审计修复见
[`.agents/tasks/02-audit-hardening/`](../02-audit-hardening/README.md)。
