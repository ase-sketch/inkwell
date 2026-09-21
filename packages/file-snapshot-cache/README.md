# @notnotype/file-snapshot-cache

与业务领域无关的完整文件快照缓存内核。调用方负责构造完整 typed node snapshot；本包负责并发构建去重、变更世代、稳定提交、watcher 生命周期、订阅和空闲回收。

本包不认识 NeuroBook、Project Workspace、HTTP、SQLite 或任何具体文件节点结构。

## Public API

```typescript
import {SnapshotCache} from "@notnotype/file-snapshot-cache";

const cache = new SnapshotCache({
    keyId: (key: string) => key,
    builder: {
        build: async ({key, signal}) => scanCompleteNodes(key, signal),
    },
});

const activation = cache.activate("project-key", {
    onRawEvents: (batch) => history.reconcile(batch.events, batch.droppedEventCount),
});
await activation.ready;
try {
    const snapshot = await cache.read("project-key");
    await cache.mutate("project-key", () => writeChapter());
} finally {
    await activation.close();
}
```

主要入口：

- `read(key, {staleWhileRevalidate})`：读取完整内存 snapshot，同 key 并发共享一个 build；one-shot read 不打开 watcher。
- `mutate(key, operation)`：与同 key 的完整 snapshot build 串行执行源数据 mutation；成功或失败后都推进 generation，不同 key 仍可并行。
- `activate(key, {onRawEvents})`：同步返回绑定当前 entry incarnation 的 `{ready, close}`；首次 activation 原子绑定 raw event callback、显式打开 watcher并持有 entry。
- `invalidate(key, event)`：推进 generation，事件按 `eventId` 有界归并并经过 debounce 重建。
- `subscribe(key, subscriber)`：只订阅成功的稳定 commit；raw event 在 rebuild 前单独投递，builder 失败不会吞掉 History 对账机会。
- `close(key)` / `closeAll()`：取消排队 mutation、debounce/idle timer、watcher与builder，等待活动 mutation settle并隔离 late result；watcher关闭失败时保留精确handle与closed entry，后续调用重试同一资源。
- `diagnostics()`：返回 entry/build/debounce/idle/watcher/subscriber 的有界资源状态；每个entry只保留最近一次build失败的时间与最多2000字符错误文本，并累计失败轮次。

## Commands

```powershell
bun run --cwd packages/file-snapshot-cache typecheck
bun run --cwd packages/file-snapshot-cache test
bun run --cwd packages/file-snapshot-cache benchmark
bun run --cwd packages/file-snapshot-cache benchmark:bun
```

benchmark 会把 Node 与 Bun 的可复现 JSON/Markdown 报告分别写入 `benchmarks/results/`。它只测缓存编排和资源生命周期，不代表调用方完整文件扫描器的耗时。

## Boundary

- builder 负责构造完整 typed nodes/issues；package 不扫描或解释文件。
- builder 返回的 nodes/issues 视为把数组所有权移交给 cache；builder 不应在返回后继续修改数组，`FileSnapshot` 以 readonly 数组暴露给消费者。
- 完整 snapshot 仅驻留内存；package 不提供磁盘 projection/store。
- watcher 与 artifact ignore 规则由调用方 adapter 提供。
- watcher 不由 `read()`或`subscribe()`隐式打开；长期 owner 必须显式持有 activation，并等待 `ready` 成功。
- 无 activation、subscriber、build、debounce或待处理事件的 entry 默认空闲 5 秒后回收；one-shot read不形成长期 owner。
- activation handle绑定创建它的精确 entry incarnation；旧 handle迟到 `close()`不得关闭同 key重开的新 entry。
- raw event与stable commit使用两套有界账本：raw batch在rebuild前至多投递一次，stable commit仍保留全部待提交事件直至构建成功。
- warm-up、后台rebuild与显式`read()`共用同一个`buildPromise`。失败会保留dirty并记录diagnostics，Promise settle后清空；下一批真实消费者只建立并共享一个重试Promise，不另设retry状态机。
- 同 key builder与`mutate()`共用公平的单槽 gate；mutation settle后统一刷新snapshot。调用方不得恢复“先写入、再手动invalidate”的两段式协议。
- watcher adapter 必须响应 `open` 收到的 `AbortSignal`，并提供可确定结束、可安全重试的 `close()`；late handle 会由 cache 立即关闭。
- `close` / `closeAll` 会终止 package 自有 timer、subscriber、watcher、排队 mutation 与可取消 build，等待已开始的 mutation settle；忽略 `AbortSignal` 的 builder late result 会被隔离。
- watcher `close()`拒绝时，entry保持closed并拒绝新消费者，但不会丢失handle或允许同key重开；同一activation、`close(key)`或失败后的`closeAll()`可以重试。只有关闭成功后才删除entry，`closeAll()`成功前cache始终保持closed。
