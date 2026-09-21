# 小说记忆模型设计候选

状态：**设计已获开发者审查通过（2026-08-28）**，9 条设计选择全部采纳，见第 11 节。不是 Spec，不是 ADR。

定位：**全新模型，不在既有实现基础上演进。** 本次 spike 独立建库、独立验证。`packages/nb-memory/` 只作为先验参考（见附录 B），不复用其类型、不受其既有决策约束。若本模型验证效果好，再单独讨论是否替换。

来源标注：
- 标「**推导**」的内容出自开发者与 Agent 的设计对话，未经实现验证。
- 未运行任何测试或基准，本文档不含实证性能或质量结论。
- 全文 `Fact`、`Episode` 等术语一律使用本文档定义，不沿用任何既有实现的同名概念。

---

## 1. 要解决什么

**把小说剧情变成一种既能精确回答「谁是谁、什么关系」，又能模糊回答「有个照镜子的场景」的结构。**

向量库切块加相似检索只能做后者。它答不了需要组合的问题——「和古书签约的那个人现在住在谁的身体里」要连着查三跳，向量空间里没有「连着查」这个操作，因为向量不能组合。

设计的出发点是人类记忆本身就不是一个库。情节记忆、语义记忆各有各的时间常数和失效模式，硬合成一个就把失效模式叠在一起。

### 两类信息的分界判据

整个模型的地基是这一条：

> **一条陈述如果必须知道上下文才能解释，它就不属于语义层。**

「她回头时恍惚看见老人在织围巾」——「她」是谁、从哪回头、这是第几次，全依赖上下文 → **情景信息**，进 `Episode`。

「苏天晴现在居于狐女身体」——单独拿出来照样成立 → **语义信息**，进 `Fact`。

这条判据可以直接当抽取管线的分流器，比「这句话重不重要」之类的启发式硬得多。它也不是拍脑袋来的：语义记忆的定义本来就是「被剥掉语境之后剩下的东西」。

---

## 2. 三个层次：类型 / 个例 / 提及

这三层横切全部节点类型，是模型里最容易混淆的一处，先立在前面。

| | 提及（一次指称） | 个例 token | 类型 type |
| --- | --- | --- | --- |
| 实体 | 「她」「那个包」 | `Individual`：苏天晴 | `Kind`：人、魔药 |
| 事件 | 「上次那事」 | `Episode`：第七场签约 | `Schema`：签约通常怎么演进（二期） |
| 断言 | 一句话里的一次陈述 | 特称 `Fact`：苏天晴头发是金色 | 泛称 `Fact`：魔药都装在瓶子里 |

推论：

- **`Episode` 永远是个例。** 重复出现的模式抽成 `Schema`，不塞回 `Episode`。
- **`Fact` 有个例和泛称两种**，且可反驳性不同。泛称「鸟会飞」不会被企鹅推翻；特称「我家那只鸟会飞」一次反例就推翻。两者混在一张表里，结果就是某个实例的事实污染了通用概念。
- **`Mention` 是最底层**，它连内容都不是，是一个指针的出现。抽取时产生，消解后可只留审计价值。

---

## 3. Schema 总览

```
核心五类 ── 去掉任何一类，模型就不成立 ─────────────────────

                    ┌─────────┐
                    │  Kind   │◄──── parent ────┐
                    └────┬────┘                 │
                         │ isa                  │
                    ┌────▼────────┐             │
   ┌── subject ────►│ Individual  │◄────────────┘
   │                └────▲────────┘
   │                     │ participant {role}
┌──┴───┐  predicate  ┌───┴─────┐  precedes
│ Fact │───────┐     │ Episode │─────────────► Episode
└──┬───┘       ▼     └────┬────┘
   │     ┌───────────┐    │
   │     │ Predicate │    │
   │     └───────────┘    │
   └──── evidence ────────┘

可选三类 ── 派生物 / 审计物，不建也能跑 ────────────────────

   ┌──────────┐      ┌──────────┐      ┌──────────┐
   │ Summary  │      │ Question │      │ Mention  │
   │ 由 Episode│      │ anchors →│      │ 指称 →    │
   │ 重算而来  │      │ 任意节点  │      │ Individual│
   └──────────┘      └──────────┘      └──────────┘
```

**核心五类：`Kind` / `Individual` / `Predicate` / `Fact` / `Episode`。** 同一性、类型规则、更新规则、语义断言、情景记录，五者互不可替代。

**可选三类：`Summary` / `Question` / `Mention`。** `Summary` 可从 `Episode` 完全重算；`Question` 是连载追踪的便利结构；`Mention` 只有审计价值。三者都可以后加，加与不加不影响核心语义，也不影响已入库数据的可用性。

`Schema`（事件模板）与 `Procedure`（怎么做）留二期。

---

## 4. 节点定义

记法：`?` 表示可空，`[]` 表示数组，`Ref<X>` 表示指向 X 的引用。

### 4.1 Kind — 类型节点

```
Kind {
  id              ID
  name            string
  parent          Ref<Kind>?          // 分类树
  basic_level     bool                // 是否为基本层次，见下
  identity_criteria enum              // 身份判据，见下
  attribute_slots [Ref<Predicate>]    // 该类型允许的谓词白名单
}
```

**`basic_level` 为什么需要。** 人自发说「椅子」而不是「家具」或「温莎椅」，因为那一层同时最大化类内相似性和类间区分度。工程含义有两条：对外呈现和默认标注都用基本层；压缩记忆时先丢下位细节、保上位结构。

**`identity_criteria` 为什么需要。** 同一性断言只有相对于某个类别才成立——问「A 和 B 是不是同一个」必须先问「同一个**什么**」，因为是类别提供了持存条件。不同类型的规则真的不一样：

| 值 | 含义 | 适用 |
| --- | --- | --- |
| `continuous` | 连续存在，不可替换，任何属性变化都不改变身份 | 人、角色 |
| `lineage` | 血缘性，内容全部重写后仍是同一个 | 文档、稿件 |
| `functional` | **功能变了就是换了类别** | 器物、道具 |
| `nominal` | 由约定的名称决定 | 组织、地点 |

`functional` 那条有实证基础：把一只浣熊染色改造成臭鼬的样子，孩子说它还是浣熊；把咖啡壶改造成喂鸟器，孩子说它现在是喂鸟器。生物类别抗拒外观改变导致的重分类，人造物则因功能改变而重分类。

**`attribute_slots` 是谓词白名单。** 顶层域不是平的枚举——人有角色、关系、偏好；器物有功能、位置、所有者；契约有状态、缔约方、条款。用一张通用属性表装所有东西，抽取时候选谓词就从十几个膨胀成任意字符串，准确率会掉一大截。

### 4.2 Individual — 个体节点（同一性锚点）

```
Individual {
  id            ID
  kind          Ref<Kind>
  status        enum { provisional, established }
  aliases       [Alias]
  merged_from   [Ref<Individual>]     // 合并后保留，旧引用仍可解析
  // 注意：没有任何内容字段
}

Alias {
  surface       string                // 「小破书」
  route         enum { name, epithet, description, pronoun_binding }
  since         DiscoursePos          // 读者从第几处起知道这是同一个
  confidence    float
}
```

**节点本身不携带内容**，它只是「同一个」这件事的所在地。所有内容都在挂到它上面的 `Fact` 里。

**`Alias.since` 是这个模型里最关键的一个字段。** 它表达「读者从文本第几处起才知道这两个称呼指同一个人」。在此之前的检索，两个称呼应当被视作两个实体。伏笔、身份揭晓、叙述性诡计全靠它——没有它，第一章的检索会泄漏第二十章才揭晓的身份。

**`merged_from` 为什么保留而不是抹掉。** 合并常常是不完全的：文本可能在揭晓之后仍以旧称呼指代，旧引用还会来敲门。保留来源既能解析旧引用，也能在发现合并错了的时候回退（`split`）。

### 4.3 Predicate — 谓词节点

谓词不是自由字符串。它是节点，因为它携带的规则决定了新 `Fact` 该取代还是追加。

```
Predicate {
  id                ID                // canonical，如 inhabits
  aliases           [string]          // 居于 / 附身于 / 占据
  domain            Ref<Kind>         // 允许的主语类型
  range             RangeSpec         // 允许的宾语类型
  cardinality       enum { single, multi }
  temporal_shape    enum { point, interval, state }
  inverse_of        Ref<Predicate>?
  symmetric         bool
  default_volatility enum { low, medium, high }
  default_centrality float
}
```

**`cardinality` 是最会产 bug 的字段。** 新来一条 `Fact`，是取代旧值还是追加？这个问题必须由谓词自己回答，不能在写入时临时判断。

- `single`：新值**取代**旧值，旧值设失效时点。例：版本、状态、发色、所在地
- `multi`：新值**追加**。例：依赖、朋友、标签

判错的后果非常具体：

| 错误 | 后果 |
| --- | --- |
| single 当 multi 用 | 库里同时躺着三个互不相容的所在地，检索出来自相矛盾 |
| multi 当 single 用 | 每加一个朋友就把上一个标成过期，朋友列表永远只剩最后一条 |

**`temporal_shape` 决定哪几个时间字段有意义：**

| 值 | 含义 | 时间字段 |
| --- | --- | --- |
| `point` | 发生一次就固定 | 只有 `valid_from`，无 `valid_until` |
| `interval` | 天生有起止 | 完整双端 |
| `state` | 当下状态，会被取代 | 双端 + 建议 TTL |

**谓词词表怎么来。** 三个选项，前两个都不行：

- 全封闭本体：精确，但脆，遇到新领域写不进去
- 全开放字符串：能写进去，但「拥有」「持有」「带着」永远合不到一起，等于没有索引
- **可行：小的封闭核心 + 开放扩展 + 别名归一**

第三种就是把实体消解那一套搬到谓词上：抽取得到的表层串是一个提及，要归一到 canonical 谓词。同一个问题，上一层。

**谓词几元。** 默认二元。一旦一条断言需要超过「主语-谓词-宾语」——「A 在 D 场合把 B 介绍给了 C」——**它就不是 `Fact`，是 `Episode`**。不做实体化，直接退回 `Episode` 表。这条边界很清晰，省掉大量麻烦。

### 4.4 Fact — 语义断言（本模型的核心）

```
Fact {
  id            ID
  subject       Ref<Individual|Kind>   // 必须是引用，见下
  predicate     Ref<Predicate>
  object        ObjectValue            // 带标签联合类型，见下

  // 认识论
  status        enum { narrated, claim, belief, speculation, disputed, inference }
  holder        Ref<Individual>        // 默认 world

  // 故事轴
  valid_from    Ref<Episode>?
  valid_until   Ref<Episode>?

  // 叙述轴
  asserted_at   DiscoursePos           // 必填
  retracted_at  DiscoursePos?

  // 溯源
  evidence      [Ref<Episode>]         // 只能指向 Episode
  inferred_from [Ref<Fact>]            // 与 evidence 严格分开

  // 强度三元组
  confidence    float                  // 多可能为真
  strength      float                  // 多容易被检索到
  support       int                    // 有多少证据

  // 更新策略
  modality      enum { constitutive, statistical, stipulated }
  volatility    enum { low, medium, high }
  centrality    float
}
```

**`subject` 必须是引用，不能是字符串。** 因为主语就是索引本身。更硬的理由是合并：如果主语是字符串，合并两个实体要重写每一条 `Fact`；是引用，只改一张别名表。

**`object` 是带标签联合类型：**

```
ObjectValue =
  | { t: "ref",        id: Ref<Individual> }
  | { t: "kindref",    id: Ref<Kind>, quant: "∃"|"∀", count?: int, unit?: string }
  | { t: "literal",    v: string }
  | { t: "number",     v: float, unit?: string }
  | { t: "special",    v: "UNKNOWN" | "NONE" }
  | { t: "unresolved", surface: string, candidates: [Ref<Individual>] }   // 仅暂存态
```

`t` 标签**必需**，因为它决定比较语义：两条 `Fact` 只有在主语相同、谓词相同、宾语类型可比时才构成冲突。没有标签，字面值「金色」和实体引用会被误判成同一条。

`special` 那一档别省。**`死因 = UNKNOWN` 表示文本明确留白**，这与「库里没有这条 `Fact`」是两回事：前者可以自信地回答「文本没说」，后者只能说「我没找到」。

`unresolved` 是合法的**暂存态**，抽取阶段必然产生。规则是：**未解析的宾语不得参与默认查询**，否则未解析的字符串会被当成已解析的实体用，这类脏数据一旦混进去极难清。固化阶段负责消解或物化。

**`status` 与 `holder` 是本模型区别于普通知识图谱的地方。**

| 值 | 含义 | 示例 |
| --- | --- | --- |
| `narrated` | 叙述层认定为真 | 苏天晴居于狐女身体 |
| `claim` | 某角色声称 | 古书自称跨越星空而来 |
| `belief` | 某角色相信 | 苏天晴认为古书知道她非原主 |
| `speculation` | 某角色推测，自己也标明不确定 | 苏天晴推测死因是心梗 |
| `disputed` | 文本明确悬置 | 太奶是否真的在临终场景在场 |
| `inference` | 读者或系统推断，非文本断言 | 古书可能在掩饰 |

没有这一层，被问到「苏天晴怎么死的」，系统会斩钉截铁答「急性心肌梗死」。**这不是检索问题，是表达能力问题**——属性单值，装不下「角色推测是心梗」和「叙述层认定未知」这两条并存的记录。

**三个强度数不能合成一个。** 它们会分离：证据充足但极少被调用（高 `support` 低 `strength`），或单一来源却深信不疑（高 `confidence` 低 `support`）。**`strength` 绝不能被读作 `confidence`**——按检索频率排序再把首位当最可靠端出去，是一类真实且隐蔽的错误。

**`modality` 决定反例怎么处理。** `constitutive`（构成性，「狗有四条腿」）允许解释和规范判断——「那条狗**缺**了一条腿」；`statistical`（仅统计，「谷仓是红的」）不允许。反例撞上前者记为异常，撞上后者应更新分布。

**`centrality` 决定推翻它要多少证据。** 规则：**推翻一条 `Fact` 所需的证据量正比于 `centrality` × 既有 `support`。** 一条被上百次证据支撑的中心属性，不该被一次随口提及推翻。

### 4.5 Episode — 事件节点

```
Episode {
  id            ID
  discourse_pos DiscoursePos           // 必填，全序
  story_time    StoryTime?             // 常缺失
  duration      string?                // 人读，如「约五十分钟」
  content       text                   // 释义，不含原文
  source_pointer { chapter, paragraph: { start, end } } // 本地原文定位
  context       Context
  participants  [Participation]
  precedes      [Ref<Episode>]
  ...
}
```

  participants  [Participation]
  precedes      [Ref<Episode>]         // 偏序，顺序的权威来源
  part_of       Ref<Summary>?

  outcome       string?
  valence       float                  // -1..1
  arousal       float                  // 0..1
  register      [string]               // 语域标签：喜剧 / 紧张 / 抒情
  surprise      float                  // 分割依据 + 保留优先级
}

Participation {
  entity        Ref<Individual>
  role          enum { agent, patient, theme, experiencer,
                       speaker, addressee, instrument, location }
}

Context {
  chapter       string
  scene         string?
  location      Ref<Individual>?       // kind = place
  pov           Ref<Individual>?       // 视角人物
}
```

**`participants` 是让 `Episode` 成为情节记忆的唯一字段。** 没有它，你有的是「带氛围的文本块」，不是「有参与者的事件」，问不了「关于古书的所有场景」。

**`role` 不能省。** 只有集合没有角色，只能答「这一场有谁」，答不了「谁对谁做了什么」。签约那场里苏天晴是签署方、古书是提出方，两者都是参与者但不可互换。这是叙事问答质量差距最大的一个字段。
**`content` 不可变。** 它保存结构化释义，`source_pointer` 指向原文段落。要求释义而非摘抄的理由是可检索——抄一段原文没法被跨章比较；不是因为原文不能存（登记过的样本章节正文就在 `t01/evidences/` 下）。事件的**解释**放在 `Summary.why`，随时可重写。

**`surprise` 一个信号两个用途：**既是场景切分的依据，也是保留优先级。

### 4.6 Episode 的边界怎么切

不按 token 数切。按**预测误差**切——维持一个事件模型，当它不再能预测，就关掉当前事件、开一个新的。

切点信号，按优先级：

1. `context.location` 变了
2. `participants` 集合发生显著变化
3. `outcome` 落定
4. 故事时间出现跳跃
5. 视角人物切换

粗略量级：一条 `Episode` 覆盖一个完整场景，通常是若干段。**不是**一个段落，**不是**一句话，**也不是**一整章。

配套归档规则：**保留第一次，保留例外，压缩中间。** 中间那些重复实例的信息会被抽进 `Schema`（二期），留着是冗余；第一次和例外携带的正是 `Schema` 抽不走的信息。

### 4.7 Summary — 派生摘要（可选）

```
Summary {
  id            ID
  covers        [Ref<Episode>]
  grain         enum { scene, chapter, arc }
  gist          text                   // 压缩叙述
  why           text                   // 因果解释，MUTABLE
  generated_at  DiscoursePos
  recomputable  bool = true
}
```

三个作用：让「第一章讲了什么」返回一段而不是八条 `Episode`；给可变的解释一个存放处，从而保住 `Episode` 的不可变；**可整体删除、从 `Episode` 重算**。

最后一条是它与 `Episode` 的根本区别：派生物 vs 原始记录。

### 4.8 Question — 未决问题（可选）

```
Question {
  id            ID
  text          string
  origin        enum { textual, reader_hypothesis }
  raised_at     DiscoursePos
  anchors       [Ref<any>]
  status        enum { open, resolved, abandoned }
  resolved_by   Ref<Fact|Episode>?
  resolved_at   DiscoursePos?
}
```

之所以值得建成节点：它要锚定到具体场景和实体；要能被后续 `Fact` 关闭；而且「现在还有哪些没解答」本身是合法查询。连载小说里它就是伏笔与回收的追踪表。

`origin` 区分「文本明确悬置」（原主是谁、造物主是谁）和「读者推断」（古书可能在掩饰）。前者是文本的承诺，后者是我们的猜测，不能混。

### 4.9 Mention — 提及记录（可选）

```
Mention {
  surface       string
  episode       Ref<Episode>
  span          [int, int]
  resolved_to   Ref<Individual>?
  method        enum { exact_alias, coref_llm, manual }
}
```

抽取的中间产物。保留它的价值是审计共指消解——出错时能定位是哪一次指称解析错了。不保留也能跑，一期建议保留。

---

## 5. 三条时间轴

```
故事时间   在虚构世界里何时为真         偏序，常缺失
叙述位置   在文本第几处被揭示           全序，永远可得
事务时间   我们的库何时记录             只用于管线审计，无叙事含义
```

### 5.1 为什么叙述位置必须独立成轴

批量入库时，事务时间全挤在同一分钟内，携带的信息量为零。就算按章增量入库让它碰巧相关，那也只是摄入顺序的副产品——重跑一次、并行处理一次、补抽一次就没了。而且粒度也不对：你要的是「第 3 章第 47 段」，不是时间戳。

**叙述位置是三条里唯一永远可得的**，应该是默认排序键。

```
DiscoursePos = { chapter: int, paragraph: int, sentence: int }
// 可折叠成全局递增整数，能全序比较即可
```

### 5.2 故事时间存什么

**不存时间戳，存 `Episode` 引用。**

```
StoryTime =
  | { t: "episode",  ep: Ref<Episode> }              // 默认：锚在场景上
  | { t: "labeled",  label: string, ord?: int }      // 「天元三年春」
  | { t: "relative", anchor: Ref<Episode>, offset: string }  // 「五分钟前」
  | null
```

排序走 `Episode.precedes` 偏序。这样永远不用编造文本没给的时间坐标。

**这条同时解决了自定义历法。** 你不需要知道「天元三年」换算成多少秒，只需要知道它在「天元二年」之后，而这个顺序文本几乎总是给了。只有查询需要做**时长算术**（「她被困了多少年」）时才必须注册真历法：

```
Calendar { name, units[], ratios, epoch? }   // 只在需要算术时建，二期
```

先做偏序、后补历法不会返工，因为历法只是给已有偏序补上距离。反过来先建历法，你会被迫为文本没给的时间点编造坐标。

### 5.3 追溯性揭示

第 20 章揭示古书在第 1 章撒了谎，哪些字段动？

| 字段 | 变化 |
| --- | --- |
| `status` | `claim` → `disputed` 或新增证伪 `Fact` |
| `holder` | 不变（还是古书说的） |
| `valid_from` | 不变（它从来就不为真） |
| `asserted_at` | 不变（读者确实在第 1 章听到了） |
| `retracted_at` | **新增 = 第 20 章** |

**撤销、修正、反转全部发生在叙述轴；故事轴只记录世界的状态变迁。**

`Episode` 完全不动——古书确实在第 1 章说了那句话，这件事永远为真。撤销只作用于 `Fact`。

附带效果：系统能回答「我是从哪一章开始不信它的」。真实读者回答不了——人是就地更新的，旧状态直接丢失，于是产生「我早就看出来了」的错觉。这是刻意做得比人类读者更可靠的一处。

### 5.4 一个可直接执行的验收判据

**同一个问题的两种问法必须走不同的轴，且答案不同：**

- 「苏天晴什么时候开始后悔的？」→ 故事轴 → 第八场
- 「读者什么时候知道契约是坑？」→ 叙述轴 → 第七段

如果系统这两问答出同一个东西，说明两条轴被合并了。倒叙、伏笔、叙述性诡计全都活在两条轴的差值里——差值为零，那些手法在模型里就不存在。

---

## 6. 五条不可妥协的规则

1. **凡是需要认识论状态或时间边界的东西，必须是节点，不能是节点属性。** 属性单值，装不下并存的多个值。还能留作节点属性的只有不可变身份字段。

2. **记录不可变，解释可变。** `Episode.content` 与 who/where/when 永不修改；`Summary.why` 随时可重写。

3. **证据只能指向 `Episode`，派生内容永不能成为另一条派生内容的证据。** `evidence` 与 `inferred_from` 严格分开，后者不缓存、前提变动时失效。

4. **取代而非覆盖。** 旧值设失效时点，退出默认检索但仍可查史。删了就丢掉「她曾经…」和「什么时候变的」两类查询。

5. **认识论状态必须一路传到最终回答，不允许在生成时被抹平。** 检索层区分了六档，回答就必须携带对应的措辞强度。这一条是防幻觉的主要防线。

---

## 7. 叙述记法（上下文无关）

抽取的输出不是自由文本，是一种可解析、可校验、可约束解码的记法。

**它之所以能做成上下文无关的，正是因为共指已经被解析掉了——文法里根本没有代词的产生式。**

```ebnf
line       ::= kindline | state | event | question
kindline   ::= "K" ID "isa" ID
state      ::= "S" ID "." pred object status? holder? evidence?
event      ::= "E" ID time actor role target? payload? status?
question   ::= "Q" ID quoted anchors origin

time       ::= "[" story "|" "d" int "]"
status     ::= "%" ("narrated"|"claim"|"belief"|"speculation"
                   |"disputed"|"inference")
holder     ::= "^" ID
evidence   ::= "@" ID+
pred       ::= ID
object     ::= ID | quoted | number | "UNKNOWN" | "NONE"
              | "∃" ID ("×" int unit)?
ID         ::= [a-z][a-z0-9_:]*        (* 只允许标识符，不允许指称串 *)
```

样例（第一章）：

```
K su_tianqing isa person
K body_fox    isa body
K codex       isa artifact

E E1 [T-5|d2] su_tianqing experiencer 心口剧痛 @noodle_stall %narrated
E E1 [T-5|d2] su_tianqing experiencer tai_nai "织围巾" %disputed
E E3 [T0|d1]  su_tianqing experiencer body_fox "镜中" %narrated
E E5 [T1|d4]  codex speaker su_tianqing "停顿后复述说辞" %narrated
E E7 [T3|d6]  su_tianqing agent contract_main "签订" %narrated

S su_tianqing .inhabits body_fox        %narrated @E3
S body_fox    .hair_color "金色"         %narrated @E3
S su_tianqing .cause_of_death "急性心肌梗死" %speculation ^su_tianqing @E1
S su_tianqing .cause_of_death UNKNOWN    %narrated @E1
S codex       .self_role "星界使者"       %claim ^codex @E7
S contract_main .goal "成为反派魔法少女"   %narrated @E8
S magical_girl .death_rate 90            %claim ^su_tianqing @E8

Q Q1 "太奶是否真的出现" -> [E1] textual
Q Q3 "原主是谁、去了哪" -> [E6, original_owner] textual
Q Q8 "古书停顿后复述是否在掩饰" -> [E5] reader_hypothesis
```

每行独立可解释，行间无顺序依赖，可任意重排、增量追加、单行校验。

**附带的工程收益：这套文法可以直接做约束解码**，逼模型只能吐出合法行，抽取阶段的格式错误归零。

---

## 8. 抽取管线

**LLM 在这条管线里的职责，就是把上下文相关的语言转成上下文无关的语言。**

做共指消解、省略补全、言外之意判定，把「她」变成 `su_tianqing`，把「对方」变成 `codex`。这是对抽取步骤最准确的描述：**消除语境**。

```
原文
 ├─► 切分 Episode（预测误差信号）
 ├─► 抽取命题（最小单位是命题，不是句子）
 │     ├─ 事件命题 → Episode beat
 │     └─ 状态命题 → Fact
 ├─► 共指消解 → Individual（候选生成见下）
 ├─► 谓词归一 → Predicate
 ├─► 认识论标注 → status / holder
 └─► 固化：物化 token、检测冲突、应用基数规则、生成 Summary
```

**最小单位是命题，不是句子。** 同一句话经常同时贡献两类信息：「她在落地镜中看到金色长发、兽耳和狐尾」，情景上是「第一次照镜」这个瞬间，语义上是三条身体属性。所以分流的单位必须是命题。

**共指消解不用向量。** 嵌入给的是相似性，而消歧要的是约束满足，这两件事在人物身上正好冲突：同一部小说里的女性角色在向量空间里必然是近邻，相似度在这里不是弱信号而是**有害信号**。用 LLM 直接决策。

候选生成也不需要向量，用**近因加场景共现**即可：代词的所指绝大多数是当前或前一个 `Episode` 里活跃的实体。候选集 = 当前 `Episode` 参与者 + 前一个 `Episode` 参与者 + 全部具名角色，小说场景下通常不到五十个。

**惰性物化。** 「她有一瓶魔药」中的那一瓶，默认不建节点，只写成对类型的量化断言：

```
S su_tianqing .possesses ∃ potion ×1 瓶 %narrated @E12
```

满足以下任一条件才物化成个体节点并回填引用：

1. 出现第二次谓述（「魔药是红色的」）
2. 出现**定指**（「**那**瓶魔药」）
3. 它开始有自己的属性

第 2 条有语言学依据：定指标记就是「读者正在追踪这个所指」的文本自证信号，汉语靠「一/那/这」和存现句式来标记。这不是我们猜的，是文本自己给的证据。

---

## 9. 检索架构

**三层存储，各回答不同问题：**

| 层 | 结构 | 回答 |
| --- | --- | --- |
| 图 | Individual / Fact / 边 | 谁是谁、什么关系、状态如何、有无矛盾 |
| 向量 | Episode 分块 + 元数据 | 「有个照镜子的场景」这类模糊线索、氛围、语气 |
| 逐字 | 不可变原文 | 逐字引用、消歧、防漂移的最终仲裁 |

**分工的正确切法不是「语义用图、情景用向量」，而是：图负责同一性与组合，向量负责相似性与质地。**

- 语义层图为主，**不用向量**（见第 8 节）
- 情景层向量为主，但必须挂一副图骨架——who / where / when 走图，其余走向量

向量索引的每个分块携带完整元数据：

```
{ text, episode_id, discourse_pos, story_time,
  participants[], speaker?, epistemic_default, valence }
```

分块建议按叙述 / 对白 / 内心独白分开切，因为三者的认识论默认值不同：对白默认 `claim`，内心独白默认 `belief`。

**查询流程：**

```
模糊线索 → 向量召回分块 → 取 episode_id 进图
        → 沿 participant 扩展到实体
        → 拉 Fact 并按 status 分层
        → 按故事轴或叙述轴排序
        → 需要引用时回逐字层
```

**回答策略是一条硬规则：`status` 必须一路传到最终回答，不允许在生成时被抹平。**

---

## 10. 第一章落地推演

用样书第一章做的纸面推演，只用结构要素。原文见 `t01/evidences/chapter-001-source-normalized.txt`（第 N 行即第 N 段）。**推导，未实测。**

### 实体

```
Individual  su_tianqing      kind=person   identity=continuous
                             别名：苏天晴 / 最佳适格者
Individual  body_fox         kind=body     金发、兽耳、狐尾、幼小
Individual  original_owner   kind=person   status=provisional，空节点
Individual  codex            kind=artifact identity=functional
                             别名：墨丘利秘典 / 黑色典籍 / 小破书 / 星界使者
Individual  tai_nai          kind=person   存在性存疑
Individual  creator          kind=person   status=provisional
Individual  contract_main    kind=contract
Individual  bedroom / noodle_stall         kind=place
```

**心智与身体必须是两个个体**，用 `inhabits` 连接。原主是第三个几乎全空的节点。三者压成一个，「原主是谁」就无处安放；分开存，才能既回答「苏天晴现在长什么样」（沿 `inhabits` 走到身体取属性），又保住「这具身体之前归谁」是空的。

`codex` 的别名里，「小破书」的 `route` 是 `epithet`（蔑称），「星界使者」是它的自称——后者严格说是一条 `%claim` 的 `Fact` 而非别名，需要在抽取时区分开。

### 场景

八个场景。**第二场（面摊之死）故事时间最早但叙述位置排第二。** 这条倒叙就是两条轴必须分开的直接证据。

| id | 叙述位置 | 故事时间 | 参与者 | 结果 |
| --- | --- | --- | --- | --- |
| E1 | d2 | 最早 | 苏天晴, 太奶(存疑) | 死亡 |
| E2 | d1 | T0 | 苏天晴, 古书 | — |
| E3 | d1 | T0+ | 苏天晴 | 震惊 |
| E4 | d3 | T0+ | 苏天晴 | 接受 |
| E5 | d4 | T1 | 苏天晴, 古书 | — |
| E6 | d5 | T2 | 苏天晴, 古书 | — |
| E7 | d6 | T3 | 苏天晴, 古书, 契约 | 契约缔结 |
| E8 | d7 | T4 | 苏天晴, 古书 | 欲哭无泪 |

### 依赖认识论状态的断言（至少 6 条）

| 断言 | status | holder |
| --- | --- | --- |
| 死因为急性心肌梗死 | `speculation` | 苏天晴 |
| 死因未知 | `narrated` | world |
| 太奶在临终场景在场 | `disputed` | 苏天晴（主观知觉） |
| 古书跨越星空而来 | `claim` | 古书 |
| 古书是星界使者 | `claim` | 古书 |
| 魔法少女死亡率九成 | `claim` | 苏天晴 |

**这一节是整个设计最该被检验的地方。** t01 已记录的多轮摘要缺陷——把「恍惚看见太奶」压成太奶客观在场、把主观触感升级为摘要者确认——都是认识论状态在文字层被抹平。**结构层保留这个字段，等于把该缺陷从「靠提示词反复纠正」变成「结构上无法表达错」。**

### 状态迁移

契约状态在叙述过程中升级：第七场时它只是古书的说法（`claim`），第八场脑中确认后升为 `narrated`。同一条断言，故事时间不变，认识论状态在叙述轴上迁移。

态度也迁移：兴奋（valid E7–E8）→ 后悔（valid E8–）。两条并存，问「她一开始什么反应」取前者，问「她现在什么态度」取后者。

### 三个查询走查

**「苏天晴是怎么死的？」**
召回 E1 → 拉到两条 `cause_of_death`，一条 `speculation` 一条 `narrated`+`UNKNOWN` → 回答必须是：她在面摊突发心口剧痛后失去意识；本人事后推测是急性心肌梗死，但文本没有确认，确切死因未知。同时可挂出 Q2。

**「她第一次看到新身体是什么反应？」**
按故事轴取 E3 → E4。需要两条轴才排得对——E4 的叙述位置是 d3，但故事时间紧接 E3。

**「古书可信吗？」**
只有靠 `status` 分层才答得好：关于自己的三条陈述全是 `claim`，无一条被叙述层确认；行为层有一条被叙述为真的可疑迹象（停顿后复述）；它承诺的与实际派发的存在落差（Q7）；且它掌握着苏天晴不知道的信息。结论只能是推断，且必须标为 `inference`。

---

## 11. 设计裁决

开发者已于 2026-08-28 通读并**全部同意**下列建议。这些都是本模型内部的设计选择，不与任何既有决策冲突。记录在此作为 spike 的起始约束。

| # | 问题 | 裁决 |
| --- | --- | --- |
| D1 | `Kind` 节点一期做还是二期做 | **一期做。** `identity_criteria` 和 `attribute_slots` 直接影响抽取准确率，不是纯增量 |
| D2 | 谓词词表的核心集合有多大 | **从 20–30 个起步**，按 `Kind` 分组，跑完第一章后按缺口扩 |
| D3 | `Mention` 是否落库 | **一期落库**，用于审计共指错误；稳定后可关 |
| D4 | `Schema`（事件模板）与 `Procedure` | **二期。** 单章无法抽出模板，至少要十章以上 |
| D5 | 惰性物化的三条触发条件够不够 | **待实测**，尤其是定指信号在汉语里的召回率 |
| D6 | 存储选型 | **SQLite 加边表**，不上图数据库。规模不是约束（见 D7），选型只看查询写起来顺不顺手 |
| D7 | 单节点活跃 `Fact` 量级 | 采用**推导值待实测**：主角活跃 50–150、累计 200–500；全书实体几百到两千、`Fact` 总量五千到两万 |
| D8 | 强度三元组的初值与更新公式 | **一期只用 `support` 计数**，`strength` 与 `confidence` 留常量，等有查询日志再调 |
| D9 | 分块粒度 | **按叙述 / 对白 / 内心独白三分**，每场景 2–4 块 |

**D7 若成立，有一个对架构影响很大的推论：单个节点的全部活跃 `Fact` 塞得进上下文**（150 条 × 约 20 token ≈ 3k token）。这意味着检索的职责只是**选对节点**，不需要在节点内部排序 `Fact`，能消掉一大类复杂度。这条必须实测，是 S1 的全部目的。

D5 与 D7 是仅有的两条「同意方向、结论待实测」，它们分别对应 spike 的 S2 与 S1。

---

## 12. Spike 范围与验收

建议只做三件事，都是为了证伪而不是为了实现。

### S1 — 验证量级推断（最便宜，最决定形状）

用样书前若干章跑抽取，数活跃 `Fact` 数。塞得进上下文，架构可大幅简化；塞不进，检索层要复杂得多。

### S2 — 验证结构化可抽取性（最高风险）

结构化命题能不能被稳定抽出来，是整个设计成立的前提。抽不出来，基数、冲突检测、组合查询全是空的。

做法：用第一章做金标准标注，测召回与准确。约束解码下的格式合规率应接近 100%，重点看语义正确率。

### S3 — 验证认识论标注（最高价值）

六档 `status` 能不能被稳定标出来。第一章那 6 条是现成的测试集。

**验收判据：问「苏天晴怎么死的」，回答必须带限定语气。** 答成肯定句就是失败，不管检索命中率多高。

### 最该先测的单点

**同一属性在两个场景取不同值时，是否正确形成两条带有效区间的记录**，而不是互相覆盖或并列成两条无时序的活跃记录。用「对契约的态度」（兴奋 → 后悔）做样例。

这一点错了，后面所有时序查询都是错的。

### 明确不做

- 不做跨作品泛化验证，单书单章的结论不外推
- 不做性能优化，规模不是本次约束
- 不接入任何现有产品模块，不写真实 Project
- `Schema`、`Procedure`、`Calendar` 全部留二期

---

## 附录 A：概念来源

模型的每条设计规则都有对应的经验依据，列在这里便于后续争论时回溯。**这些是设计的理由，不是本 spike 的验证结论。**

| 设计 | 依据 |
| --- | --- |
| 情景 / 语义分库 | 情节记忆与语义记忆在脑损伤病例中双向分离 |
| `Individual` 无内容字段 | 人物识别的身份节点是模态无关的枢纽，本身不携带内容 |
| `Alias.since` | 「何时得知同一性」是独立于内容的认知事件 |
| `identity_criteria` 分类型 | 生物类别抗外观重分类，人造物因功能改变而重分类 |
| `basic_level` | 基本层次范畴在命名频率与反应时上有稳定优势 |
| `participants` 带角色 | 情节记忆的定义特征是「项目绑进语境」，绑定即结构 |
| `Episode` 按预测误差切分 | 事件分割的边界落在预测误差尖峰，且边界处有记忆效应 |
| `Episode` 不可变、解释可变 | 提取会让痕迹重新可塑，迭代转述必然漂移 |
| `status` / `holder` | 主观流畅度与准确度是两个独立的量 |
| 保留第一次与例外 | 重复实例的信息会被图式吸收，例外才携带增量信息 |
| 最小单位是命题 | 阅读时间与回忆颗粒度都随命题数而非词数变化 |
| 三层存储 | 中枢-辐条：跨模态枢纽负责同一性，各通道负责质地 |

## 附录 B：nb-memory 参考要点

`packages/nb-memory/` 是先验参考，**本 spike 不复用其类型、不受其决策约束**。若本模型验证效果好，再单独讨论替换路径。

值得在动手前读一遍的三点：

1. 它的双时间轴决策记录（`docs/adr/0005-*.md`）——倒叙导致故事时间回退这个论证与本文档一致，可以直接引用而不必重新论证。
2. 它的历法处理——历法不进库、由宿主注入，方向与本文档第 5.2 节一致。
3. 它自己记录的一个缺口（`docs/adr/0004-*.md` 第 4 节）：角色会相信错的东西，而「发生过就永远发生过」的模型隐含了「为真」。**本文档的 `status` / `holder` 正是冲这个缺口去的**，这也是本模型相对它最主要的增量。

术语提醒：它的 `Fact` 指「发生过的事」，与本文档的 `Fact`（可取代的语义属性）不是同一个概念。跨文档讨论时需要显式区分。
