# Task 02：审计修复与 0.1.2 发布

> 状态：Merged via PR #5（2026-08-12）
>
> 开始日期：2026-08-12
>
> 分支：`codex/fix-t02-audit-hardening`
>
> Walkthrough：[`walkthrough.md`](walkthrough.md)

## 1. 目标

修复 2026-08-12 多 agent 审计确认的全部真实影响项，并发布 0.1.2：

```text
发布阻断（0.1.1 干净环境 import 崩溃 / tarball README 旧版）
  + 8 个正确性缺口
  + 低成本债务与文档滞后
  -> 全量回归测试 -> 隔离包 smoke -> 0.1.2 发布 -> deprecate 0.1.1
```

已确认决策：全量修复一次完成；`rerun` 收紧为只允许 `failed`/`completed`
（以及无未应答 ask 的 waiting）；发布走 0.1.2 + deprecate 0.1.1。

## 2. 修复清单

### 发布链路（P0）

- `extractCfg` 惰性加载 typescript；`typescript` 声明为 optional
  peerDependency；缺失时给出明确错误。
- `verify:package` 增加隔离目录 smoke（临时目录安装 tarball + hostile
  `NODE_PATH`，验证主入口不依赖可选依赖）。
- `prepublishOnly` gate：README/package.json/LICENSE 有未提交差异时拒绝发布。

### Runner 语义（P1/P2）

- `rerun`：拒绝带未应答 ask 的 waiting、拒绝 running（除非 Backend 声明
  `processRestart`）；waiting 的 timer/child 恢复仍可 rerun。
- checkpoint 终态投影改为从 journal 按 `(path, seq)` 确定性重算。
- child 启动窗口取消兜底（`children.start` 返回后补 `cancelForParent`）。
- persistence poisoned：持久化失败后后续 save 直接拒绝，阻止“业务成功但保存
  失败”与 journal 分叉；失败后 `view()`/`loadView()` 一致返回最后已知快照。
- cancel 事件在持久化后发出；resume/signal 在执行收尾期被预检拒绝。

### 输入/安全边界（P1）

- fingerprint 数组分支拒绝索引 getter 与 symbol 键；错误消息转义控制字符并
  截断长度。
- `begin()` 同步校验 callerSessionId/defaultModel；控制路径 hydrate 复查
  `requires`；ask 缓存命中路径补取消检查。
- AskSpec 与 emit 增加轻量形状校验。

### Agent/Session（P1）

- `agents.invoke` options 白名单构造，未知字段不再到达宿主端口。
- `SessionPort.acquireByTag` 原子 find-or-create；Memory 参考实现同步实现。
- ephemeral 会话在所有终态归档（含 failed/cancelled）。

### 投影、测试与文档（P2）

- traceGraph 按路径段解析嵌套分支的真实父路径与 subgraph 分组。
- capability 协商参数化测试补齐（durableTimers/childWorkflows/
  externalReceipts/outbox）。
- Task 01 数字/状态修正；README 补充 rerun、acquire、extractCfg、signal
  回收与发布 gate 说明。

## 3. 明确不做

- 跨 Runner 陈旧投影自动刷新（durable host 阶段）。
- kernel 级 acquire 串行锁（端口合同 + 参考实现原子化已覆盖 Memory 组合）。
- durable signal TTL 实现（宿主合同）。
- CI 自动发布与 provenance（保持手动发布）。
- listStored 部分失败语义（文档说明）。

## 4. 验证

```text
bun test            -> 13 files / 99 tests / 279 assertions / 0 failures
bun run typecheck   -> passed
bun run verify:package
  -> Bun bundle passed
  -> NodeNext declaration consumer passed
  -> NODE_PACKAGE_SMOKE_OK
  -> ISOLATED_PACKAGE_SMOKE_OK（干净环境，无 typescript）
```

0.1.2 发布提交（版本号、README、walkthrough）已合并；随后发布 0.1.2 并
`npm deprecate` 0.1.1。
