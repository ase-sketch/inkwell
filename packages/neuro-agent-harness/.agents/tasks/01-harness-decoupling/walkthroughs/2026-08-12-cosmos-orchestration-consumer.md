# 第七十轮：Cosmos 编排消费切片 v2

## 状态

用真实消费者流程组合第 68/69 轮新 API（`forkSession` +
`invocationResultFromSnapshot` + 锚定回写 + 跨进程恢复），证明它们作为
Cosmos 编排器的使用对象可以闭环。纯测试轮（无 `src/` 变更），未暴露 Core
缺口；用户保护文件未纳入范围。

## 规划依据

- Goal 明确「增强解耦/API/工具/SSE/Workflow 组合与 Cosmos 可逆消费能力」；
  第 68/69 轮新增了两个公开 API，但消费证据只到单元级，缺少真实编排流程的
  组合验证。
- 已有 `tests/cosmos-consumer-compatibility.test.ts` 覆盖 Capability/结构化
  输出/JSONL 恢复/cursor，但不覆盖「fork 探索 → 结果投影 → 锚定回写」与
  「重启后投影 + 继续 fork」两条编排闭环。

## 变更

- 新增 `tests/cosmos-orchestration-consumer.test.ts` 2 条：
  1. **主会话派生探索分支，投影分支结果后以 CAS 回写主会话**：Memory Store；
     主会话完成 → `forkSession`（title 覆盖 + `parentSessionId` 溯源）→ 分支
     Invocation 完成 → `invocationResultFromSnapshot` 重建分支结果 → 按
     ADR-0009 模式以 version/leaf CAS 回写 `cosmos.exploration` 条目 → 断言
     回写已持久化到主会话 Snapshot（version +1、activeLeafId 推进到新条目）
     且分支不被回写修改。
  2. **重启后从 Snapshot 投影终态并派生恢复分支**：JSONL Store；带 signal 的
     Invocation 完成后 dispose → 新 Store 实例仅靠 `read` +
     `invocationResultFromSnapshot` 投影终态（不依赖 handle/内存 active）→
     新 Harness 在恢复的 Session 上 `forkSession` 并继续跑 → 分支结果再次
     投影成功。
- 过程中修正：共享 `ScriptedModelRuntime` 的脚本序列需按两次 Invocation 提供
  两条回复（首版脚本耗尽导致分支 failed）；回写 payload 的 undefined 字段按
  `?? null` 归一（JsonValue 合同）。

## 门禁

- focused：`bun test tests/cosmos-orchestration-consumer.test.ts
  tests/cosmos-consumer-compatibility.test.ts tests/fork-session.test.ts
  tests/invocation-result-projection.test.ts` → `18 pass / 0 fail /
  108 assertions`（4 files，含 P2 吸收后的 version bump/transcript 断言）。
- `bun run verify`：`404 pass / 0 fail / 1659 assertions`，60 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，`package.json` 的
  `files` 不含 tests，包内容与第六十九轮已验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 现有 provider-neutral 合同足以表达 Cosmos 编排闭环：fork 探索、结果投影、
  锚定回写、跨进程恢复四个动作全部由公开 API 组合完成，无需新增 Core API。
- 组合边界确认：`forkSession` 在恢复场景同样可用（新 Harness + 新 Store
  实例）；`invocationResultFromSnapshot` 是重启后唯一需要的结果视图入口；
  回写仍走 ADR-0009 的显式 CAS 模式，宿主负责幂等。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、HTTP/SSE
  Transport、浏览器/产品和生产验收仍未运行。
- 编排测试使用 ScriptedModelRuntime 与本地文件系统，未覆盖真实 provider
  取消/重试、网络 Store 或浏览器产品路径。
- ADR-0036 已由本轮独立审查裁定升格 Accepted（standalone Core scope）；
  真实消费者/第三方 Store/Transport/产品验收继续单独报告。

## 独立审查

- 只读独立审查（Sagan）核对公开 API 组合面（无 private seam）、CAS 参数成对、
  断言精度与数字：**No P0/P1 findings**；确认「现有合同足够」结论成立，四条
  闭环无测试绕过；**ADR-0036 裁定升格 Accepted（standalone Core scope）**，
  全部 Acceptance gate 项有闭环证据。
- P2/P3 已吸收：回写后补 version bump 与 activeLeafId 推进断言；「跨进程」
  措辞改为「重启恢复（新 Store 实例）」；重启 fork 补 transcript 继承断言
  （entries 长度 + agent.message 存在）；「落盘」措辞改为「持久化到主会话
  Snapshot」。
- 真实 NeuroBook/Cosmos consumer、真实 provider、HTTP/SSE、浏览器/产品与
  生产验收继续单独报告，不阻塞 standalone Core acceptance。
