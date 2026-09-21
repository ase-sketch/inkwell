# 第二十轮：Context lifecycle adapter-only spike

## 结论

现有 `PreparedRun.context`、`prepareWrites`、ContextProvider、Session Snapshot 与 JSONL restart 足以让宿主 Adapter 表达稳定 History、Invocation-scoped Appending 和 request-only ModelContext。唯一需要补入 Core 的窄缺口是：公开包此前没有 canonical `agent.message` draft 构造器，消费者必须复制私有 payload envelope。

本轮新增 `createAgentMessageEntryDraft()`，没有把 NeuroBook `HistorySet`、`AppendingSet`、TSX DSL、Reminder/Watch、settlement 或 CurrentUserInput 顺序下沉到 Core。ADR-0012 已在 standalone Core 范围内接受。

## 公开测试 seam

测试只使用：

- `defineProfile()`、`PreparedRun.context`、`prepareWrites`、hook `writePlans` 和 ContextProvider；
- `NeuroAgentHarness.invoke()` / `resume()` / `snapshot()`；
- Memory/JSONL Store Adapter；
- `SessionCommitObserver` 和根导出的 entry helper/codec。

测试没有调用 Harness 私有方法，没有让 Profile/Tool 直接操作 Store，也没有修改 NeuroBook 或 Cosmos。

## Red → green 记录

### 1. Canonical durable message draft

第一条测试从包根导入 `createAgentMessageEntryDraft`，focused red 为：

```text
SyntaxError: Export named 'createAgentMessageEntryDraft' not found
0 pass / 1 fail
```

最小实现：

- `AgentMessageEntryDraftOptions` 要求显式 `turn`，可选 `invocationId`、`parentId` 和 `messageIdentity`；
- helper 固定 `kind: "agent.message"` 并复用内部 canonical serializer；
- 非负整数以外的 turn 在构造 write plan 前失败；
- 包根只导出 helper 与 options type，没有公开内部 transcript projector。

### 2. Memory History/Appending lifecycle

测试 Adapter 使用 typed marker codec，并把 marker 与 message draft 放在同一个 `appendEntries` operation：

- stable History marker 不存在时，同时返回 `context.history` 和 durable contribution；后续 Invocation 只从 transcript 恢复，不重复写；
- Appending marker 以 Invocation ID 为 key，每个 Invocation 各写一次；
- commit observer 证明第一次 prepare commit 同时包含 `marker → message → marker → message`，第二次包含 `marker → message`，并且 `expectedActiveInvocationId` 分别等于当前 Invocation；
- 两次 model request 与最终 Snapshot 中，各 contribution 都恰好出现一次。

### 3. JSONL waiting/restart lifecycle

初版测试 Adapter 每次 `Profile.prepare()` 都返回 Appending contribution。waiting 后销毁 Harness，再由新 Harness `resume()` 时，red 为：

```text
Expected: 1
Received: 2
```

这不是 Core 自动去重职责。Adapter 改为在 Snapshot 中读取同一 Invocation marker 后：

- resume 不再返回重复 prepare write/context；
- JSONL 中 marker 与 message 各一份；
- ContextProvider 首次生成的 `model-only:v<old>` 不在 Session 中；
- approval resolution 后 Provider 读取更新的 Snapshot，只生成 `model-only:v<new>`。

### 4. beforeTurn → ContextProvider 顺序

`beforeTurn` 先用 write plan 写入本轮 fact；ContextProvider 随后读取的 Snapshot version 比 hook 观察值增加 1，并把该 fact 放入当前 model request。现有 Core 合同足够，本 slice 不需要生产代码变化。

## 变更

- 新增根导出 `createAgentMessageEntryDraft()` 与 `AgentMessageEntryDraftOptions`。
- 新增 `tests/context-lifecycle.test.ts`，覆盖 Memory、JSONL、approval restart、provider-only context、commit owner 与 latest Snapshot。
- pack smoke 的 Bun 和 Node ESM consumers 从 tarball 根导入 helper；Node 直接编译 options type。
- README、CONTEXT、ADR index、Task 与 ADR-0012 同步。

## 验证

- focused `bun test tests/context-lifecycle.test.ts`：4 pass / 0 fail / 39 expect calls。
- `bun run verify`：122 pass / 0 fail / 610 expect calls；typecheck、build、32 个测试文件。
- `bun run pack:smoke`：通过；prepack 同为 122/610，npm tarball、Bun runtime consumer、Node ESM TypeScript consumer 通过。
- `git diff --check`：通过，仅有 Windows LF/CRLF 转换警告。

## 审查

独立只读 reviewer 未发现 P0/P1：

- helper 只构造 canonical draft，不绕过 Harness commit owner fence；
- branch append 仍由既有 reducer/Store 合同处理；
- Memory/JSONL tests 没有把 Adapter 去重伪装成 Core 自动语义；
- 文档没有把 NeuroBook lifecycle 或产品状态下沉。

Residual：

- helper 不验证传入 `invocationId` 是否属于目标 Session，也不验证 `parentId` 是否属于当前 branch；调用方仍必须遵守 `SessionWritePlan` 和 Store 合同。
- 独立 reviewer 的 read-only sandbox 无法执行 Bun；主集成流程已独立完成 focused、全仓和最终 package smoke。

## 未验证与下一步

仍未验证：

- 真实 NeuroBook/Cosmos Adapter；
- NeuroBook CurrentUserInput 尾置顺序；
- History/Appending settlement、retry logical key、Reminder/Watch 和 Profile runtime state；
- 真实 provider/tool、第三方 Store、跨进程 EventHub、HTTP/SSE 和产品验收。

下一轮先做 Prompt/continue lifecycle 只读行为矩阵，比较 standalone 与 NeuroBook 的当前用户输入位置；在建立独立 ADR 前不改变已接受 assembler。
