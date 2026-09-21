# 面向读者理解的小说知识图谱方案

> 状态：讨论稿。
>
> 目标：让 LLM Agent 能以读者视角理解一本书。系统需要回答人物、关系、剧情、动机、设定和伏笔问题；回答时不能使用读者尚未读到的信息。
>
> 本文只做模型设计和 TypeScript 输出形状，不实现解析器，不迁移当前 v4 数据，不修改 `chapter-01.json`、`schema.ts`、页面或抽取管线。

## 1. 先重新对齐最终任务

最终任务不是把小说完整地转换成某种现实世界本体，也不是把每个名词的全部属性都做成图节点。

最终任务是：

```text
一本书
  → 可供检索的读者记忆
  → LLM Agent 搜索图和原文证据
  → 在指定阅读位置回答问题
```

典型问题：

```text
苏天晴为什么会出现在狐女身体里？
黑色古书想对苏天晴做什么？
契约是什么时候成立的？
苏天晴为什么后悔？
读到第 18 段时，读者知道古书叫什么吗？
哪些内容是古书自称，哪些内容是叙述者确认？
```

因此系统的核心评价标准是：

```text
回答质量
读者视角是否正确
检索成本
抽取成本
跨章节稳定性
```

不是：

```text
图谱是否覆盖了世界中的所有对象和属性
模型层是否接近完整本体
每个实体是否都有统一的百科档案
```

## 2. 核心决策：抽取和建模分开

建议把系统拆成三个层次，而不是让一次 LLM 调用同时完成所有工作：

```text
原文层
  原文、段落、Beat、证据片段、向量索引

抽取层
  实体提及、事件、披露、推断候选、引用关系
  目标：尽量不漏掉有用线索，允许保留低价值内容

建模层
  有限的可复用模型、关系类型、字段簇、查询入口
  目标：压缩检索空间，统一命名，服务高频问题
```

方向关系：

```text
原文 → 抽取层 → 建模层整理
```

而不是：

```text
先建立完整模型 → 要求抽取层只能填模型
```

### 2.1 抽取层不需要等待模型层

抽取正文时，LLM 可以记录它理解到的内容：

```text
A 说 B 有两只耳朵
B 摸了摸她两只大耳朵
古书自称星界使者
苏天晴觉得自己重生了
```

这些内容首先都可以进入抽取层，带着：

```text
原文位置
原文证据
说话者或叙述来源
被描述的对象
读者当时是否已经能知道
是否是直接陈述、推断、想象或评价
```

抽取器不需要先知道全书的最终模型，也不需要因为一个字段尚未注册就丢掉内容。

### 2.2 抽取层不能直接修改模型层

抽取过程中可能发现新概念：

```text
contract.bindingMethod
body.ears.count
codex.claimedRole
```

这些只能成为模型提案：

```text
ModelProposal {
  proposedPath: "contract.bindingMethod",
  evidence: [paragraph 74],
  reuse: "unknown",
  queryValue: "unknown"
}
```

只有低频的建模步骤，或者开发者确认后，才把提案纳入模型层。

这样可以避免：

```text
某一段偶然出现一个细节
  → LLM 发明一个字段
  → 字段进入全书模型
  → 后续每章都被迫考虑这个字段
```

## 3. 披露可以宽，模型必须窄

这是本方案的一个重要不对称：

```text
披露：可以尽量保留正文表达
模型：只保留对检索和剧情理解有价值的结构
```

“披露”是证据层，不等于“正式建模”。

例如：

```text
A 说 B 有两只耳朵
```

可以记录为一条披露：

```ts
claim({
  subject: B,
  relation: "has",
  object: "两只耳朵",
  evidence: [span(18, 18)],
  source: A,
  mode: "asserted",
});
```

但：

```text
B 摸了摸她两只大耳朵
```

不一定要建立一个正式的 `body.ears.count` 或耳朵实体。原因是“她的两只大耳朵”可能只是叙述中的指称方式；它可以支持向量搜索和原文回看，但未必值得进入稳定的知识模型。

这两类内容都可以保留在原文和披露索引里：

```text
高价值、可复用、适合回答结构化问题
  → 进入建模后的图索引

低价值、一次性、只对局部描写有用
  → 保留为原文 / Beat / 披露证据
```

### 3.1 “披露”不等于“接受为事实”

抽取层要保存正文说过什么，但读者状态还要区分：

```text
asserted       正文直接说出
attributed     某角色声称，但叙述者没有确认
hedged         似乎、可能、像是
thought        角色想法或判断
inferred       读者推断
uncertain      无法确定指向或语义
```

例如：

```ts
claim({
  subject: codex,
  relation: "role",
  object: "星界使者",
  evidence: [span(45, 45)],
  source: speech(codex),
  mode: "attributed",
});
```

它表示：

```text
古书在第 45 段自称星界使者
```

而不是：

```text
读者已经确认古书确实属于星界使者这一类别
```

## 4. 三类输出：原文、披露、模型

### 4.1 原文与 Beat

原文层保留完整内容：

```text
Chapter
  → Paragraph
  → Beat
  → TextSpan
```

Beat 是连续段落组成的语义单位，负责：

- 组织 LLM 的抽取上下文；
- 提供剧情概括；
- 保留没有进入图模型的动作、情绪和描写；
- 作为 Agent 搜索时的上下文块。

Beat 不需要把所有句子结构化。

### 4.2 披露 Claim

Claim 是正文中一次可引用的表达，重点是保留原文证据：

```ts
type Claim = {
  id: ClaimId;
  subject?: EntityRef;
  predicate?: string;
  object?: EntityRef | Literal;
  evidence: readonly TextSpan[];
  source: SourceRef;
  mode: ClaimMode;
  readAt: ParagraphNo;
  storyTime?: MomentRef | null;
  confidence: "explicit" | "uncertain";
};
```

这里的 `predicate` 可以暂时是字符串或局部名称。抽取层不要求每个谓词都已经进入正式模型词表。

Claim 的最低要求是：

```text
能回到原文
能说明是谁 / 什么被描述
能说明这是谁说的或谁想到的
能说明读者在何处看到
```

### 4.3 模型层 Model

Model 不是现实世界的完整分类，也不是实体的运行时类型。它是一个有限的检索和抽取配置：

```text
哪些问题面值得关注
哪些关系可以复用
哪些实体可以共享结构
哪些字段应该进入图索引
```

一个模型可以很小：

```ts
const Character = model("character", {
  concerns: ["identity", "goal", "relationship", "decision"],
});

const Artifact = model("artifact", {
  concerns: ["identity", "ability", "owner", "goal"],
});

const Contract = model("contract", {
  concerns: ["parties", "content", "status", "consequence"],
});
```

这里的 `concerns` 不是“这个实体必然拥有这些属性”，而是：

```text
遇到这种对象时，抽取器和 Agent 值得优先检查这些问题面。
```

## 5. 模型层的真正作用

### 5.1 限制候选空间，降低 LLM 成本

没有模型层时，LLM 每次都要从全书所有可能字段中选择：

```text
发色、耳朵数量、契约状态、任务定制者、死亡率、亲属、声音、来处……
```

有模型层时，面对黑色古书只优先考虑：

```text
身份
声音
来处
目标
对谁产生作用
```

面对契约只优先考虑：

```text
参与方
内容
状态
后果
```

这减少：

```text
提示词长度
候选字段数量
重复字段
错误挂载
每章重新发明命名的概率
```

### 5.2 形成可复用的查询入口

Agent 不应只能通过自然语言向量搜索“耳朵数量”。它还应有稳定入口：

```text
character → goal
character → relationship
contract → parties
contract → status
artifact → claimed identity
```

模型层提供的是这些入口，而不是完整百科属性。

### 5.3 让关系比孤立属性更稳定

对剧情理解而言，下面通常比外貌字段更重要：

```text
谁寻找谁
谁控制谁
谁答应了什么
谁对谁隐瞒了什么
谁因为什么做了决定
某个事件改变了什么状态
```

因此模型层应优先收敛关系和状态，而不是优先收敛物理细节。

## 6. 第一章的最小模型层

先不把第一章所有内容都建模，只定义几个用于检索的模型：

```ts
const Character = model("character", {
  concerns: [
    "identity",
    "goal",
    "decision",
    "relationship",
    "belief",
  ],
});

const Body = model("body", {
  concerns: [
    "identity",
    "occupant",
    "appearance",
  ],
});

const Artifact = model("artifact", {
  concerns: [
    "identity",
    "origin",
    "goal",
    "relationship",
    "speech",
  ],
});

const Contract = model("contract", {
  concerns: [
    "parties",
    "content",
    "status",
    "consequence",
  ],
});

const Place = model("place", {
  concerns: ["identity", "location", "participants"],
});
```

这五个模型并不试图覆盖第一章所有事物，更不试图定义现实世界的完整本体。

## 7. 第一章实体层：只声明可持续指称的对象

```ts
const su = entity("su_tianqing");
const foxBody = entity("body_fox");
const originalBody = entity("body_prev");
const codex = entity("codex");
const contract = entity("contract");
const taskSet = entity("task_set");
const room = entity("room");
const noodleStall = entity("noodle_stall");
const taiNai = entity("tainai");
```

实体声明只解决：

```text
后续文字中的“她”“这具身体”“那本书”“这份契约”是否可能持续指向同一个对象。
```

它不自动声明：

```text
实体是什么类型
实体有哪些属性
实体一定存在
实体一定有某个部件
```

实体可以带一个**可选的抽取 Profile**，但 Profile 不是正文事实：

```ts
const extractionProfile = profile({
  entity: foxBody,
  model: Body,
});
```

Profile 的意义是降低抽取成本：

```text
下次看到 foxBody 时，优先检查身份、占据者和剧情相关外貌。
```

它不能让 `foxBody` 自动获得 `appearance` 或 `occupant` 的值。

## 8. 第一章的抽取示例

### 8.1 Beat 和 Claim 放在一起，但语义分开

```ts
beat({
  id: "B03",
  paragraphs: [9, 12],
  type: "description",
  summary: "苏天晴从镜中看到一具陌生的狐女身体",

  claims: [
    claim({
      subject: foxBody,
      predicate: "appearance",
      object: "金色长发、毛茸茸的耳朵、白皙肌肤和炸毛的大尾巴",
      evidence: [[9, 12]],
      source: narrator,
      mode: "asserted",
    }),

    claim({
      subject: foxBody,
      predicate: "called",
      object: "狐女",
      evidence: [[11, 11]],
      source: narrator,
      mode: "asserted",
    }),
  ],
});
```

这段只把外貌作为一个高层披露，而不是拆成六个正式字段。原文仍然保留每个细节。

如果后续问题经常问“她有几只耳朵”，再从具体披露中建立结构化索引：

```ts
claim({
  subject: foxBody,
  predicate: "has_ear_count",
  object: 2,
  evidence: [[18, 18]],
  source: narrator,
  mode: "asserted",
});
```

### 8.2 描写性的暗示不自动提升为稳定事实

```ts
claim({
  subject: foxBody,
  predicate: "has_ear_count",
  object: 2,
  evidence: [[18, 18]],
  source: narrator,
  mode: "asserted",
});
```

可以记录，因为正文明确说“惊得两只耳朵猛然竖起”。

但：

```ts
claim({
  subject: foxBody,
  predicate: "has_ear_count",
  object: 2,
  evidence: [[18, 18]],
  source: narrator,
  mode: "inferred",
});
```

如果只是从“她摸了摸两只大耳朵”推回数量，则它只能是推断 Claim，不能自动进入稳定模型字段。

更准确的规则是：

```text
原文明确对 B 说“两只耳朵”
  → 可以有 asserted Claim

原文用“两只耳朵”作为动作中的指称，但没有把数量作为剧情知识说出来
  → 可以保留原文或低等级 Claim
  → 不自动提升为稳定结构字段
```

“是否提升”应由剧情价值和查询需求决定，而不是由数字是否出现决定。

### 8.3 第一章真正有价值的关系和状态

```ts
claim({
  subject: su,
  predicate: "occupies",
  object: foxBody,
  evidence: [[25, 27]],
  source: thought(su),
  mode: "inferred",
});

claim({
  subject: codex,
  predicate: "seeks",
  object: su,
  evidence: [[30, 31]],
  source: speech(codex),
  mode: "attributed",
});

claim({
  subject: contract,
  predicate: "has_status",
  object: "成立",
  evidence: [[59, 60]],
  source: speech(codex),
  mode: "asserted",
});

claim({
  subject: su,
  predicate: "will_become",
  object: "反派魔法少女",
  evidence: [[67, 77]],
  source: system,
  mode: "attributed",
});
```

这些关系和状态比“脚带红晕”更值得进入图的稳定导航，因为它们直接服务：

```text
身份变化
人物目标
契约状态
剧情后果
```

## 9. 检索架构：图、向量和原文混合

Agent 不应只查图，也不应只做向量搜索。建议把三种索引放在一起：

```text
结构图索引
  找实体、关系、状态、事件链、时间约束

披露向量索引
  找语义相近的正文表达和局部线索

原文 / Beat 索引
  返回可读证据和上下文
```

### 9.1 图搜索适合什么

```text
苏天晴和古书是什么关系？
谁在寻找苏天晴？
契约有哪些参与方？
契约状态经历了什么变化？
哪些披露来自古书自称？
```

图搜索从稳定关系和状态开始：

```text
su_tianqing
  ← seeks ← codex
  ← party-of ← contract
  → occupies → body_fox
```

### 9.2 向量搜索适合什么

```text
她为什么突然后悔？
古书之前说过哪些中二的话？
这具身体的外貌是怎样的？
苏天晴什么时候意识到自己不是原主？
```

向量搜索可以找：

```text
Beat 摘要
原文片段
未提升为稳定字段的披露
情绪、语气、局部描写
```

### 9.3 Agent 的查询循环

```text
1. 解析问题：涉及哪些实体、关系、阅读位置和时间范围？
2. 先查图：获取稳定实体和关系骨架。
3. 再查披露向量：补充局部表达、动机和证据。
4. 检查 readAt：丢弃读者尚未看到的内容。
5. 回到原文 / Beat：验证关键结论。
6. 生成答案：区分正文陈述、角色声称和读者推断。
```

图是导航，向量是召回，原文是证据。

## 10. 防止剧透的必要字段

每条 Claim 至少需要保留：

```ts
type Claim = {
  subject?: EntityRef;
  predicate?: string;
  object?: EntityRef | Literal;
  evidence: readonly TextSpan[];
  readAt: ParagraphNo;
  source: SourceRef;
  mode: ClaimMode;
  storyTime?: MomentRef | null;
};
```

查询第 `k` 段时：

```text
只允许 Claim.readAt <= k
```

`storyTime` 仍然不能代替 `readAt`：

```text
readAt   读者何时看到
storyTime 这条内容描述故事中的哪个时刻
```

例如第 16 段回忆三个夜班：

```text
readAt = 16
storyTime = 夜班结束时刻
```

## 11. 模型层如何低频演化

模型层不应由每章抽取结果直接改写。建议有三个状态：

```text
稳定模型
  已经证明可复用，并且服务明确查询

候选模型
  抽取中反复出现，可能值得统一

局部披露
  只对一次正文有用，不进入模型
```

晋升条件可以很简单：

```text
一个字段或关系至少满足以下多数条件：

- 能回答明确的问题；
- 在多个章节或多个实体上复用；
- 有稳定的主体和对象边界；
- LLM 不使用它时容易漏掉重要剧情；
- 建立结构后能降低后续检索成本。
```

“杯子的材质、容量、重量”不是不能记录，而是默认留在原文或局部披露；只有当它们成为剧情线索、身份识别、行动限制或冲突原因时，才晋升为模型字段。

## 12. 当前方案的边界

### 可以保留

```text
所有值得回看的正文证据
低价值局部描写
不确定的指代
角色错误认知
角色自称
读者推断候选
```

### 不自动承诺

```text
每个名词都成为实体
每个实体都有统一类型
每个披露都成为稳定字段
每个数字都成为结构化事实
模型定义了字段后实体就拥有该属性
```

### 当前不做

```text
完整现实世界本体
全书一次性建模
实体自动继承模型事实
抽取阶段自动修改稳定模型
把所有 Beat 转成图节点
用模型层替代原文和向量检索
```

## 13. 方案总结

最终推荐的方向是：

```text
模型层：窄、稳定、低频，服务抽取候选和图检索
实体层：只维护可持续指称的对象身份
抽取层：宽松保留正文理解结果，允许不完整和不确定
披露层：保存证据、来源、阅读位置和语气
Beat 层：保存连续正文、剧情概括和未建模内容
向量层：召回原文表达、情绪、动机和局部描写
图层：提供关系、状态和事件链的导航
Agent：混合搜索并以读者视角组织答案
```

一句话：

> 抽取层尽量不漏，模型层主动克制；图负责导航，向量负责召回，原文负责证据，Agent 负责按读者当时知道的内容回答。

这比要求 LLM 先建立一个完整模型再抽取正文更适合长篇小说，也更符合成本和稳定性的目标。