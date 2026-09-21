# 第九十三轮：follow-up 自动 drain 失败 durable 自动 pause（pausedBy）

## 状态

第八十八轮 parity 对照代理 C（Jason）的 F3（P2）收口：自动 drain 失败时
durable 自动 pause 并携带 `pausedBy {itemId, reason, message≤500B}`，
对齐 NeuroBook（harness:6477-6510）。`src/` 状态形状 + 行为 + 测试 +
文档；另修复 `test` 脚本的 Windows 包装器停滞问题（绕道）。用户保护文件
未纳入范围。

## 规划依据（Jason F3 + 本轮核查）

- Jason 证据：NB 先落盘用户消息再 ack，admission 失败自动 pause 并带
  `pausedBy{itemId, reason, message≤500B}`；SA 原子 consume+start（更强），
  但失败只发 host `follow_up_error`，`paused` 无原因、无自动 pause。
- 本轮核查：`watchFollowUps` catch 只发 `follow_up_error`，队首坏 item
  卡住队列且无诊断；`harness.followUp.paused` 事实只有 `{paused: bool}`；
  `FollowUpQueueState` 只有 `{paused, items}`。手动 `resumeFollowUps` 失败
  仍原样抛出（宿主驱动，不自动 pause），与 NB「自动 drain 自动 pause」
  边界一致。

## 变更

- `src/coordination.ts`：`FollowUpQueueState` 增加
  `pausedBy?: {itemId, reason, message?}`。
- `src/follow-up-ledger.ts`：
  - `projectFollowUps` 从 `harness.followUp.paused` 事实投影 `pausedBy`
    （最后一条 paused 事实胜出；`paused: false` 清除）；legacy
    `{paused}` 事实保持兼容；
  - 新增导出 `truncateUtf8Bytes(value, maxBytes)`（UTF-8 字节安全截断，
    二分查找最长前缀）。
- `src/harness.ts` `watchFollowUps` catch：发布 `follow_up_error` 后，若
  队列未暂停且队首存在，durable 写入 `harness.followUp.paused`
  `{paused: true, itemId: head.id, reason: "admission_failed",
  message: truncateUtf8Bytes(error, 500)}` 并发布 `follow_up_state`；
  自动 pause 自身失败不掩盖原始错误。
- 新增 `tests/follow-up-auto-pause.test.ts` 2 条：
  - 公开 API 流程（registry.replace 构造「入队接受、启动拒绝」）：自动
    drain 失败 → `follow_up_error` + `pausedBy` 精确载荷 + durable 事实；
    宿主补救闭环 cancel → resume → paused false / pausedBy 清除；
  - `truncateUtf8Bytes` 单测（ASCII 500、中文 600 字节截到 166 字符/
    498 字节）。
- `tests/host-error-events.test.ts` follow_up_error 用例扩展 paused/
  pausedBy 断言；collector 改为等 `follow_up_state(paused)`（错误事件先于
  auto-pause 提交发布，直接读状态有竞态——初版即因此失败一次）。
- `CONTEXT.md` / `CHANGELOG.md` 同步。

## 绕道：test 脚本 Windows 包装器停滞（门禁确定性修复）

- 现象：第 92 轮起 `bun run verify` / `pack:smoke` 的测试阶段经
  `scripts/test-with-timeout.ts`（Bun.spawn + stdio inherit）运行时，在尾部
  跨进程测试附近间歇性停滞，900s 兜底反复命中（今日 ~5 次）。
- 排查：直接 `bun test --parallel=1`（主进程运行）5 次连续通过
  （41-42s）；包装器子进程路径停滞率约 50%——差异定位到包装器本身
  （Windows 下 Bun.spawn 子进程 + inherit stdio 与跨进程测试的交互）。
- 修复：`package.json` 默认 `test` 改为 `bun test --parallel=1`（不经
  包装器）；`test:bounded` 保留 `scripts/test-with-timeout.ts` 供 CI 或
  需要总时限的场景使用，脚本注释记录原因。verify/pack:smoke 恢复确定性。

## 门禁

- focused：`bun test tests/follow-up-auto-pause.test.ts
  tests/host-error-events.test.ts tests/coordination.test.ts
  tests/follow-up-events.test.ts tests/follow-up-admission-race.test.ts
  tests/follow-up-admission-jsonl.test.ts tests/follow-up-consume-recovery.test.ts
  tests/follow-up-process.test.ts tests/follow-up-reserved-facts.test.ts
  tests/wait-follow-up-drain.test.ts tests/harness-dispose.test.ts
  tests/message-identity.test.ts tests/message-identity-legacy-jsonl.test.ts`
  → `59 pass / 0 fail / 264 assertions`（13 files；随后 host-error-events
  扩展 + collector 修正后相关子集 15/0/57）。
- `bun run verify`：`456 pass / 0 fail / 1888 assertions`，78 test files；
  typecheck/build 通过（39.63s，test 脚本改为直接串行后）。
- `bun run pack:smoke`：通过（prepack 456/0/1888，Bun/Node consumer 均
  通过）。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 自动 drain 失败不再静默卡住队列：`follow_up_error` + durable
  `pausedBy`（itemId/reason/message≤500 UTF-8 字节）+ `follow_up_state`
  事件，宿主可据原因 cancel/reorder 队首后 resume；手动 resume 失败仍
  原样抛出。legacy `{paused}` 事实兼容。
- 门禁确定性恢复：默认 `test` 不经 Windows 停滞的包装器。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 仍为候选：per-event 字节预算（E4）、窗口保护（C10）/手动 compact
  （C11，需新合同）、自动注入 ADR（等真实消费者证据）。

## 独立审查

- 只读独立审查（Epicurus）：pausedBy 投影语义（最后事实胜出、paused:false
  清除、legacy 兼容）、collector 等 `follow_up_state(paused)` 保证 commit
  已 durable、主调用失败不误触发自动 pause（observeRunResult 吸收为 failed
  resolved）、手动 resume 失败不自动 pause；focused 实跑 `59/0/264`
  （13 files）。**No P0/P1 findings。**
- P2 已吸收：
  - 自动 pause commit 补 `expectedVersion: snapshot.version` CAS（对齐
    cancel/reorder）：并发 resume/cancel 先落地时自动回退，不覆盖新状态；
  - `truncateUtf8Bytes` 不切在 surrogate pair 中间（末尾孤立高位代理时
    回退一个 code unit），补 astral 边界断言；
  - 文档 focused 数字同步为 264。
