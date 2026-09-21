# Agent Extension

Agent Extension 是可选的能力包，让 workflow 里能开会话、调模型。核心
workflow 不依赖它，不注入就不用。

## 核心和扩展的分界

核心的 `WorkflowContext` 只有这些：callAction、query、now、random、
checkpoint、emit、waitForSignal、sleep、startChildWorkflow、map、all、
ask、log、progress、chart。

需要 Agent 能力时用 `AgentWorkflowContext`，它多了四组：

```text
agents    创建会话、按 tag 复用、调模型
sessions  打开已有会话
workspace 读项目文件
caller    拿到发起方会话
```

## 注入方式

Runner 构造时传入 `SessionPort` 和 `AgentPort`：

```ts
const sessions = new MemorySessionStore();
const agents = new MockAgentPort(sessions);
const runner = new WorkflowRunner(
    { sessions, agents },
    {},
    {},
);
```

不传这两个 Port，workflow 里调用 `agents.*` 会得到明确错误，而不是静默
失败。

## 会话是怎么记进账本的

会话操作也是 Activity，会进 journal。重放时引擎查账本，不会重复创建
会话或重复调用模型。

几个细节：

- `agents.create(profile, { ephemeral: true })` 创建的临时会话，在 run
  的任何终态（完成、失败、取消）都会归档。
- `agents.acquire` 按 profileKey 和 tag 复用会话，重复并发调用只创建一个。
- 调用方会话和默认模型存在 run 的扩展上下文里，跨 Runner 恢复。

## 相关

- [类型与校验](/features/types)
- [等待与恢复](/features/waits)
