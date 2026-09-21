# nb-workflow

一个会记账的脚本式 Workflow 引擎。工作流是普通的 `async` 函数，内核把每个 Activity 的输入、输出和身份写入 journal；进程中断后按 journal 重放，已完成的步骤不会重复执行。

本包的 canonical source 位于 NeuroBook monorepo 的 `packages/nb-workflow`。它是私有 workspace 包；源 checkout 只作为本次导入的只读输入，现有 Registry 版本不由 monorepo 改写。

## Core 示例

```ts
import {
    MemoryActivityExecutor,
    WorkflowRunner,
} from "@notnotype/nb-workflow";

const activities = new MemoryActivityExecutor();
activities.registerAction("math.double@1", ({ value }: { value: number }) => ({
    value: value * 2,
}));

const runner = new WorkflowRunner({}, {}, { activities });
const view = await runner.start({
    key: "hello",
    manifestHash: "sha256:hello-v1",
    run: async (workflow) => await workflow.callAction(
        "math.double@1",
        { value: 21 },
    ),
}, null);

console.log(view.result); // { value: 42 }
```

Activity 引用必须带显式版本。`MemoryActivityExecutor` 只用于测试和 demo，不提供进程重启、重试、lease 或外部副作用保证。

## Agent Extension

需要 Agent、Session 或 Workspace 能力时，通过 `SessionPort`、`AgentPort` 和 `WorkspacePort` 显式注入 `WorkflowRunner`。`MemorySessionStore`、`MockAgentPort` 和 `createMemoryWorkspace` 只提供确定性的测试实现；NeuroBook 主应用通过正式包入口接入自己的宿主适配器。

Runner 同时提供 `start`、非阻塞 `begin`、`resume`、`rerun`、`signal` 和 `cancel`。等待中的 run 取消后进入 `cancelled` 终态，不能再 resume 或 rerun；运行中的 Agent activity 收到同一 run 的 `AbortSignal`，迟到成功不会写入 journal。

## 目录与文档

- `src/`：Workflow 定义、Backend/Activity/Signal/Timer/Child/ValueStore 端口、Runner 和 Agent Extension。
- `test/`：journal 重放、等待恢复、并发、取消、公开 API 和宿主端口合同。
- `docs/`：概念、特性和 API 参考；它们属于本包，不复制到根 `docs/`。
- `demo/`：可运行的内存实现演示。

推荐阅读：

1. [故事线：每日 AI 简报](docs/guide/story.md)
2. [Activity、journal 与重放](docs/concepts/activity.md)
3. [等待与恢复](docs/features/waits.md)
4. [API 速查](docs/api.md)

## Monorepo 开发

```bash
bun install --frozen-lockfile
bun --cwd packages/nb-workflow run test
bun --cwd packages/nb-workflow run demo
```

本次收编不新增发布入口，也不在包内声明 build、pack 或自动发布合同。需要修改公开 API、宿主接口或主应用集成时，先在本包 Task 和根协调 Task 中记录边界。

## 当前边界

- Memory Backend 不支持进程重启、多 Worker、lease 或 durable host 语义。
- Kernel 不拥有 Job、Lease、Heartbeat、Retry、Outbox、数据库或远程 Worker 调度。
- Activity 失败不写入 journal；宿主必须按幂等 key 定义安全重试。
- `extractCfg` 需要可选的 TypeScript 依赖；缺失时返回明确错误，不影响主入口加载。
- Agent/Session 是显式兼容扩展，不声明替换 NeuroBook 自有 Harness。

## License

[MIT](LICENSE)
