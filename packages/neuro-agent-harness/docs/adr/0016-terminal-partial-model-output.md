# ADR-0016: Terminal Partial Model Output Fact

- Status: Accepted (standalone Core scope)
- Date: 2026-08-10
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

NeuroBook Task 07/139 证明 provider error/abort 时，已生成正文可能只存在于 cumulative stream partial。第三十轮 consumer tracer 又证明宿主 Adapter 可以在 iterator throw 或 rejected `result()` 时保留最后 partial，并通过 ADR-0015 报告 usage。

standalone Core 仍不能直接持久化 partial：

- 普通 `agent.message` 会进入下一次 Provider context；
- 没有完成的 Tool call 会破坏 transcript 完整性；
- abort request、forced terminal 与迟到 Provider 存在 winner race；
- terminal Store commit 失败时不能把本地 partial 误报成 durable；
- NeuroBook 的 `messageStatus`、Pi `stopReason` 和 UI/branch DTO 不属于 Core。

ADR-0014/0015 已提供 terminal fact、result persistence、typed error、owner CAS 和 sealed terminal。可以在这些边界上新增一条不参与 transcript 的 partial fact。

## Decision

### 1. Provider-neutral partial type

Core 新增：

```ts
type ModelTurnPartialContent =
    | {type: "text"; text: string}
    | {type: "thinking"; thinking: string};

interface ModelTurnPartial {
    readonly content: readonly ModelTurnPartialContent[];
}
```

`ModelTurnErrorOptions.partial?: ModelTurnPartial` 表示当前失败 `runTurn()` 最后已冻结、可安全保留的 text/thinking 内容：

- 不允许 Tool call；
- 至少一个 block 含非空文本；
- 不携带 usage、stopReason、errorMessage、provider/model ID、signature、cost/cache 或原始 response；
- Adapter 负责从 Provider partial 中删除未闭合 Tool 与私有字段。

### 2. Terminal partial fact

Harness 在 failed/aborted terminal plan 中可追加：

```text
harness.invocation.partial
payload = {turn, content}
```

规则：

- partial、非零 terminal usage 与 `finishInvocation` 在同一 Store commit；
- 保持 `finishInvocation` operation keys 不变；
- usage 与 partial 共用一个 `appendEntries` operation；
- partial 只允许关联 failed/aborted Invocation，且 fact turn 必须等于 terminal `turnCount`；
- 该 kind 由 Harness 保留，公共 `write()`、Profile 和 Tool 不能伪造；
- completed/waiting terminal 不产生 partial fact；
- malformed fact 由 canonical projection fail closed。

根导出：

```ts
invocationPartial(snapshot, invocationId): InvocationPartial | undefined
```

`InvocationResult.partial?`：

- confirmed 时可由当前 Snapshot 恢复；
- unknown 时只表示本地 attempt observation，Snapshot 仍是唯一恢复真相源。

### 3. Transcript and retry isolation

`projectSessionTranscript()` 和 `sessionMessages()` 永远忽略 `harness.invocation.partial`。

因此：

- retry 可以保留该 fact 作为审计/分支节点，但 Provider request 不包含截断正文；
- `invocationPartial()` 按 Invocation ID 查询，不受 active branch rewind 影响；只有 transcript projection 跟随 active path；
- compaction 不把 partial 放入 summary input，也不把它当 pending Tool；
- Runtime delta 仍负责 live 展示，Snapshot helper 负责 reconnect 后的 durable projection；
- Core 不决定宿主把 partial 渲染成气泡、审计详情或隐藏信息。

### 4. Abort winner

- cooperative abort：Adapter 在 grace 内抛带 partial 的 `ModelTurnError`，owner 仍存在时，partial 与 aborted terminal 原子提交；
- forced abort：forced terminal 先赢时，迟到 partial 不突破 invalidated attempt/sealed fence；
- Core 不从 runtime delta 反推 partial，也不延长 grace 等待 Provider；
- terminal commit unknown 不产生 partial entry 或 terminal `agent_end`。

## Alternatives

- **写普通 assistant message + status**：拒绝。会先引入 Provider retry/compaction 语义，并复制 NeuroBook UI DTO。
- **只在 InvocationResult 返回 partial，不持久化**：不足。重启/SSE reconnect 后丢失，不能修复真实恢复缺口。
- **从 ModelRuntimeEvent 重组**：拒绝。Tool delta 没有 closure/sequence 完整性，event 是观察流。
- **允许 partial Tool call**：拒绝。会制造 pending approval/Tool 和坏历史。
- **forced abort 后补写 partial**：拒绝。会突破单一 durable terminal 与 sealed fence。

## Deliberate boundary

本 ADR 不定义：

- UI message status、错误气泡、branch switcher 或 retry 按钮；
- partial continuation、自动 Provider retry 或 prompt 注入；
- Pi thinking signature、cost/cache/provider metadata；
- HTTP/SSE DTO、跨进程 EventHub；
- NeuroBook/Cosmos 修改。

## Verification gate

- failed typed error 的 partial + usage + terminal 原子写入并穿过 JSONL restart；
- `InvocationResult.partial` 的 confirmed/unknown 语义；
- retry 和 compaction Provider input 不包含 partial；
- cooperative/forced abort winner；
- host write 不能伪造，非法/空/Tool partial fail closed；
- completed/interrupted、turn mismatch 和 malformed persisted fact fail closed，inactive branch 的 terminal Invocation 仍可按 ID 查询；
- terminal commit acknowledgement 丢失时，可由后续 Snapshot reread 恢复 confirmed partial；
- strict legacy `finishInvocation` shape 兼容；
- focused、`bun run verify`、`bun run pack:smoke`；
- 独立审查确认没有把 partial fact误报为完整 assistant、Provider continuation 或真实 NeuroBook UI acceptance。

## 2026-08-10 implementation and acceptance

- 新增 text/thinking-only `ModelTurnPartial`、带 Core turn 的 `InvocationPartial`、`ModelTurnError.partial`、`InvocationResult.partial` 和根导出 `invocationPartial()`。
- `harness.invocation.partial` 与非零 usage 共用一个 `appendEntries` operation，并和原形状 `finishInvocation` 在同一 Store commit 中提交；strict legacy Store 兼容测试通过。
- failed/aborted 与 exact terminal turn 同时在 internal admission 和 Snapshot projection 校验；completed/turn mismatch/malformed fact fail closed。查询保持 Invocation-addressed，rewind 后仍可恢复原 terminal partial。
- retry Provider input 与 compaction summary input 均排除 partial；cooperative abort 可在 grace 内提交，forced-abort winner 丢弃迟到 partial。
- 初始 public red 为 0 pass / 1 fail / 1 load error；只加入类型/projection 后为 1 pass / 5 fail / 19 expect calls。最终 partial 文件为 13 pass / 0 fail / 51 expect calls。
- 相关 focused 为 57 pass / 0 fail / 259 expect calls；`bun run verify` 为 171 pass / 0 fail / 856 expect calls，覆盖 37 个测试文件并通过 typecheck/build。
- `bun run pack:smoke` exit code 0；prepack 同为 171/856，101-file tarball 的 Bun/Node ESM consumer 均验证新导出与类型。
- 第一轮独立审查结论为 `No P0/P1`，提出 terminal status/turn、active branch 与 acknowledgement recovery 三组 P2。实现补齐 status/exact-turn 和 acknowledgement 回读；active branch 建议未采用，因为 helper 是 Invocation-addressed，并新增 rewind 回归固定该边界。post-fix 独立复审为 `No P0/P1/P2`。

因此本 ADR 在 standalone Core 的 terminal partial fact、恢复 projection、retry/compaction isolation 与 abort winner 范围接受。真实 Provider、NeuroBook/Cosmos、HTTP/SSE、UI/branch status、自动 continuation 和发布/生产仍未验收。
