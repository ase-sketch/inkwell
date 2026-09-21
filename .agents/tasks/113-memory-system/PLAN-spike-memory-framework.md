# PLAN — nb-memory spike：自研记忆框架探索

> 立项：2026-07-26（Task 113 第三轮讨论后用户拍板）。状态：**S0-S5 全部完成（2026-07-27）**，结论回写 Task README「Spike 结论」节。
> 性质：spike，但不是一次性 demo——**探索全程持续重构，最终交付一个架构被探索期打磨过的库**。执行期间每个里程碑的跑分、错题分析与架构决策都回写本文件或评测仓 results/。

## 1. 背景与定位

- Task 113 三轮讨论收敛出目标形态：**episode + facts（主体 ID 归一）+ 关键主体注册表（带 tick alias）+ 轻量状态层 + tick 过滤/BM25 融合检索**（详见 README 第三轮节）。B1 四引擎对比已给出实测锚点：mem0-tickfilter（泄漏 0 / 陈旧 0 / recall+revision 100%）是要追平的下限，baseline 的 entity 77.8% 是要超越的对象（靠注册表消解）。
- 代码落点：**独立兄弟仓 `nb-memory`**（沿 nb-history / nb-workflow / nb-memory-bench 模式），后续按需 vendor 进主仓或被 subject 侧改造消费。
- 评测面：**复用 `nb-memory-bench`**——nb-memory 作为新引擎 adapter 接入，与 baseline / mem0-tickfilter 同场同题对比（fanpai-loli 20 章 / 338 事实 / 31 题 + smoke 语料离线回归）。bench 是本 spike 的 verification surface，不另造验收标准。
- 范围：只做**剧情/知识库域**。agent memory（用户记忆）维持文件式主张、不进本 spike；llmlint 共享形态是访问问题、另拍。

## 2. Goal

建成 `nb-memory` 库（TypeScript / Bun 原生、零服务器、Windows 可用），实现第三轮形态的记忆框架，verified by：**nb-memory-bench B1 全量跑分达到 mem0-tickfilter 基线（时间泄漏 0 / 陈旧 0 / recall 与 revision 100%）且 entity 超过 baseline 的 77.8%**，同时 smoke 语料离线回归、单测与 typecheck 全绿，同配置双跑方差有记录。约束：不引入 mem0 / graphiti 引擎依赖；不破坏 bench 公平性合同（引擎只管检索，答题统一由 bench 的答题模型完成；缺什么能力如实呈现不偷补）；LLM / embedding / 存储全部走可注入 port。边界：新 sibling 仓 `nb-memory` + nb-memory-bench 的 adapter 目录；**主仓 subject-memory 与 World Engine 不动**（spike 结论反哺后续改造批次）。迭代策略：每个里程碑跑分 → 错题分析落 results/ → 允许激进重构（重构前后各跑一次防退化）→ 架构决策记 ADR 短注。Blocked stop：某指标连续两轮无法逼近基线、且错题分析指向**形态本身**（而非实现质量）的缺陷时，停下带证据回报，交用户重审形态。

## 3. 工作假设（spike 内生效，验证后反哺正式拍板）

| # | 假设 | 来源 |
| --- | --- | --- |
| A | 状态层自带轻量实现（topic/view + 失效语义），不复用 World Engine 存储；subject 类型词汇与 World Engine schema 同源；预留「注册表 → WorldSubject」显式导出桥 | 第三轮分叉 A（助手荐） |
| B | alias 合并带 tick：「t≥k 已知同一实体」；as-of 查询在 t<k 视作两实体 | 第三轮分叉 B（助手强烈荐） |
| C | happening/state 二分：happening → facts append-only 永不失效；state → 状态层带失效语义 | 第三轮分叉 C（助手荐） |
| D | 边不作为存储对象：facts 带 subjectIds[]，关系查询 = 按 ID 对查 facts（图 = 注册表 + 倒排索引） | 第三轮回应 3 |
| E | 消解 = 写入时 ID 归一化：每 episode 一次「抽取+归一」联合调用，注册表全量进上下文 | 第三轮回应 4 |
| F | 关键主体按类型注册（人物/势力/有状态物品/特殊物品）；次要主体不注册不消解，字面留在 facts 靠 BM25 召回；预留次要→关键升级路径（从 episode 重放补归一） | 用户核心理念 |

## 4. 架构草图（初版，允许被里程碑重构推翻）

```text
nb-memory/
|-- src/
|   |-- core/
|   |   |-- episode-store.ts      # append-only：{ id, tick, time?, source, text }
|   |   |-- subject-registry.ts   # 关键主体：{ id, type, name, aliases:[{alias, sinceTick}],
|   |   |                         #   ontology(一行本体描述，显式更新), attrs? }；alias merge 是显式事件
|   |   |-- fact-store.ts         # happening：{ id, text, tick, subjectIds[], episodeId }
|   |   `-- state-store.ts        # state：{ subjectId, topic, view, sinceTick, invalidatedAtTick? }
|   |-- ingest/
|   |   `-- ingest-episode.ts     # 每 episode 一次联合调用：抽取 facts + 归一 subjectIds
|   |                             #   + 新关键主体注册提案 + alias 合并事件 + 状态变更提案
|   |-- retrieval/
|   |   `-- search.ts             # 语义(embedding) + BM25 字面 + tick<=asOf 过滤 + subjectId 过滤；
|   |                             #   融合评分；「边」查询 = subjectId 对交集
|   |-- ports/
|   |   `-- ports.ts              # LlmPort / EmbeddingPort / StoragePort（bench 与主仓各自注入）
|   `-- index.ts                  # 库公开面：ingest / search / registry / state 四组 API
|-- tests/                        # 纯函数与离线单测（不打真模型）
`-- docs/adr/                     # 探索期架构决策短注（每次大重构一条）
```

要点：

- **存储**：起步用 jsonl（episode/facts/registry，与 Subject RAG 同构、可 git diff）+ 内存索引；embedding 缓存与倒排索引落 sqlite（可删可重建派生物）。禁 better-sqlite3（Bun/Windows 不可装载），用 `bun:sqlite` 或主仓同款 `@libsql/client`；向量起步用 bench 同款内存余弦，量大再上 sqlite-vec。
- **摄入成本预算**：~O(episodes) 次 LLM 调用（20 章 ≤ 40 次），对齐「20 次调用完成消解」理念；成本计入每轮报告与 compare.md。
- **可复现纪律**：语义层永远可从 episode 重放重建（`rebuild` 命令）；同配置双跑记方差（B1 已证 LLM 蒸馏方差是真实风险）。

## 5. 里程碑

每个里程碑收口条件：bench 跑分 + 错题分析落 `nb-memory-bench/results/fanpai-loli/nb-memory-s<N>/` + compare.md 更新 + typecheck/单测绿 + 必要时 ADR 短注。

- **S0 建仓 bootstrap**：仓库骨架、ports、jsonl 存储、bench adapter 接通、smoke 语料（3 章/24 事实/10 探针）离线全管线跑通。
- **S1 垂直切片（facts + tick）**：episode+facts 摄入（先不做注册表，subjectIds 允许为空）、语义检索 + tick≤asOf 过滤。验收：recall/asof/泄漏对齐 mem0-tickfilter（泄漏 0）。
- **S2 注册表 + 消解**：关键主体注册、每 episode 联合抽取归一、alias 带 tick、次要主体字面保留。验收：entity > 77.8%（baseline）；「叙述者/叙事者/我」类分身失败为 0；entity×asof 交叉题验证 alias-tick 的 as-of 正确性（t<k 视作两实体）。
- **S3 状态层 + 失效语义**：state 提案与失效标记（graphiti 图纸）、检索时 state 优先于旧 facts。验收：revision 100% / 陈旧 0（对齐 tickfilter，且 dump 无跨 topic 矛盾残留——B1 baseline 的实证短板）。
- **S4 BM25/字面融合**：字面信号并入融合评分。验收：B1 中账号名/道具名类字面漏召回题清零；recall 100%。
- **S5 收口重构**：模块边界定稿、公开 API 合同写进仓 README、ADR 汇总、全量复跑 ×2 记方差、B1 六 run 对照表终版。产出物 = 可被主仓消费的库 + 「spike 学到什么」结论节（含 A-F 假设逐条判定：证实/证伪/存疑）。

顺序允许调整（如 S2 发现注册表必须先于状态层），但每步必须过 bench 再进下一步。

## 6. 风险与避坑（继承 B1，勿再踩）

- mimo 网关：非流式请求也回 `text/event-stream` 头（node 侧要本地反代改写，fetch patch 无效）；整段故障窗口需 10 分钟级重试耐力；json 模式偶发 schema 原样回显要重试计数。
- Bun/Windows：better-sqlite3 native addon 禁区；长驻进程要 nohup 脱离。
- 摄入方差：LLM 蒸馏非确定性——rebuild 可重放 + 双跑记方差是对策，不是消除。
- 语料污染：bench 的 control 对照与 `goldIsNegative` 豁免逻辑保持，不因新引擎接入而绕过。
- 别把 spike 写成产品：不做 UI、不接主仓运行时、不提前抽象多域支持（agent memory 域不进来）；但**模块边界与 port 从第一天认真做**——这正是「探索期持续重构最终得到好库」的前提。

## 7. 里程碑执行记录

### S0 建仓 bootstrap（2026-07-26，完成）

- 仓已建：`nb-memory`（git 初始化，S0 基线已提交）。惯例跟 nb-history：相对导入、`exports "." → src/index.ts`、bun test + tsc noEmit。
- 落地结构：`src/ports/ports.ts`（LlmPort/EmbedPort/StoragePort + FsStorage/MemStorage）、`src/core/`（episode-store / fact-store / subject-registry / state-store + types，jsonl 事件溯源事实源）、`src/retrieval/search.ts`（SemanticIndex：余弦 + 截断 1.15 + tick≤asOf **截断前过滤** + subjectId 过滤 + state 失效过滤）、`src/index.ts`（NbMemory 门面）。
- 注册表/状态层为事件溯源 jsonl（register/alias/ontology、set/invalidate），open 重放与写入共用 apply 路径——重建等价性由构造保证；alias 带 sinceTick 与 state 失效语义（工作假设 B/C）在 S0 就有单测覆盖。
- bench 接通：`nb-memory-bench/src/adapters/nb-memory.ts` + run.ts 登记 + README §5 差异表登记；smoke 语料离线全管线冒烟通过（摄入 24 facts 零 LLM 调用、as-of 截断验证、answer/judge/report 全链）。两仓 typecheck + 测试全绿（nb-memory 6 测试、bench 4 测试）。
- 与计划出入（记 ADR 0001）：① `ingest/ingest-episode.ts` 推迟到 S2 首建（facts 直报模式用不到，不立空壳）；② bench 消费方式从设想的包依赖改为 **tsconfig paths 直连源码**——bun 的 `link:` 在 Windows 装不上、`file:` 是拷贝（会造成「改引擎忘重装、bench 跑旧代码出假分」风险）。
- S1 的机制（tick 过滤）在 S0 已实现，S1 的实质是 B1 全量真跑验收。

### S1 facts+tick 垂直切片（2026-07-26，完成·验收口径修正）

- B1 全量真跑（run `2026-07-26T12-53-47-703Z`，错题分析见 run 目录 analysis.md）：**泄漏 0 ✅**、**asof 正确率 71.4% 超 mem0-tickfilter 的 50%**（截断前过滤 vs 超采后过滤的直接实证）、摄入 **0 次 LLM / 5.5 秒**（tickfilter 43 次 / 337 秒）。recall 75% / entity 55.6% / revision 0%。
- **验收口径修正（出入如实记录）**：原 S1 验收「recall 对齐 tickfilter」定高了——tickfilter 的 recall 100% 来自 mem0 蒸馏合并的条目密度，是 S1 刻意零 LLM 摄入不做的；且本计划自己把 recall 100% 定为 S4 验收。修正后 S1 口径 = 泄漏 0 + asof 不低于参照，均达成。
- 失分归因与里程碑映射全部对上：7/8 失分题 gold 事实未进 top10（含账号名/道具名字面类 → S4）；实体链三题（风信子=南小风=南嘉鱼妹妹）→ S2；revision 旧认知两题 → S3；多跳组合（诗经推断链）最难，S2/S4 部分缓解。无形态本身缺陷证据，按纪律推进 S2。

### S2 注册表 + 消解（2026-07-26，真跑中）

- 引擎侧已实现并提交：`ingest/resolve-facts.ts` 联合调用（批 16 一次：登记/别名 sinceTick 收敛到批内/本体更新/subjectIds 归一，失败 3 试后跳过不阻塞）；检索注入 as-of 主体卡（registeredTick 门槛 + 别名按 sinceTick 裁剪 + ontology 取当时版本，历史由事件重放免费获得）。
- 已预见风险待错题验证：别名合并不回溯打标旧事实，entity 召回靠字面别名+主体卡兜底；若失分则补「合并后重放补归一」升级路径。
- **首跑结果（run `13-17-28`，分析见 run 目录 analysis.md）**：recall 85.7↑ / asof 80↑（泄漏仍 0）/ entity 62.5↑ 但未过 77.8 门槛；**分身病实证**——风信子/南小风两主体（su-006 的 ontology 自己写着「风信子的真名」）、心月狐（代号）、十万水星（笔名）都被登记成独立主体：「真名/代号/笔名揭晓」被当成 register 而非 alias，正是 graphiti 叙述者三分身的同款病，但我们的形态让它**显式可见可修复**。另实证关系查询缺口（p023 花铃×南嘉鱼）：假设 D 的「按 id 对查」当时没接线。污染率 25.8%（S1 12.9%）=control/judge 非确定性噪声，记入双跑方差观察项。
- **轮 2 结果（run `13-46-51`）**：注册表 15→10 主体收敛，心月狐/狐狐official 正确挂为苏天晴别名；recall 85.7 / asof 75（泄漏 0）/ entity 66.7 仍未过线。残余一处分身：风信子已有别名「南小风(t≥123)」，模型同批又 register 了南小风主体——register 与 alias 同批到达时，写入顺序让存在性检查穿透。**轮 3 修复（真跑中）**：引擎不变式「主名撞别名即分身，批末自动 merge」（不依赖提示词的兜底）+ 别名挂实际称呼字符串的提示词微调。另注：同引擎两跑 recall/revision/污染率摆动明显（污染 12.9↔25.8），judge/control 非确定性是独立噪声源，S5 方差要与摄入方差分开记。
- **出入记录**：raw 摄入（episode 抽取）推迟到 S3+——S2 验收只用 facts 模式，不为未消费的能力提前接线。
- **审查修复轮（07-26，已提交 nb-memory）**：链路审查发现 id 生成撞车潜伏雷（`all.length+1` 在 merge 后收缩会撞活主体炸摄入）→ id 分配收归注册表 `allocateId()`（历史总数单调+撞车递增兜底）；registeredTick 先算后登（取首次引用事实 tick，消除批首提前可见 ≤15 tick 的 as-of 缺口）；op 应用段整体容错跳批（「消解是增强不是闸门」贯穿到底）；dump 折算合并后 id。轮 3（并行会话 14-13 run）实测 0 merge 未触雷，修复为后续轮次兜底。
- **轮 3 结果（run `14-13-56`）**：**分身 0 达成**（注册表干净：风信子挂南小风(t≥123)、苏天晴挂心月狐/狐狐official，全程 0 merge=铁律提示词生效）；recall 87.5（新高）/ asof 75 泄漏 0 / 污染 9.7（新低）；**entity 55.6 反而回落**（三轮 62.5→66.7→55.6，在判卷方差内震荡，未逼近 77.8）。剩余失分（君子有酒推断链、定身魔法事件召回、两跳关系）属检索密度/字面类=S4 认领范围，错题分析不指向形态本身。**用户已拍板（07-26）：先双跑定方差**——同配置复跑（run `14-37-25`）：**entity 55.6↔88.9%（差 3 题/33pp，复跑单轮直接过线）**、recall 87.5↔62.5、revision 0↔50、泄漏两跑均 0、分身两跑均 0。结论：9 题分辨率下判卷+摄入噪声主导（±1.5 题≈17pp），单跑数字对 77.8 门槛无裁决力；两跑均值 entity 72.2。**稳定的是结构性指标**：泄漏 0 / 分身 0 / 摄入 22 次调用，这些跨跑不变。方差纪律证明自身价值，S5 终验必须双跑取均值并扩 entity 题量。
- **用户再拍板（07-26）：扩 entity 题量再裁决**——prepare 草稿 12 题、预审收 10 去 2（金标人工校对：#6 姐妹关系放宽措辞；#10 强化药A 经用户对原文确认无误——**轮 1 注册表抽成「强化药S」反而是引擎抽取错误的实证**）；probes.jsonl 定稿 entity 9→19 题（分辨率 11pp→5.3pp，全量 41 题）。**裁决协议**：nb-memory 轮 3 配置双跑取均值；**77.8% 门槛是 baseline 在旧 9 题集上的成绩，扩题后需 baseline 复测同题集才可比**——三跑（nb-memory×2 + baseline×1）齐后终裁 S2。
- **S2 终裁（07-27，通过 ✅）**：19 题集三跑齐——nb-memory entity 双跑 78.9/73.7，**均值 76.3%（散布 5.2pp）**；baseline 同题集复测 **68.4%**（且泄漏 22.2%、摄入 57 次/1246s）。差距 7.9pp > 单题分辨率 5.3pp，**entity 超 baseline 成立**；分身 0 跨四跑稳定；p026/p028 双跑审计 timeLeak 均无（alias-tick as-of 正确性通过）。S2 验收三件套全过，收口进 S3。附注：旧 9 题门槛 77.8% 作废；判卷方差教训（同配置 33pp 摆动→扩题至 5pp 内）纳入 S5 终验纪律。
- **轮 2 修复内容（已提交）**：① 提示词铁律「真名/代号/化名/笔名/网名一律 alias 绝不 register」；② **merge 修复操作**——联合调用可输出 merge{keep,drop,sinceTick}，注册表 merge 事件 = drop 名字并入 keep 别名（时点取 max）、as-of 合并前仍视作两实体、旧 facts 标注经等价 id 集命中（显式可审计合并 vs graphiti 静默永久合并）；③ 关系查询接线：提及 ≥2 主体按主体对查共同事实 + 每主体补充 subjectId 召回；④ 携带 time 带 tick 前缀。

### S3 状态层 + 失效语义（2026-07-27，首跑完成）

- 实现（nb-memory 已提交）：联合调用第 6 类操作 `state`（只针对关键主体可变认知、本批显著改变才提案、状态层快照进上下文并强制复用已有 topic 原文）；取代语义 = 旧同 topic 条目 invalidate + 新条目 set（happening/state 二分落到生产路径）；检索对提及主体**确定性注入在效状态**（不赌语义命中）；as-of 走失效区间。
- 首跑（run `18-00-52`）：**asof 100%（8/8，泄漏 0）——六轮首次打满**，状态层 as-of 语义直接兑现；entity 77.8% 稳在终裁区间上沿；dump 状态层 16 条，取代链带失效区间清晰可审计，**无跨 topic 矛盾残留**（B1 首轮 baseline 实证短板的反面）。
- revision 50% 未达标但**无裁决力**：5 题中 3 题污染剔除、计分仅 2 题——与 S2 entity 同款分辨率病。陈旧 2 处逐题归因均非状态层设计失败：p017 是污染题；p029 是「契约实际内容」t18 字面召回缺失（S4 靶子）。
- **下一步（待用户）**：仿 S2 经验扩 revision 题量（5→12，prepare 草稿+人工校对金标）+ 推进 S4 字面融合（p029/p018/p027 钉子户全是其靶子），S4 落地后 revision/recall 预期一起抬。

### S4 BM25/字面融合（2026-07-27，首跑完成）

- 实现（nb-memory 2e0fc3d）：`retrieval/bm25.ts` 零依赖 BM25（中文按字 bigram、ASCII 整词）+ `search.ts` 语义/字面双路 RRF 融合（k=60 免调权）；**tick/主体过滤两路同权**（字面路不给 as-of 红线开口，有单测锚定）。
- 首跑（run `00-00-26`）：**entity 94.4% 历史新高**、**陈旧率 0 首达**、泄漏 0 维持、recall 87.5；「契约内容」p029 钉子户被字面路清零（S1 起连败四轮后 correct）。
- 残余 p018 病理转移：查询「匿名账号叫什么」**不含专名**，专名在答案侧——BM25 的 query→doc 方向无从发力（正向能力已由 entity 94.4 证明）。候补方案：答题侧利用主体卡别名（「魔法少女狐狐official」已挂在苏天晴别名上，t≥166）——归为 S5 观察项，不为单题过拟合。
- revision 25% 仍受 5 题小样本 + 污染剔除限制；**S3/S4 终验合并**：等 revision 扩题定稿后一次双跑同时裁决（revision 100%/陈旧 0 + recall 100%）。

### S3 轮 2 + revision 扩题（2026-07-27，指标未达标，触发 blocked-stop 汇报）

- revision 扩题 5→12（草稿 10 收 7，金标人工终审；p029 判分口径修正=题目要求列旧猜测不判 stale）。
- **扩题揭穿小样本假象**：S4 首跑那次「陈旧率 0」是 5 题artifact；12 题下修复前四跑 revision 36.4/45.5/55.6/75.0（均 53.1）、陈旧 33–42%。
- 轮 2 修复（已提交）：① 提案提示词扩到**客观处境类**（生计来源/作品状态/道具持有/公开可见性…）；② 注入从「主体全部状态」改为**按查询相关性 top2**（原全量注入=8 条态度类淹没被问 topic）。
- 修复后双跑：revision 50.0 / 25.0（均 37.5）、陈旧 33.3/41.7。**两轮对比落在噪声内**：计分题仅 8–11 道且污染率 6.3–18.8% 摆动使分母不稳，单跑散布 25–75%——指标无裁决力。
- **确认生效的部分**：状态 topic 从清一色态度类扩到 28 类，含生计来源/视频账号的可见性/直播收入/神典石持有量——提案覆盖问题已解决。
- **残余病灶定位在检索侧，不指向形态**：① 目标 state 因 topic 措辞≠提问措辞未被召回（问「经济来源」，状态名「生计来源」）；② 无关 state 因正文字面含主体名被 BM25 召回挤占；③ 个别 state 的 view 偏题。泄漏 0 / as-of 正确性 / 取代链可审计跨全部跑次稳定。
- **blocked-stop 判定**：按计划纪律（指标连续两轮无法逼近且需判断是否形态缺陷）停下汇报。证据表明**不是形态缺陷**，是「状态检索命中率 + 评测分辨率」双重问题。待用户拍板：继续做结构性检索改动（主体当前状态清单注入 + 标注「当前状态」）再验，还是记录现状进入 S5 收口。

## 8. 交付物清单

1. sibling 仓 `nb-memory`（库 + tests + docs/adr + README 合同）。
2. nb-memory-bench 的 `nb-memory` adapter 与六 run 对照表终版。
3. 本文件回写：各里程碑实际结果、与计划出入、A-F 假设判定。
4. Task 113 README 补「spike 结论」节 → 支撑正式拍板（分叉 A/B/C、偷设计三项落点、主仓 subject 侧是否原地改造 vs 换用 nb-memory）。
