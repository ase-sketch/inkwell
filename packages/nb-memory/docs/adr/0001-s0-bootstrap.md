# ADR 0001 — S0 建仓决策（2026-07-26）

- **仓库惯例跟 nb-history**：相对导入、`exports: "." → src/index.ts`、bun test + tsc noEmit、4 空格、中文注释。相对导入是有意的——`link:` 消费时不依赖消费方 tsconfig paths。
- **注册表与状态层用事件溯源 jsonl**（register/alias/ontology、set/invalidate 每行一事件）：alias 合并与状态失效天然是「显式事件」（工作假设 B/C 的落库形态），且 open 重放与写入共用同一 apply 路径，重建等价性由构造保证。
- **向量索引纯内存派生物**：open 后惰性批量嵌入，暴力余弦扫描（截断 1.15，主仓同款）。sqlite embedding 缓存推迟到量级需要时（B1 全量 338 条 ≈ 11 个 embed 批，不值得提前上）。
- **状态失效双写**：store 与索引各持条目副本，invalidate 需同步索引侧（按 refId 定位）；重建路径天然一致，双写只服务进程内即时性。
- **subject.type 是开放字符串**：World Engine 的类型本来就是用户 schema 驱动的（character/location/item…），枚举硬编码反而不同源。
- **bench 消费方式 = tsconfig paths 直连源码**（`"@notnotype/nb-memory": ["../nb-memory/src/index.ts"]`，tsc 与 bun 运行时都认）：bun 的 `link:` 在 Windows 装不上、`file:` 是拷贝——拷贝会让「改了引擎忘重装、bench 跑旧代码出假分」成为常态风险，spike 期直连最安全。import 说明符保持包名，将来 vendor 时零改动。
- **与计划草图的出入**：`ingest/ingest-episode.ts`（抽取+归一联合调用）推迟到 S2 首建——S0/S1 纯 facts 直报模式用不到，空壳文件没有约束力。
