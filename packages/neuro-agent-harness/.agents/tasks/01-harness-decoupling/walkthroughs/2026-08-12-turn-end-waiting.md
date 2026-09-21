# 第九十二轮：turn_end waiting 事件语义对齐

## 状态

第八十八轮 parity 对照代理 C（Jason）的 E2（P2）收口：进入 approval
waiting 的 turn 以 `turn_end(waiting)` 闭合，而非 `completed`。`src/`
事件类型 + 发布点变更 + 测试 + 文档；用户保护文件未纳入范围。

## 规划依据（Jason E2 + 本轮核查）

- Jason 证据：NeuroBook turn_end status 含 `"waiting"`（dto:661-666、
  harness:4619）；SA `turn_end` 只有 `completed | failed`，等待轮发布
  `turn_end completed` + `agent_end waiting`。
- 本轮核查：SA 的 waiting 路径（harness.ts:1469 附近）在 `waitInvocation`
  durable 提交后发布 `turn_end(turn, completed)`——但该 turn 的工具调用
  正在待批，resume 后才执行，标 completed 与语义不符；resume 从下一 turn
  继续（`turn = invocation.turnCount`，循环内 `turn += 1`），waiting turn
  本身不会再以 completed 闭合。改为 `waiting` 更诚实且对齐 NB。
- 影响面审计：全仓测试对 `turn_end` 的断言只有 presence、failed 路径
  （`turn_end:1:failed`）与 completed 路径（`turn_end:1:completed`），
  无任何测试钉住 waiting 路径的旧值——改动不破坏既有断言。

## 变更

- `src/events.ts`：`turn_end.status` 联合类型增加 `"waiting"`。
- `src/harness.ts`：approval waiting 路径发布 `turn_end(turn, "waiting")`
  （原 `"completed"`），带原因注释。
- 新增 `tests/turn-end-waiting.test.ts`：门控 Tool 流程收集事件，断言
  `turn_end(1, waiting)` → `agent_end(waiting)` → resume →
  `turn_end(2, completed)` → `agent_end(completed)`；`agent_end` 序列为
  `["waiting", "completed"]`。public red 先行（旧行为 status completed）。
- `docs/events-inventory.md` turn_end 行补 `"waiting"`；`CHANGELOG.md`
  新增条目；`CONTEXT.md` 新增 waiting 闭合不变式。

## 门禁

- focused：`bun test tests/turn-end-waiting.test.ts tests/approval.test.ts
  tests/event-publisher-coverage.test.ts tests/turn-failure-events.test.ts
  tests/message-committed-event.test.ts tests/wait-for-invocation.test.ts
  tests/active-profile-steer-admission.test.ts tests/waiting-control-process.test.ts
  tests/waiting-resume-process.test.ts` → `34 pass / 0 fail / 119 assertions`
  （9 files）。
- `bun run verify`：`454 pass / 0 fail / 1868 assertions`，77 test files
  （P2 吸收前）；P2 吸收后直接 `bun test --parallel=1` 实跑
  `454 / 0 / 1869 assertions`，77 files，41.59s（typecheck/build 在
  包装器运行中已通过；两次 900s 兜底命中为环境间歇问题，直接串行稳定）。
- `bun run pack:smoke`：通过（prepack 454/0/1868，113 files，Bun/Node
  consumer 均通过）。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- waiting 轮的 turn 生命周期事件现在诚实表达「工具待批」：`turn_end(waiting)`
  进入 waiting、resume 后下一 turn 以 `turn_end(completed)` 闭合；
  `failed`/`completed` 路径不变。事件消费方（宿主 Transport）可以区分
  等待轮与完成轮，无需再从 `agent_end(waiting)` 反推。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 仍为候选：pausedBy/自动 pause（F3）、per-event 字节预算（E4）、
  窗口保护（C10）/手动 compact（C11，需新合同）、自动注入 ADR（等真实
  消费者证据）。

## 独立审查

- 只读独立审查（Bohr）：waiting 路径发布顺序（waitInvocation → 
  approval_required → turn_end(waiting) → agent_end(waiting)，无 await 可
  插入失效）、resume turn 编号（turnCount 保留链：session.ts:587 写入、
  633 resume 保留）、类型联合影响面（全仓消费点均 presence/turn 级或
  failed/completed 精确断言，无穷举 switch 破坏）；focused `34/0/119`
  实测一致。**No P0/P1 findings。**
- P2 已吸收：
  - events-inventory 全表行号按第九十二轮实校准（第九十一轮 compactIfNeeded
    与第九十二轮 waiting 发布后漂移，顺带修正 agent_start/turn_start/
    model_event/agent_end/tool/compaction/session/host 各行）；
  - ADR-0013 事件形状补注 `"waiting"`（历史正文保留，附当前合同说明）；
  - turn-end-waiting 测试补 `expect(turnEnds).toHaveLength(2)`，钉死
    waiting turn 不重复闭合。
