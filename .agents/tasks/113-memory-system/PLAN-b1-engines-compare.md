# B1 下一轮实施计划：接入 mem0 / graphiti 与语料扩充（M2/M3/M4）

> 状态：**计划定稿，待开工**（2026-07-23）。上下文：B1 harness（`nb-memory-bench` 兄弟仓）已建成并完成 baseline 首轮跑分（见 [README](README.md) 「B1 首轮跑分」节）。本计划覆盖用户拍板的三件事：接入 mem0、接入 graphiti、语料 8 章 → 20 章扩充。

## 0. 本轮探索确认的关键事实（2026-07-23，gh api + 本地 clone 实查）

两仓已浅 clone 到 `neuro-book/.agent/workspace/memory-research/{mem0,graphiti}/`，实施期直查源码。

1. **mem0ai@3.1.1**（npm，`import {Memory} from "mem0ai/oss"`）：内置 `memory` 向量库**已是 better-sqlite3 持久化实现**（`dimension`/`dbPath` 可配，支持 2560 维）——调研文档「TS OSS 无持久嵌入式向量库」结论已过时，**无需自写适配器**。`add(messages, {userId, metadata, infer})` 支持 metadata 透传与 `infer` 开关；LLM/Embedder config 均有 `baseURL` + `embeddingDims`；v3 检索融合（entity store + reranker）在 TS OSS 存在。
2. **mem0 OSS 商业墙**：`add({timestamp})` 与 `search({referenceDate})` 参数存在但**直接抛错**（付费平台功能挡板，`getTemporalFeatureErrorMessage`）——OSS 无官方 as-of 检索。
3. mem0 `VectorStoreFactory` 是纯 switch 按名字创建、**不支持自定义实例注入**（`mem0-ts/src/oss/src/utils/factory.ts:153`）。
4. **graphiti-core 0.29.2**（PyPI，Python≥3.10，本机 3.11.5 ✓）：`neo4j>=5.26` 是**核心依赖**（非 extra）；`SearchFilters.valid_at/invalid_at: list[list[DateFilter]]`（gte/lte/is_null，OR-of-AND）——**as-of 查询原生可组合**；`search(query, center_node_uuid, group_ids, num_results, search_filter) -> list[EntityEdge]`（`graphiti_core/graphiti.py:1527`）；`OpenAIGenericClient(LLMConfig(base_url…))` + `OpenAIEmbedder(OpenAIEmbedderConfig(base_url, embedding_dim…))` 支持 openai-compatible（`structured_output_mode` 建议 `json_object`）；遥测关 `GRAPHITI_TELEMETRY_ENABLED=false`；并发 `SEMAPHORE_LIMIT`（默认 10，对 mimo 网关设 3 保守）。
5. **本机环境**：docker/podman 均无；**Java 21 有** → graphiti 后端定 **Neo4j Community 本机 zip**（解压到评测仓 `.neo4j/`，gitignore，自包含免容器）；FalkorDB/falkordblite 路线放弃（无容器 / 需 Py3.12+）。Calibre `ebook-convert` 9.10 可用（转化备选）。

## 批次 A：语料扩充（8 → 20 章）

1. `bun scripts/epub-to-corpus.ts --epub <同一 epub> --out corpus/fanpai-loli --offset 8 --max 12` 续转第 9-20 章（现有脚本已验证 spine 解析；ebook-convert 记为备选管线，仅当遇到本脚本解析不了的书时启用）。corpus.json 的 chapters 补 12 项。
2. `prepare extract` 只对新章跑（extract 支持按章增量），新事实 tick 从 195+ 续接——**现有 158 条定稿与 17 题引用不动**。
3. 人工初校新事实（重点：视角污染——第 9-20 章大概率有更多风信子/他角色视角段，逐段比对原文 + grep 他角色名嫌疑扫描）→ append 定稿 `facts.jsonl`。
4. `prepare probes` 全量重出草稿 → 人工合并定稿：保留现有 17 题，从草稿挑新增，目标共 **28-32 题**，优先补 revision（现仅 2 题）、跨 10+ 章长程实体消解、跨章 asof；沿用 `goldIsNegative` 口径。

## 批次 B：M2 mem0 adapter

1. `bun add mem0ai`；**首要风险验证**：better-sqlite3（native addon）在 Bun 下能否装载——10 行冒烟脚本建 Memory 实例。
2. `src/adapters/mem0.ts` 实现 `MemoryEngine`：
   - 配置：`llm: {provider:"openai", config:{apiKey, model:"mimo-v2.5-pro", baseURL}}`；`embedder: {provider:"openai", config:{…, embeddingDims:2560}}`；`vectorStore: {provider:"memory", config:{dimension:2560, dbPath: runDir 下}}`。
   - `ingestFacts`：逐批（8 条/批，与 baseline 同节奏）`add(合批文本, {userId:"bench", infer:true, metadata:{tick, time}})`——`infer:true` 走 v3 ADD-only 管线，即 mem0 的「记忆维护」；`capabilities.rawIngest=true`（整章 add）。
   - `query`：`search(question, {userId:"bench", limit:10})`；`capabilities.asOf=false`（商业墙如实呈现）。
   - `dump`：`getAll()` 导出明文（B2 可审查性口径）。
3. **变体引擎 `mem0-tickfilter`**（同文件导出，run.ts 工厂登记）：检索 limit×3 后按 `metadata.tick <= asOfTick` 后过滤再截断——**明标「adapter 层模拟、非引擎能力」**，回答「读时排序哲学补上时间过滤后表现如何」。README §5 差异表登记。
4. 验收：smoke 语料（24 事实/10 题）真模型全管线通过（mem0 内部自调 LLM，mock 不可行）。

## 批次 C：M3 graphiti adapter（Python stdio 桥接 + 本机 Neo4j）

1. 一次性环境（均自包含于评测仓）：Neo4j Community zip 解压 `.neo4j/`（gitignore）→ 设密码 → `neo4j.bat console` 起 bolt://localhost:7687；`python -m venv bridge/.venv && pip install graphiti-core`。
2. `bridge/graphiti_bridge.py`：stdin/stdout JSONL 命令循环（`init`/`ingest`/`search`/`dump`/`close`），长驻进程免 REST 端口管理：
   - init：`Graphiti(uri, user, password, llm_client=OpenAIGenericClient(LLMConfig(api_key, model, small_model, base_url))`（`structured_output_mode="json_object"`）`, embedder=OpenAIEmbedder(OpenAIEmbedderConfig(api_key, embedding_model="Qwen/Qwen3-Embedding-4B", embedding_dim=2560, base_url=siliconflow)))` + `build_indices_and_constraints()`；env `GRAPHITI_TELEMETRY_ENABLED=false`、`SEMAPHORE_LIMIT=3`。
   - ingest：8 条 facts 合批一个 episode（文本带故事时间行），`reference_time = date(2020,1,1)+timedelta(days=tick)`（tick→伪 datetime 单调映射）；raw 模式每章一 episode。
   - search：普通题 `search(query)`；asof 题 `SearchFilters(valid_at=[[lte(T)]], invalid_at=[[is_null],[gt(T)]])`（未失效 或 失效于 T 后）→ edges 的 fact 文本 + valid_at；`capabilities.asOf=true`（引擎原生）。
   - dump：导出全部 edges/nodes 明文。
3. `src/adapters/graphiti.ts`：`Bun.spawn` 长驻 bridge，JSONL 封装为 `MemoryEngine`。
4. 验收：smoke 真模型小跑；重点观察 mimo structured output 多阶段抽取失败率、中文实体抽取质量、429——失败模式本身是评测数据，如实记录。

## 批次 D：M4 三方对比与回写

1. 扩充语料正式跑：baseline / mem0 / mem0-tickfilter / graphiti × facts 模式（raw 模式 mem0 与 graphiti 两方，baseline 不支持如实缺席）。成本预估：~350 事实，graphiti 合批后 ~45 episodes × 多阶段调用，总量 2-4M token 级（mimo 计价便宜）。
2. 多引擎对比汇总：读各 run 的 report.json 渲染对照表（正确率/泄漏率/陈旧率/污染率/摄入成本/检索延迟并排）。
3. 回写：`nb-memory-bench` 对照报告 + 本 README 结论段 + `docs/research/memory-engines-mem0-graphiti.md` 修订（① TS OSS 已有持久向量库 ② as-of 商业墙 ③ 实测数字取代纸面推断）+ 记忆文件。

## 关键文件

- 复用：`src/engine.ts`（MemoryEngine 接口）、`src/llm.ts`、`src/pipeline/bench.ts`、`src/run.ts` 的 `makeEngine` 工厂、`scripts/epub-to-corpus.ts`、smoke 语料。
- 新增：`src/adapters/mem0.ts`、`src/adapters/graphiti.ts`、`bridge/graphiti_bridge.py`。
- 修改：`src/run.ts`（登记 3 引擎 + 对比汇总）、评测仓 `README.md` §5/§8、`corpus/fanpai-loli/*`、`.gitignore`（.neo4j / bridge/.venv）。

## 风险与退路

| 风险 | 退路 |
| --- | --- |
| better-sqlite3 在 Bun 装载失败 | 工厂不支持实例注入（已实查），mem0 引擎路线改用 node 运行时跑同一 CLI |
| mimo structured output 过不了 graphiti 多阶段抽取 | 记录失败率作为评测结果；试 `json_schema`/`json_object` 两档；仍失败则「该模型档位不可用」本身入报告 |
| Neo4j zip 本机启动问题（内存/端口） | WSL2 Ubuntu 跑 FalkorDB 备胎 |
| 扩章后视角污染漏网 | 校对流程同首轮：逐段比对原文 + grep 他角色名嫌疑扫描 |

## 验证

- M2/M3 各自先在 smoke 语料真模型全管线通过，dump 可读、判分四类齐全。
- M4 正式轮：四引擎 × fanpai-loli 扩充语料全部产出 report.md，对照表并排成立。
- 回归：`bun run typecheck` + `bun test` 全绿。
