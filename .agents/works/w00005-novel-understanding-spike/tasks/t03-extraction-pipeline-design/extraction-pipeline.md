# 抽取管线提案

状态：**提案，等待开发者审查**。不是 Spec，不是 ADR，没有实现代码。

范围：给定小说章节文本，产出并维护符合 `nbook.novel-memory/v2-spike` 的图（`t02/chapter-01.json` 的形态）。

来源标注：全文为设计推导，**未经任何实测**。第 9 节的成本是纸面估算，第 10 节的指标目标是待验证的靶子而非结论。全部字段名与 `t02/schema.ts` 对齐。

---

## 1. 要解决的不是「让 LLM 吐一个 JSON」

最直接的做法是把一章文本丢给模型，让它按 schema 返回整份 JSON。这条路会在三个地方断掉，而且都不是调提示词能修的。

**一、交叉引用。** 一条 `Fact` 有六个外键：`subject`、`predicate`、`object.id`、`holder`、`evidence[]`、`validFrom`。让模型一次写出整张图，等于要求它同时记住并保持几百个 id 一致。结果是 `validate()` 的外键检查从兜底变成常态失败点——而这个校验器的价值恰恰在于它平时应该全绿。

**二、增量不是重写。** 第二章进来的时候，真正的工作不是"理解第二章"，而是"把第二章合进已有的图"。合并里最难的那步——这个「她」是不是上一章那个人、这条新属性是取代旧值还是与旧值并存——是全局判断，不是文本理解。模型手里只有一个窗口，没有全局。

**三、位置记账。** `assertedAt`、`Alias.since`、`evidence`、`precedes`、`support` 全是位置与计数。模型写这些只会引入噪声，而代码能 100% 算对。

所以这条管线的中心思想只有一句：

> **LLM 只做局部的语言判断；全局账本归代码。**

这不是保守。这是把每一步交给擅长它的一方。它也是 `memory-model.md` 第 8 节那句话的延长线——「LLM 的职责是把上下文相关的语言转成上下文无关的语言」——转换完就交棒。

---

## 2. 四条不可妥协的规则

### R1 · 只读前缀

**抽取第 k 段时，候选实体表、别名表、场景标签只能包含 `since ≤ k` 的条目——按「读到这里为止库里有什么」构造，不是按「库里现在有什么」构造。**

第一次顺序跑全书时这两者恰好相等：处理第一章时，库里本来就只有第一章。所以 R1 在第一趟里是空的。不相等的场合有四个，都是常规操作：

| 场合 | 泄漏怎么发生 |
| --- | --- |
| **重跑**（换提示词 / 修 bug / 换模型） | 全书已入库，第一章的候选表里躺着第二十章才出场的角色、才揭晓的专名 |
| **回填**（第 8 节批准新谓词后回填旧章） | 同上，回填用的是当前全局状态 |
| **章内并行**（S2 的窗口并行） | 第 50 段的产出先落库，第 5 段的候选表就看得见它 |
| **S1 自己** | S1 是整章一次调用，它看得见第 27 段。若它给第 5 段那一场打的 `context.scene` 用了后文才揭晓的专名，第一趟就已经泄漏 |

前三个都发生在第一趟之后，最后一个是结构性的——S1 必须看整章才能切场景。

**这条规则难缠的地方在于：第一趟的产出是对的，验收也过了；六周后换个提示词重跑，输出被静默污染。** 而 `validate()` 抓不到——结构完全合法，只是某些 `Alias.since` 变小了。

所以 R1 真正买到的性质不是「防泄漏」，是**重跑幂等**：候选表由位置决定，与库里已经攒了多少无关，第一次跑和第一百次跑拿到的候选表逐字相同。

并行的结论要分两种：**重跑可以完全并行**，每个窗口的切片取自已有的图，互不依赖；**只有首次抽取必须顺序**，因为窗口 k 的切片依赖窗口 1…k−1 的产出。

### R2 · 模型不写 id、不写位置、不写证据

模型只能在给定的候选集合里选，或产出受文法约束的表层串。所有 `ID`、`DiscoursePos`、`evidence`、`support`、`precedes`、`validFrom/validUntil` 由装配器派生。

效果：`validate()` 的外键错误从「模型质量问题」变成「管线 bug 的报警器」。前者只能靠调提示词，后者能被单元测试钉死。

### R3 · Episode 只增不改

所有修订只作用于 `Fact` / `Alias` / `Question` / `Summary`。重跑一章可以重算 `Fact`，但 `Episode.content` 一经写入不再变。

重跑时若切分结果与已有 `Episode` 不一致，**报警而不是覆盖**。重新切分是破坏性操作，必须走显式开关（`--resegment`），并且等于重建该章。

### R4 · 释义层与逐字层分离

`Episode.content` 是不含原文的结构化释义；同一记录必须带 `sourcePointer: {chapter, paragraph: {start, end}}`，指向本地原文段落。原文不复制进图谱——全书只保留一份权威副本（那份归一化正文文件），图谱靠 `sourcePointer` 指过去。`sourcePointer` 与 `content` 一经写入不可变，后续回答需要逐字引用时再由 locator 读取。

**这条现在不是隐私要求。** 按根 `AGENTS.md`「真实模型调用与样本数据」，小说正文不属于敏感数据，进不进 Git 由 Task 的`允许文件`决定。R4 保留下来的理由只剩两条：`content` 抄一遍原文等于没建索引，检索命不中；原文有两份副本就会出现哪份为准的问题。

S4 装配和 S7 闸门都必须拒绝缺少有效指针、包含原文重合或无法通过 canonical source hash 的记录；校验失败时不得持久化图谱。

---

## 3. 管线总览

```
章节文本
  │
  ├─ S0  定位           代码    段落编号 → DiscoursePos 索引
  │                             → 77 条 { paragraph, chars, sha }
  │
  ├─ S1  场景切分       LLM     整章一次，弱模型
  │                             → 8 个窗口 W1…W8：段落区间 + 场景标签 + 故事先后
  │                             代码按故事序拓扑排序 → E1…E8 与 precedes
  │
  ├─ S2  窗口抽取       LLM     每窗口一次，强模型 ★ 全管线风险最高的一步
  │                             输入：窗口文本 + 前缀候选表 + 谓词白名单
  │                             输出：记法行，约 14 行/窗口，不含任何 id
  │
  ├─ S3  归一           代码    表层串 → 实体 id / 谓词 id
  │        └ 定点重问   LLM     仅对未命中的行，小范围重试
  │                             → 归一后的记法行 + 未命中报告
  │
  ├─ S4  装配           代码    记法行 → 完整记录（补齐 id / 位置 / 证据）
  │                             一条 Fact 15 个字段，模型只碰 4 个
  │
  ├─ S5  固化           代码    基数取代 / 冲突检测 / 合并提名 / 幂等
  │                             → 合并后的图 + 冲突报告 + 待批队列
  │
  ├─ S6  派生           LLM     Summary.gist·why / Question / Question 关闭
  │
  └─ S7  闸门           代码    validate() + 指标 + 待批队列 → 整章落库或整章拒绝
```

八个阶段里**只有三个用模型**（S1、S2、S6，加上 S3 的定点重试）。这个比例是设计目标，不是巧合——每把一件事从模型挪到代码，就少一类无法回归测试的失败。

**S2 是唯一的强调用，也是唯一真正有风险的一步。** 其余七步要么确定性、要么便宜。这条管线值不值得做，本质上取决于 S2 行不行。

---

## 4. 逐阶段定义

### 先看整条链

**每一阶段的输出就是下一阶段的输入，中间没有隐藏状态。** 这条性质是后面所有可测试性的来源——任何一步都能单独喂进去、单独看出来。

| 阶段 | 谁做 | 输入 | 输出 |
| --- | --- | --- | --- |
| S0 定位 | 代码 | 章节纯文本（本地） | 段落索引：编号 + 字数 + 指纹 |
| S1 切分 | LLM · 弱 | 全章文本 + 段落索引 | 窗口表：段落区间 + 场景标签 + 故事先后 |
| S2 抽取 | LLM · 强 ★ | 单窗口文本 + 前缀候选表 + 谓词白名单 | 记法行（表层串，不含 id） |
| S3 归一 | 代码 + 定点重问 | 记法行 + 别名表 + 谓词表 | 记法行（已换成 id）+ 未命中报告 |
| S4 装配 | 代码 | 归一后的记法行 + 窗口位置 | 完整记录（`Fact` / `Episode` / `Alias` / `Question`） |
| S5 固化 | 代码 | 完整记录 + 现有图 | 合并后的图 + 冲突报告 + 待批队列 |
| S6 派生 | LLM | 本章 `Episode` + 新增 `Fact` + 全部 open `Question` | `Summary` / 新 `Question` / 关闭动作 |
| S7 闸门 | 代码 | 合并后的图 | 通过或拒绝 + 指标报告 |

下面八节用同一个例子贯穿：**第一章第 50–63 段那一场（缔约），以及它产出的那条 `F08`「苏天晴签了契约」**。同一份数据看八遍，就能看出每一步到底动了什么、没动什么。

**模型看得见原文，Git 看不见。** 这两件事不冲突：S1 与 S2 的调用在本地把原文读进提示词，落库的只有释义与段落指针（R4）。所以下面所有示例里，凡是涉及原文的位置一律只写段号，不写内容——这不是文档为了省事，就是管线真实的数据形状。

---

### S0 · 定位（代码）

**做什么** — 给每个段落一个稳定编号。之后全库所有位置字段都引用它。

**输入** — 章节纯文本，由 `t01` 的样书解析给出（E8）。

**输出** — 段落索引。**不含正文**，正文留在本地定位器里：

```jsonc
[
  { "chapter": 1, "paragraph": 1,  "chars": 34, "sha": "9f21…" },
  { "chapter": 1, "paragraph": 5,  "chars": 61, "sha": "a19c…" },
  …
  { "chapter": 1, "paragraph": 50, "chars": 88, "sha": "4d70…" },
  …
  { "chapter": 1, "paragraph": 77, "chars": 26, "sha": "77b0…" }
]
```

三个字段各有用处：

- `paragraph` —— `DiscoursePos` 的唯一来源
- `chars` —— 估 token、切窗口、算第 9 节的成本
- `sha` —— 让 R3 的「重跑时切分不一致就报警」有据可依。**原文改没改过，比对指纹就知道，不用把原文存进 Git。**

**判据：稳定。** 同一份文本重跑必须逐段给出相同编号。段落切分规则写死并纳入测试，不能跟着清洗启发式的版本走。

这一条比它看起来重要：编号一旦整体平移一位，`assertedAt` 与 `Alias.since` 会跟着全错，而 `validate()` 一个错都报不出来——结构完全合法，只是每条断言都指到了隔壁段。这类错误只有靠 S0 的确定性来防，事后无法检测。

**一期不产出句级编号。** `DiscoursePos.sentence` 是可选字段，留在模型里但不填。句级切分的重跑稳定性比段级难保证得多，而收益只是位置精确一档。

---

### S1 · 场景切分（LLM，整章一次，弱模型）

**做什么** — 把 77 个段落切成若干窗口，每个窗口将来变成一条 `Episode`。

按 `memory-model.md` 第 4.6 节的信号切，**不按 token 数切**：

1. `context.location` 变了
2. `participants` 集合显著变化
3. `outcome` 落定
4. 故事时间跳跃
5. 视角人物切换

**输入** — 全章文本 + S0 的段落索引。

**输出** — 窗口表。注意**没有 `E` 开头的 id**：R2 不许模型写 id，它只能用本地标号 `W1…Wn`，按叙述顺序编。

```jsonc
[
  { "w": "W1", "paragraphs": [5, 7],   "scene": "房间", "location": "昏暗的房间", "pov": "苏天晴",
    "storyAfter": ["W3"], "storyOffset": null },
  { "w": "W2", "paragraphs": [8, 10],  "scene": "房间", "location": "昏暗的房间", "pov": "苏天晴",
    "storyAfter": ["W1"] },
  { "w": "W3", "paragraphs": [11, 18], "scene": "面摊", "location": "面摊",       "pov": "苏天晴",
    "storyAfter": [], "storyOffset": { "anchor": "W1", "text": "五分钟前" } },
  { "w": "W4", "paragraphs": [19, 26], "scene": "房间", "storyAfter": ["W2"] },
  { "w": "W5", "paragraphs": [27, 35], "scene": "房间", "storyAfter": ["W4"] },
  { "w": "W6", "paragraphs": [36, 49], "scene": "房间", "storyAfter": ["W5"] },
  { "w": "W7", "paragraphs": [50, 63], "scene": "房间", "storyAfter": ["W6"] },
  { "w": "W8", "paragraphs": [64, 77], "scene": "房间", "storyAfter": ["W7"] }
]
```

**代码拿到这张表之后做两件事，都是纯计算：**

1. 按 `storyAfter` 拓扑排序，得到 `W3 → W1 → W2 → W4 → W5 → W6 → W7 → W8`，依次编号 `E1…E8`
2. `precedes` = `storyAfter` 取逆

这两步跑完的结果，与 `t02/chapter-01.json` 里手工写的 `Episode` 编号和 `precedes` **逐字段一致**——包括那个看起来最别扭的地方：`E1` 在第 11 段而 `E2` 在第 5 段。原因就在这里，**`E` 编号走故事序，`discoursePos` 走叙述序**，两者故意不一致。

**故事顺序只能给相对关系，不能给时间戳。** 这一步是倒叙唯一能被发现的地方——第一章的 `E1` 就是靠 `W3.storyAfter = []` 判出「故事时间最早」的。`storyOffset` 里的「五分钟前」是模型抄下来的措辞，`anchor` 由代码从 `W1` 换成 `E2`，两者合成 `Episode.storyTime`。

**粒度校准** — 一条 `Episode` 覆盖一个完整场景，通常若干段。不是一段，不是一句，也不是一整章。第一章 77 段切 8 场，平均 9.6 段，可当作量级参考。

**切歪了长什么样：**

| 切得太细 | 切得太粗 |
| --- | --- |
| 一段一场，`Episode` 退化成文本块 | 一章一场，`validFrom` 全指向同一条 |
| `participants` 无意义（每场一两个人） | 故事轴失去分辨率，「她当时什么状态」问不出来 |
| `precedes` 变成一条直线，倒叙消失 | 「兴奋 → 后悔」这类状态迁移无处安放 |

**这一步不需要强模型。** 判断「场景换了没有」比判断「这句话的认识论状态」容易一个数量级。

---

### S2 · 窗口抽取（LLM，每窗口一次，强模型）★

**做什么** — 一个窗口的文本进去，一组记法行出来。全管线唯一真正有风险的一步。

**建议把命题抽取、共指消解、谓词归一、认识论标注融成一次调用**，而不是四次串联。理由是这四件事互相依赖：

> 「她说她是星界使者」——判定 `status = claim`、`holder = codex` 的前提是知道说话人是谁（共指），而知道这是引语（语域）又反过来决定了状态。拆开做，每一步都在信息不足的情况下决策。

拆成四次的代价是四倍成本加信息割裂；合成一次的代价是失败不好定位。第 13 节 E1 请开发者裁决。

#### 输入三件套

以 **W7（第 50–63 段，缔约那一场）** 为例，实际拼进提示词的是这些：

```
【场景文本】第 1 章第 50–63 段          ← 本地读取，约 1.1k token，不入库

【候选实体】snapshotAt(第 49 段) 的 individuals —— 7 个
  su_tianqing     person     苏天晴 · 最佳适格者
  body_fox        body       这具身体
  codex           artifact   黑色典籍 · 墨丘利秘典
  tai_nai         person     太奶
  original_owner  person     （无别名）
  bedroom         place      昏暗的房间
  noodle_stall    place      面摊

【谓词白名单】19 个
  identity  located_in  inhabits  cause_of_death  died_at  attitude_to
  signed  suspects  designated_as  self_role  is_concealing
  hair_color  has_feature  apparent_age  previous_owner  offered
  lifecycle  goal  death_rate
```

**候选表怎么来：`snapshotAt(窗口首段 − 1)`。** R1 到这里就是一行代码，调 `t02/schema.ts` 的现成函数。这一行同时买到三个性质：

- 候选表由位置决定，与库里已经攒了多少无关 → 重跑幂等
- `contract_main` 与 `creator` 的 `since` 都是第 50 段，**不在表里**——它们是 W7 的产物，不是 W7 的输入
- `小破书` 的 `since` 也是第 50 段，所以候选表里 `codex` 只有「黑色典籍」和「墨丘利秘典」两个称呼。**模型是在不知道「小破书」这个称呼的前提下，从文本里认出它的**

第三条正是 R1 想要的效果：如果候选表按「库里现在有什么」构造，「小破书」会提前出现在第 5 段的提示词里。

#### 白名单怎么算 —— 一处需要裁决的漏洞

原本的规则是「按候选主语的 `Kind.attributeSlots` 取并集」。W7 的候选主语覆盖 `person` / `body` / `artifact` / `place` 四个 Kind，并集是 **16 个**谓词，看起来很好。

但漏了 `contract` 的两个槽 `lifecycle` 和 `goal`——因为 `contract` 这个 Kind 在第 49 段之前没有任何实例，不进候选表，它的槽位也就进不了白名单。而 `F25`「这份契约 · 已缔结」恰恰要在这一场产出。**模型手里没有 `lifecycle` 这个词，这条事实就抽不出来。**

这是「新实体在哪一场诞生，就在哪一场需要它的槽位」造成的死循环，不是提示词能修的。建议改成：

> **白名单 = 候选主语的 Kind 槽位 ∪ 全部 `basicLevel: true` 的 Kind 槽位。**

`basicLevel` 的定义本来就是「对外呈现与默认标注都用基本层」，也就是「你临时要给一个新东西命名时会用到的那一层」，正好是这里需要的集合。第一章按这条算出来是 19 个（全部），因为 registry 现在只有 19 个；`role` 是 `basicLevel: false`，不进。

代价要说清楚：白名单会从「十几个」涨到「几十个」。粗估 15 个基本层 Kind、每个 25 个槽、去重后 60–80 个，仍远小于 200，但第 9 节的指令 token 要往上调。**列为 E10 待裁决。**

#### 输出

**是记法行，不是 JSON。** 理由见第 6 节。W7 吐出 14 行：

```
C W7 "与悬浮的典籍缔结契约，对方自称星界使者，她当场答应。"
M W7 story_after=W6 valence=0.6 arousal=0.7 surprise=0.48 outcome="契约缔结" register=喜剧
P W7 su_tianqing agent
P W7 codex agent
P W7 "这份契约" theme
A codex "小破书" epithet
?I "这份契约" -> "contract"
?I "造物主" -> "person"
S codex .self_role "星界使者" %claim ^codex
S su_tianqing .signed "这份契约" %narrated
S su_tianqing .attitude_to "兴奋" %narrated
S codex .offered "这份契约" %narrated
S "这份契约" .lifecycle "已缔结" %narrated
Q "造物主是谁" -> ["造物主", codex] textual
```

三个地方值得停一下：

- **`su_tianqing`、`codex` 是 id，`"这份契约"` 是带引号的表层串。** 前者在候选表里，模型是「选」；后者不在，模型只能「抄」。这个区别是 S3 的全部工作量所在
- **`^codex` 只在 `%claim` 那行出现。** `%narrated` 的 `holder` 恒为 `world`，代码补，模型不写（第 5 节）
- **没有 `@evidence`、没有 `assertedAt`、没有 `F08`。** 记法里就没有这些产生式，模型想写也写不出来——这是 R2 的语法级执行

---

### S3 · 归一（代码 + 定点重问）

**做什么** — 把表层串换成 id，把换不掉的挑出来。

**输入** — S2 的记法行 + 当前别名表 + 谓词 registry。

**输出** — 归一后的记法行 + 一份未命中报告。W7 的 14 行分成三堆：

| 结果 | 行数 | 哪些行 |
| --- | --- | --- |
| 直接归一 | 7 | `C` / `M` / 两条 `P` / `A` / `self_role` / `attitude_to` |
| 新实体提名 | 2 | `?I "这份契约"`、`?I "造物主"` |
| 依赖提名，暂挂 | 5 | `P … theme`、`signed`、`offered`、`lifecycle`、`Q` 的 anchor |

归一动作长这样：

```
  A codex "小破书" epithet
→ A codex "小破书" epithet                      codex 在候选表 → 原样通过

  S su_tianqing .signed "这份契约" %narrated
→ S su_tianqing .signed ?"这份契约" %narrated    宾语未命中 → 标 unresolved，等提名批准
```

未命中报告：

```jsonc
{
  "batch": ["ch01", "W7", "prompt-v1", "model-x", "registry-v1"],
  "resolved": 7,
  "nominatedIndividuals": [
    { "surface": "这份契约", "kind": "contract", "route": "description", "usedInLines": 4 },
    { "surface": "造物主",   "kind": "person",   "route": "description", "usedInLines": 1 }
  ],
  "nominatedPredicates": [],
  "pendingLines": 5
}
```

**谓词提名为什么是空的。** 假设模型另外吐了一行 `?P "缔结" -> "signed"`：S3 先查 registry 的 `aliases[]`，`signed.aliases` 里已经有「缔结」，于是直接归一，**不进队列**。别名表在这里挡掉了绝大多数看起来像新谓词的提名，队列里剩下的才是真的没见过的词。这就是第 8 节那个「队列长度快速衰减」预期的来源。

**定点重问**只针对未命中的行：把候选表和该行一起重发，问「这个指的是列表里的哪一个，还是都不是」。窗口不变，一次约 2k token，成本可以忽略。

#### E4 的直接代价，请连带考虑

E4 的建议裁决是「具名角色可自建，非具名必须走 `?I` 提名」。按这条规则数一遍第一章的 9 个实体：

| 可自建（有 `name` 路由别名） | 必须提名 |
| --- | --- |
| `su_tianqing`（苏天晴）、`tai_nai`（太奶） | `body_fox`、`bedroom`、`noodle_stall`、`original_owner`、`contract_main`、`creator` |
| `codex` —— 但只从第 27 段起，之前它叫「黑色典籍」，是 description | |

**9 个里 6 个要人批**，第一章跑一趟就攒 6 条待批。这是 E4 那条规则的直接代价，之前没算过。

提名不阻塞落库：相关行以 `object.t = "unresolved"` 先写进去，批准后回填（第 8 节第 4 步）。但这意味着第一章第一次落库时会有 5 条 `Fact` 带着 `unresolved` 宾语，第 10 节的硬闸 3「残留 unresolved 不超过阈值」要按这个量级定。

如果这个代价偏高，一个收窄方向是：**只有 `person` 需要提名，`place` / `artifact` / `body` / `contract` 允许按 description 自建。** 理由是实体爆炸的风险几乎全部来自人物（「一个老人」「路过的女孩」），而地点和器物的 description 通常就是它的稳定称呼。这条并进 E4 一起裁。

---

### S4 · 装配（代码）

**做什么** — 记法行 → 完整记录。这一步**不做任何判断，只做派生**。

**输入** — 归一后的记法行 + 窗口位置（`W7` = 第 1 章第 50–63 段）。

**输出** — 四种记录。`Fact` 的逐字段推导见第 6 节，这里补 `Episode` 的：

```
输入行   C W7 "与悬浮的典籍缔结契约，对方自称星界使者，她当场答应。"
         M W7 story_after=W6 valence=0.6 arousal=0.7 surprise=0.48 outcome="契约缔结" register=喜剧
         P W7 su_tianqing agent
         P W7 codex agent
         P W7 contract_main theme          ← 提名批准后回填
窗口     第 1 章第 50–63 段，S1 给的 scene=房间 / location=昏暗的房间 / pov=苏天晴
```

```jsonc
{
  "id": "E7",                                          // 代码：故事序拓扑排序后编号
  "discoursePos": { "chapter": 1, "paragraph": 50 },   // 代码：窗口首段
  "content": "与悬浮的典籍缔结契约…",                    // 模型：C 行
  "sourcePointer": { "chapter": 1,
                     "paragraph": { "start": 50, "end": 63 } },  // 代码：窗口区间
  "context": {
    "chapter": "第一章",                                // 代码
    "scene": "房间",                                    // 模型：S1
    "location": "bedroom",                              // 模型给表层串，S3 归一成 id
    "pov": "su_tianqing"                                // 同上
  },
  "participants": [                                     // 模型：P 行
    { "entity": "su_tianqing",   "role": "agent" },
    { "entity": "codex",         "role": "agent" },
    { "entity": "contract_main", "role": "theme" }
  ],
  "precedes": ["E8"],                                   // 代码：storyAfter 取逆
  "outcome": "契约缔结",                                 // 模型：M 行
  "valence": 0.6, "arousal": 0.7,                       // 模型：M 行
  "register": ["喜剧"], "surprise": 0.48,                // 模型：M 行
  "partOf": undefined                                   // 常量：一期不产出
}
```

`Alias` 的派生只有一句话，但它是整个模型最关键的字段：

```
输入行   A codex "小破书" epithet
```

```jsonc
{ "surface": "小破书",        // 模型
  "route": "epithet",         // 模型
  "since": { "chapter": 1, "paragraph": 50 },   // 代码：窗口首段。模型无从知道，也不该知道
  "confidence": 0.85 }        // 代码：按 route 查表
```

`route` → `confidence` 查表：`name` 1.0 / `description` 1.0 / `epithet` 0.85 / `pronoun_binding` 0.6。金标准里两条 epithet 是手写的 0.8 与 0.9，查表会统一成 0.85——**`confidence` 不进第 10 节的金标准比对**，它是查表值，不是抽取结果。

#### 一处要更正的决定权

第 5 节的表把 `Episode.content` 列在「代码派生」栏，这是错的：`content` 是结构化释义，代码写不出来，只能由模型在 `C` 行给。**本次已改到「模型决定」栏。** 相应地，S4 与 S7 必须对 `content` 跑一次逐字重合检测（与本地原文比 n-gram），重合超阈值就拒绝落库——这是 R4 从「约定」变成「闸门」的地方。

**这个闸门原本不用新建，现在要重建。** `t01/scripts/source-overlap.ts` 曾经在做这件事：它算逐字重合、阈值常量是 `MIN_OVERLAP_CHARS = 8`，并钉住了一个 canonical 的 `SOURCE_SHA256`——正好是 R4 要的两件事。但 2026-08-29 放宽逐字正文规则后该脚本已随旧规则一起删除，`t01/scripts/` 只剩 `generate-v7-brief.ts`。它的两个做法仍然是对的口径，实现要重写。

#### 与金标准对齐时的一处口径差

`t02/chapter-01.json` 里 `Episode.sourcePointer` 是单段（`{start: 50, end: 50}`），管线产出的是整个窗口区间（`{start: 50, end: 63}`）。金标准是手工装填时按代表段写的，不是管线口径。**比对时按窗口首段对齐，`end` 不参与比对。**

---

### S5 · 固化（代码）

**做什么** — 把本窗口的新记录合进已有的图，并决定谁取代谁。

**输入** — S4 的完整记录 + 当前图。
**输出** — 合并后的图 + 冲突报告 + 待批队列增量。

按顺序执行四步：

**1 · 基数规则** —— 全章唯一一次触发在 `attitude_to` 上：

```
已在库    F06  su_tianqing .attitude_to "兴奋"   %narrated ^world  validFrom=E7   活跃
本次新入  F07  su_tianqing .attitude_to "后悔"   %narrated ^world  validFrom=E8

判据      attitude_to.cardinality = "single"
          且 (subject, predicate, status, holder) 四元组完全相同
动作      给 F06 写 validUntil = E8            ← 全库唯一一种原地回写
结果      两条都留在库里。factsValidDuring(E7) 只返回 F06，
          factsValidDuring(E8) 只返回 F07
```

**这是唯一会改动已有记录的操作**，而且只写一个字段。其余全是追加。

**2 · 冲突检测** —— 主谓相同、宾语不可比、且 `status` 与 `holder` **也**相同 → 报冲突。反过来说：

```
F02  su_tianqing .cause_of_death "急性心肌梗死"  %speculation  ^su_tianqing
F03  su_tianqing .cause_of_death UNKNOWN         %narrated     ^world

同主语、同谓词、宾语不可比 —— 但 status 与 holder 都不同 → 不是冲突，两条并存
```

这不是特例，是设计要的结果。**「问她怎么死的，回答必须带限定语气」这条验收判据，在数据层就长这个样子**：库里同时存着一条她自己的推测和一条叙述层的留白，检索时两条一起出来，回答自然带上限定。压成一条就没了。

**3 · 合并提名** —— 检出候选同一性，进人工队列。第一章不触发。

**4 · 幂等** —— 按批次键 `(chapterId, windowId, promptVersion, modelId, registryVersion)` 去重。W7 的键是 `(ch01, W7, prompt-v1, model-x, registry-v1)`。详见第 7 节。

---

### S6 · 派生（LLM）

**做什么** — 产出可选三类。核心五类到 S5 就齐了，这一步是加分项。

三件事，**必须分成三次调用**：

| # | 输入 | 输出 | 为什么单独一次 |
| --- | --- | --- | --- |
| 1 | 本章全部 `Episode` 的 `content` + `outcome` | `{ gist, why }` | `why` 是全库唯一允许被后续章节重写的字段，可定期重跑，与另外两件事的生命周期不同 |
| 2 | 本章文本 + 新增 `Fact` | 新 `Question` | `textual` 与 `reader_hypothesis` 是两个不同的提示，混在一起系统会把自己的猜测当成作者的伏笔去追 |
| 3 | 全部 open `Question` + 本章新增 `Fact` | 关闭动作 | 只需要看 id 和一句话，最便宜的一次 |

第 1 件的输入输出：

```
输入   E1…E8 的 content 与 outcome（不是原文），共约 400 字
输出   { "gist": "主角在猝死后于陌生幼体中醒来，与一本自称来自星界的典籍缔约，代价与预期不符。",
         "why":  "开场以昏暗房间起笔、随后倒叙死亡，是为了让身份错位先于死因揭晓；
                  契约的兴奋与后悔构成本章唯一一次状态取代。" }
代码补 id / covers=[E1…E8] / grain="chapter" / generatedAt=第 77 段 / recomputable=true
```

第 3 件跑完第一章的结果是**空的**，这一点比它看起来重要：

```
open  Q1 太奶是否真的在临终场景出现     ← F23 是 %disputed，不构成回答
      Q2 确切死因是什么                ← F03 的宾语是 UNKNOWN，记录的正是留白本身
      Q3 原主是谁、去了哪里            ← F16/F17 同样是 UNKNOWN
      Q5 造物主是谁                    ← creator 是零事实节点
      Q7 承诺与实际派发之间的落差       ← reader_hypothesis，本章不会自答
关闭  （无）
```

**`UNKNOWN` 宾语不得关闭 `Question`。** 一条「死因 = UNKNOWN」看起来像个答案，实际是把「文本没说」这件事显式记下来。让它关掉 Q2，等于把留白当成了结论——这正是 `t01` 记录的那类摘要缺陷在管线里的复现路径，要在代码里硬性排除，不能指望模型不犯。

---

### S7 · 闸门（代码）

**做什么** — 决定这一章的产出落不落库。判据全在第 10 节，这里只给输入输出的形状。

**输入** — S5 合并后的图 + 本章的批次记录。
**输出** — 一个布尔结果加一份报告：

```
批次  (ch01, prompt-v1, model-x, registry-v1)

硬闸
  validate()                0 error / 0 warn                    ✓
  记法行可解析率            100%  (112 / 112)                    ✓
  content 与原文重合        最大 4-gram，阈值 8                   ✓
  sourcePointer 完整        8 / 8 条 Episode 均有有效指针          ✓
  unresolved 残留           5 / 26 = 19.2%   阈值 20%             ✓  ← 见 S3 的 E4 代价

金标准（仅用于回归比较，不构成绝对质量结论）
  场景边界 F1               0.88    目标 ≥ 0.80                   ✓
  实体召回                  9 / 9   目标 ≥ 8/9                    ✓
  共指准确                  0.92    目标 ≥ 0.90                   ✓
  谓词归一                  0.88    目标 ≥ 0.85                   ✓
  认识论准确                0.92    目标 ≥ 0.90                   ✓
    关键 6 条               6 / 6                                ✓
  事实召回                  0.73    目标 ≥ 0.70                   ✓

待批队列  实体 6 · 谓词 0
结论      落库
```

上面所有数字都是**示意的形状，不是实测结果**——管线还没写。它们在这里的作用只有一个：说明这份报告长什么样，好让 P0 的出口条件有个可对照的东西。

**闸门不通过时不得部分落库。** 一章是一个事务，要么整章进去，要么整章不进。半章入库会让 `Alias.since` 和 `assertedAt` 停在一个既不是「读到这里」也不是「读完这章」的位置上，之后再重跑就对不上批次键了。

---

## 5. 决定权划分

**这张表是整个提案的核心。** 它决定了模型能犯哪些错、不能犯哪些错。

| 记录 | 模型决定 | 代码派生 | 常量或默认 |
| --- | --- | --- | --- |
| `Kind` | —（一期人工维护） | — | — |
| `Individual` | `kind`、是否新建 | `id`、`mergedFrom` | `status` 由是否具名决定 |
| `Alias` | `surface`、`route` | **`since`** | `confidence` 由 `route` 取默认 |
| `Predicate` | 仅在待批队列里提名 | — | 人工批准后写入 |
| `Episode` | 边界、`participants` 及其 `role`、`outcome`、`valence`、`arousal`、`register`、`surprise`、故事顺序的相对关系、`storyTime` 的相对措辞、`context.scene`/`location`/`pov`、**`content`** | `id`、`discoursePos`、`precedes`、`sourcePointer`、`storyTime.anchor`、`context.chapter` | `partOf` |
| `Summary` | `gist`、`why` | `id`、`covers`、`generatedAt` | `grain`、`recomputable` |
| `Question` | `text`、`origin` | `id`、`raisedAt`、`anchors`、`status`、`resolvedBy`、`resolvedAt` | — |
| `Mention` | `resolvedTo` | `id`、`surface`、`episode`、`span` | `method` 由解析路径决定 |

三个值得单独说的：

**`Episode.content` 归模型，这是本次的更正。** 早先的版本把它列在代码派生栏，那是错的——`content` 是结构化释义，代码写不出来。它由 S2 的 `C` 行给出，再由 S4 与 S7 各跑一次与本地原文的逐字重合检测（R4）。这是全表唯一一处模型直接写自由文本的地方，所以也是唯一需要内容闸门的地方。

**`Alias.since` 永远由代码写。** 模型只报告"这一段里出现了称呼 X 指向实体 Y"，`since` 就是当前窗口的起始位置。模型无从知道也不该知道这个称呼在别处是不是更早出现过。

**`confidence` 按 `status` 查表，不由模型给。** D8 已裁决一期只用 `support` 计数、`strength` 与 `confidence` 留常量。建议表：`narrated` 0.95 / `claim` 0.50 / `belief` 0.50 / `speculation` 0.35 / `disputed` 0.30 / `inference` 0.40。让模型输出一个 0–1 的小数只会得到 0.8 和 0.9 两个值。

**`holder` 只在非 `world` 时由模型写。** `status = narrated` 时 `holder` 恒为 `world`，代码补。这样模型要写 `holder` 的场合就只剩"谁在声称/相信/推测"，而那正好是它读文本时唯一能判断的。

---

## 6. 为什么输出记法而不是 JSON

`memory-model.md` 第 7 节已经定义了一套上下文无关的记法。管线直接用它，理由有四条：

1. **约束解码。** 文法能压死格式错误。JSON schema 能压格式，但压不住"该不该填这个字段"。
2. **单行可校验、可 diff。** 一行一命题，重跑时能逐行比对，金标准比对才做得起来。JSON 的字段顺序和嵌套让 diff 变成噪声。
3. **字段不越界——这是 R2 的语法级执行。** 记法里根本没有 `id`、`assertedAt`、`support` 的产生式。模型想写也写不出来。这比在提示词里写"不要输出 id"可靠得多。
4. **已有资产。** 第 7 节的 EBNF 直接可用。

### 管线用的是第 7 节文法的一个子集

`memory-model.md` 第 7 节的文法是给人看的完整记法，管线要的比它**窄**：

- **去掉 `@evidence`** —— 证据归代码派生（R2），产生式里根本不该有
- **去掉 `E` 行的 `[story|dN]` 时间戳** —— 同上
- **不用 `E` 行** —— 它把「谁在场」「这场的氛围」「结果」挤在一行，而 schema 里这三样分别落在 `participants`（逐个实体一条）、`valence`/`arousal`/`register`/`surprise`（每场一条）、`outcome`。管线改用 `P` + `M` 两种行分开产出。`E` 行原本表达的「事件节拍」在 `t02/schema.ts` 里没有对应字段，一期不产出
- **`Q` 行去掉 id** —— 同样是 R2

### 需要补的产生式

补五种，其中 `C` 是本次新增：

```ebnf
line        ::= kindline | state | question
              | content | alias | participant | epmeta | nominate   (* 新增 *)

content     ::= "C" WID quoted            (* Episode 释义，不得与原文逐字重合 *)

alias       ::= "A" ID quoted route
route       ::= "name" | "epithet" | "description" | "pronoun_binding"

participant ::= "P" WID entity role
role        ::= "agent" | "patient" | "theme" | "experiencer"
              | "speaker" | "addressee" | "instrument" | "location"

epmeta      ::= "M" WID kv+
kv          ::= key "=" value
key         ::= "valence" | "arousal" | "surprise"
              | "outcome" | "register" | "story_after"

nominate    ::= "?" ("P" | "I") quoted ("->" quoted)?      (* 提名，进待批队列 *)

WID         ::= "W" int                   (* 窗口本地标号。E 编号由代码分配 *)
entity      ::= ID | quoted               (* 候选表里的选 id，不在表里的抄表层串 *)
```

三处要注意：

- **`WID` 而不是 `ID`。** 模型只能用本地窗口标号 `W1…Wn`，`E1…En` 由 S1 之后的拓扑排序分配（见 S1）
- **`entity` 允许带引号的表层串。** 这是 S2 与 S3 的分工线：在候选表里的写 id，不在的抄原词，由 S3 决定它是新建、归并还是暂挂
- **`nominate` 的箭头右侧含义随类型变。** `?P "缔结" -> "signed"` 右侧是建议的 canonical 谓词名；`?I "这份契约" -> "contract"` 右侧是 Kind。共用一条产生式是为了不再长文法，代价是解析器要按左侧字母分支

### 一行数据穿过三个阶段

第 4 节给了 W7 完整的 14 行输出。这里只跟一行，因为记法的价值恰好在这一行里：

```
S2 吐出   S su_tianqing .signed "这份契约" %narrated
            └ 主语从候选表选 id，宾语不在表里只能抄表层串

S3 归一   S su_tianqing .signed contract_main %narrated
            └ 提名批准后，表层串换成 id。这一步纯查表，没有模型参与

S4 装配   { "id": "F08", … 共 16 个字段 }
            └ 见下
```

### 装配器把一行变成什么

**输入是 S3 归一之后的行**，不是模型的原始输出——表层串已经换成 id，这一步不再做任何解析判断：

```
输入行    S su_tianqing .signed contract_main %narrated
窗口      第 1 章 · W7（第 50–63 段）· 已编号为 E7
```

```jsonc
{
  "id": "F08",                                     // 代码：批次内分配 + 全局去重
  "subject": "su_tianqing",                        // 模型（从候选表选）
  "predicate": "signed",                           // 模型（从白名单选）
  "object": { "t": "ref", "id": "contract_main" }, // 模型选 id，代码打 t 标签
  "status": "narrated",                            // 模型
  "holder": "world",                               // 代码：narrated → world
  "validFrom": "E7",                               // 代码：temporalShape=point → 当前 Episode
  "assertedAt": { "chapter": 1, "paragraph": 50 }, // 代码：窗口起始段
  "evidence": ["E7"],                              // 代码：当前 Episode
  "confidence": 0.95,                              // 代码：status 默认表
  "strength": 0.5,                                 // 常量（D8）
  "support": 1,                                    // 代码：证据计数
  "modality": "stipulated",                        // 代码：Predicate 默认
  "volatility": "low",                             // 代码：Predicate.defaultVolatility
  "centrality": 0.8                                // 代码：Predicate.defaultCentrality
}
```

**15 个字段里，模型只碰了 4 个**——`subject`、`predicate`、`status`，加上 `object` 的 id（`t` 标签由代码按解析结果打）。这就是 R2 的具体样子，也是为什么外键错误应该等于管线 bug 而不是模型质量问题。

`confidence` 这一栏写的是查表值 0.95，而金标准 `F08` 手写的是 0.98。两者不必对齐——**`confidence` 与 `strength` 都是查表或常量，不进第 10 节的金标准比对**。

---

## 7. 增量维护：第二章怎么进来

五种写操作，区别在**谁有权决定**：

| 操作 | 触发 | 谁判定 | 作用于 | 可逆性 |
| --- | --- | --- | --- | --- |
| **追加** | 新命题，`multi` 谓词或无冲突 | 代码 | 新 `Fact` | 撤销该批次 |
| **取代** | 新命题，`single` 谓词且已有活跃同键条目 | **代码**（`cardinality` 完全决定） | 旧 `Fact.validUntil` | 清空该字段 |
| **合并** | 两个 `Individual` 被揭示为同一个 | 模型提名 + **人工确认** | `mergedFrom` + 新 `Alias.since` | `split` |
| **撤销** | 后文证伪先前断言 | 模型提名 + **人工确认** | `Fact.retractedAt`，可能改 `status` → `disputed` | 清空该字段 |
| **关闭** | 新 `Fact` 回答了 open `Question` | 模型匹配 | `Question.status` / `resolvedBy` / `resolvedAt` | 改回 `open` |

分界很清楚：**取代由代码算，合并和撤销由人批。** 前者被 `cardinality` 完全决定，没有判断余地；后者是全局的、影响历史查询的、错了很难发现的决定。

合并的证据门槛应该高：`memory-model.md` 第 4.4 节的规则是「推翻一条 `Fact` 所需的证据量正比于 `centrality` × 既有 `support`」，同一性判断适用同样的逻辑。宁可留两个节点等后文，不要错误合并——错误合并会把两条身份线的所有 `Fact` 搅在一起，比漏合并难修得多。

### 幂等

每条产出带批次键 `(chapterId, windowId, promptVersion, modelId, registryVersion)`。重跑一个窗口等于：先撤销该批次的产出，再重新写入。

**`registryVersion` 是这五项里最容易被漏掉的一项，漏了整个幂等就是假的。** S2 的提示词里有一份谓词白名单，它随第 8 节的批准循环一直在长：

> 第一趟跑全书时词表 19 个谓词，第一章的产出验收通过。六周后书跑完了，词表涨到 200 个。
> 这时为了修个 bug 重跑第一章——白名单变了，模型看到的选项多了十倍，输出跟着变。
> 而批次键的另外四项**一模一样**，系统认定这是同一次重跑，直接覆盖。

结果是产出变了，却没有任何东西记录下为什么变。四项键相同而给出不同答案，这不叫幂等。加上第五项之后，`(第一章, 窗口 3, prompt-v2, model-x, registry-v1)` 与 `(…, registry-v7)` 是两个不同批次，各自可复现、可并存、可对比。

这也是为什么 `Predicate` 不需要 `since`：**要钉住的不是每个谓词的出生位置，是整份词表的版本。** 谓词是我们造的词表，不是作者写的内容——「读者读到第几段才知道 `located_in` 存在」不是一个有意义的问题。而第 8 节的**回填**本来就要拿更大的词表重跑旧章；按叙述位置冻结词表，等于禁掉这条设计里明写的操作，按版本号钉住则让回填变成一次显式换版本。

同理，`t02/schema.ts` 的 `snapshotAt()` 在切片时把整份 `Kind` 与 `Predicate` 原样保留，只切 `Individual` / `Fact` / `Episode` / `Question` / `Summary` / `Mention`。管线取「读到第 k 段为止的候选表」时直接用它，两边口径一致。

`Episode` 因 R3 不参与重写，只校验 `content` 与已有是否一致，不一致就报警。

**重新切分是另一回事。** 切分变了，`Episode` 的身份就变了，等于重建该章，必须显式声明。这条要在实现里做成一道门，不能靠自觉。

---

## 8. 谓词词表怎么长大

`t02` 的 registry 有 19 个谓词，全部来自第一章。第二章一定不够用。`memory-model.md` 第 4.3 节裁定的路线是「小的封闭核心 + 开放扩展 + 别名归一」，落到管线上是一个四步循环：

1. **窗口抽取时**，模型只能从当前主语 `Kind` 的 `attributeSlots` 里选
2. **都不合适**，emit `?P "表层串" -> "建议的 canonical"`
3. **每章结束跑一次去重**：新提名 vs 现有谓词及其 `aliases`，问"是不是同一个谓词的不同说法"。是 → 并进 `aliases[]`；不是 → 进待批队列
4. **开发者批量过队列**，批准的写进 registry 并回填该章 `unresolved` 的 `Fact`

这个循环的价值不在自动化，在于**把词表膨胀从静默的质量滑坡变成一个可见的队列**。

**队列长度本身就是最有用的指标。** 如果第一章提名 20 个、第五章还在提名 20 个，说明本体设计有问题，而不是书变复杂了。健康的曲线应该快速衰减。

---

## 9. 成本估算（纸面推算，未实测）

按中文 1 字 ≈ 1.4 token 粗估，一章 4–8k token。

| 阶段 | 调用次数 | 输入 | 输出 |
| --- | --- | --- | --- |
| S1 切分 | 1 | 约 8k | 约 0.5k |
| S2 窗口抽取 | 约 8（每窗口一次） | 每次约 3.5k（文本 1k + 候选表 1.5k + 指令 1k） | 每次约 0.6k |
| S3 定点重问 | 1–2 | 每次约 2k | 每次约 0.2k |
| S6 派生 | 1–2 | 每次约 4k | 每次约 0.5k |
| **单章合计** | **约 12** | **约 45k** | **约 6k** |

一本 300 章：输入约 13.5M，输出约 1.8M。

两点判断：

- **抽取是一次性离线成本**，不在查询路径上。这个量级对单本书完全可接受。
- **主要增长项是候选表**，不是正文。正文长度固定，候选表随书变长。R1 的只读前缀天然限制了一部分（还没出现的角色不在表里），但到后期仍需按近因和场景共现裁剪。见 E3。

**E10 若按建议裁决，这张表要往上调。** 白名单从「十几个」涨到「几十个」，指令部分从约 1k 涨到约 1.6k，单章输入从 45k 涨到约 50k，一本 300 章从 13.5M 涨到约 15M。量级不变，写在这里是为了不让它悄悄发生。

---

## 10. 质量闸门

### 硬闸（不通过不落库）

1. `validate()` 返回 0 error
2. 记法行 100% 可解析——约束解码下应恒成立，不成立说明解码器没接上，是工程 bug 不是模型问题
3. 残留 `object.t === "unresolved"` 不超过阈值。**建议先取 20%**：按 E4 的建议裁决，第一章会有 5 / 26 条带 unresolved 宾语（见 S3），阈值定在 10% 会直接卡死第一章
4. `Episode.content` 与本地原文的最长逐字重合不超过阈值——沿用已删除的 `t01/scripts/source-overlap.ts` 定过的 `MIN_OVERLAP_CHARS = 8`，不另定口径。R4 从约定变成闸门就在这一条
5. 每条 `Episode` 都有有效 `sourcePointer`，且段落区间落在 S0 的索引内

第 4、5 条是 R4 要求的，之前只写在 R4 的正文里，没进这张清单。

**一章是一个事务：要么整章落库，要么整章拒绝。** 半章入库会让 `Alias.since` 与 `assertedAt` 停在一个既不是「读到这里」也不是「读完这章」的位置上，之后重跑就对不上批次键了。

### 金标准

`t02/chapter-01.json` 就是第一章的金标准。**它是人工装填的，本来就是为这一刻准备的。**

| 指标 | 口径 | 目标 |
| --- | --- | --- |
| 场景边界 | 与金标准对齐，容差 ±1 段 | F1 ≥ 0.8 |
| 实体召回 | 金标准 9 个 `Individual` 建出几个 | ≥ 8 / 9 |
| 共指准确 | `Mention.resolvedTo` 与金标准一致 | ≥ 0.90 |
| 谓词归一 | 同主语同宾语时 `predicate` 一致 | ≥ 0.85 |
| **认识论准确** | `Fact.status` 与金标准一致 | **≥ 0.90，且第一章那 6 条关键断言全对** |
| 事实召回 | 金标准 26 条中主谓宾对齐的比例 | ≥ 0.70 |

### 一条压过所有指标的行为判据

**跑完管线后，问「苏天晴怎么死的」，回答必须带限定语气。答成肯定句就是失败，不管六项指标多好看。**

这条与 `t02` 的验收判据是同一条，故意不改口径。

### 口径的诚实性

金标准只有一章，而且是我们自己写的。**这些指标只能用于"管线有没有退化"的相对比较，不能当作绝对质量结论，更不能外推到其它章节或作品。** 要得到绝对结论，需要独立标注的多章金标准，那是另一件事。

---

## 11. 失败模式与拦截点

| 失败模式 | 长什么样 | 拦在哪 |
| --- | --- | --- |
| 幻觉实体 | 抽出书里没有的人 | 候选表约束 + `validate()` 外键；新建必须走显式 `?I` 提名 |
| **身份泄漏** | 第 5 段就用上第 27 段才揭晓的名字 | **R1 只读前缀**；`t02` 的冒烟测试里已有对应断言，可直接复用 |
| 谓词漂移 | 「拥有」「持有」「带着」各建一个 | registry + 别名归一 + 待批队列；队列长度做监控 |
| 认识论抹平 | 角色的声称被记成 `narrated` | 语域默认值（对白 → `claim`，内心独白 → `belief`）+ 每章抽检 + 金标准指标 |
| 时间轴混淆 | 把叙述位置写进 `storyTime` | 模型根本不写这两个字段（R2） |
| 事实爆炸 | 一章抽出几百条琐碎 `Fact` | 谓词白名单 + `centrality` 阈值 + `factLoad()` 监控 |
| 重复摄入 | 重跑产生同一事实两份 | 批次幂等键 |
| **词表漂移** | 六周后重跑第一章，白名单已从 19 涨到 200，输出被静默改写且无迹可寻 | 批次键里的 `registryVersion`（第 7 节） |
| 场景漂移 | 重跑切分不同，`Episode` 身份变了 | R3：不覆盖，报警；重切分走显式开关 |
| 原文入库 | 逐字文本进了 Git | R4：`content` 存释义 + 段落指针 |

「认识论抹平」是这张表里唯一**只能靠概率手段防**的一项——它不违反任何结构约束，`validate()` 抓不到。这也是它必须进金标准指标、并且权重最高的原因。`t01` 记录的多轮摘要缺陷全是这一类。

---

## 12. 分期

### P0 · 单章、只读、不合并

回答的是 spike 的 S2（结构化可抽取性），**全管线风险最高的一期**。

- 做：S0 → S5 的最小闭环，输入第一章，输出一份通过 `validate()` 的 JSON
- 不做：增量、合并、撤销、`Summary`
- 出口：六项指标 + 那条行为判据
- 如果这一期不过，后面的都不用做

### P1 · 多章增量

回答 D7（单节点 `Fact` 量级）和 D5（惰性物化触发条件）。

- 加：追加 / 取代 / 合并提名 / 待批队列 / 幂等
- 出口：连跑五章，`validate()` 全绿，待批队列长度衰减，`factLoad()` 曲线可看

`factLoad()` 已经在 `t02/schema.ts` 里了，D7 的度量口径不用重新定义——跑起来就有数。

### P2 · 修订与派生

- 加：撤销、`Question` 关闭、`Summary` 重算
- 出口：构造一次"后文证伪前文"，检查 `retractedAt` 正确写入、`status` 正确迁移、`Episode` 一个字节没动

---

## 13. 待裁决

| # | 问题 | 建议 |
| --- | --- | --- |
| E1 | S2 融成一次调用还是拆成四次 | **融成一次。** 共指、谓词、认识论互相依赖，拆开每步都信息不足；拆开还要四倍成本。代价是失败不好定位，用记法行的逐行比对补 |
| E2 | 是否用约束解码 | **用。** 若 Provider 不支持文法约束，退回「JSON schema + 单行重试」，但记法层不变 |
| E3 | 候选表怎么裁剪 | 当前场景参与者 + 前一场景参与者 + 具名角色按最近出现距离取 top-N。**N 待实测**，先取 50 |
| E4 | 模型能否自主新建 `Individual` | **具名角色可自建**（有专名就有身份），**非具名必须走 `?I` 提名**（「一个老人」这类极易造成实体爆炸）。**但第一章按这条算下来 9 个实体里 6 个要人批**（见 S3），建议连带裁一个收窄版：只有 `person` 需要提名，`place` / `artifact` / `body` / `contract` 允许按 description 自建 |
| E5 | `confidence` 按 `status` 查表 | 接受。理由见第 5 节，与 D8 一致 |
| E6 | 待批队列的审批频率 | 每章一次。频率低了会积压并阻塞回填 |
| E7 | 用哪个模型跑 S2，是否需要双模型交叉取交集 | 一期单模型。交叉取交集能提准确率但砍召回，等有了基线再评估 |
| E8 | 章节文本从哪来 | 复用 `t01` 的样书解析。不重写 EPUB 处理 |
| E9 | 抽取产出进不进 Git | **治理层面已由 2026-08-29 的根 `AGENTS.md` 裁决**：小说数据不是敏感数据，按 Task 的`允许文件`进 Git。剩下的是设计问题——R4 仍要求 `Episode.content` 是释义而非抄录，但理由已改成检索质量，不再是隐私。**请确认 R4 这个新理由下的写法可接受** |
| **E10** | **S2 的谓词白名单怎么算** | 原规则「候选主语 Kind 的槽位取并集」有个死循环：新实体在哪一场诞生，就在哪一场需要它的槽位，而那时它还不在候选表里——第一章的 `F25`（契约·已缔结）就因此抽不出来。建议**并上全部 `basicLevel: true` 的 Kind 槽位**，代价是白名单从「十几个」涨到「几十个」，第 9 节的指令 token 要上调 |

E3、E4、E10 是「方向清楚、参数待实测」的三条，都会在 P1 拿到数据。E10 是本次写逐阶段定义时才发现的，之前的版本里不存在。

---

## 附录：与既有资产的对接

| 已有的东西 | 在这条管线里的位置 |
| --- | --- |
| `t02/schema.ts` 的 `validate()` | S7 的硬闸门。一行不用改 |
| `t02/schema.ts` 的 `snapshotAt()` | **R1 的实现，一行调用：`snapshotAt(窗口首段 − 1)` 就是 S2 的候选表。** 「读到第 k 段为止库里有什么」不用管线自己写；返回的仍是 `MemoryGraph`，切片自身也能过 `validate()` |
| `t02/schema.ts` 的 `factLoad()` | P1 的 D7 度量。一行不用改 |
| `t02/chapter-01.json` | P0 的金标准 |
| `t02/viewer.html` | 抽取结果的人工检查工具。**它已经支持拖入其它数据集**，抽出来的 JSON 直接拖进去就能看 |
| `t02/scripts/build-viewer.ts` | 校验加注入，管线产出后直接复用 |
| `memory-model.md` 第 7 节 EBNF | S2 的输出文法，需按第 6 节收窄一个子集，并补五种产生式 |
| `t01` 的样书解析 | S0 的输入源 |
| `t01/scripts/source-overlap.ts`（已删除） | **S4 与 S7 的 `content` 重合闸门。** 它曾经在算逐字重合（`MIN_OVERLAP_CHARS = 8`）并钉住了 canonical `SOURCE_SHA256`，正好是 R4 需要的两件事。但 2026-08-29 放宽逐字正文规则时，该脚本随旧规则一起删除——**口径可以照抄，实现要重建** |

**这条管线不需要新建任何验证基础设施。** `t02` 交付的校验器、金标准、查看器正好构成 P0 的完整验收环境——这是当初把数据结构和查看器一起做掉换来的。
