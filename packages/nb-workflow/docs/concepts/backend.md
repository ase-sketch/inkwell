# Backend

Backend 是账本存放的地方。它决定 workflow 崩溃后能不能恢复。

## 接口

```ts
interface WorkflowBackend {
    readonly capabilities: BackendCapabilities;
    createRun(initial: WorkflowRunState): Promise<WorkflowRunState>;
    loadRun(runId: string): Promise<WorkflowRunState | null>;
    saveRun(next: WorkflowRunState, expectedRevision: number): Promise<WorkflowRunState>;
    listRuns(): Promise<readonly WorkflowRunState[]>;
}
```

引擎只依赖这五个方法。存数据库还是存内存，由实现决定。

## 内置实现

`MemoryWorkflowBackend` 把账本放在进程内 Map 里，适合测试和演示。它诚实
声明自己不支持进程重启、多 Worker 和 lease。

```ts
const backend = new MemoryWorkflowBackend();
const runner = new WorkflowRunner({}, {}, { backend });
```

## 版本号与并发安全

账本的每次写入带版本号（revision）。写入时传期望版本，版本对不上就拒绝：

```ts
await backend.saveRun(next, currentRevision);
```

这叫 compare-and-swap。两个进程同时写同一个 run，只有一个能成功，防止
旧进程覆盖新进程的结果。

## 不可变字段

run 的身份字段在创建后不能改：runId、定义引用、输入、扩展上下文、创建
时间。Backend 保存时会校验，改了就拒绝。身份变了，账本就对不上号。

## 真实产品怎么用

Cosmos 这类产品会实现数据库版 Backend（比如 Prisma + SQLite）。引擎对
实现没有要求，只要求行为符合接口合同。Worker、租约、重试、Outbox 这些
都在宿主一侧，不属于本包。

## 相关

- [Port 与宿主](/concepts/ports)
- [能力协商](/concepts/capability)
