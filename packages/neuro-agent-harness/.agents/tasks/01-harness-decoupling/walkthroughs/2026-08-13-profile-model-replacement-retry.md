# 第一百一十五轮：Profile/Model replacement 与 retry consumer contract

## 状态

本轮完成一个面向公开消费者的 retry 语义 tracer。结论是：旧 Invocation 的 `retry()` 按 retry 发生时当前 Registry 中的 Profile/Model 语义创建新 Invocation；它不继承旧 Invocation 的 Profile Version，也不把运行时 `modelConfig` 写入 durable Invocation。该行为与 ADR-0028 的既定合同一致，不需要 pinned execution snapshot 或新的 Core API。

本轮只保留测试增量 `tests/profile-model-replacement-retry.test.ts`，没有修改 `src/`、根导出、durable schema、依赖或 package 边界。继续保护既有 dirty 文件：`docs/architecture.md`、`docs/pi-adapter-design.md`、`package.json`、`tests/context.test.ts`。

## 规划依据

- 第 114 轮已证明 partial 展示可以由宿主 entry 与 Harness Invocation fact 组合，不需要继续扩展 Core partial/continuation API。
- 交接状态把第 115 轮的第一步定为：完成 Invocation A 后替换同一 Profile key 或 Model 配置为 B，再调用公开 `retry()`，确认 retry 使用的版本和 durable 解释。
- ADR-0028 已明确 `retry()` 创建新的 Invocation，并绑定 retry 时当前有效 Profile Version；它不是 approval resume 的旧 Profile pin。

## 消费者问题

宿主在热替换 Profile 或 Model 配置后调用旧 Invocation 的 retry 时，需要知道两件事：

1. retry 是否仍使用旧的 A 语义，还是使用当前的 B 语义；
2. durable Snapshot 是否把两次 Invocation 的语义边界记录清楚，同时避免把 provider-specific `modelConfig` 伪装成 Core durable fact。

如果 retry 误用旧语义，宿主会得到一个表面上是新 Invocation、实际仍执行旧配置的结果；如果 retry 把运行时配置写进 Core，又会把 Provider/Model 领域事实固化到宿主无关的 Session。

## Public consumer tracer

`tests/profile-model-replacement-retry.test.ts` 使用公开 API 组合：

- `ProfileRegistry.add()` / `replace()`：模拟 Profile watcher 将 A 替换为 B；
- `NeuroAgentHarness.createSession()`、`invoke()`、`retry()` 和 `snapshot()`；
- `MemorySessionStore` 与 `JsonlSessionStore`；
- `ScriptedModelRuntime`：记录 provider-visible 的 `systemPrompt` 和 `modelConfig`。

Profile A/B 具有同一个 `profileKey`，但分别声明 `version: 1` / `version: 2`，并返回不同的 `systemPrompt`、Model 名称和 `configurationVersion`。两条测试都先完成 A，再替换为 B，最后对 A 的 Invocation 调用公开 `retry()`。

## 已验证行为

### Memory

- 第一次 Model request 使用 A：`system-A` 与 `model-A`；
- retry 的第二次 Model request 使用 B：`system-B` 与 `model-B`；
- 两次 Invocation 都保留相同的 canonical payload；
- Snapshot 保留两条独立 Invocation：旧记录 `profileVersion: 1`，retry 记录 `profileVersion: 2`，retry 记录的 `retryOf` 指向旧 Invocation；
- `modelConfig` 只出现在 ModelRuntime request，不出现在 Invocation record；
- retry 返回 B 的结果。

### JSONL restart

- 第一次 Invocation 在 JSONL 中持久化为 Profile A 的 `profileVersion: 1`；
- 关闭 Harness、替换 Registry 为 B、重新创建 Harness 后，公开 `retry()` 使用 B 的 `systemPrompt` 与 `modelConfig`；
- 重启后的 Snapshot 同样保留旧记录版本 1、新 retry 版本 2 和 `retryOf` 关系；
- JSONL 只保存 Invocation/Core 事实，不保存 provider-specific `modelConfig`。

这说明 durable Profile Version 能解释两条 Invocation 的兼容身份，但不会冻结 retry 的 provider execution snapshot。该结果是既定合同，而不是本轮新增的隐式兼容行为。

## 验证

### focused

```text
bun test tests/profile-model-replacement-retry.test.ts
2 pass / 0 fail / 6 expect calls
```

同时复跑相关基线：

```text
bun test tests/profile-version-approval-admission.test.ts tests/profile-registry.test.ts tests/canonical-schema-value-admission.test.ts
25 pass / 0 fail / 62 expect calls
```

### 全量

```text
bun run typecheck
通过

bun run build
通过

bun test --parallel=1
524 pass / 0 fail / 2187 expect calls
94 files
```

`bun run verify` 的 typecheck/build 阶段通过，但它随后调用接手前已 dirty 的 `package.json` 中的 `test:bounded` wrapper；wrapper 在 300 秒进程级上限后以 exit 124 结束。单独复跑 wrapper 末尾的 wait/in-process 测试全部通过，直接 `bun test --parallel=1` 取得了完整绿灯基线。因此本轮把 `verify` 记为 wrapper timeout，不把它误报为通过；没有修改该 protected package.json。由于本轮没有修改 `src/`、根导出、依赖或打包边界，因此没有运行 `bun run pack:smoke`；第 111 轮安装后 Bun/Node package consumer 证据仍是最近的 package boundary 验收。

## 复核与边界

本地窄复核确认测试断言了 provider-visible A/B 配置、durable Profile Version、retry 关系、Memory/JSONL 重启和不持久化 `modelConfig`；没有发现 P0/P1。测试不是真实 Provider 或真实宿主 Adapter 集成。

仍未验证：

- 真实 Cosmos Harness Adapter、`agent.invoke@1` schema 或 Cosmos package consumer；
- 真实 Pi/provider 的 ModelRuntime 配置映射；
- 第三方严格 Session Store；
- 真实 NeuroBook 接入、浏览器/UI、生产 Transport 和部署；
- 旧 Invocation 是否需要产品层“按旧配置继续执行”的另一个显式动作。当前公开 `retry()` 的合同是使用当前 Profile/Model 语义。

## 结论

现有 `Profile Version` 只负责 durable Invocation 的兼容声明；公开 `retry()` 继续绑定当前 Profile/Model 是可解释且已测试的行为。没有证据要求把 `PreparedRun.modelConfig`、provider snapshot、job/attempt 或 Cosmos 字段加入 Harness Core。

下一轮回到规划入口：优先寻找真实 tracked consumer/Adapter 或更接近真实 Provider/Transport 的边界；在真实消费者出现前，不继续堆叠没有新问题来源的 fake parity fixture。
