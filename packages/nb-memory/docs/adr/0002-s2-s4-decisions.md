# ADR 0002 — S2-S4 探索期架构决策（2026-07-26/27）

逐条为「跑分驱动出来的设计」，证据在 nb-memory-bench results/fanpai-loli 各 run 的 analysis.md。

## S2 消解与注册表

- **写入时 ID 归一化**（工作假设 E 证实）：每批 16 条事实一次「抽取+归一」联合调用，注册表全量进上下文；20 章语料 22 次调用完成消解（graphiti 同语料 43 次且 recall 不可用级别）。
- **merge 是显式事件、as-of 前视作两实体**：分身修复（风信子/南小风实证）走 `merge{keep,drop,sinceTick}` 事件——drop 名字并入 keep 别名（时点取 max）、旧 facts 标注经等价 id 集命中。与 graphiti 静默永久合并相对：错误合并可审计、可回放定位。
- **引擎不变式兜底，不赌提示词**：「一个名字不能既是 A 主名又是 B 别名」——register 与 alias 同批到达时存在性检查会被写入顺序穿透（轮 2 实证），批末自动 merge 是代码级约束。
- **id 分配权归注册表**（`allocateId`，历史登记总数单调）：调用方用 `all.length` 数数在 merge 后必撞车（审查发现的潜伏雷）。
- **registeredTick 先算后登**：从 facts 映射反查首次引用 tick，否则主体提前可见破坏 as-of。
- **检索注入 as-of 主体卡**：别名按 sinceTick 裁剪、ontology 取当时版本（事件溯源免费提供历史）——替代 graphiti 滚动 summary 的三个用途（检索锚/消解判据/兜底）且无漂移。

## S3 状态层

- **happening/state 二分**（工作假设 C 证实）：facts append-only 永不失效；可变认知走状态层 `set/invalidate` 事件，取代 = 旧同 topic invalidate + 新 set。asof 100%、陈旧 0 的直接来源。
- **topic 复用靠上下文强制**：状态层快照进联合调用上下文并要求复用已有 topic 原文——跨 topic 矛盾（B1 baseline 实证短板）由此收敛。
- **检索对提及主体确定性注入在效状态**：revision 类问题不赌语义命中。

## S4 字面融合

- **BM25 中文按字 bigram、ASCII 整词，零依赖**；与语义路 RRF（k=60）融合免调权。entity 94.4%、「契约内容」四连败钉子户清零的来源。
- **tick/主体过滤两路同权**：字面路不给 as-of 红线开口（单测锚定）。
- **已知边界**：查询侧不含专名的「反向专名题」（p018）字面路无从发力——候补是答题侧利用主体卡别名，S5 观察项，不为单题过拟合。

## 方法论（S5 终验纪律）

- **判卷/摄入方差是一等公民**：同配置 entity 9 题集两跑差 33pp；治法 = 扩题量（9→19 后散布 5.2pp）+ 双跑取均值 + 同题集对照复测（跨题集分数不可比，「旧门槛作废」实证）。
