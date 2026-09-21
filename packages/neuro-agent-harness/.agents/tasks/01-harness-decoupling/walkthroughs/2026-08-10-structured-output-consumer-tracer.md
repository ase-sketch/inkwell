# 第二十五轮：Invocation-scoped structured output consumer tracer

## 结论

NeuroBook `b1bc9feb` 修复的是产品侧动态 `report_result` binding 漏判，不是 standalone Run Kernel 缺少同名内置 Tool。

现有公开合同已经能表达 per-Session / per-Invocation 动态结构化结果：

```text
durable Session initial
  → Profile.prepare(initial)
  → dynamic Tool ValueSchema
  → provider-visible parameters
  → runtime parse
      ├─ invalid: durable isError ToolResult → next model turn
      └─ valid: ToolResult.output + terminate
          → Invocation output
          → JSONL restart recovery
```

因此本轮没有新增 `PreparedRun.output`、Core completion Tool factory、ADR 或生产代码。`report_result` 名称、TypeBox、NeuroBook binding DTO、Workflow result projection 和 completion policy 继续由宿主组合。

## NeuroBook 行为映射

`b1bc9feb` 的关键行为是：

- dynamic 或显式空 `outputSchema` 必须让 provider-visible Tool 参数要求 `data`；
- 缺失或无效 `data` 形成 Tool error，不静默完成，模型可在下一 turn 修正；
- 合法结构化 `data` 成为调用结果；
- 未声明 output schema 的 adhoc 调用仍允许 text-only。

standalone 对应 seam：

- `Profile.prepare(context.initial)` 每次 Invocation 从持久化 initial 构造 Tool；
- `ValueSchema.jsonSchema` 经 `modelToolSpec()` 进入模型请求；
- `ValueSchema.parse()` 在 Tool 执行前校验；
- `executeTool()` 把 parser 异常转换为 `isError: true`；
- ToolResult message 先写入 durable transcript，下一 model turn 才能看到；
- 合法 Tool 返回 `output` 和 `terminate`，Harness 以 `tool_terminate` 完成并持久化 Invocation output。

静态 `Profile.output` 仍负责 Profile 级终态校验。动态 Tool 已拥有 Invocation 级 schema 时，再给 `PreparedRun` 增加第二个 output parser 会制造重复 ownership；本轮没有证据支持这种扩张。

## Cosmos consumer tracer

`tests/cosmos-consumer-compatibility.test.ts` 新增一个只使用公开 API 的 fixture：

1. 同一个 Profile 创建两个 Session；
2. initial 分别保存 Action version 和 `answer` / `score` output contract；
3. `prepare()` 为每个 Invocation 生成不同的 `complete_action` schema；
4. `answer` Invocation 首轮故意遗漏 `data`；
5. 下一请求确认看到了 durable error ToolResult，再提交合法 `{answer: ...}`；
6. `score` Invocation 确认 provider schema 已切换为 number 字段，并提交 `{score: 7}`；
7. 新 Harness + 新 JSONL Store 实例恢复两份 Invocation output，并保留前一轮 Tool error entry。

这证明结构化结果可以成为 Harness Invocation output，同时没有让 Harness 持有 Cosmos 的 ActionDefinition、Run、Step、Job、lease、预算、checkpoint 或领域写入。

## 绕道

第一轮 focused red 不是 Core 缺口：新增 tracer 误用了该文件中不存在的 `assistant()` fixture，Model callback 抛出 `ReferenceError`，Harness 正常把 Invocation 收口为 failed。补齐测试 Adapter 后，同一行为通过。

第一次外部只读 reviewer 在五分钟内没有返回，遗留进程已按精确 PID 清理；第二次诊断调用因忽略用户配置而落到失效 API-key 路径并返回 401。确认本机 ChatGPT 登录态后，使用禁用插件的 ephemeral/read-only 调用完成独立 patch 审查。以上尝试均未修改工作树。

## 验证

Focused：

```text
bun test tests/cosmos-consumer-compatibility.test.ts

2 pass
0 fail
35 expect() calls
```

Typecheck：

```text
bun run typecheck
```

通过。

全仓：

```text
bun run verify

128 pass
0 fail
651 expect() calls
Ran 128 tests across 32 files.
```

`git diff --check` 通过。本轮没有公共导出、构建产物或 package consumer 变化，因此没有重复运行 `bun run pack:smoke`。

## 独立审查

最终 reviewer 未发现 P0/P1，并确认：

- dynamic schema 确实由 `prepare(initial)` 进入 provider Tool spec；
- parser error 会成为可继续的 durable Tool error；
- 合法 `output + terminate` 经 settle/finish 持久化并可由 JSONL 恢复；
- 当前证据不支持新增 `PreparedRun.output` 或 Core completion factory；
- Cosmos durable truth 没有下沉。

Reviewer 标记的 P2/residual：

- 真实 provider schema 传输、真实 Cosmos/NeuroBook 接入和 HTTP/SSE 未验证；
- 自然停止仍可用 assistant text 完成，Core 不强制 completion Tool；
- 连续 Tool error 达到 `maxConsecutiveToolErrorTurns` 时仍按现有保护策略失败。

## 下一步

回到 bug-fix parity 规划。下一轮先窄审 NeuroBook 的 turn failure、provider request/usage 与 compaction/recovery 修复；只有能形成 provider-neutral、可复现的 standalone red 时才修改 Core。
