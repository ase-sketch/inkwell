# file-snapshot-cache benchmark baseline

生成时间：2026-07-24T13:26:38.415Z

> 本报告只测独立 cache 编排与资源生命周期，不代表真实 WorkspaceFileNode 文件扫描延迟。

## Environment

- OS: win32 10.0.26200 (x64)
- CPU: 13th Gen Intel(R) Core(TM) i7-13700K, 24 logical CPUs
- Memory: 31.77 GiB
- Node: v24.3.0
- Bun: 1.3.14
- Revision: cdd223f18ed72f34cd78c538fadc5eff27c77eff
- Package source SHA-256: 553d4c53c0e84bb0ccbfa8140427ee2cf90014a4c82a16bc18afe5fd31e06b6e
- Filesystem: NTFS, path <repo>\packages\file-snapshot-cache
- Seed: 114202607

## Node scale

| Nodes | Cold p50 | Cold p95 | Cold p99 | Warm p50 | Warm p95 | Warm p99 | Heap delta |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.008 ms | 0.046 ms | 0.102 ms | 0.001 ms | 0.002 ms | 0.006 ms | 0 B |
| 10,000 | 0.006 ms | 0.027 ms | 0.029 ms | 0.000 ms | 0.002 ms | 0.004 ms | 0 B |
| 50,000 | 0.003 ms | 0.011 ms | 0.024 ms | 0.000 ms | 0.001 ms | 0.003 ms | 0 B |

## Concurrency and events

- 100 concurrent cold readers: build count 1, total 1.748 ms
- 1k event burst: build count 1, dropped 900, total 6.012 ms

## Memory and resources

- 100 rebuilds / 10k fresh nodes: heap 22.82 MiB -> 22.82 MiB, slope 0 B/cycle, R2 0.0000
- RSS: 113.39 MiB -> 112.91 MiB, slope -7.50 KiB/cycle, R2 0.7948
- 100 key closeAll: entries 0, debounce timers 0, idle timers 0, watchers 0, subscribers 0
- Node active resources: 0 -> 0

## Structural gates

| Gate | Result |
|---|---|
| concurrentBuildDeduplicated | 通过 |
| eventBurstBounded | 通过 |
| closeAllReleasedOwnedResources | 通过 |
| warmReadsAvoidBuilder | 通过 |
| retainedHeap | 不可用 |
| retainedRss | 通过 |

## Notes

- synthetic benchmark 只测 cache 编排和生命周期，不代表真实 WorkspaceFileNode 文件扫描延迟。
- 无生产消费者的 projection/store Interface 已删除；本报告只覆盖 File Index 实际需要的 snapshot 行为。
- heap/RSS 风险探测要求高拟合度的正向线性增长；RSS 阈值只用于识别明显风险，不是产品延迟或内存预算。
- 报告不运行 git status；repository revision 与 package source SHA-256 共同标识本次输入，后者覆盖未提交 package 内容。
