# API 速查

完整类型定义以发布的 `dist/index.d.ts` 为准。这里列常用入口。

## Runner

```text
new WorkflowRunner(ports?, env?, options?)
  .start(definition, args, options?)  -> Promise<RunView>
  .begin(definition, args, options?)  -> { runId, done }
  .resume(runId, answers)             -> Promise<RunView>
  .rerun(runId)                       -> Promise<RunView>
  .cancel(runId)                      -> Promise<RunView>
  .signal(runId, reference, value, options?) -> Promise<RunView>
  .view(runId) / .loadView(runId)
  .list() / .listStored()
```

options 包括 backend、activities、definitions、values、signals、timers、
children、events、clock、random、defaultConcurrency、maxConcurrency、
inlineValueLimitBytes。

## Workflow 上下文

Core（`WorkflowContext`）：

```text
callAction / query / now / random / isCancelled / getBudget
checkpoint / emit / waitForSignal / sleep / startChildWorkflow
map / all / ask / log / progress / chart
```

Agent（`AgentWorkflowContext`）额外提供：

```text
agents.create / acquire / invoke / profile
sessions.open
workspace.read
caller
```

## 定义

```ts
type WorkflowDefinition = {
    key: string;
    version?: string;
    manifestHash?: string;
    requires?: BackendRequirements;
    phases?: { key: string; title: string }[];
    run: (workflow, args) => Promise<result>;
};
```

`key` 和 `version` 合起来是定义身份，manifestHash 绑定具体实现。重放时
定义必须和账本记录的一致。

## 常用类型

```text
RunView / WorkflowRunState / ActivityRecord / ActivityIdentity
WorkflowValue / ValueRef / AskSpec / PendingAsk / PendingWait
BackendCapabilities / BackendRequirements
WorkflowEventEnvelope / RunStatus
```

## 错误类型

```text
WorkflowPersistenceError    持久化失败，不是业务失败
WorkflowBackendConflictError 版本号冲突
WorkflowBackendCapabilityError 能力不足
WorkflowDefinitionConflictError / NotFoundError
ActivityDefinitionNotFoundError / ExecutionConflictError
SignalConflictError / TimerConflictError / ChildWorkflowConflictError
NonJsonValueError
```

全部从顶层导出，可以用 instanceof 区分基础设施错误和业务失败。

## 教学演示

```bash
bun run demo:guide
```
