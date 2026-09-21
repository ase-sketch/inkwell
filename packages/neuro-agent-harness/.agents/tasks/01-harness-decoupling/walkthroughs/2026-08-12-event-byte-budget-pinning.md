# 第九十四轮：per-event 字节预算边界钉住（E4 收口）

## 状态

第八十八轮 parity 对照代理 C（Jason）最后的 P2（E4 per-event 字节预算）
收口。核实结论：SA 的 replay/live 序列化字节预算已覆盖单事件路径（与 NB
per-event 预算功能等价，第 58 轮审计结论成立），缺的是直接钉住测试——
本轮补上。纯测试 + 文档轮（无 `src/` 变更）；用户保护文件未纳入范围。

## 规划依据（Jason E4 + 第 58 轮审计 + 本轮核实）

- Jason 证据：NB 有 per-event 字节预算，超大事件降级 snapshot_required
  （session-event-hub.ts:211-222）；SA 缺 standalone 侧 per-event 预算。
- 第 58 轮审计（2026-08-11）：探针证明现有 replay/live serialized-byte
  budgets 已能把超大事件导向 Snapshot/queue_overflow recovery，不新增
  Core API。
- 本轮核实（events.ts）：live 队列在 push 时检查
  `liveBytes + serializedBytes > queueByteLimit`（默认 1 MiB）→
  fail closed（queue_overflow）；replay 在 staged 时累计 bytes 越界
  （默认 4 MiB）→ 旧 cursor 要求 Snapshot。单事件超过预算同样命中——
  与 NB per-event 机制功能等价，只是粒度在队列/重放层而非单事件层。

## 变更

- `tests/events.test.ts` 新增 2 条：
  - 单个事件（序列化后 837 B）超过 subscriber queue 字节预算（512 B）→
    立即 fail closed（queue_overflow）；
  - 单个超大事件（序列化后 1038 B）使 replay 字节预算（700 B）越界 →
    新订阅 cursor 立即
    `snapshotRequired`。
- `CONTEXT.md` 新增 EventHub 字节预算条款（单事件 + 累积双路径、默认值、
    与 NB 等价说明）。

## 门禁

- focused：`bun test tests/events.test.ts` → `23 pass / 0 fail /
  73 assertions`（含 2 条新增）。
- `bun run verify`：`458 pass / 0 fail / 1891 assertions`，78 test files；
  typecheck/build 通过（39.78s）。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- E4 以「机制已存在 + 直接钉住」收口：超大单事件在 live 与 replay 两层
  都有明确 fail-closed/Snapshot 行为，测试锁定；parity 审计（第八十八轮
  A/B/C 三组）全部收口完成。
- 与 NB 的机制差异（队列/重放层聚合预算 vs 单事件预算）记录为等价实现，
  不引入新 Core API。等价性限定：介于 1 MiB 与 4 MiB 之间的事件对既有
  live 消费者 fail closed，但新订阅者经 replay 会原样收到（不产生
  Snapshot 信号）；replay 驱逐后 cursor 恰在驱逐事件之后时可能静默跳过
  该事件而不要求 Snapshot——均为既有 ring 驱逐设计，审查 P2 记录。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 下一候选（需新合同/ADR）：窗口保护（C10，需 Model contextWindow 来源）、
  手动 compact（C11，公开 compactSession API）、自动注入（等真实消费者
  证据）。

## 独立审查

- 只读独立审查（Hegel）：两个新增断言与实现逐行一致、非空转（实测序列化
  837 B / 1038 B 均真实越界；既有累积路径测试提供负例对照）；replay
  驱逐后 `oldestSeq = latestSeq + 1` 使 after:0 要求 Snapshot 的路径成立；
  NB 侧 `maxEventBytes` 证据已对照 neuro-book 源码核实；focused
  `23/0/73` 实测一致。**No P0/P1 findings。**
- P2 已吸收：walkthrough 字节数字校准（837/1038）；CONTEXT 等价条款补
  边界限定（1 MiB~4 MiB 区间与驱逐后 cursor 边界为既有 ring 设计）。
