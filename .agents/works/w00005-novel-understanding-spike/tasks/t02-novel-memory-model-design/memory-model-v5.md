# 小说记忆模型 v5：TypeScript 双层 DSL（审查稿）

状态：**设计探索稿，等待开发者逐节审查。尚未迁移数据或实现。**

本稿记录 2026-09-03 对 v4 记忆结构的重新设计。它只替换 v4 的 `Kind / Predicate / Slot / Disclosure` 这一半；Beat、Scene、Moment、叙述位置与读者视角原则继续沿用 `memory-model-v4.md`，本文用到的 Moment 最小语义在第 3 节重述。当前 `chapter-01.json`、`schema.ts` 和三个 HTML 仍是 v4.1 实现，不能拿它们当作本稿已经落地的证据。

来源口径：

- **设计推导**：类型层、值层、Fact 身份、字段投影和 DSL 语法。
- **第一章人工金标**：段号与示例内容来自现有 `chapter-01.json` 和归一化正文，不是模型抽取结果。
- **会话内原型验证**：使用 TypeScript `5.9.3` 对小型内存原型做过静态检查和确定性展开；没有形成仓库源码。
- **未验证**：真实模型是否更容易稳定输出本 DSL、跨书词表是否收敛、抽取准确率与规模表现。

---

## 1. 一页结论

### 1.1 两层，不把类型声明当成正文事实

```text
TypeScript 类型层
  Kind / extends / Trait / 字段簇 / 字段叶 / 值域
  作用：候选路由、自动补全、局部形状检查
  禁止：生成 Fact、Disclosure、Entity 属性或类型归属

TypeScript 值层
  Entity 引用 / Moment 引用 / from(...) / fact(...) / infer(...)
  作用：显式描述文本在何处、由谁、以什么保留度披露了什么

Canonical 层
  Statement / Fact / FieldProjection / Disclosure
  作用：稳定身份、图导航、支持与冲突求值、按阅读位置查询
```

`extends`、交集和 Trait 即使声明了 `HasEars`，也只表示抽取时可以检查耳朵字段。`fact(...)` 只构造带 `timeRef` 的命题；只有 `from(...)` 或 `infer(...)` 再为它提供 `at / source / hedge` 并编译成 Disclosure 后，它才进入读者认知。

### 1.2 不再让模型从全局表选择 `P_EarCount`

耳朵不再拆成全局的 `P_Ear`、`P_EarCount`。类型层提供一个局部字段簇：

```ts
const Body = {
  ears: cluster("body.ears", 1, {
    count: numberLeaf({ cardinality: "single", volatility: "low" }),
    aggregate: {
      appearance: textLeaf({ cardinality: "single", volatility: "low" }),
    },
    members: entityRefLeaf({ cardinality: "multi", volatility: "low", valueSemantics: "set" }),
  }),
};
```

模型写：

```ts
fact(E.bodyFox, Body.ears, { count: 2 }, M.a);
```

Canonical 求值边界仍然是稳定叶路径：

```text
entity:body_fox | body.ears@1.count
```

因此不是删除谓词语义，而是把冷门全局谓词收进相关类型的局部字段结构。

### 1.3 `Fact` 是完整命题，不是空地址

```text
Fact = 主体 + 已绑定字段 + 规范化值补丁 + timeRef
Disclosure = Fact + 证据锚（Statement 或 Derivation）+ at + source + hedge
FieldProjection = Fact 在每个显式叶路径上的派生投影
```

v4 的 `Slot` 不直接改名为 `Fact`。无值地址仍只是内部的 `FieldAddress`，不是事实。一个字段地址存在，不能推出读者知道任何值。

### 1.4 数组降低重复，但不吞掉每条 Fact 的时间

`from(...)` 的数组共享一段原文的 `statementId / at / source / hedge`。每个 `fact(...)` 仍显式携带自己的 `timeRef`。第一章第 16 段正好证明这两层不能合并：同一段叙述产生的几条 Fact 分别指向 `M_nightshifts`、`M_b`、`null` 和 `M_a`。

---

## 2. 不可升级规则

以下规则是本稿的硬边界。

1. **类型声明只路由候选字段。** `Kind`、`extends`、交集、Trait、字段形状都不能产生 Fact 或 Disclosure。
2. **类型归属也是 Fact。** “苏天晴是魔法少女”必须经显式 `fact(E.su, Identity, { kind: K.magicalGirl }, timeRef)`，并带来源与叙述位置。
3. **类级 Fact 不向实例继承。** “魔法少女死亡率 90%”挂在 `K.magicalGirl` 上，不会自动成为苏天晴的实例属性。
4. **关系存在不能反推类型。** 系统可以把“某主体的耳朵数量是 2”判为类型兼容性待定，但不能据此反推主体是狐女或身体。
5. **缺失不是 `null`。** 没写某个叶子表示没有该 Claim；只有字段值域明确允许 `null` 时，显式 `null` 才是一个值。
6. **Disclosure 只增不改。** 后文否定前文时追加反驳，不覆盖旧披露。
7. **叙述位置和故事时间分开。** `at` 回答读者何时看到；`timeRef` 回答命题在故事里的哪个时刻成立。

反例：

```ts
// 类型层：狐女提供耳朵相关候选字段。
type K_FoxGirl = Kind<{
  id: "K_fox_girl";
  extends: [K_Humanoid];
  with: [HasEars, HasTail];
}>;

// 值层：正文只显式披露了类型归属。
from({
  id: "ST_C01_P11_N1",
  at: 11,
}, {
  source: narrator,
  hedge: "plain",
}, [
  fact(E.bodyFox, Identity, { kind: K.foxGirl }, M.a),
]);

// 读到第 11 段：
// bodyFox 的 Kind claim 可见；body.ears.count 仍为 unknown。
// 第 18 段显式出现 fact(... { count: 2 } ...) 后，数量才可见。
```

---

## 3. 术语

| 术语 | 定义 | 是否有稳定身份 |
| --- | --- | --- |
| `Entity` | 人物、组织、概念、地点、物品、身体等可被持续指称的主体 | 是，字面 ID |
| `Kind` | 分级类型索引；可多父继承并组合 Trait | 是，词表 ID |
| `Trait` | 一组可复用的候选字段；表达能力或描述面，不表达实例事实 | 是，词表 ID |
| `FieldCluster` | 类型局部的结构化字段入口，如 `Body.ears` | 是，`id + version` |
| `FieldLeafSpec` | `textLeaf()` 等构造器返回的未绑定叶描述；没有簇身份，不能作为 `fieldQuery()` 参数 | 否，静态形状 |
| `BoundFieldLeaf` | `cluster()` 或关系绑定递归产生的可求值叶；带 `clusterId + version + leafPath + qualifiers` | 是，绑定字段身份 |
| `FieldLeaf` | `BoundFieldLeaf` 的简写；只指可求值的绑定叶 | 是，绑定字段身份 |
| `FieldAddress` | `subject + bound field + leafPath`；只用于分组和导航，不含值 | 派生稳定键 |
| `Statement` | 一次原文表述的身份锚；同一句产生的多个 Fact 共享它 | 是，与 Fact 分离 |
| `Moment` | 故事时间上的身份锚；有稳定 ID、没有绝对坐标，`grain` 标记文本把它视为点还是区间，时刻关系可推导它的可能位置范围 | 是，字面 ID |
| `Fact` | 一个完整命题：主体、字段、显式值补丁和故事时刻 | 是，内容寻址 |
| `FieldProjection` | Fact 的一个显式叶投影；冲突和局部支持在这里比较 | 派生稳定键 |
| `Disclosure` | 某个 Statement 或读者推导对某个 Fact 的一次披露，带叙述位置、来源和保留度 | 是，只增不改 |
| `CandidatePath` | 由 Kind/Trait 展开的候选字段；求值恒为 unknown | 派生，不是 Fact |
| `ReaderState` | 给定阅读位置和可选故事时刻，对可见 Disclosure 的求值结果 | 查询结果 |

`Fact` 与 v4 的含义不同。v4 把 `Fact` 当作无值槽；v5 把它恢复成日常含义中的完整命题。无值分组键不再作为业务节点暴露。

---
## 4. TypeScript 类型层

### 4.0 示例类型基元

下面是本节代码块共享的最小示例词汇。代码块按语义分组，不要求拼接成一个可直接运行的单文件；`declare function` 只表示白名单 DSL 宏的类型签名，不代表当前仓库已经有这些 API。

```ts
type StatementId = string;
type DerivationId = string;
type Para = number;
type FactId = string;
type DisclosureId = string;
type FieldAddress = string;

type Cardinality = "single" | "multi";
type Volatility = "low" | "medium" | "high";
type Hedge = "plain" | "hedged" | "suspended";

/** 叶构造器的输出；尚未绑定到某个 FieldCluster。 */
type FieldLeafSpec = {
  readonly type: "field-leaf-spec";
  readonly cardinality: Cardinality;
  readonly volatility: Volatility;
  readonly valueSemantics?: "set" | "ordered-list";
};

type QualifierMap = Readonly<Record<string, unknown>>;
type EmptyQualifiers = Readonly<Record<string, never>>;

/** cluster() 或关系绑定产生的可求值叶。 */
type BoundFieldLeaf<
  ClusterId extends string = string,
  Version extends number = number,
  Path extends string = string,
  Qualifiers extends QualifierMap = EmptyQualifiers,
> = {
  readonly type: "field-leaf";
  readonly clusterId: ClusterId;
  readonly version: Version;
  readonly leafPath: Path;
  readonly qualifiers: Qualifiers;
  readonly cardinality: Cardinality;
  readonly volatility: Volatility;
  readonly valueSemantics?: "set" | "ordered-list";
};

type FieldLeaf = BoundFieldLeaf;

type FieldClusterRef<
  Id extends string = string,
  Version extends number = number,
> = {
  readonly type: "field-cluster";
  readonly id: Id;
  readonly version: Version;
};

type BindField<
  ClusterId extends string,
  Version extends number,
  Path extends string,
  Value,
  Qualifiers extends QualifierMap,
> = Value extends FieldLeafSpec
  ? BoundFieldLeaf<ClusterId, Version, Path, Qualifiers>
  : Value extends Readonly<Record<string, unknown>>
    ? {
        readonly [Key in keyof Value]: BindField<
          ClusterId,
          Version,
          `${Path}.${Extract<Key, string>}`,
          Value[Key],
          Qualifiers
        >;
      }
    : Value;

type BindFields<
  ClusterId extends string,
  Version extends number,
  Fields extends Readonly<Record<string, unknown>>,
  Qualifiers extends QualifierMap,
> = {
  readonly [Key in keyof Fields]: BindField<
    ClusterId,
    Version,
    Extract<Key, string>,
    Fields[Key],
    Qualifiers
  >;
};

type FieldCluster<
  Id extends string = string,
  Version extends number = number,
  Fields extends Readonly<Record<string, unknown>> = Readonly<Record<string, never>>,
  Qualifiers extends QualifierMap = EmptyQualifiers,
> = FieldClusterRef<Id, Version> & BindFields<Id, Version, Fields, Qualifiers>;

type CandidateFields<T> = T;

// 前置类型只表示候选簇引用；可查询叶由后文的簇值派生。
type IdentityFields = {
  kind: FieldClusterRef<"identity", 1>;
  appellation: FieldClusterRef<"identity", 1>;
};

type BodyFieldRefs = {
  hair: FieldClusterRef<"body.hair", 1>;
  ears: FieldClusterRef<"body.ears", 1>;
  face: FieldClusterRef<"body.face", 1>;
  skin: FieldClusterRef<"body.skin", 1>;
  tail: FieldClusterRef<"body.tail", 1>;
};

type BodyFields = BodyFieldRefs;

type Entity<Id extends string, Candidates = unknown> = {
  readonly type: "entity";
  readonly id: Id;
  readonly candidates?: Candidates;
};

type EntityRef<Id extends string = string> = Entity<Id>;
type KindRef<Id extends string = string> = {
  readonly type: "kind-ref";
  readonly id: Id;
};
type SubjectRef = EntityRef | KindRef;
type MomentRef<Id extends string = string> = {
  readonly type: "moment-ref";
  readonly id: Id;
};
type FieldQuery = {
  readonly address: FieldAddress;
  readonly subject: SubjectRef;
  readonly leaf: BoundFieldLeaf;
};

type StatementSource =
  | {
      readonly channel: "narrator" | "system" | "author";
      readonly holder: null;
    }
  | {
      readonly channel: "speech" | "thought";
      readonly holder: EntityRef;
    };

type ReaderInferenceSource = {
  readonly channel: "reader_inference";
  readonly holder: null;
};

type Source = StatementSource | ReaderInferenceSource;

type CanonicalPrimitive = string | number | boolean | null;
type CanonicalValue =
  | CanonicalPrimitive
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };
type CanonicalObject = { readonly [key: string]: CanonicalValue };
type CanonicalPatch = CanonicalObject;

declare function entity<Id extends string>(id: Id): Entity<Id, never>;
declare function kind<Id extends string>(id: Id): KindRef<Id>;
declare function moment<Id extends string>(id: Id): MomentRef<Id>;

/** 只接受已绑定叶；字段簇和 FieldLeafSpec 都没有可求值的 leafPath。 */
declare function fieldQuery<
  ClusterId extends string,
  Version extends number,
  Path extends string,
  Qualifiers extends QualifierMap,
>(
  subject: SubjectRef,
  leaf: BoundFieldLeaf<ClusterId, Version, Path, Qualifiers>,
): FieldQuery;

type LeafOptions = {
  readonly cardinality: Cardinality;
  readonly volatility: Volatility;
  readonly valueSemantics?: "set" | "ordered-list";
};

declare function textLeaf(options: LeafOptions): FieldLeafSpec;
declare function numberLeaf(options: LeafOptions): FieldLeafSpec;
declare function kindRefLeaf(options: LeafOptions): FieldLeafSpec;
declare function entityRefLeaf(options: LeafOptions): FieldLeafSpec;
declare function cluster<
  Id extends string,
  Version extends number,
  Fields extends Readonly<Record<string, unknown>>,
>(id: Id, version: Version, fields: Fields): FieldCluster<Id, Version, Fields>;

type BoundRelation<
  Id extends string,
  Version extends number,
  Value extends Readonly<Record<string, unknown>>,
> = {
  <Qualifiers extends QualifierMap>(
    qualifiers: Qualifiers,
  ): FieldCluster<Id, Version, Value, Qualifiers>;
  readonly id: Id;
  readonly version: Version;
};

declare function relation<
  Id extends string,
  Version extends number,
  Value extends Readonly<Record<string, unknown>>,
>(
  id: Id,
  version: Version,
  spec: {
    readonly qualifiers: Readonly<Record<string, unknown>>;
    readonly value: Value;
  },
): BoundRelation<Id, Version, Value>;
declare function entityRefQualifier(): unknown;
declare function optionalTextQualifier(): unknown;

type Kind<Spec> = { readonly type: "kind"; readonly spec: Spec };
type Trait<Spec> = { readonly type: "trait"; readonly spec: Spec };

type K_Agent = Kind<{
  id: "K_agent";
  extends: [];
  with: [];
}>;

type K_AntagonistRole = Kind<{
  id: "K_antagonist_role";
  extends: [];
  with: [];
}>;

type HasIdentity = Trait<{ id: "has_identity"; fields: [] }>;
type HasMission = Trait<{ id: "has_mission"; fields: [] }>;
type HasTransformation = Trait<{ id: "has_transformation"; fields: [] }>;
```

这些类型只提供静态形状；它们不会把字段值、Kind 归属或 Disclosure 自动写进 Entity。

### 4.1 Entity 同时有类型身份和值引用

```ts
/**
 * `CandidateFields` 只限制本轮模型可以填写哪些字段。
 * 它不是该实体已经拥有这些属性的证明。
 */
type E_BodyFox = Entity<
  "body_fox",
  CandidateFields<IdentityFields & BodyFields>
>;

/**
 * 值空间实例只保存稳定身份。
 * 不把 ears、tail 等正文事实直接塞进 Entity 对象。
 */
const bodyFox: E_BodyFox = entity("body_fox");
```

别名 `E_BodyFox` 可以重命名，实体身份不能因此改变。Canonical 身份来自字面量 `"body_fox"`，不是 TypeScript 标识符名。

### 4.2 Kind 是开放的分级索引

```ts
/** 一个人形主体。 */
type K_Humanoid = Kind<{
  id: "K_humanoid";
  extends: [];
  with: [HasIdentity];
}>;

/**
 * 狐女 is-a Humanoid，并组合 HasEars / HasTail。
 * 多父类型使用 extends 数组，不受 JavaScript 单原型链限制。
 */
type K_FoxGirl = Kind<{
  id: "K_fox_girl";
  extends: [K_Humanoid];
  with: [HasEars, HasTail];
}>;

/** 魔法少女与狐女是两条可交叉的类型分支。 */
type K_MagicalGirl = Kind<{
  id: "K_magical_girl";
  extends: [K_Agent];
  with: [HasMission, HasTransformation];
}>;

type K_VillainMagicalGirl = Kind<{
  id: "K_villain_mg";
  extends: [K_MagicalGirl, K_AntagonistRole];
  with: [];
}>;
```

`Kind<...>` 的 `id` 与 `kind(id)` 的参数使用同一个权威词表 ID，统一写成 `K_*`。TypeScript 别名只服务于静态引用，不参与 Kind 身份。

Kind 数量不设人为上限。候选检索走父类闭包、Trait 倒排和字段倒排，不靠压少 Kind 数量。

### 4.3 Trait 只提供候选字段

```ts
type HasEars = Trait<{
  id: "has_ears";
  fields: [BodyFieldRefs["ears"]];
}>;

type HasTail = Trait<{
  id: "has_tail";
  fields: [BodyFieldRefs["tail"]];
}>;
```

`HasEars` 的含义是：抽取器处理该候选类型时，可以检查注册字段 `body.ears`。它不表示：

- 该实体一定有耳朵；
- 耳朵数量有默认值；
- 可以建立 `body.ears.*` Fact；
- 可以把 Kind 级 Fact 复制到实例。

### 4.4 FieldCluster 取代冷门全局谓词

下面是当前候选 API。代码用于展示 DSL 形状，不是现有仓库实现。

```ts
const Identity = cluster("identity", 1, {
  kind: kindRefLeaf({
    cardinality: "multi",
    volatility: "low",
    valueSemantics: "set",
  }),
  appellation: textLeaf({
    cardinality: "multi",
    volatility: "low",
    valueSemantics: "set",
  }),
});

const Body = {
  hair: cluster("body.hair", 1, {
    appearance: textLeaf({ cardinality: "single", volatility: "low" }),
  }),

  ears: cluster("body.ears", 1, {
    /** 集合整体的数量，不是一个叫 EarCount 的全局谓词。 */
    count: numberLeaf({ cardinality: "single", volatility: "low" }),

    /** 未区分左右耳时，只允许写 aggregate，不能伪造成员。 */
    aggregate: {
      appearance: textLeaf({ cardinality: "single", volatility: "low" }),
    },

    /** 只有正文分别指称具体耳朵后，才显式列成员 Entity。 */
    members: entityRefLeaf({
      cardinality: "multi",
      volatility: "low",
      valueSemantics: "set",
    }),
  }),

  face: cluster("body.face", 1, {
    appearance: textLeaf({ cardinality: "single", volatility: "low" }),
  }),

  skin: cluster("body.skin", 1, {
    color: textLeaf({ cardinality: "single", volatility: "low" }),
  }),

  tail: cluster("body.tail", 1, {
    appearance: textLeaf({ cardinality: "single", volatility: "medium" }),
    texture: textLeaf({ cardinality: "single", volatility: "low" }),
    members: entityRefLeaf({
      cardinality: "multi",
      volatility: "low",
      valueSemantics: "set",
    }),
  }),
} as const;
```

耳朵姿态和尾巴姿态当前故意不放进长期记忆字段。它们变化频率高，继续按 v4 留在 Beat 概括或原文中。若以后统一两种 DSL，可为叶子增加 `retention: "beat"`，但本稿尚未采纳。

### 4.5 关系使用限定参数，不把实例烧进名字

v4 的 `P_role_to_su`、`P_attitude_feet`、`P_prospect` 把目标或上下文写进了谓词名。v5 用可绑定字段：

```ts
const Relation = {
  role: relation("relation.role", 1, {
    qualifiers: {
      target: entityRefQualifier(),
    },
    value: {
      description: textLeaf({ cardinality: "single", volatility: "low" }),
    },
  }),

  attitude: relation("relation.attitude", 1, {
    qualifiers: {
      target: entityRefQualifier(),
      aspect: optionalTextQualifier(),
    },
    value: {
      description: textLeaf({ cardinality: "single", volatility: "low" }),
    },
  }),

  kin: relation("relation.kin", 1, {
    qualifiers: {
      target: entityRefQualifier(),
    },
    value: {
      description: textLeaf({ cardinality: "single", volatility: "low" }),
    },
  }),

  inhabits: relation("relation.inhabits", 1, {
    qualifiers: {
      body: entityRefQualifier(),
    },
    value: {
      description: textLeaf({ cardinality: "single", volatility: "low" }),
    },
  }),
};
```

使用时先绑定限定参数：

```ts
fact(
  E.codex,
  Relation.role({ target: E.su }),
  { description: "引导苏天晴走上完美的生活" },
  null,
);

fact(
  E.su,
  Relation.attitude({ target: E.bodyFox, aspect: "feet" }),
  { description: "小脚是世界上最美好的瑰宝" },
  null,
);

fact(
  E.su,
  Relation.kin({ target: E.tainai }),
  { description: "亲属关系" },
  null,
);

fact(
  E.su,
  Relation.inhabits({ body: E.bodyFox }),
  { description: "居于这具身体" },
  M.a,
);

```
限定参数进入 FieldAddress 和 Fact 身份。换一本书或换一个主体时，`relation.role` 与 `relation.attitude` 原样复用。

---

## 5. TypeScript 值层

### 5.1 模型输出的公共形状

```ts
/** 一段原文表述的稳定引用，由 ingest 协调器提供，不让模型编造。 */
type StatementRef = {
  readonly id: StatementId;
  readonly at: Para;
};

type FactInput<Subject = SubjectRef, Field = FieldCluster, Value = unknown> = {
  readonly type: "fact-input";
  readonly subject: Subject;
  readonly field: Field;
  readonly value: Value;
  readonly timeRef: MomentRef | null;
};

type StatementInput = {
  readonly type: "statement-input";
  readonly statement: StatementRef;
  readonly evidence: {
    readonly source: StatementSource;
    readonly hedge: Hedge;
  };
  readonly facts: readonly FactInput[];
};

type InferenceInput = {
  readonly type: "inference-input";
  readonly derivationId: DerivationId;
  readonly at: Para;
  readonly result: FactInput;
  readonly hedge: Hedge;
  readonly inferredFrom: readonly [FieldQuery, ...FieldQuery[]];
};

type MemoryInput = StatementInput | InferenceInput;

/**
 * 一个完整命题输入。
 * `timeRef` 每条必填；null 表示该命题不系于某个故事时刻。
 */
declare function fact<Subject, Field, Value>(
  subject: Subject,
  field: Field,
  value: Value,
  timeRef: MomentRef | null,
): FactInput<Subject, Field, Value>;

/** 同一原文表述产生的 Fact 数组共享来源元数据。 */
declare function from(
  statement: StatementRef,
  evidence: {
    readonly source: StatementSource;
    readonly hedge: Hedge;
  },
  facts: readonly FactInput[],
): StatementInput;

/**
 * 读者推断不是原文 Statement。
 * `inferredFrom` 指向可重算的 FieldAddress，而不是某次具体 Disclosure。
 */
declare function infer(
  derivationId: DerivationId,
  at: Para,
  result: FactInput,
  options: {
    readonly hedge: Hedge;
    readonly inferredFrom: readonly [FieldQuery, ...FieldQuery[]];
  },
): InferenceInput;
```

`from(...)` 不接收一个共享 `timeRef`。第 16 段会证明共享它必然丢信息。

编译映射是本稿的正式合同，不由实现自由猜测：

- `from(statement, evidence, facts)` 为每个 Fact 生成文本披露：`statementId = statement.id`、`at = statement.at`、`source = evidence.source`、`hedge = evidence.hedge`；`derivationId` 与 `inferredFrom` 不存在。
- `infer(derivationId, at, result, options)` 只生成一个读者推断披露：`statementId = null`、`derivationId` 与 `at` 原样保留、`source = { channel: "reader_inference", holder: null }`、`hedge = options.hedge`、`inferredFrom = options.inferredFrom`。
- `infer(...)` 没有 `source` 参数，也没有隐式 hedge 默认值；调用者必须显式选择 `plain`、`hedged` 或 `suspended`。`inferredFrom` 至少一项，空数组是非法输入。

### 5.2 `satisfies` 的准确口径

```ts
const chapter01 = [
  // from(...), infer(...)
] as const satisfies readonly MemoryInput[];
```

`satisfies` 只让 TypeScript 检查表达式的静态可赋值形状，并保留较具体的推断类型。它不验证小说语义，不验证 `at` 是否越界、引用是否存在或证据是否可信。TypeScript 类型还会在编译时被擦除。本轮只讨论 DSL 语义；解析器和不可信输入边界留到实现阶段单独设计。

---

## 6. 第一章示例

以下段号严格对应现有第一章人工金标。

本节注释里的 `D13`、`D17`、`D18`–`D24` 是当前 v4 `chapter-01.json` 的人工金标条目 ID，只用于逐项对照。它们不是第 8.3 节定义的 v5 `DisclosureId`；迁移到 v5 时会按新身份载荷重新计算 `D_...`。

### 6.1 引用表

```ts
const E = {
  su: entity("su_tianqing"),
  codex: entity("codex"),
  bodyFox: entity("body_fox"),
  stall: entity("noodle_stall"),
  tainai: entity("tainai"),
} as const;

const K = {
  foxGirl: kind("K_fox_girl"),
  starEnvoy: kind("K_star_envoy"),
  magicalGirl: kind("K_magical_girl"),
} as const;

const M = {
  a: moment("M_a"),
  b: moment("M_b"),
  nightshifts: moment("M_nightshifts"),
  later: moment("M_later"),
} as const;

```

#### 6.1.1 示例词汇与证据引用

后续代码块复用以下最小词汇。`ST` 由 ingest 预先提供，模型只能引用其中的 `StatementRef`，不能自行编造段号；`M.later` 和 `ST.laterLeftn1` 只服务于第 10.2 节的假设性后文示例。

```ts
const ST = {
  p09n1: { id: "ST_C01_P09_N1", at: 9 },
  p10n1: { id: "ST_C01_P10_N1", at: 10 },
  p11n1: { id: "ST_C01_P11_N1", at: 11 },
  p12n1: { id: "ST_C01_P12_N1", at: 12 },
  p16n1: { id: "ST_C01_P16_N1", at: 16 },
  p18n1: { id: "ST_C01_P18_N1", at: 18 },
  p45c1: { id: "ST_C01_P45_C1", at: 45 },
  p68s1: { id: "ST_C01_P68_S1", at: 68 },
  laterLeftn1: { id: "ST_LATER_LEFT_N1", at: 79 },
} as const satisfies Readonly<Record<string, StatementRef>>;

const narrator = { channel: "narrator", holder: null } as const;
const speech = <Holder>(holder: Holder) => ({
  channel: "speech" as const,
  holder,
});

const Life = {
  previousWork: cluster("life.previous_work", 1, {
    description: textLeaf({ cardinality: "single", volatility: "low" }),
  }),
} as const;

const Profession = cluster("profession", 1, {
  deathRate: numberLeaf({ cardinality: "single", volatility: "low" }),
});

const Ear = cluster("body.ear", 1, {
  scar: textLeaf({ cardinality: "single", volatility: "low" }),
});

type PercentValue = number & { readonly unit: "percent" };
declare function percent(value: number): PercentValue;
```

`Life.previousWork`、`Profession` 和 `Ear` 都是字段簇；`percent(90)` 是把数值标记为百分比的值构造器。`narrator` 与 `speech(holder)` 是本稿示例使用的两个来源值，分别表示叙述者告知和角色说话；它们不改变 `from(...)` 对 `source` 与 `hedge` 的要求。

### 6.2 第 9、10、11、12、18 段：身体字段

```ts
const chapter01Memory = [
  from(ST.p09n1, { source: narrator, hedge: "plain" }, [
    fact(E.bodyFox, Body.hair, {
      appearance: "灿烂金色的长发垂落在肩膀后背",
    }, M.a),

    // D13：第 9 段只披露耳朵外观，不披露数量。
    fact(E.bodyFox, Body.ears, {
      aggregate: {
        appearance: "毛茸茸的耳朵，长在头顶",
      },
    }, M.a),

    fact(E.bodyFox, Body.face, {
      appearance: "精致的五官与眼眸",
    }, M.a),
  ]),

  from(ST.p10n1, { source: narrator, hedge: "plain" }, [
    fact(E.bodyFox, Body.skin, { color: "白皙" }, M.a),
  ]),

  from(ST.p11n1, { source: narrator, hedge: "plain" }, [
    /**
     * 同一句话同时给出类型归属与称呼。
     * 这是一个多叶 Fact，两个叶投影保留共同 Fact 身份。
     */
    fact(E.bodyFox, Identity, {
      kind: K.foxGirl,
      appellation: "一只娇小的金毛狐女",
    }, M.a),
  ]),

  from(ST.p12n1, { source: narrator, hedge: "plain" }, [
    // D17：尾巴外观。
    fact(E.bodyFox, Body.tail, {
      appearance: "背后一只正在炸毛的大尾巴",
    }, M.a),
  ]),

  from(ST.p18n1, { source: narrator, hedge: "plain" }, [
    // D23：耳朵数量直到第 18 段才出现。
    fact(E.bodyFox, Body.ears, { count: 2 }, M.a),

    // D24：尾巴触感与外观是不同叶路径，不再伪装成 multi 值。
    fact(E.bodyFox, Body.tail, {
      texture: "触感无比柔顺，被薅时的摩挲拉拽感从尾巴尖直冲天灵盖",
    }, M.a),
  ]),
] as const satisfies readonly MemoryInput[];
```

读到第 11 段时，即使 `K_FoxGirl` 的候选路由含 `Body.ears`，结果仍是：

```text
body.ears.aggregate.appearance = 已披露
body.ears.count                = unknown
body.tail.texture              = unknown
```

读到第 18 段后，后两项才分别由 D23、D24 进入读者认知。

### 6.3 第 16 段：同一叙述位置，不同故事时刻

```ts
from(ST.p16n1, { source: narrator, hedge: "plain" }, [
  // D18：这一事实说的是连续三个夜班那段时间。
  fact(E.su, Life.previousWork, {
    description: "连续三个夜班后刚下班",
  }, M.nightshifts),

  // D19、D20：称呼出现在五分钟前的面摊时刻。
  fact(E.stall, Identity, { appellation: "街边面摊" }, M.b),
  fact(E.tainai, Identity, { appellation: "太奶" }, M.b),

  // D21：亲属关系按当前金标是不系于某一刻的一般关系。
  fact(E.su, Relation.kin({ target: E.tainai }), { description: "亲属关系" }, null),
]);

infer(
  "I_C01_P16_1",
  16,
  // D22：读者在第 16 段才推得苏天晴居于这具身体，命题指向 M_a。
  fact(E.su, Relation.inhabits({ body: E.bodyFox }), { description: "居于这具身体" }, M.a),
  {
    hedge: "plain",
    inferredFrom: [
      fieldQuery(E.bodyFox, Identity.appellation),
      fieldQuery(E.bodyFox, Identity.kind),
      fieldQuery(E.bodyFox, Body.tail.appearance),
      fieldQuery(E.su, Life.previousWork.description),
    ],
  },
);
```

这里数组只能共享 `statement / source / hedge`。把 `timeRef` 提到数组外会把四种时间语义压成一个错误值。

### 6.4 第 45 段：角色自称只是一条带来源 Fact

```ts
from(ST.p45c1, {
  source: speech(E.codex),
  hedge: "plain",
}, [
  fact(E.codex, Identity, { kind: K.starEnvoy }, M.a),
  fact(
    E.codex,
    Relation.role({ target: E.su }),
    { description: "引导苏天晴走上完美的生活" },
    null,
  ),
]);
```

查询必须表述为“墨丘利秘典自称是星界使者”，不能无来源地回答“它确定是星界使者”。这条类型 claim 是否扩大下一段抽取的候选字段，仍是待裁决的路由策略；无论如何都不得自动生成 Fact。

### 6.5 第 68 段：Kind 可以作为 Fact 主体

```ts
from(ST.p68s1, {
  source: speech(E.su),
  hedge: "hedged",
}, [
  fact(K.magicalGirl, Profession, {
    deathRate: percent(90),
  }, null),
]);
```

这是苏天晴以问句提出的类级 claim，所以保留度是 `hedged`。它既不确认 90%，也不把死亡率继承给任何魔法少女实例。

---

## 7. Canonical 形状

DSL 编译后保留 Statement、Fact、FieldProjection 与 Disclosure 四类记录；Disclosure 的证据锚按来源判别为 Statement 或 DerivationId。

```ts
interface Statement {
  id: StatementId;
  /** 归一化正文版本；正文变化会产生新的 Statement 身份。 */
  sourceRevision: string;
  /** 当前 spike 至少有段号；以后可追加句内字符区间。 */
  span: {
    paragraphStart: Para;
    paragraphEnd: Para;
    charStart?: number;
    charEnd?: number;
    ordinal: number;
  };
}

interface BoundField {
  id: string;
  version: number;
  /** 关系字段在这里保存 target / aspect / context。 */
  qualifiers: Readonly<Record<string, CanonicalValue>>;
}

interface Fact {
  id: FactId;
  subject: SubjectRef;
  field: BoundField;
  /** 只含模型显式写出的叶子；缺省叶子不参与该 Fact。 */
  value: CanonicalPatch;
  timeRef: MomentRef | null;
}

interface FieldProjection {
  /** 原始多叶 Fact 的共同身份。 */
  factId: FactId;
  /** 不含值的分组地址，不是业务 Fact 节点。 */
  address: FieldAddress;
  leafPath: string;
  value: CanonicalValue;
  timeRef: MomentRef | null;
  cardinality: "single" | "multi";
  volatility: "low" | "medium" | "high";
}

interface DisclosureBase {
  id: DisclosureId;
  factId: FactId;
  at: Para;
  hedge: Hedge;
}

interface StatementDisclosure extends DisclosureBase {
  statementId: StatementId;
  derivationId?: never;
  source: StatementSource;
  inferredFrom?: never;
}

interface InferenceDisclosure extends DisclosureBase {
  statementId: null;
  derivationId: DerivationId;
  source: ReaderInferenceSource;
  inferredFrom: readonly [FieldQuery, ...FieldQuery[]];
}

type Disclosure = StatementDisclosure | InferenceDisclosure;
```

### 7.1 多叶 Fact 与叶投影

第 11 段的一个 Fact：

```ts
fact(E.bodyFox, Identity, {
  kind: K.foxGirl,
  appellation: "一只娇小的金毛狐女",
}, M.a);
```

产生一个 Fact 和两个投影：

```text
Fact F_x
  value = {
    kind: K_fox_girl,
    appellation: "一只娇小的金毛狐女"
  }

Projection 1
  address = entity:body_fox | identity@1.kind
  value   = K_fox_girl
  factId  = F_x

Projection 2
  address = entity:body_fox | identity@1.appellation
  value   = "一只娇小的金毛狐女"
  factId  = F_x
```

若另一个来源只披露 `kind = K_fox_girl`，它只支持 Projection 1，不自动替完整合取 Fact 或 Projection 2 背书。原始 Fact 身份保留“这两个叶子来自同一个命题组”。

### 7.2 尾巴不再产生错误竞争

```text
第 12 段  entity:body_fox | body.tail@1.appearance
第 18 段  entity:body_fox | body.tail@1.texture
```

两个投影地址不同，因此不会因为同主体、同时刻、同来源、值不同而被误判为竞争。`Body.tail` 仍是模型看到的一个字段簇。

---

## 8. Fact、Statement 与 Disclosure 的身份规范

### 8.1 Fact ID

Fact 使用内容寻址，规范输入如下：

```ts
interface FactIdentityPayload {
  schema: "nbook.fact/v5";
  subject: {
    type: "entity" | "kind";
    id: string;
  };
  field: {
    id: string;
    version: number;
    qualifiers: CanonicalObject;
  };
  value: CanonicalPatch;
  timeRef: null | {
    type: "moment";
    id: string;
  };
}
```

```text
Fact.id = "F_" + base64url(SHA-256(JCS(FactIdentityPayload)))
```

规范化规则：

1. 先按 FieldCluster 形状验证，再计算身份；非法叶子不参与“宽松修复”。
2. 对象键按 RFC 8785 JCS 递归排序；源码中的对象键顺序不影响 Fact ID。
3. `undefined` 禁止出现。字段缺省与显式 `null` 不同；只有值域允许时才接受 `null`。
4. 字符串按原 Unicode 序列保留，不额外做 Unicode 归一化。
5. 数组默认有序，元素顺序参与 Fact ID。
6. 叶描述符若声明 `valueSemantics: "set"`，则先按每个元素的 canonical bytes 排序并去重，再参与 JCS；不能仅因为 cardinality 是 `multi` 就擅自排序。
7. `subject.type` 参与身份，`entity:x` 与 `kind:x` 不是同一主体。
8. `field.version` 与绑定后的 qualifiers 参与身份。字段语义或 qualifier 改变时必须升版本，旧 Fact 不静默换义。
9. `timeRef: null` 与具体 Moment 不同。叙述位置、来源、保留度和 Statement 不进入 Fact ID。

因此：

- 同一 Fact 被叙述者和角色各说一次，复用同一 Fact ID，产生两条 Disclosure。
- `{ kind, appellation }` 的对象键调换顺序，Fact ID 不变。
- `{ count: 2 }` 与 `{ count: 2, aggregate: { appearance: "尖" } }` 是两个 Fact。
- 两个 Fact 可以在 `body.ears.count` 叶投影上互相支持，但较短 Fact不能支持较长 Fact 中的 `appearance` 叶。

### 8.2 Statement ID 与 Fact ID 分离

Statement 表示原文中的一次表述，不表示它说的内容。建议身份输入为：

```ts
interface StatementIdentityPayload {
  schema: "nbook.statement/v5";
  sourceRevision: string;
  span: {
    paragraphStart: Para;
    paragraphEnd: Para;
    charStart?: number;
    charEnd?: number;
    ordinal: number;
  };
}
```

```text
Statement.id = "ST_" + base64url(SHA-256(JCS(StatementIdentityPayload)))
```

同一句原文产生多个 Fact 时，它们共享 `statementId`。同一个 Fact 被另一段再次说出时，Fact ID 相同，Statement ID 不同。

当前第一章只有段号坐标；`ordinal` 用于区分同一段内的多次表述。是否引入稳定字符区间，留作实现前裁决。

### 8.3 Disclosure ID

文本披露与读者推断使用同一个前缀，但身份输入是判别联合：

```ts
type DisclosureIdentityPayload =
  | {
      schema: "nbook.disclosure/v5";
      kind: "statement";
      factId: FactId;
      statementId: StatementId;
      at: Para;
      source: StatementSource;
      hedge: Hedge;
    }
  | {
      schema: "nbook.disclosure/v5";
      kind: "reader_inference";
      factId: FactId;
      statementId: null;
      derivationId: DerivationId;
      at: Para;
      source: ReaderInferenceSource;
      hedge: Hedge;
      inferredFrom: readonly [FieldQuery, ...FieldQuery[]];
    };
```

```text
Disclosure.id = "D_" + base64url(SHA-256(JCS(DisclosureIdentityPayload)))
```

因此，推断披露的 `derivationId`、`at`、`hedge` 和 `inferredFrom` 都参与 Disclosure 身份；编译器不得删除、默认或重排这些输入。固定的 `reader_inference` 来源也进入 payload。`DerivationId` 自身的生成算法仍是独立未决项，但其字面值已被本合同完整保留。

---

## 9. 字段地址、支持与冲突

### 9.1 FieldAddress

```text
FieldAddress = JCS({
  subject: { type, id },
  field: { id, version, qualifiers },
  leafPath
})
```

它回答“关于这个主体，我们在独立求值哪个问题”，例如：

```text
entity:body_fox | body.ears@1.count
entity:body_fox | body.tail@1.texture
entity:codex    | relation.role@1(target=entity:su_tianqing).description
```

FieldAddress 是可重建索引，不是一个宣称已知值的节点。没有可见 Disclosure 时，求值必须是 `unknown`。

### 9.2 支持分两档

- **完整 Fact 支持**：多个 Disclosure 指向同一 Fact ID。
- **叶投影支持**：不同 Fact 在同一 FieldAddress、同一规范化叶值和兼容 `timeRef` 上一致。

本节只把三种 `timeRef` 视为兼容：两者都为 `null`；两者引用同一个 Moment ID；或时刻关系闭包明确判定两个 Moment 为同一时刻。一空一非空、可能范围仅重叠或关系仍不可判定，都不能构成叶投影支持。

回答完整合取时只能使用完整 Fact 支持；回答单个叶子时可以使用叶投影支持。这避免把“另一来源只确认两只耳朵”错误表述成“另一来源确认两只尖耳”。

### 9.3 冲突仍按叶地址判断

基数与易变度挂在 FieldLeaf 上：

- `single`：同一 FieldAddress、同一故事时刻的不同值可能竞争。
- `multi + set`：不同值并列累加，不互斥。
- `multi + ordered-list`：数组顺序属于值语义，不能当集合去重。
- `volatility`：继续给持久化和接续判断提供提示，不单独决定世界真相。

v4 的 W9、W11 仍未因 DSL 自动解决：跨章时刻不明时如何判支持、同一 Moment 区间内是否用叙述位置判接续，都需要独立裁决。

---

## 10. 集合与部件 Entity

### 10.1 未区分成员时只记 aggregate

第 9 段只写“毛茸茸的耳朵”，没有分别指称左耳和右耳：

```ts
fact(E.bodyFox, Body.ears, {
  aggregate: {
    appearance: "毛茸茸的耳朵，长在头顶",
  },
}, M.a);
```

不能据此生成两个耳朵 Entity，也不能把 aggregate 属性复制给假想成员。

### 10.2 文本开始分别指称时才提升成员

假设后文写“左耳有一道伤疤”：

```ts
// 身份来自文本开始稳定区分这一部件的位置。
const leftEar = entity("body_fox:left_ear");

from(ST.laterLeftn1, { source: narrator, hedge: "plain" }, [
  fact(E.bodyFox, Body.ears, {
    members: [leftEar],
  }, M.later),

  fact(leftEar, Ear, {
    scar: "一道伤疤",
  }, M.later),
]);
```

迁移规则：

1. 旧的 `body.ears.aggregate.*` Fact 保持不变。
2. 新成员通过显式 `members` Fact 连接到集合；反向部件导航由该 Fact 派生，不另设反向字段。
3. aggregate Fact 不自动复制到任何成员。
4. 后文明确说“左右耳都毛茸茸”时，才能新增成员级 Fact。
5. 未被单独识别的另一只耳朵保持未物化，不编一个右耳 ID。

---

## 11. ReaderState

建议查询签名：

```ts
readerState(chapter, {
  /** 先过滤 Disclosure.at <= readAt，防止后文泄漏。 */
  readAt: 9,

  /** 可选：查询某个故事时刻；缺省表示列出可见时刻分支。 */
  worldTime: M.a,
});
```

最低求值顺序：

1. 只取 `Disclosure.at <= readAt`。
2. 应用可见的反驳。
3. 展开可见 Fact 的 FieldProjection。
4. 按 FieldAddress 分组。
5. 按 cardinality、timeRef、来源、hedge 和已裁决的接续规则求值。
6. 输出下列求值分组，并把证据锚（Statement 或 `DerivationId`）与来源一路带到回答。

- `held`：可见且未被反驳的 Disclosure 是 `plain`，或被另一条可见的 `plain` Disclosure 以同一规范化叶值印证；单值字段上若仍存在竞争或时刻同一性未决，则不能进入本组。
- `pending`：可见且未被反驳的 Disclosure 不满足 `held` 条件，例如自身带保留、单值字段仍有竞争，或时刻同一性未决。
- `refuted`：Disclosure 被一条当前可见的追加反驳指向；反驳记录沿用 v4 的 append-only 语义，本稿不改变其身份和载荷形状。原 Disclosure 保留，但不再支持当前值。
- `unknown`：该 FieldAddress 当前没有 `held` 或 `pending`；只有 CandidatePath、没有可见 Disclosure，或只剩 `refuted` 历史时都属于此状态。前三项是 Disclosure 分组，可以并存；`unknown` 是当前值缺失的结果，不是第四个 Disclosure 分组。

第 9 段查询不得看见第 18 段 D23 的 `count = 2` 或 D24 的尾巴触感。Kind/Trait 产生的 CandidatePath 即使出现在上下文里，求值也恒为 `unknown`，直到有显式可见 Disclosure。

---

## 12. 数组到底降低了什么负担

数组适合三处：

1. `Kind.extends` 和 `Kind.with`：表达多父类型和 Trait 组合。
2. `from(..., facts[])`：一段原文的多个 Fact 共享 Statement、来源与保留度。
3. 多值字段：值域明确声明为 set 或 ordered-list 后，数组表达多个值。

数组不负责：

- 省略每条 Fact 的 `timeRef`；
- 把多个来源或不同 hedge 混进一个 `from`；
- 自动把类型路由变成事实；
- 自动创建集合成员 Entity；
- 把多个叶投影当作互相独立的原文陈述。

与 Tailwind 的类比只在“模型选择可组合的局部原子能力”这一点成立。类型层类似 utility 注册表；值层的 `fact(...)` 仍必须保留证据和命题边界，不能像 CSS 类一样无条件叠加。

---

## 13. 从 v4 到 v5 的映射

| v4 | v5 草案 | 原因 |
| --- | --- | --- |
| `Kind.category` | 删除，由 Kind/Trait 层级与倒排索引派生 | 手工 UI 路由分类与文本类型混在一起 |
| 无父子的 Kind 标签 | 多父 Kind DAG + Trait 组合 | 支持分级索引和类型局部字段 |
| 全局 `Predicate` | `FieldCluster + FieldLeaf`；跨主体关系另带 typed qualifiers | 避免 `P_EarCount`、`P_role_to_su` 这类冷门或烧实例名称 |
| `Slot = subject + predicate` | 派生 `FieldAddress`，不作为已知事实节点 | 无值地址存在不能代表事实成立 |
| `Disclosure = slot + value + evidence` | `Fact` 保存完整命题，`Disclosure` 保存一次说出 | 相同命题的多个来源复用 Fact 身份 |
| `P_tail` 强行 `multi` | `body.tail.appearance` 与 `body.tail.texture` | 不同描述面不再竞争 |
| `P_kind` | `Identity.kind` 的显式 Fact | 类型归属继续带来源，不升级为静态真相 |
| `Entity.intro` | 从指定 `readAt` 的可见 Fact 派生 | 删除无证据摘要缓存 |
| Kind 与同名 Entity 双节点 | Kind 本身可作为 Fact 主体 | 类级属性不需要同名 Entity，也不向实例继承 |
| 两份章节真源 | 倾向一个 Chapter canonical；Beat 视图可拆分 | Moment 引用不再跨文件悬空；尚未迁移 |

v4 的 Beat、Scene、Moment、MomentRelation、来源通道、叙述位置与 append-only 原则继续保留。本稿没有重新设计这些部分。

---

## 14. 当前验证证据

### 14.1 已验证，仅限会话内小型原型

使用项目现有 TypeScript `5.9.3`：

- 正常的第 9、10、11、12、18 段 DSL 样例静态诊断为 0。
- 漏掉 `fact(...)` 的 `timeRef` 参数会被拒绝。
- 第 9 段切片不会出现第 18 段的耳朵数量。
- 第 12 段尾巴外观与第 18 段尾巴触感落到不同 FieldAddress。
- 只有 `Identity.kind = K_fox_girl` 的反例不会展开出任何 `body.ears.*` Fact。

这些只证明原型形状可以表达上述样例，不证明真实模型能稳定抽取。

### 14.2 从当前 v4 金标计算出的迁移量

当前 `chapter-01.json` 有 50 个 Slot、66 条填槽 Disclosure。按 `(Slot, value, timeRef)` 暂算会得到 62 个命题 Fact，其中 4 个 Fact 各有两条 Disclosure；9 个字段地址含多个不同 Fact。这个统计用于解释“Fact 与 Disclosure 分开”能否承载现有数据，不是 v5 最终迁移计数。

### 14.3 未验证

- 未让真实 Provider/Model 输出本 DSL。
- 未把完整第一章 66 条 Disclosure 迁成 v5。
- 未实现 Fact ID、Statement ID 或字段版本迁移。
- 未验证第二章的竞争、接续、反驳和部件提升。
- 未验证跨作品词表复用。
- 未修改 Viewer，也未进行真实浏览器验收。
- 未设计模型输出解析器；`satisfies` 不承担运行时或语义校验。
- 当前 `fact<Subject, Field, Value>` 没有从字段簇推导 `Value`；因此尚未建立 `Body.ears.count` 的数值约束、`Identity.kind` 的 `KindRef` 约束或未知字段拒绝合同。
- 当前 `fieldQuery(...)` 只声明接收绑定叶并返回 `FieldQuery`；`FieldQuery.address` 如何由 `subject + clusterId + version + qualifiers + leafPath` 构造，尚未形成类型或编译映射合同。

---

## 15. 待开发者审查

| # | 问题 | 当前倾向 |
| --- | --- | --- |
| V5-1 | `Fact` 是否允许一个结构化 patch 含多个叶子 | 允许。Fact 保留合取身份，FieldProjection 提供叶级支持和冲突 |
| V5-2 | 弱类型 claim 是否扩大后续抽取候选字段 | 倾向扩大但标弱；不改变 ReaderState，也不生成事实 |
| V5-3 | 模型新造的 Kind/Trait/Field 何时进跨书注册表 | 已选：先进入本书 proposal，经确认后晋升 |
| V5-4 | Statement 是否需要句内字符区间 | 当前至少 `paragraph + ordinal`；实现前用含多说话人的长段落验证 |
| V5-5 | FieldCluster 版本升级时旧 Fact 如何查询 | 旧版本不可变；需要显式投影/迁移规则，不能静默改义 |
| V5-6 | 高易变字段是否也进入同一 DSL | 当前不进入长期 Fact，留在 Beat；是否引入 `retention: "beat"` 待定 |
| V5-7 | 同一 Moment 区间内是否用叙述位置判断接续 | v4 W11 原样保留，DSL 不替代产品裁决 |
| V5-8 | `DerivationId` 自身如何内容寻址 | 尚未裁决；不影响本稿已规定它与 `inferredFrom`、`at`、`hedge` 共同进入推断 Disclosure 身份 |
| V5-9 | TypeScript DSL 是否正式替代 v2 EBNF | 倾向替代；先用完整第一章和一次真实模型 A/B 验证输出稳定性 |

---

## 16. 本稿不做什么

- 不改 `chapter-01.json`、`schema.ts`、Viewer 或 graph 页面。
- 不声称 v5 已实现或优于 JSON structured output。
- 不设计解析器安全边界、AST 白名单、执行沙盒或性能。
- 不改 `t03` 抽取管线。
- 不写正式 Spec 或 ADR。
- 不处理 World Engine 的上帝视角真相。

---

## 17. 外部依据

- TypeScript 的声明分别创建 type space 与 value space：<https://www.typescriptlang.org/docs/handbook/declaration-merging.html#basic-concepts>
- `satisfies` 只检查表达式可赋给某类型并保留具体推断：<https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator>
- TypeScript 类型注解会在编译时擦除：<https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types>
- TypeScript 联合与交叉类型：<https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types>
- TypeScript 对象扩展：<https://www.typescriptlang.org/docs/handbook/2/objects.html#extending-types>
- RFC 8785 JSON Canonicalization Scheme：<https://www.rfc-editor.org/rfc/rfc8785.html>

这些资料只支持 TypeScript 与 canonicalization 的语言机制，不证明本小说领域模型正确。领域结论仍需靠金标迁移和真实抽取实验验证。
