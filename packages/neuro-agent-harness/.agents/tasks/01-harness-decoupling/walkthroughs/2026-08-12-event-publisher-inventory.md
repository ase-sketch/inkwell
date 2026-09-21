# 第七十三轮：事件发布点一致性审计

## 状态

第七十二轮收尾候选落地：对 `HarnessEvent` 公开类型做发布点一致性审计，防止
「声明但未发布」的合同漂移再次发生。审计发现第二个同类漂移
（`snapshot_required.reason` 的三个声明值从未发布）并收窄；建立事件发布点
清单文档与运行时覆盖 smoke。用户保护文件未纳入范围。

## 规划依据

- 第七十一轮审查发现 `message_committed` 声明但未发布（第七十二轮修复）；
  walkthrough 明确记录「编译期无法保证每个公开事件类型都有发布点」为保留
  边界，本轮以人工清单 + 运行时 smoke 双层防线补上。
- 审计过程：逐项枚举 `HarnessRuntimeEvent`（12）、`HarnessSessionEvent`（8）、
  `HarnessHostEvent`（1）并与 `publishRuntime`/`publishTerminalEvent`/
  `event-publication`/协调发布点逐项对照。

## 变更

- `src/events.ts`：`snapshot_required.reason` 收窄为 `"commit_order"`（唯一
  实际发布值；订阅期恢复由 `EventConnected.snapshotRequired` 标志承担，
  类型注释明示）。全仓无代码/测试引用被移除的声明值。
- 新增 `docs/events-inventory.md`：21 个事件类型 × 发布点（文件:行号）×
  触发条件完整矩阵 + 审计结论（含 `model_event`/`compaction_*` 仅代码引用
  审计覆盖的说明）；`docs/README.md` 索引加入该清单。
- 新增 `tests/event-publisher-coverage.test.ts`：审批门控 Tool 的富会话流程
  实际发布 9 个核心 runtime 类型 + `session_entry`/`session_status` 的
  smoke 断言。

## 门禁

- focused 5 文件（coverage + message-committed + events + persistence-events +
  epoch）：`42 pass / 0 fail / 167 assertions`。
- `bun run verify`：`414 pass / 0 fail / 1703 assertions`，63 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：exit 0；prepack `414/0/1703`，113 files，package
  `132.0 kB`，unpacked `621.2 kB`；Bun/Node ESM consumers 通过。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论与边界

- 审计确认全部公开事件类型都有发布点（`model_event` 依赖 provider
  `onEvent`、`compaction_*` 依赖 compactor 配置，由代码引用审计覆盖）；
- `snapshot_required` 收窄后，公开类型与实现一一对应；
- 编译期仍无法机械保证类型与发布点一致；清单文档 + smoke 测试是当前防
  漂移手段，后续可在引入新事件类型时以本清单为 checklist。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- `model_event` 的发布路径（ModelRuntimeAdapter 转发）未被 smoke 覆盖，
  仅代码引用审计覆盖。

## 独立审查

- 只读独立审查（Kepler）逐项核对矩阵行号、类型计数与发布点枚举：
  **No P0/P1 findings**；21 个类型全部有发布点且行号准确，`snapshot_required`
  收窄经 `git log -S` 证实「从未发布」、`EventConnected.snapshotRequired`
  覆盖三类订阅期恢复，smoke 断言逐事件可达无空转，收窄属预 1.0 合理
  breaking（CHANGELOG 记录准确）。
- P2 已吸收：`follow_up_state` 触发条件修正（由 pause/cancel/reorder/resume
  变更路径发布，公开查询不发布）；pack 体积按最终门禁更新。
