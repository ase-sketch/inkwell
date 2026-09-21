# 第二十一轮：Prompt/continue lifecycle audit

## 结论

NeuroBook 与 standalone Harness 的差异不只是 Context sections 排序。NeuroBook 同时拥有“prompt 首轮尾置当前输入”和“continue 不写新输入”两项合同；standalone 当前只有“每次 invoke 都生成 user message”和“Context sections 放在完整 transcript 之后”的合同。

只把最后一条 user message 移到 Context 后面会在 steer、Tool continuation、approval resume 和 compaction 下产生错误。当前没有足够证据定义窄且兼容的 API，因此本轮不建立 ADR、不修改生产代码。

## 证据边界

已阅读并追到真实调用链：

- NeuroBook `reference/agent/context.md` 与 `reference/agent/runtime-hooks.md`；
- `server/agent/profiles/prompt-order.ts` 及其测试；
- NeuroBook `prepareRun()` 对 Appending、pending user message、`appendingCount` 与 `currentUserInputCount` 的实际使用；
- standalone `run()`、`drainSteers()`、`compactIfNeeded()`、`composeContextMessages()` 和 approval resume 测试。

没有修改或运行 NeuroBook；结论来自本地文档、代码和测试。

## 行为矩阵

| 场景 | NeuroBook | Standalone | 不能直接等价的原因 |
| --- | --- | --- | --- |
| Prompt 首轮 | 先写 History/Appending，再写 pending user；provider 重组为 `H → M → A → U` | user 进入 live transcript，随后 compose 为 `H → transcript(U) → M → MA → A` | 当前输入属于 transcript，Core 没有独立分区 |
| Continue 无新输入 | `pendingUserMessage=null`，`currentUserInputCount=0`，不写 user entry | 没有对应 invoke mode；`invoke()` 总会生成 user message | 排序选项不能补出“没有输入”语义 |
| 首轮前 steer | steer 进入当前 RunFrame，具体顺序由运行态处理 | `drainSteers()` 在 compose 前把 steer push 到 messages | “最后一条 user”可能是 steer，不是 invocation input |
| Tool 后续 turn | 初始 `H → M → A → U` 已成为 RunFrame 前缀，assistant/toolResult 继续追加 | ContextProvider 每 turn 重新解析，并放在完整 live messages 后 | 静态首轮 context 与 per-turn dynamic context 生命周期不同 |
| Approval resume | resolution continue 没有 pending user input | `resume()` 重建 PreparedRun，但不新增 user message | 这是已有独立路径，不应被新的 prompt option 改写 |
| 首轮 compaction | NeuroBook 由 RunFrame/TurnSnapshot pipeline 管理 | standalone 在 model call 前可能把 messages 替换为 durable compaction projection | 当前输入可能被保留、移动或进入 summary，数组位置不稳定 |

`M` 表示 model-only Context，`MA` 表示 modelContextAppending，`A` 表示 Appending，`U` 表示当前输入。

## 临时 tracer bullet

临时测试只使用公开 `defineProfile()`、`invoke()` 和 Scripted Model request，期望：

```text
HISTORY → MODEL_CONTEXT → APPENDING → CURRENT_INPUT
```

focused red：

```text
Expected:
  HISTORY, MODEL_CONTEXT, APPENDING, CURRENT_INPUT

Received:
  HISTORY, CURRENT_INPUT, MODEL_CONTEXT, APPENDING

0 pass / 1 fail / 2 expect calls
```

这证明首轮差异真实存在，但没有回答 continue、steer 或 compaction。测试随后删除，避免把尚未决定的新语义提交成永久合同。

## 方案筛选

### 仅改变 `composeContextMessages()`

拒绝。它只收到完整 transcript，不知道哪条是本次 invocation input，也会破坏 ADR-0003/0010 的兼容默认。

### 移动最后一条 user message

拒绝。最后一条 user 可能是 steer、旧 follow-up、system-shaped context contribution，或 compaction 后根本不存在。

### `PreparedRun` 增加 placement flag

暂缓。placement 不能表达无输入 continue；如果只覆盖 prompt 首轮，还必须定义 compaction 与 pre-model steer 的 tail 范围。

### 显式 Invocation input mode

保留为后续候选。一个完整 ADR 至少要同时说明：

- `prompt` 与 `continue` 是否写 durable input；
- 默认值如何保持现有消费者兼容；
- Profile `userMessage` override 与 payload 的关系；
- 首轮 current-input tail 如何识别；
- pre-model steer、retry/follow-up、approval resume 和 compaction 行为；
- message identity、caller provenance 与旧 JSONL 恢复。

## 收尾

本轮只新增 Task 与 walkthrough，没有保留测试或源码变更。本轮重新验证：

- `bun run verify`：122 pass / 0 fail / 610 expect calls，包含 typecheck、build 和 32 个测试文件；
- `git diff --check`：docs checkpoint 前执行；
- 上一轮 npm tarball、Bun consumer、Node ESM TypeScript consumer 已通过。

本轮未重复 package smoke。集成审查没有发现矩阵中的 scope overclaim。下一轮转向 ADR-0007 standalone ownership fence acceptance；Prompt/continue API 等出现更完整、可测试的 input-mode 方案后再恢复。
