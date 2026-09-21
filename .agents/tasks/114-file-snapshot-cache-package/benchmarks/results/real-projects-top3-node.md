# NeuroBook 真实 Project Workspace 性能基线

生成时间：2026-07-24T14:22:56.481Z

> 本报告只读真实 Project Workspace。cache 阶段使用独立 package adapter，不代表已经接入 /api/projects。首轮是进程首次扫描，但 OS 文件缓存未清空，因此不是物理冷盘基准。

## Environment

- OS: win32 10.0.26200 (x64)
- CPU: 13th Gen Intel(R) Core(TM) i7-13700K, 24 logical CPUs
- Memory: 31.77GiB
- Node: v24.13.0
- Filesystem: NTFS
- Workspace Root: <repo>\workspace
- Source SHA-256: 893de3de576ba0ae48973c0fcd0f92736d514cd60f8ff72a6dba92b6c8d38b4d
- Projects: 3/35
- Rebuild cycles: 10

## Sequential full scan

Wall: 35816.77ms

| Project | Scan | Nodes | Files | Markdown | Bytes | Heap delta | Derive p95 | Error |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| workspace/ming-ding-zhi-shi | 20785.57ms | 1444 | 944 | 904 | 26.80MiB | 15.50MiB | 0.06ms |  |
| workspace/ming-ding-zhi-shi-2 | 11811.40ms | 1615 | 1086 | 1018 | 162.86MiB | 18.42MiB | 0.13ms |  |
| workspace/gong-li-yu-lu-xue-yuan | 3014.46ms | 947 | 874 | 789 | 50.27MiB | 3.70MiB | 0.04ms |  |

## Cross-project comparison

- Raw unbounded Promise.all: 5179.42ms，success 3/3
- Cache bounded concurrency=2: 8962.27ms，observed peak=2，builds=3
- Warm all-project read p50/p95/p99: 0.00ms / 0.00ms / 0.01ms，build delta=0
- Largest project 100 readers: workspace/ming-ding-zhi-shi-2，builds=1，wall=14875.40ms

## Rebuild memory

- Project: workspace/ming-ding-zhi-shi-2，nodes=1615，cycles=10
- Heap: 50.17MiB -> 50.26MiB，slope=9.36KiB/cycle，R2=0.4464
- RSS: 212.70MiB -> 229.38MiB，slope=1.57MiB/cycle，R2=0.8703
- Active resources: 3 -> 3

## Largest projects detail

### workspace/ming-ding-zhi-shi

- 顶层节点：lorebook=880，reference=513，simulation=31，manuscript=6，.agent=4，upload=4，.nbook=3，AGENTS.md=1
- 最大文件：reference/silly-tavern/命定之诗与黄昏之歌v4.2/raw/source.png (6.84MiB)；upload/v4.2.1.png (6.84MiB)；upload/v4.2.1.raw.json (2.62MiB)；reference/silly-tavern/命定之诗与黄昏之歌v4.2/raw/card.json (2.60MiB)；reference/silly-tavern/命定之诗与黄昏之歌v4.2/worldbook/entries.json (1.84MiB)
- 统计：volume=2，chapter=1，words=74，lorebook=409

### workspace/ming-ding-zhi-shi-2

- 顶层节点：lorebook=934，reference=537，agents=68，.nbook=20，manual=19，manuscript=13，.agent=9，upload=5
- 最大文件：.nbook/subject-rag.sqlite (120.39MiB)；.nbook/history.sqlite (9.38MiB)；reference/silly-tavern/命定之诗与黄昏之歌v4.2/raw/source.png (6.84MiB)；upload/v4.2.1.png (6.84MiB)；.agent/tmp/epub-output.txt (4.89MiB)
- 统计：volume=3，chapter=2，words=17968，lorebook=435

### workspace/gong-li-yu-lu-xue-yuan

- 顶层节点：reference=845，lorebook=57，roleplay=25，manuscript=6，.agent=4，upload=4，.nbook=3，AGENTS.md=1
- 最大文件：reference/silly-tavern/在基沃托斯跟学生们涩涩的日子V1.5/raw/source.png (7.68MiB)；upload/V1.5_1.png (7.68MiB)；reference/silly-tavern/命定之诗与黄昏之歌v4.2/raw/source.png (6.84MiB)；upload/v4.2.1.png (6.84MiB)；reference/silly-tavern/在基沃托斯跟学生们涩涩的日子V1.5/raw/card.json (2.84MiB)
- 统计：volume=2，chapter=1，words=851，lorebook=26

## Conclusions

- 首轮逐项目完整扫描最慢的是 workspace/ming-ding-zhi-shi：20785.57ms / 1444 nodes。
- 统计派生最大 p95 为 0.13ms，与完整扫描相比可忽略，主要成本位于完整节点 builder。
- 全部项目逐个扫描 wall=35816.77ms；无界并发 wall=5179.42ms；cache 并发上限 2 wall=8962.27ms。
- 最大项目 100 个并发 cold readers 触发 1 次完整扫描，wall=14875.40ms。
- 最大项目 10 次 rebuild 后 heap slope=9.36KiB/cycle (R2=0.4464)，RSS slope=1.57MiB/cycle (R2=0.8703)。
