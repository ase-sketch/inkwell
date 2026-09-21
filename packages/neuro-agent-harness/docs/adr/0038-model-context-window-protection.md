# ADR-0038: Model Context Window Protection

- Status: Accepted (standalone Core scope)
- Date: 2026-08-13
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

NeuroBook 的 `assertContextWithinWindow`（neuro-agent-harness.ts:5062-5071）在 Compaction 被有效关闭时用请求前估计的上下文 token 阻止超窗口 provider 请求，fail closed 而不是静默依赖 provider overflow；该语义已被 NB 测试钉住。SA 的 `ModelRuntime` 是无窗口概念的 provider-neutral seam；parity 审计 C10 曾因「Model contextWindow 来源」证据不足暂缓。第一百轮确认 NB 实现与测试证据后吸收。

## Decision

- `ModelRuntime` 新增可选 `contextWindow?: number`（正有限数，Harness 构造时校验）。
- Harness 每轮模型调用前，仅当 `contextWindow` 已声明且配置了 `ContextCompactor` 时，用 `compactor.estimate` 对请求消息求和估计；估计超过窗口即抛明确错误（phase 归 `run`，不进入 Model 阶段），不发送请求。
- 未声明 `contextWindow` 或未配置 compactor 时守卫完全跳过（Core 不内置 tokenizer）。
- Compaction 已执行仍超窗（如 keepRecent 大于窗口或 trigger 配置不当）同样 fail closed。

## Alternatives

- 用累计 provider usage 做守卫：拒绝——usage 是事后值，无法阻止超窗请求本身；NB 同样使用请求前估计。
- Core 内置 token estimator：拒绝——tokenizer 是宿主/provider 域，Core 保持 provider-neutral。
- 吸收 NB 的 percent-based trigger/reserve 合同：暂缓——SA 第九十五轮已确立绝对 token 合同（triggerTokens/keepRecentTokens），改合同需要真实消费者证据。

## Verification gate

- 超窗 fail closed 发生在模型调用前；窗口内正常调用；未声明/无 compactor 跳过；非法窗口在构造时拒绝。
- focused、全量、pack:smoke 与独立审查。

## Evidence and acceptance

- 新增 `tests/model-context-window.test.ts` 5 条 + interrupted 队列现状钉住（显式 `store.reconcileInterrupted()` 收口后队列未暂停、宿主可 resume；NB `pauseFollowUps` 的 "interrupted" 参数在当前 NB（commit 844abc2）无调用点，不吸收）。
- focused 104/0/423（18 files）；全量 491/0/2007、83 files（第一百轮口径，工作区含用户保护文件）；pack:smoke 通过；独立审查（McClintock）无 P0；1 条 P1（interrupted 假阳性钉子）已修复，3 条 P2 全部吸收（审查后无未解决 P0/P1）。
- 2026-08-13 升格 Accepted：NB assertContextWithinWindow 证据 + 测试钉住 + 独立审查满足验收；真实 provider/消费者的窗口口径行为仍待宿主侧验收。
