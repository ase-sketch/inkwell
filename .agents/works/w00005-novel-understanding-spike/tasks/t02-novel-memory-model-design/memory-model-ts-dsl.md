# 用 TypeScript 描述小说记忆（设计稿）

> 这份文档**不是** `memory-model-v5`。它把"用 TypeScript 类型系统 + 值空间来描述小说记忆结构"这一套单独拿出来，独立成文。
> 定位：**设计审查稿**。是"模型输出长什么样、怎么落成数据"的语法提案，不是已接入的管线，也不证明抽取能跑通。
> 阅读对象：你。目的是你能在几分钟内看懂现在的设计，然后挑毛病。

---

## 0. 一句话说明它是什么

让**模型用一种"长得像 TypeScript、其实是声明语法"的东西**输出小说记忆，而不是输出自由文本、EBNF 或裸 JSON。

为什么可以是 TypeScript 而不必真的执行它：

- **类型空间**定义"这个世界有哪些类型、每种类型能填哪些字段"——相当于词表和路由。
- **值空间**定义"这段正文，实际向读者说了什么"——相当于每一条记录。
- 最终系统**只读 TypeScript 的语法树（AST）**，不编译、不运行、不 import。类型只是为了给人看、给编辑器补全、给静态检查拦低级错。

一句话：**类型空间管"可以写什么"，值空间管"实际写了什么"，AST 解释器把值空间解成规范化数据。**

---

## 1. 为什么不用 EBNF，也不用裸 JSON

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| EBNF | 严格、可约束解码 | 没人熟、没补全、写错全靠报错 |
| 裸 JSON | 通用、数据干净 | **没有任何约束**：字段名写错、类型写错、漏字段，都要等下游校验 |
| TypeScript 声明 | 有补全、有类型检查、大家熟 | 有一点学习成本；且要小心"它真的是代码"的错觉（见第 9 节） |

核心区别不是好看，而是**约束的载体**：

- JSON 里 "count": "两只" 合法，错误要等运行时。
- TypeScript 里 `count: "两只"` 直接报错（要求 number）。
- 字段名 `color: "金色"` 塞进 `Body.ears` 也直接报错（没有这个字段）。

但**类型检查能拦住的是"形状"错误，拦不住"这句话是不是真的"**。真假由值空间的证据和求值决定，跟类型无关。

---

## 2. 两个空间

```
类型空间（定义"可以写什么"）
  Kind       类（狐女、典籍、魔法少女）
  FieldCluster  字段簇（body.ears、body.tail、identity）
  Leaf       叶字段（值类型 / 基数 / 易变度 / 保留地）
  routes     某一类上"允许填哪些字段簇"

值空间（定义"实际说了什么"）
  Entity     主体（苏天晴、黑色古书、这具身体）
  Fact       完整命题 = 主体 + 字段簇 + 值 + timeRef
  Disclosure 一次披露 = Fact + at + source + hedge
  FieldProjection  Fact 的叶路径投影，供查询/冲突分组
  from       证据批次 = 同一段正文、同一来源的一组 Fact
```

两类空间同名不合并：`K_FoxGirl`（类型）和 `foxGirl`（值引用）是两回事。**类型不是值，值不是类型。**

---

## 3. 核心概念

每个概念先用一句大白话，再给带注释的代码。

### 3.1 主体 Entity

"一个能被记住、能被提到的东西"。人物、组织、概念、地点、物品、身体、法宝、咒术……全是主体。

```ts
// 值引用：只携带稳定身份，不带属性。
const suTianqing = entity("su_tianqing");
const bodyFox    = entity("body_fox");
const codex      = entity("codex");
```

注意：**主体身上不直接挂字段**。`bodyFox` 不是一个「装满了金色头发、两只耳朵的对象」，它只是一个指针。它有什么，由 Fact 在求值后决定。这样才不会把"类型的结构"误当成"已成立的事实"。

### 3.2 类 Kind 与路由 routes

"这个主体属于哪一类"。类是分级索引，可以无限增长，可以有多个父类。

```ts
// 定义类：狐女，是人类、有"耳朵""尾巴"这些可填字段簇。
type K_FoxGirl = Kind<{
  extends: [K_Humanoid];                 // is-a：狐女是一种人类
  routes: [typeof Body.ears,             // is-able-to-have：可以填耳朵
           typeof Body.tail];            //                 可以填尾巴
}>;
```

**route 的意思是"抽取时可以往这个方向问"，不是"她一定有"。**

- `狐女` 这个类让抽取器知道：见到狐女，可以问耳朵、问尾巴。
- 但不代表「是狐女 ⇒ 有尾巴」。
- 正文没写尾巴，就**没有**关于尾巴的任何事实；只有显式披露才算数。

这就是"候选路由"和"已披露事实"的边界。

### 3.3 字段簇 FieldCluster 与叶 Leaf

"一类字段的集合"，像一个表格模板。`Body.ears` 描述"耳朵这个整体能填哪些条目"。

```ts
const Body = {
  // 耳朵：一个集合。能给整体填什么？
  ears: cluster("body.ears", {
    // count：数量，单值、几乎不变
    count: number({ cardinality: "single", volatility: "low" }),

    // aggregate：把"整体外观"当一个值（还没分左右耳时）
    aggregate: {
      appearance: text({ cardinality: "single", volatility: "low" }),
    },

    // members：以后明确分左右耳时，指向具体耳朵主体
    members: entities({ cardinality: "multi", volatility: "low" }),

    // pose：耳朵姿态。每一拍都在变，所以"读的时候记得，不建长期槽"
    pose: text({ cardinality: "single", volatility: "high", retention: "beat" }),
  }),

  // 尾巴：同理
  tail: cluster("body.tail", {
    appearance: text({ cardinality: "single", volatility: "medium" }),
    texture:    text({ cardinality: "single", volatility: "low" }),
    members:    entities({ cardinality: "multi", volatility: "low" }),
    pose:       text({ cardinality: "single", volatility: "high", retention: "beat" }),
  }),
};
```

叶字段（Leaf）携带四件事：

| 属性 | 意思 | 例子 |
| --- | --- | --- |
| 值类型 | 这个字段要什么类型 | string / number / kind-ref / entity-refs |
| 基数 cardinality | 单值还是多值 | 发色单值，朋友多值 |
| 易变度 volatility | 多久变一次 | 发色 low，耳朵姿态 high |
| 保留地 retention | 长期记忆还是只留在一拍里 | memory / beat |

**"删掉 P_EarCount"不是删语义，是把它收进 `body.ears.count` 这一个局部名字里**：
模型不再从全局谓词表找一个冷门的 `P_EarCount`，而是一看 `Body.ears` 就知道能填 count、aggregate、pose。冷门的是"全局谓词"，不冷门的是"类型自己的局部字段"。

### 3.4 事实 Fact（完整命题）

**Fact = 主体 + 字段簇 + 值 + timeRef。它是一个"填好了的卡片"，不是空地址。**

```ts
// 一条完整命题：这具身体，耳朵数量是 2，发生在 M_a 这一刻。
fact(bodyFox, Body.ears, { count: 2 }, M.a);
```

要点：

- Fact **带值**。所以它才配叫"事实项"——哪怕读者还不知道，它是"一句话声称了这么一件事"。
- 同一个 `fact()` 调用里多片叶子（如 count 和 aggregate.appearance 一起写）**属于同一个事实组**，见 3.7 的 statementId。
- Fact 的身份由"主体 + 字段簇 + 规范化值 + timeRef"决定，规则见第 5 节。

### 3.5 披露 Disclosure

"这句话是谁、在读者读到第几段时说的"。**Fact 本身没有立场，Disclosure 才标记"谁说、什么态度"。**

```ts
from(18, narrator, "plain", [
  fact(bodyFox, Body.ears, { count: 2 }, M.a),
]);
```

这里 `from(18, narrator, "plain", [...])` 把里面的 Fact 变成一次披露：

- `18` ＝ 读者在第 18 段读到（叙述位置）
- `narrator` ＝ 叙述者直陈
- `plain` ＝ 直陈（不是"似乎""大概"）

**同一条 Fact 可以被多次披露**：第 45 段古书说"反派魔法少女"，第 1 段作者章标题也说了"反派魔法少女"——同一个 `(主体, 字段, 值, timeRef)`，两条 Disclosure，各自带来源。这就是"同一件事被两个人说过"。

### 3.6 叶投影 FieldProjection

Fact 是"卡片"，但卡片可能塞了好几片叶子。查询、冲突、支持计数需要一个**细粒度的稳定地址**，这就是叶投影。

```ts
// fact(bodyFox, Body.ears, { count: 2 }, M.a) 产生的投影：
{ address: "entity:body_fox|body.ears.count", value: 2 }
```

`body.ears.count` 是**内部索引**，不是模型要写的名字。模型只写整块 `Body.ears`，编译器再展开成这些细地址。冲突、并列、支持数、`inferredFrom` 依赖，都挂在叶地址上。

### 3.7 候选路径 CandidatePath & statementId

两个容易混的东西，这里分开：

- **CandidatePath**：类型 route 产生的"可以问什么"。它**恒不产生事实**，求值永远是 `unknown`。见第 7 节红线。
- **statementId**：某一次 `fact()` 调用（一次原子陈述）的指纹。它把同一次陈述的所有叶和所有 Fact 绑在一起。

```ts
// 同一句"她有两只尖耳"：count 和 appearance 来自同一次陈述。
fact(bodyFox, Body.ears, {
  count: 2,
  aggregate: { appearance: "尖耳" },
}, M.a);
```

这条会生成两个叶投影，但它们共享同一个 `statementId`。如果另一个来源只说"她有两只耳朵"（count=2）而**没提尖耳**，它只给 `count` 投影增加支持，**不会**替 `appearance` 背书。这样"多叶合取"不会在拆开后被错误拼接成来源。

`statementId` 与 `Fact 身份` 是两个东西：statementId 描述"这一次陈述说了什么"；Fact 身份描述"哪一句话被说了"。

### 3.8 证据批次 from

把"同一段正文、同一来源、同一态度"的一组 Fact 打包。它只是共享 `at / source / hedge` 的外壳，**每条 Fact 仍要带自己的 timeRef**。

```ts
from(18, narrator, "plain", [
  fact(bodyFox, Body.ears, { count: 2 }, M.a),
  fact(bodyFox, Body.tail, { texture: "无比柔顺" }, M.a),
]);
```

---

## 4. 第一章例子

用真实段落走一遍，模型会输出什么。

```ts
const E = {
  bodyFox: entity("body_fox"),
  suTianqing: entity("su_tianqing"),
} as const;

const K = { foxGirl: kind("K_fox_girl") } as const;
const M = { a: moment("M_a") } as const;
const narrator: Source = { channel: "narrator", holder: null };

type K_FoxGirl = Kind<{
  extends: [K_Humanoid];
  routes: [typeof Body.ears, typeof Body.tail];
}>;

const chapter = [
  // 第 9 段：外貌。写耳朵的"整体外观"，还没分左右耳。
  from(9, narrator, "plain", [
    fact(E.bodyFox, Body.hair,
      { appearance: "灿烂金色的长发垂落在肩膀后背" }, M.a),
    fact(E.bodyFox, Body.ears,
      { aggregate: { appearance: "毛茸茸的耳朵，长在头顶" } }, M.a),
    fact(E.bodyFox, Body.face,
      { appearance: "精致的五官与眼眸" }, M.a),
  ]),

  // 第 10 段：肤色。
  from(10, narrator, "plain", [
    fact(E.bodyFox, Body.skin, { color: "白皙" }, M.a),
  ]),

  // 第 11 段：类型 + 称呼，同一句原文给了两样东西。
  from(11, narrator, "plain", [
    fact(E.bodyFox, Identity,
      { kind: K.foxGirl, appellation: "一只娇小的金毛狐女" }, M.a),
  ]),

  // 第 12 段：尾巴整体外观。
  from(12, narrator, "plain", [
    fact(E.bodyFox, Body.tail, { appearance: "背后一只正在炸毛的大尾巴" }, M.a),
  ]),

  // 第 18 段：耳朵数量 + 尾巴触感。两条 Fact，独立成立。
  from(18, narrator, "plain", [
    fact(E.bodyFox, Body.ears, { count: 2 }, M.a),
    fact(E.bodyFox, Body.tail,
      { texture: "触感无比柔顺，被薅时的摩挲拉拽感从尾巴尖直冲天灵盖" }, M.a),
  ]),
] as const satisfies readonly Batch[];
```

展开后（编译器做的，不是模型写的）：

```text
Fact 组（每次 fact() 调用 = 一个 statementId）：
  F1  bodyFox body.hair   { appearance: "…长发…" }        M_a
  F2  bodyFox body.ears   { aggregate.appearance: "毛茸茸…" } M_a
  F3  bodyFox body.face   { appearance: "精致的五官与眼眸" }   M_a
  F4  bodyFox body.skin   { color: "白皙" }                 M_a
  F5  bodyFox identity    { kind: foxGirl, appellation: "…狐女" } M_a
  F6  bodyFox body.tail   { appearance: "…炸毛…" }          M_a
  F7  bodyFox body.ears   { count: 2 }                     M_a
  F8  bodyFox body.tail   { texture: "…柔顺…" }             M_a

叶投影（细粒度的稳定地址，用于查询/冲突）：
  entity:body_fox|body.hair.appearance
  entity:body_fox|body.ears.aggregate.appearance
  entity:body_fox|body.face.appearance
  entity:body_fox|body.skin.color
  entity:body_fox|identity.kind
  entity:body_fox|identity.appellation
  entity:body_fox|body.tail.appearance
  entity:body_fox|body.ears.count
  entity:body_fox|body.tail.texture
```

关键结果：

- **尾巴外观和尾巴触感两个都是 `body.tail.*` 的子路径，但路径不同**，所以不会互相竞争——它们是一条尾巴的两个面，不是矛盾。改掉 v4 里"为让两个值共存而把基数写成 multi"的绕法。
- **第 9 段查询看不到第 18 段的 count**——`readerState(readAt=9)` 只取 `at ≤ 9` 的 Disclosure。没有阅读位置就是泄漏后文。
- **只有类型 claim、没有任何 body 字段的实体，不会凭空长出耳朵尾巴**——`routes` 只给候选，不给事实。

---

## 5. 稳定地址与 Fact 身份规则

这部分最影响"能不能重复、能不能 diff、能不能指向同一个事实"。规则要写死。

### 5.1 Fact 的身份（FactKey）

```text
FactKey = (
  subjectRef,      // "entity:body_fox" 或 "kind:K_magical_girl"
  fieldClusterId,  // "body.ears"
  canonicalPatch,  // 规范化后的 patch（见 5.2）
  timeRefId        // "M_a" 或 "null"（表示不系于某一刻）
)
```

- **不含 at / source / hedge**——那些属于 Disclosure。同一句话被两个人说，仍是**同一个 Fact**、两条 Disclosure。
- **不含 statementId**——那是"这一次陈述"，跨 Fact 归一化时不需要它。

### 5.2 canonicalPatch 规范化

同一份 patch 会被不同的人写成不同顺序、不同空白，要归一化成同一串：

1. **对象键排序**：按键名字典序稳定排序后递归序列化。
2. **数组保持项序**：`[left, right]` 和 `[right, left]` 是两回事（左右耳顺序有意义），不重排。
3. **`null` 与缺省严格区分**：
   - 字段簇 schema 里的可选字段**缺失** = "这条陈述没提它"（序列化里不出现该键）。
   - `timeRef: null` = "明确不系于某一刻"（序列化里是 `null`）。
   - 这两件事语义不同：缺省≠不系于某刻。
4. **字段簇版本**：`fieldClusterId` 本身就是语义版本。将来 `body.ears` 改结构时，用 `body.ears@v2` 这种后缀，避免新旧版本地址撞车。第一版暂用裸 id。

### 5.3 statementId（与 Fact 身份分开）

```text
statementId = (
  source 批次的标识 + 该批次内 fact() 调用的序号,
  或 = 该 fact() 调用的内容指纹
)
```

用途：把一次原子陈述里的所有叶投影绑在一起，防止"多叶合取被拆开后被外来来源部分背书"。它**不参与** Fact 归一化。

### 5.4 Fact.id 生成建议

```text
Fact.id = "F" + (全局递增序号，按首次出现的 FactKey 分配)
```

关键：**同一个 FactKey 只分一个 id，跨批次、跨来源共享**。这样 `inferredFrom`、支持计数、导航都指向同一个稳定节点。重复出现不新建节点。

---

## 6. readerState 求值语义

"读到第 k 段为止，读者认为什么"。这是主查询。

```
readerState(readAt, worldTime?)
```

1. 取 `Disclosure.at <= readAt` 的全部披露（**阅读位置过滤**）
2. 应用其中的反驳（反驳是一条 Disclosure，主语是另一条 Disclosure）
3. 按叶投影地址分组
4. 用已知的时刻先后排序，推不出的保持并列
5. 每组的输出三堆：**当前认为为真** / **悬而未决** / **已被推翻**

几个关键判定：

- **叙述位置 vs 故事时刻**是两件事。`at` 回答"读者什么时候知道"，`timeRef` 回答"事情什么时候发生"。一条披露两个都要，缺一不能从另一个推出。
- **同一地址的多条值**按基数、时刻、来源处理：单值冲突、多值并列、时刻不同接续、值相同来源不同印证。
- **多叶合取**：同 statementId 的叶共享"来源可信度"，但不能被拆分后单独背书（见 3.7）。
- **类级事实不向实例继承**：`(魔法少女, 死亡率)=90%` 是挂在 Kind 上的 Fact，不会自动变成"苏天晴死亡率=90%"。
- **未知 = 待定**：类型 claim 未证实、或值冲突无法裁决时，返回"待定 / 未知"，**不回退为默认**，也不丢弃这条披露。

---

## 7. 关键不变量（红线）

这些是设计上不许踩的线，将来实现和测试都要守：

1. **类型（Kind / routes / extends / 字段簇）只能扩大候选，不能生成事实。**
   `K_FoxGirl.routes` 里出现 `Body.ears`，绝不代表"她必有耳朵"。`routes` 求值恒为 `unknown`。

2. **只有显式 `from(at, source, hedge, [...])` 里的 Fact 才能进入读者认知。**
   任何从类型或类级事实推导、继承、合成的值，都不算披露。

3. **Fact 必须带值。** 空地址不叫事实（那只是内部的 FieldProjection 地址）。
   "地址存在" ≠ "事实成立"；成立由 `readerState` 求值决定。

4. **类级事实不继承到实例；实例归类不自证拥有该类的全部属性。**
   "归为狐女" 是 `identity.kind` 这条显式 Fact，不是"获得狐女能力包"。

5. **阅读位置是查询参数，不是存储属性。** 库里存全部披露；"读到第 k 段"是一次带参数的查询。

6. **披露层只增不改（append-only）。** 后文推翻前文，是追加一条以旧披露为主语的反驳，不改旧记录。

7. **`null` 与缺省分开。** `timeRef: null` 是"明确不系于某刻"，与"这条陈述没提时刻"不是一回事。

---

## 8. 名词对照表

| 名词 | 一句大白话 | 对应 v4 旧概念 |
| --- | --- | --- |
| Entity | 能被记住的主体 | Entity |
| Kind + routes | 类 + "这类能填什么" | Kind + （新）候选路由 |
| FieldCluster | 一类字段的模板（如 body.ears） | 若干细粒度 Predicate 的集合 |
| Leaf | 模板里的一个格子（如 count） | 单个 Predicate |
| Fact | 填好的卡片 = 主体+字段簇+值+timeRef | （新，含值） |
| Disclosure | "这句话是谁在哪说的" | Disclosure |
| FieldProjection | 卡片里的单个格子地址（内部索引） | Slot（降级为地址） |
| CandidatePath | "可以问什么"，恒不为事实 | （新） |
| statementId | "这一次陈述说了什么" | （新） |
| from | 同一段正文的一批 Fact | （新，批处理外壳） |

---

## 9. 边界声明（一句，不展开）

本篇只描述"模型输出长什么样、落成什么数据、怎么求值"。

`as const satisfies readonly Batch[]` **只在 TypeScript 下证明"形状对"**——它能拦 `count: "两只"`、漏 timeRef、错字段名。但它**不验证小说语义**（这句话是不是真的、at/source/timeRef 对不对），也**不代表模型文本被安全执行**。模型输出如何从 TypeScript 文本安全地变成数据（AST 白名单、引用闭包、资源上限）不属于本篇，属后续实现审查。

需要特别点破的一处：**模型输出的 TypeScript 是"看起来像代码的声明"，系统绝不能 `transpile` 后 `import`/`eval`/`Function` 去运行它**。只读 AST，解成数据。

---

## 10. 留给你的问题

1. **`Fact` 含值**，还是仍要一个"无值地址 + 值分离"的双层？含值更贴日常语义，但 `inferredFrom` 指向谁、支持计数按什么分组，都会有连带改动。
2. **集合（左耳/右耳）升级**：以后文本明确分左右耳时，是把 member 提升成 Entity（本文倾向），还是始终留在 aggregate？这决定"外观/触感"这类整体描述以后怎么挂。
3. **`body.ears.*` 作为内部叶路径**，你接受它作为稳定地址吗？它毕竟还是"路径字符串"，不是强类型 ID。
4. **`statementId` 与 Fact 身份分开**是否够用？还是你希望每个 `fact()` 调用本身就是一个可导航节点（那 Fact 就退成 projection 了）。
