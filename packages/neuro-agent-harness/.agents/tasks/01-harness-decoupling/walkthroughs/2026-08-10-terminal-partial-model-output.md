# 第三十一轮：Terminal partial model output

## 结论

ADR-0016 已在 standalone Core 范围接受。实现、focused/full/package 验证和两轮独立审查均已完成。

Model Runtime 现在可以把失败 turn 已生成、但不应视为完整 assistant message 的 text/thinking block 放入 `ModelTurnError.partial`。Harness 将它作为独立 terminal fact 保存：

```text
ModelTurnError({usage?, partial?})
  → Run Kernel adds the current turn
  → finishInvocation
     + one appendEntries operation
         ├─ harness.invocation.usage（非零时）
         └─ harness.invocation.partial
  → InvocationResult.partial
  → invocationPartial(snapshot, invocationId)
```

partial 不进入 `agent.message`、Provider retry 或 compaction summary。Tool call 不允许进入该事实。

## 为什么不用普通 assistant message

NeuroBook Task 07/139 与第三十轮 Pi-like tracer 证明：Provider 在 iterator throw、error event、`result()` reject 或 cooperative abort 时，可能已经生成 cumulative partial。

直接把它写成普通 `agent.message` 会改变三个合同：

- retry 会把截断正文重新发送给 Provider；
- compaction 会把截断正文当作已完成历史；
- 未闭合 Tool delta 会制造不存在的 pending Tool/approval。

因此本轮只保存审计与恢复事实，不把 partial 提升为正常 transcript。

## 公共合同

`ModelTurnError` 新增：

```ts
type ModelTurnPartialContent =
    | {type: "text"; text: string}
    | {type: "thinking"; thinking: string};

interface ModelTurnPartial {
    readonly content: readonly ModelTurnPartialContent[];
}
```

构造函数会 clone/freeze partial，要求至少一个 block 含非空文本，并拒绝 Tool block。

Harness 为事实增加自己的 turn：

```ts
interface InvocationPartial extends ModelTurnPartial {
    readonly turn: number;
}
```

根包导出 `invocationPartial(snapshot, invocationId)`；`InvocationResult.partial?` 的语义与 `persistence` 绑定：

- `confirmed`：当前 Snapshot 可以恢复同一 partial；
- `unknown`：只是本地 attempt observation，调用方必须回读 Snapshot。

## Red → green

第一层 public red：

```text
0 pass
1 fail
1 load error
Export named 'invocationPartial' not found
```

只加入类型和 projection、尚未接入 Run Kernel 后：

```text
1 pass
5 fail
19 expect() calls
```

当时只有非法 partial 构造/host forge 边界通过；以下行为仍丢失：

- failed terminal + JSONL restart；
- terminal Store failure 的本地 unknown；
- retry 隔离；
- cooperative abort；
- forced-abort winner。

接入 existing terminal pipeline 后，首层矩阵为：

```text
6 pass
0 fail
28 expect() calls
```

收尾阶段先追加三个公开行为门禁，现有实现直接通过：

1. compaction summary input 不含 durable partial；
2. strict legacy Store 不接受新 `finishInvocation` keys 时，partial + usage 仍可提交；
3. 最新 persisted partial 损坏时 projection fail closed，不静默回退到旧事实。

第一轮独立审查后再追加四个恢复/语义门禁：

1. partial turn 必须精确匹配 terminal `turnCount`；
2. completed Invocation 的 shape-valid partial 也要 fail closed；
3. active branch rewind 后，terminal partial 仍可按 Invocation ID 查询；
4. Store 已提交 terminal 但 acknowledgement 丢失时，`result()` 通过 Snapshot reread 恢复 confirmed partial。

其中前两个测试先红，证明 projection 只校验 JSON shape、不校验 Invocation 关系；实现随后在 internal admission 与 Snapshot projection 同时收紧。

最终文件结果：

```text
13 pass
0 fail
51 expect() calls
```

## 持久化与旧 Store 兼容

`finishInvocation` operation 没有增加字段。terminal plan 仍只有两种形状：

```text
[finishInvocation]
```

或：

```text
[
  finishInvocation,
  appendEntries([usage?, partial?])
]
```

usage 与 partial 在同一个 `appendEntries` operation，整个 plan 由 Store 的单次 commit 原子应用。保留 kind 只能由 Harness 的合法 terminal plan 写入；公开 `write()`、Profile 和 Tool 不能伪造。

`invocationPartial()` 对损坏 payload 抛 `SessionInvariantError`。它不把 malformed 最新事实隐藏成“没有 partial”或回退到较旧值。

## Retry 与 compaction 隔离

`projectSessionTranscript()` 只投影 canonical `agent.message`，因此 `sessionMessages()`、下一次 Provider request 和 compaction summary input 都忽略 `harness.invocation.partial`。

集成测试实际执行：

1. 第一次 Invocation 以 `"do not summarize"` partial 失败；
2. 第二次 Invocation 触发 compaction；
3. summary Adapter 与第二次 Model request 都不包含该文本。

这只证明内容隔离；Core 不定义 UI 应显示错误气泡、审计详情还是隐藏信息。

## Abort winner

### Cooperative abort

同一个 `AbortSignal` 触发 Provider 在 grace 内抛 `ModelTurnError({partial})`。Harness 在 owner 仍有效时将 partial 与 aborted terminal 同批提交，结果为 `aborted/confirmed`。

### Forced abort

grace 到期后 forced terminal 先赢时，attempt 与 write fence 已失效/封闭。迟到 Provider partial 不补写 Store，handle 的 durable winner 不包含 partial。

Core 不延长 grace 等待 partial，也不从 runtime delta 重组内容。

## 验证

相关 focused：

```text
bun test \
  tests/model-turn-partial.test.ts \
  tests/model-turn-error.test.ts \
  tests/invocation-result-durability.test.ts \
  tests/abort-boundary.test.ts \
  tests/harness.test.ts \
  tests/compaction.test.ts

57 pass
0 fail
259 expect() calls
```

全仓：

```text
bun run verify

171 pass
0 fail
856 expect() calls
Ran 171 tests across 37 files.
typecheck passed
build passed
```

包 smoke：

```text
bun run pack:smoke

exit code 0
prepack: 171 pass / 0 fail / 856 expect() calls
tarball: 101 files, 94.7 kB, 459.6 kB unpacked
```

Bun 与 Node ESM 隔离消费者都从 tarball 安装并实际检查：

- `new ModelTurnError(..., {partial})`；
- `InvocationResult.partial` 类型；
- `invocationPartial()` 根导出与空 Snapshot 行为。

`git diff --check` 通过；只有 Windows 工作区既有的 LF/CRLF 转换警告。

## 审查

第一轮独立只读审查范围包含完整 staged 源码、测试、ADR 和 package smoke，结论：

```text
No P0/P1
```

reviewer 提出三个 P2：

1. projection 只校验 payload shape，没有验证 terminal status；
2. internal admission 没有验证 partial turn 与 terminal turnCount 的关系；
3. unknown 事件与后续 Snapshot confirmed recovery 需要更明确的测试证据。

处理结果：

- projection 与 admission 都要求 failed/aborted 且 `partial.turn === turnCount`；
- reviewer 建议只扫描 active path 的部分未采用：`invocationPartial(snapshot, invocationId)` 与 `invocationUsage()` 一样按 Invocation ID 查询，rewind 不应删除历史 Invocation 事实；新增 rewind 回归固定该决定；
- terminal commit 未确认时不发布 `agent_end` 已由 `tests/turn-failure-events.test.ts` 覆盖，没有复制同一事件测试；
- 新增 commit 已落盘但 acknowledgement 丢失的 Store boundary，证明 `result()` 可通过 Snapshot reread 恢复 confirmed partial。

post-fix reviewer 独立复跑 partial 文件为 13/0/51，并返回：

```text
No P0/P1/P2
```

reviewer 的组合命令把 `bun run verify` 报为 script missing，不能作为全仓证据；主流程随后真实运行 `bun run verify` 与 `bun run pack:smoke`，分别得到 171/856 和 exit code 0。

## 未验证

- 真实 Pi package 与 Provider 的 partial 映射；
- NeuroBook 的 UI message status、branch/retry 和 reconnect projection；
- Cosmos 是否选择 Harness 而不是继续直接使用 `pi-ai`；
- HTTP/SSE DTO、跨进程 EventHub 与浏览器产品行为；
- provider thinking signature、cost/cache/quota metadata；
- partial continuation 或自动 Provider retry；
- 发布、部署和生产操作。

## 下一步

创建本地 checkpoint 后回到第三十二轮规划，重新比较 Workflow sidecar coverage、SSE Transport 和真实消费者 Adapter 的证据收益。
