# @notnotype/nb-memory

NeuroBook 记忆框架（Task 113 产物）。TypeScript / Bun 原生、零第三方依赖、Windows 可用；LLM / embedding / 存储 / 索引全部走可注入 port。

评测面：sibling 仓 `nb-memory-bench`（B1 剧情记忆基准，fanpai-loli 20 章 / 338 事实 / 48 探针）。设计决策与证据：`docs/adr/`。架构可视化：`docs/architecture.html`（单文件离线页，可直接浏览器打开）。

## 形态

```
episode（原始叙事，append-only，语义层可由其重放重建）
  ├─ facts        happening：发生过就永远发生过，append-only 永不失效，带 subjectIds[]
  ├─ registry     关键主体：类型 + 带时点的别名 + 一行本体描述（显式更新，非滚动 summary）
  └─ state        可变状态：带失效区间，取代 = invalidate + set
```

- **边不是存储对象**：subjectIds 含 ≥2 个 id 的事实本身就是边，关系查询 = 按 id 对查（图塌缩为「注册表 + 倒排索引」）。
- **消解在写入时完成**：每批事实一次「抽取+归一」LLM 调用，注册表全量进上下文（20 章 = 22 次调用）。
- **as-of 是一等公民**：别名带「何时得知同一性」、本体描述保留历史版本、状态带失效区间——查询任一历史时点都不会泄漏该时点之后才知道的事。

## 双时间轴

对齐 graphiti 的 bi-temporal，两条轴各自独立、同为 AND：

| 轴 | 语义 | 单调性 | 回答什么问题 |
| --- | --- | --- | --- |
| `tick` | 摄入序 / 叙事推进序（transaction time） | **永远单调** | 叙事推进到这里时，（该视角）知道多少 → **知识边界** |
| `instant` | 故事时间秒数（event / valid time），可空 | **可回退** | 故事时间的这一刻，世界是什么样 → **世界状态** |

`instant` 可回退是双轴存在的直接理由：倒叙 / 插叙 / 回忆章节里 tick 递增而 instant 后退，单轴系统在这里必然出错。

**fail-closed**：查询给了某轴而记录缺该轴坐标一律判不可见——无法安放的记录宁可漏召回，也不能泄漏进它可能并不属于的时间窗口。

Calendar 不进库，走宿主注入（`instant` 用 bigint 与 World Engine 日历内核同构）。只存 instant、不落人读串 = 改历法零迁移。

## 公开 API

```ts
import {NbMemory, FsStorage, SqliteIndexStore} from "@notnotype/nb-memory";

const memory = await NbMemory.open({
    storage: await FsStorage.open(dir),
    embedder, llm,
    indexStore: await SqliteIndexStore.open({file: `${dir}/index.sqlite`, modelKey: "openai/text-embedding-3-small/1536"}),
    deferEmbedding: true,   // 摄入只落库，嵌入交给 backfillVectors 后台补
});

// 摄入：一批事实一次联合消解（登记主体 / 别名合并 / 状态提案 / subjectIds 归一）
await memory.ingestBatch([{tick: 1, instant: 86400n, time: "第一天", text: "……"}]);
await memory.addFact({tick: 1, text: "……", subjectIds: ["su-001"], meta: {speaker: "老王", channel: "group"}});

// 检索：语义 + BM25 字面 RRF 融合；全部过滤对两路同权
const hits = await memory.search("粉发女孩是谁？", {asOfTick: 20, limit: 10});
const asWorldWas = await memory.search("她住在哪？", {asOfInstant: 1_000_000n});

// 多跳第一跳：问题里没有专名时的主体锚点
const met = memory.subjectsIn({instantRange: [a, b], types: ["character"]});

memory.registry   // register / addAlias / updateOntology / merge / resolve / card / canonicalId
memory.states     // set / invalidate / activeAt(asOf?, subjectId?)
memory.facts / memory.episodes
await memory.backfillVectors()  // 补齐未嵌入的向量，返回本次条数
await memory.stats()            // {entries, pendingVectors}
memory.dump()                   // 明文导出，可审查
```

### 查询计划

多跳查询（「昨天遇到的女孩，头发是什么颜色？」——问题里没有专名，主体锚点得先从时间窗口解出来）表达成结构化计划：

```ts
import {planHeuristically, planWithLlm, executePlan} from "@notnotype/nb-memory";

// 方案 C：零 LLM，词表 + 注册表求解，覆盖常见轮次
const plan = planHeuristically(query, {now: {tick, instant}, secondsPerDay: 86400, registry: memory.registry});
// 方案 B：截断上下文 + 注册表快照 → 一次小模型调用；失败自动降级
const {plan, degraded} = await planWithLlm(cheapLlm, {query, recentTurns, subjects: memory.registry.all, now});

const {hits, subjectsPerStep} = await executePlan(memory, plan);
```

三种产出方式（启发式 / 便宜模型 / 手写）共用同一份 schema，执行器完全一样——所以便宜模型的计划质量可以拿主模型的计划做离线对照。

#### 按描述解主体

`findSubjects` 除了按结构解（时间窗 / 类型 / 共现），还能按**描述**解——补的是「查询侧不含专名」这个盲区：

```ts
const {hits} = await executePlan(memory, {
    source: "manual",
    steps: [
        {op: "findSubjects", describedAs: "学校认识的猫娘兽人", types: ["character"]},
        {op: "search", query: "和风信子是什么关系", subjectsFrom: 0},
    ],
});
```

`mentionedIn` 那条字面路要求问句里原样出现主名或已知别名，「学校认识的猫娘兽人」一个主体都解不出来。`describedAs` 拿这句话去检索主体的本体描述（每个 ontology 版本一条索引条目），**零 LLM，只多一次 embedding**。

两个刻意的取舍：

- **描述条目必须显式 `sources: ["subject"]` 才召回**，否则每次普通检索都会被一堆本体描述挤占。
- **这条路只走语义、关掉字面路**。字面路的价值是专名召回，而这里恰恰没有专名；CJK bigram 会让「银发的剑士」和「戴兜帽的陌生人」因为共享一个「的」互相召回。解主体对错解的容忍度远低于普通检索——**解错会把后续整跳锚到错误主体，比解不出更糟**。

as-of 由版本链承担：ontology 版本链本身就是取代链，第 i 版在第 i+1 版生效时失效，所以「t=40 时还不知道他是银发剑士」这件事自动成立，这条路上不另写时间判据。

**已知局限**：没有相似度下限，存活集非空时总会解出某个主体。定下限需要评测数据支撑，未凭空拍数字。

**实测结论：`describedAs` 的输入必须是「指代短语」，不能是整个问句。** 在 fanpai-loli 语料上实测：

| 输入 | 解出结果 |
| --- | --- |
| 「主角重生后在学校认识的猫娘兽人，与魔法少女风信子之间是什么关系？」（整句） | ✗ 风信子 / 白貂精灵 / 花铃 |
| 「主角重生后在学校认识的猫娘兽人」 | ~ 苏天晴 / **南嘉鱼** |
| 「学校认识的猫娘兽人」 | ✓ **南嘉鱼** |
| 「深蓝色头发的猫女」 | ✓ **南嘉鱼** |
| 「会说话的黑色古书」 | ✓ **黑色古书** |

问句里另一个实体（「魔法少女风信子」）与疑问句式会把整句向量带偏。**所以抽取指代短语这一步不能省**——它正是规划器填 `describedAs` 时该做的事。`search()` 里的 `resolveByDescription` 直接灌整句，因此对这类混合问句无效（默认关闭，见下）。

## 纪律

- **jsonl 是唯一事实源**（episodes / facts / registry / state 四个文件，事件溯源、可 git diff）；向量与倒排索引都是派生物，删掉照常工作，只是慢一次。
- **成本纪律**：录入用 LLM（贵，可异步可批）；**检索基线永远是 0 次 LLM + 1 次 embed**，任何 LLM 增强都必须可选、可降级——规划挂了就退回朴素检索，绝不让增强路径变成必经之路。
- **消解是增强不是闸门**：联合调用失败重试 3 次后跳过本批，事实照常落库（计入 `skippedResolveBatches`），永不阻塞摄入。
- **引擎不变式兜底，不赌提示词**：如「一个名字不能既是 A 的主名又是 B 的别名」在批末自动 merge 修复。
- **先过滤再算距离，不做超采后过滤**：超采会让被过滤掉的未来片段先占名额，是 as-of 泄漏的经典来源。存储层的 SQL 下推**只允许放宽**（返回超集），权威判据只有 `passesFilter` 一份，由差分测试逐位钉死。
- **tick 不是时间**：「昨天」「上周」只在有 `instant` 时解析，否则如实记入 `unresolved`——硬映射成 tick 窗口会得到一个看似能用、实则随语料密度漂移的结果。
- 禁 better-sqlite3（要 node-gyp，Bun/Windows 装不上）；SQLite 本身没问题，用 runtime 内置的 `bun:sqlite` / `node:sqlite`。bench 消费本库走 tsconfig paths 直连源码（`link:` 装不上、`file:` 是拷贝会跑旧代码）。

## 存储

向量存普通 BLOB 列（Float32 小端），过滤走 SQL，精确余弦在 JS 里对已过滤存活集计算。**不用向量虚表**：本库查询几乎永远带过滤（一次 `search` 发出约 10 个子查询，多数候选集只有几十条），这种负载下先过滤再暴力扫描的成本正比于存活集，而 ANN 无论怎么过滤都要扫全图，还得靠超采近似过滤。成本模型是反的——过滤越严，暴力扫描越便宜。

换 embedding 模型只清空向量列渐进重嵌，**不报错也不要求删库**：记忆库是长期资产。

`deferEmbedding` 下摄入零 embedding 成本，字面路立即可召回、语义路等补齐——**优雅降级是双路架构白送的**。但 `stats().pendingVectors` 会如实暴露降级状态，不静默返回半成品。

## B1 成绩（fanpai-loli，facts 模式）

| 指标 | nb-memory | baseline（主仓 subject 记忆等价内核，同题集） |
| --- | --- | --- |
| entity | 76.3%（19 题集双跑均值，单跑最高 94.4%） | 68.4% |
| 时间泄漏率 | **0%（跨全部跑次）** | 22.2% |
| asof | 71–100% | 57.1% |
| 摄入成本 | 22 次 LLM / ~3 分钟 | 57 次 / 21 分钟 |
| 分身（同实体拆成多主体） | 0 | 存在 |

revision 未达标（双跑均 37.5%）——病灶为状态检索命中率与评测分辨率，非形态缺陷，详见 ADR 0003。

**读分数前先看 ADR 0003 的方法论**：跨题集分数不可比；单跑数字不可信（同配置 entity 两跑差 33pp）；裁决协议 = 扩题量 → 双跑均值 → 同题集对照。

## 决策考古

- ADR 0001：S0 建仓
- ADR 0002：S2-S4 注册表消解与引擎不变式
- ADR 0003：A-F 工作假设判定、遗留问题与方法论沉淀
- ADR 0004：视角与知识边界（三层拆解、一库一视角、角色视角下 fact = 见闻）
- ADR 0005：双时间轴、向量持久化与查询计划
