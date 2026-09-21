# 第六十七轮：Approval Fact Coherence Admission

## 状态

第六十六轮读侧 admission 只覆盖 Invocation/Session 结构级矛盾，未覆盖 waiting
Invocation 的 approval fact。本轮三路只读调查发现并修复一个 P1 安全洞：waiting
且 `pendingApprovals` 显式空或缺失时，`resume()` 的 exact-set 校验恒通过（0=0），
`resolveApprovals()` 因 `request === undefined` 直接执行 gated Tool——审批门禁被
静默绕过、外部副作用 Tool 无人批准即执行、全程无错误。只改 `src/session.ts` 与
文档；用户保护文件未纳入范围。

## 规划依据

- 三路并行只读调查（Workflow 组合缺口 / Invocation 细粒度 coherence / NeuroBook
  2026-08-05 后 parity）：
  - Workflow 调查给出两个有证据的 Core 候选（公开 `invocationResultFromSnapshot`
    投影、`forkSession` 原语），本轮后置，记录为下一候选；
  - NeuroBook 两个候选（幂等 follow-up deliveryId、启动自动恢复 queue）均为
    delivery/exactly-once 宿主语义，与第六十轮边界冲突，拒绝下沉；
  - coherence 审计用手工 JSONL + 真实 Harness 公开操作探针确认 7 种损坏状态：
    (a) waiting + 空 approvals → `resume(id, [])` 被接受且 gated Tool 执行 1 次
    （最高损害，静默绕过）；(b) 重复 toolCallId → resume 死锁且错误指向宿主输入
    （可定位性差）；(e2) waiting turnCount 回退 → resume 后 transcript 非单调/
    重复 turn，模型可能重新请求同一副作用 Tool（e2b 探针：第二次审批轮）。
- 判定：`Invocation.sessionId` 不一致与 `Entry.invocationId` 悬空无读侧消费者
  （探针 + `rg` 双重确认），不值得 admission；turnCount 检查只针对 waiting 状态
  自身属性，不做跨 invocation 或 terminal 比较（crash 恢复路径会合法产生
  terminal turnCount 小于已提交条目 turn 的状态，不能误伤）。
- 与第六十六轮同族：reducer 写侧已拒绝这些状态（waitInvocation 拒绝空 approvals、
  resumeInvocation 要求 waiting），读侧兜底只在损坏文件/第三方 Adapter 生效。

## 变更

- `src/session.ts` 的 `assertSessionInvocationCoherence()` 追加 approval fact
  阶段（对每个 waiting Invocation）：
  - `pendingApprovals` 缺失或空数组 → `waiting Invocation X 必须包含 pending
    approval`（与 reducer 同款语义，封死两个绕过面）；
  - `toolCallId` 重复 → `Invocation X pendingApprovals 包含重复 toolCallId Y`；
  - turnCount 必须是非负整数；
  - turnCount 低于自身已提交最大 `agent.message` turn（沿 active path、按
    `invocationId` 归属、仅数字 `payload.turn`）→ `waiting Invocation X
    turnCount 回退（已提交最大 turn Y）`。
- 写侧对称：reducer 的 `waitInvocation` 现在同样拒绝重复 `toolCallId`、负数
  turnCount 与 turnCount 回退，错误在写入边界暴露，不再留到下一次 read 才把
  整个 Session 永久拒读。
- 防御性兜底：`resumeOnce` 对 `store.read` 结果再执行一次
  `normalizeSessionSnapshot`，第三方 Adapter 即使漏掉 read 侧归一化也无法绕过
  审批门禁到达 Tool 执行；`SessionStore` 接口文档显式固化「read/create 必须
  返回已归一化 Snapshot」义务。
- `tests/session-invocation-coherence.test.ts` 新增 Approval fact describe（6
  条）：空数组拒绝、缺失拒绝、重复 toolCallId 拒绝、turnCount 回退拒绝、合法
  waiting 通过、JSONL read + `harness.resume` 双重 fail closed 且 `toolExecutions
  === 0`（安全属性直接锁在 public seam）；另加 turnCount 缺失/负数拒绝、写侧
  reducer admission（3 条）与第三方 Store 防御性归一化（1 条）。第六十六轮合法
  组合测试的 waiting/aborting-waiting 用例补齐 approvals。
- `CONTEXT.md` 扩展 Invocation Coherence 术语与 approval fact 不变式；
  `CHANGELOG.md` Unreleased 记录安全收紧。

## TDD 证据

实现前新断言全部红（旧实现接受空 approvals 等状态）；实现后 focused：

```text
bun test tests/session-invocation-coherence.test.ts \
  tests/approval.test.ts tests/profile-version-approval-admission.test.ts \
  tests/recovery.test.ts tests/abort-boundary.test.ts \
  tests/jsonl-replay-graph-admission.test.ts
59 pass / 0 fail / 192 assertions（6 files，含 P2 吸收后新增）
```

红→绿过程中修正：第 66 轮「合法状态组合」的 waiting 与 aborting-waiting 用例
补 `pendingApprovals`（旧测试构造的 waiting 本来就缺 approval，属测试自身不合规，
新 admission 正确拒绝）。

## 门禁

- `bun run verify`：`388 pass / 0 fail / 1586 assertions`，57 test files；
  typecheck/build 通过；全部 legacy fixture（legacy waiting approval 按版本 1
  恢复等）无一误伤。
- `bun run pack:smoke`：exit 0；prepack `388/0/1586`，113 files，package
  `128.7 kB`，unpacked `610.8 kB`；Bun/Node ESM consumers 通过。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、HTTP/SSE
  Transport、浏览器/产品和生产验收仍未运行。
- 不校验非 waiting Invocation 残留 `pendingApprovals`、pendingApprovals 与
  transcript 中 Tool Call 的逐一对应（resume exact-set 已覆盖）、跨 invocation
  turnCount 比较或 terminal turnCount 与条目的关系（会误伤 crash 恢复路径）。
- 已记录候选：公开 `invocationResultFromSnapshot` 只读投影、`forkSession` 原语
  （ADR-0002 预告的 defer）；`Invocation.sessionId`/`Entry.invocationId` 悬空
  判定为不值得 admission。

## 独立审查

- 只读独立审查（Fermat）逐一核对绕过面与 turn 语义：**No P0/P1 findings**；
  确认 `resolveApprovals` 只能经 `resumeOnce` 到达、第一方 Store 的 read 已在
  exact-set 校验前抛出；steer/follow-up/invoke 等其它入口均不消费 waiting
  approvals；turnCount 检查与 run/commitMessages/waitInvocation 语义对齐，
  crash/abort/reconcile 与 legacy fixture 无一误伤。
- P2 已吸收：`resumeOnce` 防御性归一化 + `SessionStore` 接口固化归一化义务；
  waiting turnCount 必须非负整数（缺失/负数拒绝）；reducer 写侧补
  toolCallId 唯一与 turnCount 回退检查（错误在写边界暴露）；pack 尺寸数字按
  最终门禁更新。
