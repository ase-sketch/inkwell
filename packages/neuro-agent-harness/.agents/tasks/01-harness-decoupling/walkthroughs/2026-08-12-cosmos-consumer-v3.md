# 第九十六轮：Cosmos 消费切片 v3（compactSession + pausedBy 组合验证）+ ADR-0037 升格

## 状态

给第九十三/九十五轮新增的 `pausedBy` 与 `compactSession` 做编排器真实流程
的组合验证，并为 ADR-0037 升格 Accepted 补消费者证据。纯测试 + 文档轮
（无 `src/` 变更）；用户保护文件未纳入范围。

## 规划依据

- 第九十三轮 auto-pause（pausedBy）与第九十五轮 compactSession 落地后，
  公开 API 尚未在编排器组合流程中验证；目标要求「支持作为 cosmos 的使用
  对象」与真实消费者证据。
- NeuroBook parity 刷新：自 08-12 起无新提交（仍为 08-09 docs-only），
  无新差异。

## 变更

- 新增 `tests/cosmos-consumer-v3.test.ts` 2 条：
  - **长会话手动压缩 → fork → 锚定回写**：3 次 invoke 后
    `compactSession(keepRecentTokens: 1, instructions)` → fork（断言
    丢弃 compaction fact、保留原始消息）→ 分支 invoke → 公开投影重建
    结果 → 以压缩后 leaf 为锚 CAS 回写主会话；
  - **压缩后 follow-up 坏项自动 pause → cancel → 好项 resume →
    JSONL 重启恢复**：入队接受/启动拒绝（registry.replace v1→v2）、
    `pausedBy` 精确载荷、好项入队（v2 接受）、cancel 坏项、resume 后
    await handle（初版未 await，follow-up 仍在 running 时快照丢消息）、
    重启后压缩投影（8 条消息含摘要与 follow-up 链）、队列清空、
    compaction entry 存在。
- `docs/adr/0037-manual-compact-session.md` 升格 Accepted，补审查与
  消费者切片证据。

## 门禁

- focused：`bun test tests/cosmos-consumer-v3.test.ts
  tests/cosmos-orchestration-consumer.test.ts
  tests/cosmos-consumer-compatibility.test.ts tests/follow-up-auto-pause.test.ts
  tests/compact-session.test.ts` → `19 pass / 0 fail / 116 assertions`
  （5 files）。
- `bun run verify`：`472 pass / 0 fail / 1938 assertions`，80 test files；
  typecheck/build 通过（41.78s；一次 960s 无输出超时为瞬态负载，拆开跑
  即通过）。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- `compactSession` 与 `pausedBy` 在编排器流程中组合可用：手动压缩与
  fork/回写互不干扰（fork 丢弃 compaction 事实）、坏项自愈闭环
  （pause → cancel → resume）与重启恢复全部由公开 API 表达。
- ADR-0037 升格 Accepted（standalone Core scope），36+1=37 份 ADR 全部
  Accepted。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行（本切片仍为仓库内 consumer
  fixture）。
- 仍为候选：窗口保护（C10，需 Model contextWindow 来源，证据不足暂缓）、
  自动注入（等真实消费者证据）。

## 独立审查

- 只读独立审查（Bernoulli）：两条切片与公开 API 语义逐项一致（fork 复制
  规则 isCoreOwnedForkFact、压缩后 leaf 作写锚、pausedBy 载荷与第 93 轮
  合同、重启投影 8 条消息序列与事务顺序）；无空转路径（有界轮询超时后
  断言仍会失败、三处 handle 均被 await）；focused `19/0/116` 实测一致；
  ADR 目录 37 份全部 Accepted。**No P0/P1 findings。**
- P2 已吸收：fork「保留原始消息」补直接断言（fork 的 agent.message 条目
  含压缩前消息 a1/a3），不再只依赖无 compaction fact 的间接证据。
