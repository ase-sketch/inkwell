# 第八十八轮：悬挂 Tool Call 的启动闭合 admission（NeuroBook parity 深度对照）

## 状态

NeuroBook parity 深度对照轮。三路并行只读代理逐模块比对双侧合同后，吸收
最高价值 P1：全新 Invocation 不得从悬挂 Tool Call 的 transcript 启动。
`src/` 行为变更 + 测试 + CHANGELOG/CONTEXT 同步；用户保护文件未纳入范围。

## 规划依据（三路对照结论）

- 代理 A（Boole，核心运行循环/turn 语义）：
  - **P1 D1**：NeuroBook 失败 turn 绝不落盘未闭合 tool call，assistant +
    toolResults 同一批次提交，runLoop 起点 `assertNoUnclosedToolCallsForModel`
    （neuro-agent-harness.ts:7666/7907/7923）；standalone 的 assistant 在
    Tool 执行前单独提交（harness.ts:1444），forced abort / parallel 违规 /
    Store 失败会留下「有 call 无 result」的 durable transcript，而
    `retry()`/`start()` 入口无闭合 admission——abort 后 retry 会把悬挂 call
    直接发给 provider（重复副作用或模型报错）。
  - D2（InvocationError phase 细化）、D3（带内 stopReason）为 P2 候选。
- 代理 B（Hume，compaction/prepare）：
  - C2（previous summary 是否计入 keepRecent 预算，与 NB 真实语义分歧）、
    C4（toolResult cut 分支）、P3（prepareWrites 当前 invocation 可见性陷阱）
    均为 P1/P2 级，但主要是「行为存在零断言」的测试收口与文档决策；
    5 个切分行为测试列为下一候选。
- 代理 C（Jason，identity/事件/队列）：
  - **P1 C2**：follow-up 默认 caller 分歧——NeuroBook 缺省 `{kind:"user"}`
    （harness:1411-1418），standalone 缺省 `{kind:"system", name:"followUp"}`
    （harness.ts:458/1767），影响 hooks/trace/授权；列为下一轮候选。

本轮选取 A/D1（正确性缺口，影响真实副作用面），C2 与 B 的 compaction
测试收口记录为下一候选。

## 变更

- `src/harness.ts` `startOnce`：全新 Invocation 启动（invoke / invokeAt /
  retry / follow-up 自动启动共用入口）在 startInvocation 落盘前检查
  `pendingToolCalls(sessionMessages(snapshot))`；idle Session（
  `activeInvocationId === null`）存在未完成 Tool Call 时抛
  `存在未完成 Tool Call，不能启动新 Invocation：<name>`。
  - 仅检查 idle Session：waiting 的待批 approval call 由 `resumeOnce`
    独立路径处理（resume 不经过 startOnce），不误拒；
  - 检查在 anchor/expectedFollowUpId 校验之后、profile resolve 与 commit
    之前，不改变既有错误优先级。
- 新增 `tests/closed-tool-call-admission.test.ts` 3 条：
  forced abort 悬挂后 `retry` 显式失败、新 `invoke` 显式失败、干净
  transcript 不受影响。public red 先行：改动前 retry/invoke 均被接受
  （promise resolved），绿后全部拒绝。
- `tests/tool-call-identity.test.ts` 的 legacy duplicate occurrence 用例
  更新：原语义是「invoke 启动后在 compaction 阶段失败（status failed）」；
  新 admission 把拒绝提前到启动入口（invoke 直接 rejects、不落盘
  startInvocation），语义更强，断言改为启动期拒绝 + 零 Invocation +
  summaryCalls 0 + model.requests 0。
- `CHANGELOG.md` Unreleased 新增条目；`CONTEXT.md` Tool Call Identity
  不变式节新增「idle Session 悬挂 Tool Call 拒绝启动」条款。

## 门禁

- focused：`bun test tests/closed-tool-call-admission.test.ts
  tests/tool-call-identity.test.ts tests/abort-boundary.test.ts
  tests/approval.test.ts tests/harness.test.ts tests/follow-up-process.test.ts
  tests/workflow-agent-invocation.test.ts tests/recovery.test.ts
  tests/core-owned-entry-admission.test.ts tests/compaction.test.ts` →
  `59 pass / 0 fail / 280 assertions`（10 files）。
- `bun run verify`：`446 pass / 0 fail / 1829 assertions`，75 test files；
  typecheck/build 通过（38.98s；本轮一次被 900s 兜底杀掉是环境负载所致，
  重试即通过）。
- `bun run pack:smoke`：通过——prepack 同为 446/0/1827，tarball 113 files、
  137.3 kB / 640.6 kB unpacked，Bun 与 Node ESM consumer 均通过；P2 吸收为
  纯测试/文档变更，不改变包边界，最终全仓数字以 446/0/1829 为准。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 悬挂 Tool Call 不再能隐式进入 provider 请求：所有全新启动入口在 durable
  mutation 前 fail closed，错误信息包含 Tool 名；resume 的 approval 路径
  不受影响；legacy 脏 transcript 也由同一检查兜底（原 compaction guard
  保留为第二道防线）。
- 行为与 NeuroBook `assertNoUnclosedToolCallsForModel` 对齐（普通 call
  拒绝启动；approval call 走 resume）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 未做合同级修复：assistant 仍先于 toolResults 提交（未闭合窗口仍可能
  在 abort/Store 失败时产生），只是启动侧 fail closed；延迟到同一批次
  提交需单独 ADR（Boole 建议）。
- 下一候选（parity 审计产出）：follow-up 默认 caller 对齐（P1，C2）；
  compaction 切分/二次压缩/toolResult cut/skip/悬挂 firstKeptEntryId
  测试收口（B）；`turn_end waiting` 语义、pausedBy/自动 pause、per-event
  字节预算（P2）。

## 独立审查

- 只读独立审查（Lovelace）：admission 位置（anchor/expectedFollowUpId 之后、
  commit 之前）、错误优先级（invoke-while-waiting 仍先报
  InvocationConflictError，跨实例 durable waiting 由 Store reducer 拒绝）、
  `resumeOnce` 完全不经过 startOnce；red→green 真实（无新代码时 retry/invoke
  必然被接受）；focused 数字实测一致。**No P0/P1 findings。**
- P2 已吸收：
  - legacy 用例标题改为「legacy duplicate occurrence 不能用一个旧 result
    闭合悬挂 call（启动期拒绝）」；
  - `danglingSession` 增加正向断言（assistant toolCall 已落盘 + 无
    toolResult 闭合），durable 前置条件自文档化；
  - compaction 阶段 guard（`不能 compaction`）覆盖缺口：尝试用「运行中宿主
    write 注入」与「beforeTurn hook 注入」两条公开路径复现，均不可达——
    宿主 write 在运行中会先触发 run 的版本 CAS 冲突（expected=2, actual=3）；
    hook writePlans 落盘后对 run 本地 messages 视图不可见（P3 可见性陷阱），
    compaction 看不到注入消息。结论：启动 admission + resume exact-set +
    occurrence 匹配已封死该 guard 的全部公开入口，guard 保留为不可达的
    legacy 防御（第二道防线），walkthrough 显式记录证据，不再维持人为构造
    的测试。
