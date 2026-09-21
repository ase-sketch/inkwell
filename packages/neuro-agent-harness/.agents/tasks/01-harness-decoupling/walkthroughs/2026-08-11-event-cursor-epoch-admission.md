# 第五十七轮：Event Cursor Epoch Admission

## 状态

public red→green、focused/full/package gate、production / API-domain / test-sensitivity 三路窄复审均已完成；ADR-0032 已在 standalone in-process EventHub cursor-admission 范围接受，第五十七轮收口。本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

1. NeuroBook `AgentJobEventHub` 的 `subscriptionReplay()` 明确拒绝 `after > 0` 且缺少 `eventEpoch` 的 cursor，并给当前订阅者一个 `snapshot_required` frame。
2. standalone `SessionEventHub.subscribe()` 原先使用 `cursor.eventEpoch === undefined || cursor.eventEpoch === this.eventEpoch`，所以 `{after: 1}` 会被当成当前 epoch，直接 replay。
3. Event epoch 是 Hub/process identity；同一个数字 seq 在不同 Hub 中没有连续性证明。缺 epoch 的非零 cursor 可能来自丢字段、跨 Hub 或 malformed HTTP/JS caller，应该回 Snapshot。
4. `after: 0` 是起始边界，不表示从另一个 stream 延续；空 cursor 表示从当前 tail 订阅，两者应保持兼容。

## 决定

- `SessionEventHub.subscribe()` 对 `cursor.after > 0 && cursor.eventEpoch === undefined` 设置 `connected.snapshotRequired: true`，不 replay。
- 不关闭 subscription、不 enqueue sentinel；`snapshotRequired` handshake 由 Host/SSE Adapter 决定何时关闭并读取 Snapshot。这一点由本轮测试绕道确认。
- 不改变 EventCursor 类型、Event envelope、durable Session shape、Transport API 或 reconnect generation。

ADR-0032 已接受：[Event Cursor Epoch Admission](../../../adr/0032-event-cursor-epoch-admission.md)。

## Public TDD 与实现

新增 `tests/event-cursor-epoch-admission.test.ts`：

1. 明确构造 `{after: 1} satisfies EventCursor`（省略 `eventEpoch`）→ `snapshotRequired: true`，不进入 replay；
2. `after: 0` 无 epoch 与空 cursor 保持合法。

生产改动仅为 `src/events.ts` 的 `missingEpoch` admission predicate：

```ts
const missingEpoch = cursor.eventEpoch === undefined
    && cursor.after !== undefined
    && cursor.after > 0;
```

随后现有 `epochMatches` / replay-expiry / cursor-ahead 逻辑继续工作。

## 审查与绕道

Red 阶段新测试观察到原实现 `snapshotRequired: false`，证明确有缺口。修复后 EventHub focused 为 `23/0/74`。

production 与 API/domain reviewer 首次均返回 `No P0/P1/P2 findings.`。

test-sensitivity reviewer 首次误读为“测试设置了 Hub epoch，所以没有测试缺 epoch”；事实是 cursor 字面量明确是 `{after: 1}`，Hub 构造器 epoch 不会写回 cursor。为消除歧义，测试改为 `const cursorWithoutEpoch = {after: 1} satisfies EventCursor` 并添加注释；post-fix 复审返回 `No P0/P1/P2 findings.`。

## 全仓门禁

```text
bun test tests/event-cursor-epoch-admission.test.ts tests/events.test.ts
23 pass / 0 fail / 74 assertions

bun run verify
338 pass / 0 fail / 1457 assertions
51 test files
typecheck + build passed

bun run pack:smoke
prepack: 338 / 0 / 1457
109 files
120.7 kB package / 571.9 kB unpacked
Bun + Node ESM consumers passed
```

## 当前未验证

真实 NeuroBook/Cosmos Adapter、HTTP/SSE query parser、自动 recovery backoff/connection generation、跨进程 EventHub、第三方 Store 与浏览器/产品 SSE 验收仍未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
