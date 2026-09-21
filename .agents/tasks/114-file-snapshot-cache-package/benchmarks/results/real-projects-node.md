# NeuroBook 真实 Project Workspace 性能基线

生成时间：2026-07-24T14:20:29.764Z

> 本报告只读真实 Project Workspace。cache 阶段使用独立 package adapter，不代表已经接入 /api/projects。首轮是进程首次扫描，但 OS 文件缓存未清空，因此不是物理冷盘基准。

## Environment

- OS: win32 10.0.26200 (x64)
- CPU: 13th Gen Intel(R) Core(TM) i7-13700K, 24 logical CPUs
- Memory: 31.77GiB
- Node: v24.13.0
- Filesystem: NTFS
- Workspace Root: <repo>\workspace
- Source SHA-256: 893de3de576ba0ae48973c0fcd0f92736d514cd60f8ff72a6dba92b6c8d38b4d
- Projects: 35/35
- Rebuild cycles: 5

## Sequential full scan

Wall: 33637.53ms

| Project | Scan | Nodes | Files | Markdown | Bytes | Heap delta | Derive p95 | Error |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| workspace/ming-ding-zhi-shi | 13960.13ms | 1444 | 944 | 904 | 26.80MiB | 15.49MiB | 0.14ms |  |
| workspace/gong-li-yu-lu-xue-yuan | 8961.33ms | 947 | 874 | 789 | 50.27MiB | 4.12MiB | 0.05ms |  |
| workspace/ming-ding-zhi-shi-2 | 7253.72ms | 1615 | 1086 | 1018 | 162.86MiB | 18.29MiB | 0.21ms |  |
| workspace/novel-6 | 1107.56ms | 77 | 42 | 37 | 226.90KiB | 707.08KiB | 0.01ms |  |
| workspace/novel-4 | 669.18ms | 55 | 30 | 25 | 156.83KiB | 300.45KiB | 0.00ms |  |
| workspace/wei-ming-ming-xiao-shuo | 596.43ms | 34 | 18 | 12 | 126.61KiB | 143.14KiB | 0.00ms |  |
| workspace/novel-7 | 118.59ms | 29 | 15 | 10 | 124.08KiB | 187.52KiB | 0.00ms |  |
| workspace/plot-api-test-1784896243955-3a6d8f0ae24b08 | 22.08ms | 12 | 6 | 1 | 268.90KiB | 21.66KiB | 0.00ms |  |
| workspace/plot-api-test-1784896294537-7c5831910b74a8 | 18.69ms | 12 | 6 | 1 | 268.60KiB | 70.69KiB | 0.00ms |  |
| workspace/notice-disabled | 18.68ms | 11 | 7 | 1 | 300.61KiB | 18.61KiB | 0.00ms |  |
| workspace/plot-api-test-1784896270225-fe879a3cb30a68 | 18.30ms | 12 | 6 | 1 | 268.90KiB | 24.65KiB | 0.00ms |  |
| workspace/plot-api-test-1784896245021-303f6de9956f8 | 17.97ms | 12 | 6 | 1 | 268.90KiB | 41.88KiB | 0.00ms |  |
| workspace/plot-api-test-1784896286578-8ddd76128e2bc | 16.16ms | 11 | 5 | 1 | 268.57KiB | 41.99KiB | 0.00ms |  |
| workspace/plot-api-test-1784896290661-e9855ed6d298b | 15.67ms | 11 | 5 | 1 | 268.57KiB | 35.43KiB | 0.00ms |  |
| workspace/delete-project-1cbdb4eb-4b08-4337-a96c-28b4fd8ce5ec | 15.27ms | 10 | 6 | 1 | 268.43KiB | 17.41KiB | 0.00ms |  |
| workspace/lifecycle | 11.83ms | 8 | 6 | 1 | 296.04KiB | 14.62KiB | 0.00ms |  |
| workspace/d15 | 11.44ms | 8 | 6 | 1 | 296.04KiB | 14.64KiB | 0.00ms |  |
| workspace/world-tools-test-1784891341825-36448f5b5e4d5 | 11.13ms | 5 | 3 | 0 | 984B | 12.75KiB | 0.00ms |  |
| workspace/reconcile | 10.37ms | 7 | 5 | 0 | 296.04KiB | 14.22KiB | 0.00ms |  |
| workspace/world-tools-test-1784889944214-8bb1dc153cb5a | 9.13ms | 5 | 3 | 0 | 984B | 10.90KiB | 0.00ms |  |
| workspace/world-tools-test-1784889945424-2ad878d08297e | 8.92ms | 5 | 3 | 0 | 984B | 10.79KiB | 0.00ms |  |
| workspace/record | 8.84ms | 6 | 5 | 0 | 296.04KiB | 13.81KiB | 0.00ms |  |
| workspace/notice-e2e | 8.68ms | 6 | 5 | 0 | 296.04KiB | 12.70KiB | 0.00ms |  |
| workspace/unseen | 8.58ms | 6 | 5 | 0 | 296.04KiB | 13.93KiB | 0.00ms |  |
| workspace/notice-at-least-once | 8.41ms | 6 | 5 | 0 | 296.05KiB | 13.75KiB | 0.00ms |  |
| workspace/world-tools-test-1784889977710-fd6fc06d93db18 | 8.39ms | 5 | 3 | 0 | 984B | -486.98KiB | 0.00ms |  |
| workspace/world-tools-test-1784889976259-d3f0f5f8b9fa48 | 8.27ms | 5 | 3 | 0 | 984B | 25.69KiB | 0.00ms |  |
| workspace/notice-sensitive | 8.16ms | 6 | 5 | 0 | 296.05KiB | 16.06KiB | 0.00ms |  |
| workspace/world-tools-test-1784889973853-b49c96f725b708 | 8.07ms | 5 | 3 | 0 | 984B | 13.45KiB | 0.00ms |  |
| workspace/world-tools-test-1784889946765-40bc5685b09b08 | 7.85ms | 5 | 3 | 0 | 984B | 11.67KiB | 0.00ms |  |
| workspace/sql-close-9fb281eb-f151-4411-8b5f-86bdac642dda | 5.55ms | 4 | 3 | 0 | 268.09KiB | 6.46KiB | 0.00ms |  |
| workspace/sql-close-fdd0f105-3d31-4a1c-9b2d-68bbfd8c5abb | 5.29ms | 4 | 3 | 0 | 268.09KiB | 6.86KiB | 0.00ms |  |
| workspace/disabled | 4.97ms | 3 | 2 | 0 | 216.04KiB | 5.09KiB | 0.00ms |  |
| workspace/sql-tool-efda5698-447d-46f7-a48e-505924aa65f1 | 3.58ms | 1 | 1 | 0 | 87B | -31.47KiB | 0.00ms |  |
| workspace/same-name-book | 2.31ms | 1 | 1 | 0 | 47B | 5.99KiB | 0.00ms |  |

## Cross-project comparison

- Raw unbounded Promise.all: 16507.95ms，success 35/35
- Cache bounded concurrency=2: 42457.78ms，observed peak=2，builds=35
- Warm all-project read p50/p95/p99: 0.01ms / 0.02ms / 0.07ms，build delta=0
- Largest project 100 readers: workspace/ming-ding-zhi-shi-2，builds=1，wall=13499.72ms

## Rebuild memory

- Project: workspace/ming-ding-zhi-shi-2，nodes=1615，cycles=5
- Heap: 50.59MiB -> 50.62MiB，slope=5.42KiB/cycle，R2=0.0254
- RSS: 240.61MiB -> 243.55MiB，slope=558.40KiB/cycle，R2=0.3852
- Active resources: 3 -> 3

## Largest projects detail

### workspace/ming-ding-zhi-shi

- 顶层节点：lorebook=880，reference=513，simulation=31，manuscript=6，.agent=4，upload=4，.nbook=3，AGENTS.md=1
- 最大文件：reference/silly-tavern/命定之诗与黄昏之歌v4.2/raw/source.png (6.84MiB)；upload/v4.2.1.png (6.84MiB)；upload/v4.2.1.raw.json (2.62MiB)；reference/silly-tavern/命定之诗与黄昏之歌v4.2/raw/card.json (2.60MiB)；reference/silly-tavern/命定之诗与黄昏之歌v4.2/worldbook/entries.json (1.84MiB)
- 统计：volume=2，chapter=1，words=74，lorebook=409

### workspace/gong-li-yu-lu-xue-yuan

- 顶层节点：reference=845，lorebook=57，roleplay=25，manuscript=6，.agent=4，upload=4，.nbook=3，AGENTS.md=1
- 最大文件：reference/silly-tavern/在基沃托斯跟学生们涩涩的日子V1.5/raw/source.png (7.68MiB)；upload/V1.5_1.png (7.68MiB)；reference/silly-tavern/命定之诗与黄昏之歌v4.2/raw/source.png (6.84MiB)；upload/v4.2.1.png (6.84MiB)；reference/silly-tavern/在基沃托斯跟学生们涩涩的日子V1.5/raw/card.json (2.84MiB)
- 统计：volume=2，chapter=1，words=851，lorebook=26

### workspace/ming-ding-zhi-shi-2

- 顶层节点：lorebook=934，reference=537，agents=68，.nbook=20，manual=19，manuscript=13，.agent=9，upload=5
- 最大文件：.nbook/subject-rag.sqlite (120.39MiB)；.nbook/history.sqlite (9.38MiB)；reference/silly-tavern/命定之诗与黄昏之歌v4.2/raw/source.png (6.84MiB)；upload/v4.2.1.png (6.84MiB)；.agent/tmp/epub-output.txt (4.89MiB)
- 统计：volume=3，chapter=2，words=17968，lorebook=435

### workspace/novel-6

- 顶层节点：lorebook=62，manuscript=6，.nbook=3，.agent=2，AGENTS.md=1，PROJECT-STATUS.md=1，project.yaml=1，workspace.yaml=1
- 最大文件：.nbook/project.sqlite (112.00KiB)；manuscript/001-第一卷/001-第一章/index.md (21.83KiB)；lorebook/note/story-concept/index.md (11.19KiB)；lorebook/rule/system-panel/index.md (9.13KiB)；lorebook/character/银龙姬/index.md (6.11KiB)
- 统计：volume=2，chapter=1，words=7374，lorebook=23

### workspace/novel-4

- 顶层节点：lorebook=42，manuscript=4，.nbook=3，.agent=2，AGENTS.md=1，PROJECT-STATUS.md=1，project.yaml=1，workspace.yaml=1
- 最大文件：.nbook/project.sqlite (112.00KiB)；.nbook/icons.json (3.30KiB)；lorebook/character/protagonist/index.md (3.09KiB)；lorebook/rule/dragon-kind/index.md (2.56KiB)；lorebook/rule/power-systems/index.md (2.52KiB)
- 统计：volume=1，chapter=1，words=0，lorebook=16

## Conclusions

- 首轮逐项目完整扫描最慢的是 workspace/ming-ding-zhi-shi：13960.13ms / 1444 nodes。
- 统计派生最大 p95 为 0.21ms，与完整扫描相比可忽略，主要成本位于完整节点 builder。
- 全部项目逐个扫描 wall=33637.53ms；无界并发 wall=16507.95ms；cache 并发上限 2 wall=42457.78ms。
- 最大项目 100 个并发 cold readers 触发 1 次完整扫描，wall=13499.72ms。
- 最大项目 5 次 rebuild 后 heap slope=5.42KiB/cycle (R2=0.0254)，RSS slope=558.40KiB/cycle (R2=0.3852)。
