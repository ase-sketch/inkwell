---
schema: nbook.walkthrough/v1
taskId: 00161-novel-understanding-spike
sequence: 2
role: leader
status: completed
createdAt: 2026-08-26T23:47:35+08:00
---

# 第一章 Brief 与候选图谱研究结果

## 结论

本次两跳实验证明 DeepSeek V4 Flash 能把第一章转成可回查原文的结构化 brief，并只凭该 brief 生成三层候选图；但当前 brief 没有压缩原文，候选图也不能直接写入 `nb-memory`。下一步应先设计消费者中立、可校验的 brief schema，再做 ingest graph schema；不应直接接入真实存储。

## 实验边界

- 输入仅为《转生反派萝莉，找茬魔法少女》第一章，原文纯文本 2,122 字。
- 第一次调用读取原文并生成 `nbook.novel-brief.spike/v1`；第二次调用只读取第一次的 JSON，并生成 `nbook.novel-graph.spike/v1`。
- 两次成功调用均为 `opencode/deepseek-v4-flash`，脱敏主机 `opencode.ai`。第二次首个 300,000 ms 请求在客户端超时，使用同一目的重试后成功。
- 本实验不写数据库，不修改产品源码、公开 API、Spec 或持久化合同，不证明全书质量或跨章实体归一。

## 已验证结果

### Brief

- 1 个场景、4 个实体、7 个事件、26 条原文证据、4 个不确定项。
- 26 条引文均能在清理后的第一章原文中逐字定位，最长限制 48 字检查通过。
- 86 次 evidence ID 引用全部解析；无重复 evidence ID、无悬空引用。
- 单场景切分可成立：现场地点、在场主要参与者和白天时间连续；前世死亡属于回忆插叙，不自动等于场景切换。
- 中性摘要 125 字；紧凑 JSON 9,426 字，是原文纯文本的 4.44 倍。它提供结构化和证据链，但没有提供字符压缩。

### 候选图

- 实际数组为 19 个节点、17 条边：memory-native 12 个节点，World Engine 候选 2 个，Plot 候选 5 个。
- memory-native 节点为 1 Episode、7 Fact、4 Subject、0 State；World 层无 slice/patch，因 brief 缺可解析的 story instant 明确阻断；Plot 层为 1 Chapter、1 Scene、3 Thread 候选。
- 17 条边端点全部存在；234 次 evidence ID 引用全部解析；所有 World/Plot 节点均为 `candidate: true`，未写入产品。
- 模型自报 17 个节点、10 个 memory 节点，与实际 19/12 不一致。原始 graph JSON 保留该漂移，独立 stats 记录实际计数。
- 96 条 brief JSONPath 中 94 条解析，2 条无效：`mem-fact-007` 与 `edge-mem-006` 均引用不存在的 `$.events[6].effects[1]`。
- 7 个 memory Fact 的 `data.knower` 使用 brief 局部 ID `ch001-entity-01`，而图内主体 ID 是 `mem-subject-001`。拓扑边完整不等于原生引用可写，当前图 `ingestReady: false`。
- brief 中有 4 条状态变化、2 条关系变化，图中却是 0 State、0 WorldPatch。自由文本状态没有稳定物化成 `StateEntry` 所需的 `subjectId/topic/view/sinceTick`。

### 调用与产物成本

- 第一次：1,956 input tokens，19,969 output tokens，262,387 ms，0 次重试。
- 第二次成功请求：4,597 input tokens，17,760 output tokens，123,498 ms；另有 1 次 300,000 ms 客户端超时尝试。
- 成功请求合计 6,553 input tokens、37,729 output tokens、44,282 total tokens、385.885 秒。
- 第二次输入 token 是第一次的 2.35 倍；graph 紧凑 JSON 21,575 字，是 brief 的 2.29 倍。本形状不适合作为“廉价压缩层”的直接证据。

## 人工语义审查

1. **阻断：ID 空间混用。** `data.knower` 未归一到图内 Subject，不能直接调用 memory 写入接口。
2. **阻断：briefPath 悬空。** 模型自己声明“所有 briefRefs 均存在”，完整 JSONPath 解析推翻了该声明。
3. **状态建模缺口。** brief 将状态变化嵌在事件中并用自由文本表达，第二级只稳定生成 Fact/Subject，未生成 State。
4. **World 主体升格过早。** “造物主”仅被提及一次，尚不足以满足“最少支持当前叙事”的持续状态追踪门槛。
5. **状态主题被误作主体。** “墨丘利秘典契约”是关系/状态主题，却被建为 `type=concept` 的 WorldSubjectCandidate。
6. **次要主体可能过度登记。** “太奶”和“造物主”都被建为 memory Subject；是否值得进入长期注册表需要跨章信号，单章不能确认。
7. **实验混杂。** 第一次 brief 已含 `worldCandidates` 和 `plot.threadCandidates`。第二次证明的是预投影判断可以传递，不是纯中性 brief 能独立支持三个消费者。

## 对研究问题的回答

### Brief 最低字段

当前 11 个顶层字段过宽。下一轮建议保留来源、视角、中性摘要、事件、主体、独立状态变化、场景、证据和不确定项；移除 `worldCandidates` 与 Plot Thread 等消费者特定判断。状态变化必须是带稳定 ID 的对象，至少包含 `subjectRef`、`topic`、`before`、`after/view`、`eventRef` 和 evidence refs。

### 三系统边界

- `nb-memory`：发生过的 Episode/Fact、关键 Subject、谁在何时知道什么，以及可重建的证据锚。
- World Engine：只有会随剧情演变、后续会再次读取且能分配故事时点的动态值；本章应先阻断 slice/patch，而不是猜时间。
- Plot：Chapter/Scene 可作只读候选；Thread、Promise、purpose、outcomeType、pacingRole 属作者判断，必须 `needsAuthorConfirm`，不能当作拆书事实。
- 同一主题只设一个真相源；其它系统只存锚，不复制一套平行真值。

### 全量与懒惰加载

两者仍应共用同一渐加协议：来源单元状态从未处理到 brief-valid、graph-validated、consumer-projected，可按覆盖目标和优先级推进。全量模式把目标覆盖设为当前全部来源单元；懒惰模式只推进满足当前消费所需的单元与字段。连载新增章节进入同一队列。

本次只支持这一统一状态模型的方向，不支持当前 schema 的全书铺开。原因是 brief 体积和输出 token 膨胀、第二级引用错误、State 丢失与消费者特定字段混杂。

## 建议决策

下一 Task 优先做 **brief schema 设计与对照实验**，而不是公开 ingest API 或数据库迁移。建议同时比较：

1. 紧凑中性 brief：不含 World/Plot 候选，状态变化结构化；
2. 当前宽 brief：作为本次基线；
3. 原文直接走现有 `ingestRaw`：比较 Fact/Subject/State 覆盖、token、耗时和错误隔离。

验收重点应是可机检引用、ID 归一、State 召回与压缩率，不以“生成了很多节点”作为通过标准。

## 验证记录

- JSON 语法：`jq empty` 检查三份 evidence JSON，退出码 0。
- 来源证据检查：26/26 引文逐字命中，86/86 brief evidence refs 解析。
- 图谱结构检查：17/17 边端点存在，234/234 graph evidence refs 解析；94/96 brief paths 解析，图谱不可直接 ingest。
- `bun run docs:check`：通过，`checkedFiles: 5314`，`failures: []`。
- `bun run governance:check`：通过，`failures: []`，`warnings: []`。
- `git diff --check`：退出码 0；仅输出工作区既有 LF/CRLF 转换 warning。
- 聚焦测试：产品测试未运行；本 Task 不修改产品源码。尝试 `bun run agent:task-check -- --task 00161-novel-understanding-spike`，仓库无该 script，原文为 `error: Script not found "agent:task-check"`；没有用其它命令冒充。
- HTML 浏览器 smoke：通过真实 Chromium 文件页验证。桌面 1280×800 默认显示 19 节点 / 17 边；点击 `mem-fact-001` 显示 `ch001-evidence-03` 引用和证据原句，点击 `edge-mem-001` 显示 source/target；关闭 memory 层显示 7 节点 / 4 边，恢复后为 19 / 17；Brief tab 摘要长度 125；质量 tab 显示“不可直接 ingest”和 8 条 findings；无外部资源请求，桌面无横向溢出。
- 手机 390×844 回归：图谱、Brief、质量三 tab 均无横向溢出；搜索“造物主”显示 6 节点 / 10 边。首次发现质量页 393px 溢出，定位为网格子项默认 `min-width:auto` 撑宽，加入 `.quality-grid>div,.brief-grid>div{min-width:0}` 后 `scrollWidth=390`，修复验证通过。
- 秘密扫描：Task、evidence 与研究草稿未发现 API key 值、Authorization 值或完整配置对象。

## 产物

- `evidences/chapter-001-brief.json`：第一次模型原始结构化输出。
- `evidences/chapter-001-graph.json`：第二次模型原始候选图输出，保留模型自报计数与引用错误。
- `evidences/model-call-stats.json`：脱敏调用统计、机械校验、完整路径校验与人工审查发现。
- `evidences/chapter-001-graph.html`：三层候选图审查页面，已通过桌面与手机浏览器 smoke。
