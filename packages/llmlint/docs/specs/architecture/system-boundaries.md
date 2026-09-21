# 总体系统边界

> 状态：Accepted（2026-08-16）。
> 目标：规定规则运行时、Web、评测实验室和进化实验室的职责与依赖方向。

## 1. 架构结论

项目由四个边界明确的系统和两类共享基础设施组成。目录之间不能任意调用内部代码：

```text
                         versioned artifacts
                 ┌──────────────────────────────┐
                 │                              ▼
┌──────────────┐ │  ┌────────────────┐    ┌────────────────┐
│ evals        │─┘  │ evolution      │    │ web            │
│ 评测实验室    │    │ 进化实验室      │    │ 在线产品        │
└──────┬───────┘    └───────┬────────┘    └───────┬────────┘
       │                      │                     │
       ├──────────────┬───────┴──────────────┬──────┤
       ▼              ▼                      ▼      ▼
┌──────────────┐  ┌────────────────┐  ┌────────────────────┐
│ skill        │  │ contracts      │  │ model runtime      │
│ 规则运行时    │  │ 工作区制品合同  │  │ 模型调用基础设施     │
└──────────────┘  └────────────────┘  └────────────────────┘
```

- `skill/` 是可安装、可发布的规则运行时真相源。
- `web/` 是在线产品与用户数据真相源。
- `evals/` 是规则、模型和 guide 的离线测量仪器。
- 目标 `evolution/` 是作者候选与 reviewer 候选的离线实验室。
- 已接受的根级 `contracts/` 目标只保存 Web、evals、evolution 共用的制品 schema、稳定键和指纹算法；它不进入 `skill/` 发布物。目录在出现第一个真实跨系统消费者的实现任务时创建，不提前造平台包。
- 已接受的 model runtime 目标只承载通用模型 transport、重试、限流和调用记录，不含 brief、repair、reviewer 或 Web session 语义。

## 2. 依赖规则

### 2.1 允许的源码依赖

| 调用方 | 可以依赖 | 理由 |
| --- | --- | --- |
| Web | `skill` 公开 API、`contracts`、model runtime | 在线扫描、制品校验和模型调用 |
| evals | `skill` 公开 API、`contracts`、model runtime | 用真实规则运行时测量，不 spawn CLI |
| evolution | `skill` 公开 API、`contracts`、model runtime | 生成候选、扫描产物、写可复放实验 |
| skill | 仅自身运行时依赖 | 保持可发布、可同步，不依赖开发仓应用 |

### 2.2 禁止的源码依赖

- Web 不得 import `evals/` 或 `evolution/` 的内部模块。
- evals 不得 import Web server、Prisma schema 或生产数据库访问层。
- evolution 不得 import Web server、Prisma client 或 evals 的内部管线。
- skill 不得 import `contracts/`、Web、evals 或 evolution。
- 三个应用不得通过相对路径共享“顺手可用”的内部 helper；需要共享时先判断它属于 `contracts`、model runtime，还是应该保留重复但受制品合同约束。

当前 Web 对 `evals/lib`、`evals/generator` 和 `evals/detector` 的运行时 alias 属于迁移债务，不作为目标架构。迁移时应分别处理：

- taxonomy、制品类型、指纹算法 → `contracts/`。
- provider transport、限流、重试、流式调用 → model runtime。
- detector 分块若属于检测算法 → `skill` 或独立 detector adapter，不继续留在 evals 给 Web 反向引用。
- evals 的 lift、holdout、verdict、corpus loader → 只留 evals。

## 3. 四个系统的职责

### 3.1 规则运行时：`skill/`

负责：

- 规则模型、规则目录和稳定 rule id。
- `scan`、`fix`、`guide`、CLI 和 Agent Skill 合同。
- 扫描作用域、span、fixability 和规则 review 语义。
- 对调用者公开稳定的扫描结果，不保存用户数据。

不负责：

- 判断规则有没有判别力。
- 保存 Web judgment。
- 调度作者进化。
- 知道 evals 报告、Web 数据库或候选排名。

### 3.2 在线产品：`web/`

负责：

- OAuth session、用户权限和 owner 边界。
- `Text` 信封、不可变 `Revision`、人类 `DocJudgment` 和 `SpanAnnotation`。
- 在线机器扫描、外部 detector、LLM 动态规则检测和 Agent session。
- 检测工作台入口与评判工作区。
- 盲评揭示闸门、用户 consent、可见性和审计。
- 导出经过权限检查、版本化的研究制品。

Web 是用户数据的唯一在线真相源。离线程序不得直接写其生产数据库。

### 3.3 评测实验室：`evals/`

负责：

- reference → brief → render → repair 的离线评测数据管线。
- 规则判别力、lift、holdout、verdict、模型分层和 guide 实验。
- 生成版本化 `RuleEvaluationReport`、`RuleProfile` 等制品。
- 维护 `METHODOLOGY.md` 的统计纪律。

不负责：

- 提供 Web 在线 API。
- 保存用户账户和 session。
- 训练 reviewer 或淘汰作者候选。
- 把 repair、uploaded 或 rev_k 混入 lift。

### 3.4 进化实验室：`evolution/`

负责：

- `AuthorCandidate`、`ReviewerCandidate`、实验轮次和候选谱系。
- writer、critic、reviewer 的配置和调用 provenance。
- 人工校准集、冻结 holdout、适应度报告和主动学习采样。
- 离线候选正文及其完整指纹。
- 产生可导入 Web 的系统生成正文制品，或消费 Web 的匿名研究导出。

不负责：

- 修改 rule verdict。
- 把 reviewer 预测写成人类 judgment。
- 直接读写 Web 生产数据库。
- 把进化产物写入 evals 主 corpus。
- 在未通过人类 holdout 时自动淘汰生产作者配置。

## 4. 数据所有权

| 数据 | 唯一真相源 | 其他系统如何使用 |
| --- | --- | --- |
| 规则与 rule id | `skill/` | import 公开 API 或随制品引用 fingerprint |
| 规则判别报告 | `evals/` | 版本化只读 artifact |
| 用户 Text/Revision | Web DB | 权限过滤后的导出 artifact |
| 人类 DocJudgment | Web DB | 匿名、版本化研究导出；仍标 human |
| 作者候选谱系 | evolution run store | artifact 导出或批准后发布 |
| reviewer candidate | evolution run store | 版本化 artifact；批准后可供 Web shadow runtime 使用 |
| reviewer 预测 | 产生该预测的 append-only ledger | offline 预测由 evolution 拥有；online shadow 预测由 Web 拥有；下游只按 prediction id/fingerprint 镜像，不改写 |
| 模型 secret | 部署环境或本地 ignored config | 永不进入 artifact、日志、浏览器 DTO |

## 5. 跨系统通信

边界间首选**版本化制品**，不是数据库共享或内部 HTTP 偷连：

```text
evals ── RuleEvaluationReport / RuleProfile ──► Web, evolution
Web ── HumanJudgmentExport / RevisionCorpusExport ──► evals, evolution
evolution ── GeneratedCorpus / EvolutionRunReport / ReviewerPredictionExport ──► Web 管理员导入或只读镜像
skill ── package version + public API ──► 三个应用
```

每个制品必须通过 [`artifact-contracts.md`](artifact-contracts.md) 的 envelope 校验。导入方必须拒绝未知 major schema、损坏 fingerprint 和不满足用途许可的数据。

## 6. 部署拓扑

第一阶段：

- Web 是唯一长驻服务。
- evals 和 evolution 都是离线 CLI/harness，不开公网端口。
- Web 外部 detector 和 LLM 通过 server adapter 调用，浏览器不持有 secret。
- evolution 若需人类打分，只通过 Web 的 Arena/评判 API 发布题目和读取匿名导出，不持有 Web 数据库凭据。

后续只有在离线任务量或队列要求证明有必要时，才把 evolution scheduler 独立成服务。不得为了“微服务架构”提前增加网络边界。

## 7. 架构验收

任何新实现任务必须回答：

1. 代码属于哪个系统，谁拥有其数据。
2. 它依赖的是公开 API、共享基础设施，还是版本化制品。
3. 是否把 evals 方法论、Web 用户事实和 evolution 预测混在一起。
4. 是否能在不连接另外两个应用数据库的情况下独立测试。
5. 是否记录了 rule、prompt、model、style、guide、engine 和输入数据的版本或 fingerprint。

不能回答以上问题的模块不得进入实现阶段。