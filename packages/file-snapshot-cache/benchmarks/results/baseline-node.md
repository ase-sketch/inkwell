# file-snapshot-cache benchmark baseline

生成时间：2026-07-24T13:26:23.630Z

> 本报告只测独立 cache 编排与资源生命周期，不代表真实 WorkspaceFileNode 文件扫描延迟。

## Environment

- OS: win32 10.0.26200 (x64)
- CPU: 13th Gen Intel(R) Core(TM) i7-13700K, 24 logical CPUs
- Memory: 31.77 GiB
- Node: v24.13.0
- Bun: not used for this run
- Revision: cdd223f18ed72f34cd78c538fadc5eff27c77eff
- Package source SHA-256: 553d4c53c0e84bb0ccbfa8140427ee2cf90014a4c82a16bc18afe5fd31e06b6e
- Filesystem: NTFS, path <repo>\packages\file-snapshot-cache
- Seed: 114202607

## Node scale

| Nodes | Cold p50 | Cold p95 | Cold p99 | Warm p50 | Warm p95 | Warm p99 | Heap delta |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.017 ms | 0.214 ms | 0.235 ms | 0.002 ms | 0.005 ms | 0.028 ms | 476.13 KiB |
| 10,000 | 0.012 ms | 0.018 ms | 0.062 ms | 0.003 ms | 0.003 ms | 0.005 ms | 4.22 MiB |
| 50,000 | 0.012 ms | 0.067 ms | 0.091 ms | 0.003 ms | 0.003 ms | 0.006 ms | 21.98 MiB |

## Concurrency and events

- 100 concurrent cold readers: build count 1, total 0.520 ms
- 1k event burst: build count 1, dropped 900, total 7.580 ms

## Memory and resources

- 100 rebuilds / 10k fresh nodes: heap 12.35 MiB -> 12.36 MiB, slope 69 B/cycle, R2 0.6008
- RSS: 161.51 MiB -> 204.66 MiB, slope 167.48 KiB/cycle, R2 0.2636
- 100 key closeAll: entries 0, debounce timers 0, idle timers 0, watchers 0, subscribers 0
- Node active resources: 2 -> 2

## Structural gates

| Gate | Result |
|---|---|
| concurrentBuildDeduplicated | 通过 |
| eventBurstBounded | 通过 |
| closeAllReleasedOwnedResources | 通过 |
| warmReadsAvoidBuilder | 通过 |
| retainedHeap | 通过 |
| retainedRss | 通过 |

## Notes

- synthetic benchmark 只测 cache 编排和生命周期，不代表真实 WorkspaceFileNode 文件扫描延迟。
- 无生产消费者的 projection/store Interface 已删除；本报告只覆盖 File Index 实际需要的 snapshot 行为。
- heap/RSS 风险探测要求高拟合度的正向线性增长；RSS 阈值只用于识别明显风险，不是产品延迟或内存预算。
- 报告不运行 git status；repository revision 与 package source SHA-256 共同标识本次输入，后者覆盖未提交 package 内容。
