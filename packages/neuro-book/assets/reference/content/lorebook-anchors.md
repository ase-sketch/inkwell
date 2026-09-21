# Lorebook 条目锚点与别名规范

本规范面向执行世界书（lorebook）条目沉淀与维护的 Agent 与开发者。它定义了条目出处锚点（`anchors`）、别名列表（`aliases`）及治理来源（`governance`）的填写规则与验收口径。

---

## 怎么用（先看结论）

当你在沉淀或更新 lorebook 条目时，遵循以下极简口诀：

1. **开书访谈期**（尚无章节正文）：`governance.source: interview`，`anchors: []` 留空合法。
2. **有正文后的 AI 沉淀**：**强制**填写 `anchors`，必须包含 `chapter`（规范章节标识）与 `quote`（原文引用）。
3. **人工修改/编写**：`governance.source: manual`，`anchors` 按需填写。
4. **别名必须填**：`aliases` 必须穷举角色/物品/设定的常见称呼、代称、外号，因为按需注入机制直接依赖 `title` + `aliases` 进行文本匹配命中。

---

## Frontmatter 结构定义

标准 lorebook 内容节点的 `index.md` frontmatter 中与本规范相关的字段定义如下：

```yaml
title: "青霜剑"
type: "item"
subtype: "equipment"
status: "active"
aliases:
  - "家传古剑"
  - "青霜"
  - "断岳剑"
governance:
  source: "generated" # interview | generated | manual | imported
  review: "proposed"  # proposed | reviewed
anchors:
  - chapter: "001-departure"
    quote: "少年反手抽出青霜剑，三尺寒刃如秋水初泓。"
    note: "主角首次出剑，揭示兵器外貌与特征"
  - chapter: "第一章 启程"
    quote: "此乃家传断岳剑，吹毛断发。"
    note: "大纲阶段设定的曾用名"
```

### 字段校验规则

| 字段 | 类型 | 是否必填 | 语义与约束 |
| --- | --- | --- | --- |
| `anchors` | `Array<Anchor>` | 可选（旧条目缺省合法） | 条目在正文或大纲中的出处锚点列表。 |
| `anchors[].chapter` | `string` | 必填 | 出处章节。**严格二选一**：<br>1. `manuscript` 章节目录名（如 `001-departure`、`002-the-blade`）；<br>2. `Plot` 章节名称（如 `第一章 启程`）。<br>**严禁任何无规范的自由发挥描述**。 |
| `anchors[].quote` | `string` | 必填 | 小说正文或大纲中的**原文引用片段**。必须为原文语句，不得用 AI 自行概括的二手文本替代。 |
| `anchors[].note` | `string` | 可选 | 锚点说明或出处上下文备注（如「初次登场」、「伏笔揭晓」）。 |
| `aliases` | `Array<string>` | 必填（角色类条目必须填入有效别名；非角色类条目如 story-concept 允许空数组） | 条目的常见称呼、外号、全称/简称、代词等列表。 |
| `governance.source` | `string` | 必填 | 内容来源标识：`interview`（访谈期沉淀）、`generated`（正文提取/AI沉淀）、`manual`（人工沉淀/编辑）。 |

---

## 三种来源口径

### 1. 访谈期沉淀（开新书访谈，尚无正文）

- **场景**：项目初始化初期，与作者进行世界观或人物头脑风暴，尚未编写正式章节正文。
- **锚点口径**：
  - `governance.source` 填写 `interview`（固定值，不写 `interview-session` 等变体）。
  - `anchors` 字段保持为空数组 `[]` 或缺省。
  - 允许章节与原文引用留空，校验完全合法。
  - `aliases`：角色类条目（如 protagonist）必填常见称呼；非角色类条目（如 story-concept）允许留空数组。

### 2. 有正文后的 AI 沉淀（正文编写阶段）

- **场景**：正文（`manuscript/`）产出后，AI 通过写作助手、记忆沉淀或提取工作流自动沉淀新的角色、物品、组织或事件设定。
- **锚点口径**：
  - `governance.source` 填写 `generated`。
  - **强制要求**：条目中必须至少包含一条合法锚点（含 `chapter` 和 `quote`）。
  - **机器验收门禁**：验收程序会对有正文后的 AI 沉淀条目进行机器抽查（如「随机抽查 5 条均有来源标注与章节/引用锚点」），缺失或塞在非结构化对象中将判定为不合格。

### 3. 人工修改与录入

- **场景**：人类作者直接手工录入设定或在界面上修改条目。
- **锚点口径**：
  - `governance.source` 填写 `manual`。
  - `anchors` 字段推荐按需填入，若作者未指定正文出处，可保持为空数组 `[]`。

---

## 别名（aliases）填写纪律

在 M2a 写作与对话工作流中，Lorebook 的按需注入（On-demand Retrieval / Injection）不采用昂贵的全库嵌入召回，而是**依靠正文/上下文对条目的 `title` 和 `aliases` 进行精准匹配**。

如果一个条目只有 `title: 苏云`，而正文中普遍使用「云哥」、「楼主」或「天机阁主」来称呼他，系统将无法按需命中该条目，导致设定断层。

**沉淀条目的硬性要求：**
- **必须**填写真实会出现在正文或对话中的别名。
- 包括但不限于：
  - **缩写/简称**：如「天机阁」→ `aliases: ["天机"]`
  - **称谓/职务**：如「楚修远」→ `aliases: ["楚阁主", "楚先生", "师兄"]`
  - **绰号/化名**：如「林夜」→ `aliases: ["黑鸦", "无面人"]`
  - **代称/外文音译**：如「阿尔伯特」→ `aliases: ["老阿", "阿尔伯特伯爵"]`
- **严禁**：角色类条目为了应付校验留空 `aliases: []`，或者把纯标签（如「重要」、「已死」）误塞进 aliases。非角色类条目（如 story-concept）允许空数组。

---

## 正反例对比

### 正例 1：有正文后的 AI 角色设定沉淀

```yaml
---
title: 顾长清
type: character
subtype: person
status: active
icon: user
aliases:
  - "顾先生"
  - "长清道人"
  - "青云剑首"
tags:
  - 青云门
  - 剑修
summary: "青云门执剑长老，外表温文尔雅，实则背负守护镇妖塔的宿命。"
refs:
  - relation: depends_on
    target: lorebook/faction/qingyun-sect/
    note: "所属门派"
anchors:
  - chapter: "003-mist-over-mountain"
    quote: "顾长清放下手中素瓷茶盏，眸光微敛：‘镇妖塔下的封印，撑不过今年初雪。’"
    note: "首次表明身份与所守秘密"
  - chapter: "005-sword-and-shadow"
    quote: "‘师弟，莫要逼我出青云剑。’长清道人袖中青芒一闪而逝。"
    note: "首次展现青云剑首实力"
retrieval:
  enabled: true
  trigger: null
governance:
  source: generated
  review: proposed
ext: {}
---
```
> **解析**：`governance.source` 为 `generated`；`anchors` 包含规范的章节目录名与原文直引；`aliases` 穷举了常见称谓，可确保后续按需注入命中。

---

### 正例 2：访谈期条目沉淀

```yaml
---
title: 镇妖塔
type: location
subtype: building
status: pending
icon: tower
aliases:
  - "锁妖塔"
  - "九层禁塔"
tags:
  - 禁地
  - 宗门建筑
summary: "青云门禁地，用于封印上古凶煞的核心建筑，共九层。"
refs: []
anchors: []
retrieval:
  enabled: true
  trigger: null
governance:
  source: interview
  review: proposed
ext: {}
---
```
> **解析**：访谈期项目尚无章节正文，`governance.source: interview`，`anchors: []` 合法留空。

---

### 反例 1：正文后沉淀缺失 anchors 或填入非结构化 ext

```yaml
# 错误示范
title: 噬魂珠
type: item
status: active
governance:
  source: generated
ext:
  anchor_info: "在第三章主角打妖怪的时候掉落的" # 错误！机器无法校验，ext 字段不被数据面认可
```
> **错误**：有正文后的沉淀缺少顶级结构化 `anchors` 数组，私自放入 `ext` 自由对象，机器抽查必挂。

---

### 反例 2：chapter 字段自由发挥

```yaml
# 错误示范
anchors:
  - chapter: "第三卷 中期大决战 差不多第15节" # 错误！不是规范章节名
    quote: "主角捡起了珠子"
```
> **错误**：`chapter` 未使用规范的 manuscript 章节目录名（如 `015-showdown`）或 Plot 章节名（如 `第十五章 决战`）。

---

### 反例 3：quote 使用 AI 二手概括

```yaml
# 错误示范
anchors:
  - chapter: "002-broken-blade"
    quote: "这里主角把剑弄断了，然后很伤心。" # 错误！并非原文直接引用
```
> **错误**：`quote` 必须截取小说正文原句，不能以概括句替代。

---

### 反例 4：空置 aliases 导致按需注入失效

```yaml
# 错误示范
title: 慕容雪
type: character
aliases: [] # 错误！未填写正文中出现的别名如「雪儿」「慕容仙子」「小雪」
```
> **错误**：正文中其他人物称呼「雪儿」时，因 aliases 缺失，Agent 无法关联到「慕容雪」的设定档案。
