# 第八十二轮：model_event 发布路径运行时 smoke

## 状态

第七十三轮事件发布点审计明示的覆盖缺口：`model_event` 发布路径此前只有代码
引用审计（需要真实 provider 流式 Adapter 转发 `onEvent`），无运行时 smoke。
本轮补上：真实形状的 ModelRuntime 在 `runTurn` 内通过 `request.onEvent`
转发流式事件，断言 Harness 逐条发布 `model_event`（顺序/turn/载荷）且不进入
durable transcript。纯测试轮（无 `src/` 变更）；用户保护文件未纳入范围。

## 规划依据

- 第七十三轮审计结论与 `docs/events-inventory.md` 明示：`model_event` 只在
  provider 流式场景触发，focused smoke 不覆盖；第八十轮 Gauss 遗留审计再次
  列为未处理测试缺口。
- `src/model.ts` 的 `ModelRuntimeEvent` 五种类型（message_start/text_delta/
  thinking_delta/tool_call_delta/message_end）与 harness.ts:1425 的
  `onEvent → publishRuntime(model_event)` 转发点。

## 变更

- 新增 `tests/model-event-publisher.test.ts`：自定义 ModelRuntime 在
  `runTurn` 内按序 emit message_start → text_delta("hel") →
  thinking_delta("hmm") → text_delta("lo") → message_end，再返回最终消息；
  断言：
  - 5 条 `model_event` 按序发布（类型序列与 delta 载荷精确匹配）、turn 为 1；
  - 所有 `model_event` 先于同 turn 的 `message_committed`（流式在前、终态
    提交在后）；
  - durable entries 全部是 `agent.message`（`model_event` 不落盘）。
- `docs/events-inventory.md` 审计结论行更新：`model_event` 由本 smoke 覆盖，
  `compaction_*` 仍为代码引用审计。

## 门禁

- focused：`bun test tests/model-event-publisher.test.ts
  tests/event-publisher-coverage.test.ts tests/message-committed-event.test.ts`
  → `8 pass / 0 fail / 43 assertions`（3 files，含 P2/P3 吸收后的载荷与
  entries 断言）。
- `bun run verify`：`436 pass / 0 fail / 1788 assertions`，70 test files；
  typecheck/build 通过。
- `bun run pack:smoke`：未运行——本轮无 `src/` 变更，包内容与第八十一轮已
  验证状态一致。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 事件发布点双层防线补全：runtime 类型除 `compaction_*`（需 compactor
  配置，保留代码引用审计）外均有运行时覆盖；session 类型由持久事件/
  协调套件覆盖；host 错误事件（`abort_request_error`/`follow_up_error`）
  无运行时断言（触发需失败注入 Store），仅信封级/负向覆盖，记录为边界
  候选，不冒充已闭环。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool（含真实流式
  SDK）、第三方 Store、HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- `tool_call_delta` 类型未在 smoke 中覆盖（本轮用文本流）；代码引用审计
  覆盖，若未来需要可补 Tool 流式用例。

## 独立审查

- 只读独立审查（Noether）：转发路径真实覆盖（onEvent → publishRuntime →
  hub → 订阅者完整链路）、模型形状与 src/model.ts 合同一致、断言无空转
  （数量守卫 + findIndex/findLastIndex 相对顺序非空转）、snapshot 在
  dispose 前获取；focused/全仓数字实测一致。**No P0/P1 findings。**
- P2/P3 已吸收：结论行修正 host 事件覆盖表述（如实记录无运行时断言）；
  测试补 durable entries 非空与 assistant 消息存在断言、text_delta("lo")
  与 message_end 载荷断言；events-inventory 行号按第八十二轮校准并注明
  后续需重新校准。
