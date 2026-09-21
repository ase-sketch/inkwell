# Pi Adapter Design

Core 不直接依赖 Pi。不同宿主可以暂时直接使用自己的 `pi-ai` 版本；把 Pi 类型放进公开 Interface 会重新制造消费者版本耦合。

当前初步方向是：Agent 使用较少的宿主可以先直接使用 `pi-ai`，不必为了接入 Harness 提前增加 Adapter。待 Harness 的 Profile、Session、Workflow 和 Transport 合同稳定后，再由宿主实现 `ModelRuntime`/`ContextCompactor` Adapter，逐步迁移而不改变 Core。

## Adapter shape

NeuroBook Adapter 实现两个独立 Interface：

- `ModelRuntime<TModelConfig>`：provider turn、stream event、Tool Call 和 usage。
- `ContextCompactor`：token estimate 与 summary generation。

两者可以在实现内部共享同一个 NeuroBook Models runtime、provider config 和 trace recorder，但 Core 只看到 provider-neutral JSON config。

建议 `TModelConfig` 使用类似结构：

```ts
type NeuroBookModelConfig = {
    modelKey: string;
    thinkingLevel?: string;
    timeoutMs?: number | null;
    requestOptions?: JsonObject;
    trace?: JsonObject;
};
```

不要把 Pi `Model`、`Models`、provider registry 或 SDK event 类型暴露到 Profile、Tool、Session entry 和 package root。

## Mapping responsibilities

| Core contract | Pi Adapter responsibility |
| --- | --- |
| AgentMessage | 转换 Pi Message/AssistantMessage/ToolResultMessage |
| ModelToolSpec | 转换 Pi Tool schema |
| ModelRuntimeEvent | 投影 Pi delta，清除 provider 私有字段 |
| AbortSignal | 贯通 Pi stream/complete cancellation |
| TokenUsage | 归一化 input/output/total |
| JsonValue modelConfig | 解析 NeuroBook EffectiveConfig 和 model key |
| ContextCompactor | 使用同一 Models runtime 完成 summary，并提供精确 token estimate |

## Packaging recommendation

Pi Adapter 不作为 Harness Core 的强制依赖。Cosmos、NeuroBook 和 llmlint 可以各自保留宿主侧 Adapter 和 provider 版本；只有在接口和兼容矩阵稳定后，才评估发布独立 `@notnotype/neuro-agent-harness-pi`。

Sidecar 不通过 Pi Adapter 或 Harness Core 提供。旁路 Agent、后续运行和跨步骤编排使用 Core 之上的 Workflow、Agent caller 和 Capability 组合。

未来若本库提供领域无关的 `read` 等常用 Tool 或 SSE Transport，应继续放在可选 Adapter/扩展层，不能把 NeuroBook 的路径、配置、鉴权或 UI 状态写入公开 Core 合同。
