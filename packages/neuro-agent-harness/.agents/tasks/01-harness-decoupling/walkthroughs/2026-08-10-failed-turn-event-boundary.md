# 第二十六轮：Failed turn runtime event boundary

## 结论

ADR-0013 已在 standalone Core runtime event 范围接受。

公开 `HarnessRuntimeEvent` 一直声明：

```text
turn_start(n)
turn_end(n, completed | failed)
```

但实现从未发布 `turn_end(failed)`。本轮补齐 active failure 的 turn closure，并在独立审查中顺带修复一个既有 terminal P1：durable terminal 未确认时不得伪造 `agent_end`。

最终语义：

```text
active in-turn failure
  → turn_end(failed)
  → failure settlement
  → durable finish confirmed
  → agent_end(failed)
```

`turn_end` 仍只是 runtime boundary；Snapshot 与 Invocation terminal record 才是恢复真相源。

## NeuroBook 对照与范围

NeuroBook Task 07/139 将以下概念分层：

- provider turn transaction；
- partial assistant ingest；
- Invocation lifecycle terminal；
- UI error/abort projection。

standalone 本轮只吸收第一层中可由现有 provider-neutral合同证明的事件排序。没有移植：

- Pi stream、`stopReason` 或 message status；
- partial assistant persistence；
- provider 错误正文或 UI projection；
- HTTP/SSE、跨进程 EventHub 或产品 DTO。

## Red

新建 `tests/turn-failure-events.test.ts` 后，Model throw 得到：

```text
received:
turn_start:1
agent_end:failed

expected:
turn_start:1
turn_end:1:failed
agent_end:failed
```

同一 red matrix 中两个边界从一开始就通过：

- `Profile.prepare()` 在首个 `turn_start` 前失败时没有 `turn_end`；
- 自然 turn 已发布 `turn_end(completed)` 后，`settleRun` 失败不会补第二个 failed turn。

这证明问题不是“所有失败都缺事件”，而是 Run Kernel 没有跟踪已经开始但尚未闭合的 turn。

## 最小实现

`run()` 增加 invocation-local `openTurn`：

- 发布 `turn_start` 后记录 turn number；
- natural stop、waiting 和普通 Tool turn 的 completed boundary 后清除；
- catch 发现 open turn 时，在 `settleFailure` 前发布一次 `turn_end(failed)` 并清除；
- abort / ownership loss 已 invalidated 的 attempt 仍由现有 `publishRuntime()` fence 丢弃普通 failed boundary。

新增 beforeTurn Hook failure，证明非 Model 失败也使用同一边界且不会调用 Model。

## 审查发现的 P1

第一次独立审查发现 ADR 的 durable terminal 声明与既有代码不一致：

```ts
publishTerminalEvent(..., attempt, durableTerminal);
```

最后一个参数实际是 `allowInvalidated`，不是“是否允许发布”。普通 failure 的 terminal Store commit 如果失败，`durableTerminal === false` 只会启用普通 attempt 检查；active attempt 仍可能发布 `agent_end(failed)`，而 Snapshot 继续是 running。

新增 `FailingTerminalStore` red 后精确复现：

```text
turn_start:1
turn_end:1:failed
agent_end:failed      ← 不应存在

Snapshot:
activeInvocationId = current invocation
status = running
```

修复为显式 gate：

```ts
if (durableTerminal) {
    publishTerminalEvent(..., true);
}
```

修后 failed turn boundary 可以存在，因为它是运行期事实；terminal Store 未确认时不发布 `agent_end`，Snapshot 留给重启后的 `reconcileInterrupted()`。

## 验证

Focused：

```text
bun test tests/turn-failure-events.test.ts

5 pass
0 fail
13 expect() calls
```

相关 ownership / abort / Event / persistence：

```text
bun test \
  tests/abort-boundary.test.ts \
  tests/invocation-ownership.test.ts \
  tests/events.test.ts \
  tests/persistence-events.test.ts

33 pass
0 fail
118 expect() calls
```

全仓：

```text
bun run verify

133 pass
0 fail
664 expect() calls
Ran 133 tests across 33 files.
```

`git diff --check` 通过。本轮没有公共类型、导出或 package 内容变化，因此没有重复运行 `bun run pack:smoke`。

## 独立审查

第一轮 reviewer 发现上述 durable terminal P1。修复与回归后，post-fix reviewer 未发现 P0/P1，并确认：

- terminal Store 未确认时不再伪造 `agent_end`；
- finish 成功和合作式 abort 仍发布 terminal；
- `allowInvalidated=true` 只在调用点已确认 durable terminal 后使用；
- open-turn、waiting、settlement、abort 与 ownership fence 未见回归；
- 当前 focused/full 证据足以接受 standalone scope。

Residual P2：`publishTerminalEvent(..., allowInvalidated)` 本身不验证 durable 状态，仍依赖内部调用点纪律；未来若继续重构 terminal pipeline，应把“durable 后发布”封装成更难误用的内部 API。

## 未验证

- 真实 provider、partial assistant 与 Pi stream throw；
- 真实 HTTP/SSE consumer 和断线恢复；
- 跨进程 EventHub；
- 真实 NeuroBook/Cosmos 接入；
- 浏览器、产品、发布和生产验收。

## 下一步

回到第二十七轮规划。优先继续审计 provider request/usage 与 partial assistant，但必须先解决消息状态、toolCall 剥离、abort grace/ownership 和恢复语义，不能把 NeuroBook `AssistantMessage` DTO 直接搬入 Core。
