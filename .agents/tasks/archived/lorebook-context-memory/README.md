# Profile Context Memory

> Active task directory format: `NN-kebab-case-name/`. Archived tasks move to `docs/tasks/archived/<task-slug>/`.

## V2 Update: Agent Context Root

本 task 已从第一版 `lorebook/context/` 升级为更通用的 `agent-context/`：

- `agent-context/{profile}/context.md` 是 Agent 自主维护的 profile-scoped context memory，也可以承载 profile 专用 Project 运行说明。
- `agent-context/{profile}/generated.md` 是程序生成的推荐文本。
- `.nbook/context-access/{profile}.json` 仍是程序私有访问状态，不作为 Agent 默认上下文入口。
- `simulation/` 只保存 runtime state：`subjects/`、`entities/`、`runs/`。
- 默认模板不再生成 `simulation/config.yaml`、`simulation/cast.yaml`、`simulation/simulator.md` 或 `simulation/writer.md`。
- `simulator.leader` 读取 `AGENTS.md` 与 `agent-context/simulator.leader/context.md`；`agent-context/rp.writer/context.md` 只作为可选写作偏好来源，由上级整理进 writer brief，`rp.writer` 自身不绑定读取。

旧的 `lorebook/context/` 小节保留为 V1 设计记录；当前实现以本 V2 更新和 `reference/agent/profile-context-memory.md` 为准。

## User Request

- 讨论并制定替代内容节点 `inject.profiles` / `inject.always` 的 lorebook context 设计。
- `inject` 可以删除；当前更需要 profile-scoped 的上下文记忆和程序推荐，而不是每个内容节点静态声明自己要注入哪些 profile。
- 新机制需要同时对 AI 和程序友好。
- Agent 能自主维护每个 profile 的上下文选择，例如 `mustRead`、候选、排除项和说明；这些字段通常在初始化或后续上下文整理时由 Agent 设置。
- 程序可根据 read 工具调用、retrieval、handoff、Plot、跨 session / 跨 profile 等信号生成推荐内容；算法策略较复杂，第一阶段先不实现算法。
- 不同 profile 必须隔离：`writer` 不能看到 `leader.default` 或 `simulator.leader` 的私有 context。
- 程序生成的推荐不能放在 `.nbook/context-recommendations`，因为 Agent 不推荐访问 Project Workspace 外的文件。
- 推荐文件不要 JSON，最好渲染成结构化文本；推荐原因不应啰嗦，优先保留事实数据。

## Goal

为 lorebook context memory 设计第一版文件结构、规范和实现计划，明确 Agent 自主维护内容与程序生成推荐内容的边界，并为后续删除内容节点 `inject` 做准备。

成功标准：

- 明确 Project Workspace 内的 Agent 可读文件布局。
- 明确 `.nbook` 下程序私有访问状态与 Project 内推荐文本的边界。
- 明确 profile 隔离规则，尤其是 `writer` 不读取 `leader.default` / `simulator.leader` 私有 context。
- 明确 `agent-context/{profile}/context.md` 的 frontmatter 与正文定位。
- 明确 `agent-context/{profile}/generated.md` 的结构化文本格式。
- 给出分阶段实现计划，第一阶段不实现复杂推荐算法。

## Current State

- 内容节点 frontmatter 当前包含：

```yaml
retrieval:
  enabled: true
  trigger: null
inject:
  profiles: []
  always: false
```

- `reference/content/retrieval.md` 当前把内容节点进入 Agent 上下文分成 `inject` 与 `retrieval` 两条路径。
- `inject` 设计适合少量长期稳定规则，例如文风、禁忌、创作边界；但在大型 worldbook 中，它把“条目自身属性”和“某个 profile / 某次任务是否需要它”绑得太死。
- `workspace/ming-ding-zhi-shi/lorebook` 是大型 SillyTavern worldbook 导入样本，包含大量 `world`、`system`、`location`、`faction`、`character`、`species` 等条目。很多条目对 `leader.default`、`simulator.leader`、`director`、`writer` 的可见性和用途完全不同。
- 新目录规范已经明确：
  - `lorebook/` 默认是 god-view canon / prototype / rules。
  - `simulation/subjects/` 才是 subject-facing knowledge。
  - `writer` 通常不应直接读取完整 god-view lorebook，而应优先消费上游 brief 和显式 `lorebookEntries`。
- 新 prompt engineering 角色边界已经明确：
  - `leader.default` 负责拆任务、路由、监督和解释。
  - `simulator.leader` 负责 world / simulation 裁决和 subject 信息过滤。
  - `director` 负责 Thread / Scene / Plot。
  - `writer` 只负责正式正文渲染。
  - `retrieval` 只提供候选上下文，不做剧情、状态或正文决策。

## Proposed File Layout

第一版推荐布局：

```text
{project}/
|-- lorebook/
|   `-- context/
|       |-- leader.default.md
|       |-- simulator.leader.md
|       |-- director.md
|       |-- writer.md
|       `-- generated/
|           |-- leader.default.md
|           |-- simulator.leader.md
|           |-- director.md
|           `-- writer.md
`-- .nbook/
    `-- context-access/
        |-- leader.default.json
        |-- simulator.leader.json
        |-- director.json
        `-- writer.json
```

职责分层：

- `agent-context/{profile}/context.md`：Agent 自主维护的 profile-scoped context memory。
- `agent-context/{profile}/generated.md`：程序根据访问状态和其他信号渲染出的 profile-scoped 推荐文本，Agent 可读。
- `.nbook/context-access/{profile}.json`：程序私有访问状态和原始信号，按 Project Workspace 分割；Agent 默认不读。

`.nbook/context-access` 只记录程序状态，不作为 Agent 上下文入口。需要给 Agent 看的推荐必须渲染到 Project Workspace 内的 `agent-context/{profile}/generated.md`。

## `agent-context/{profile}/context.md`

这是 Agent 自主维护的上下文记忆文件，不是 policy 文件。

### Frontmatter

frontmatter 放 Agent 可自主设置的结构化上下文选择状态：

```yaml
profile: writer
version: 1
updatedAt: "2026-06-06T00:00:00+08:00"
updatedBy: agent

mustRead:
  - path: lorebook/location/诺斯加德联盟/城镇/龙吼堡垒/
    note: 当前章节主要场景。
    setBy: agent
    updatedAt: "2026-06-06T00:00:00+08:00"

candidates:
  - path: lorebook/character/银莳萝/
    note: 可能在当前剧情线出现；出场确认前不提升为 mustRead。
    priority: 70
    setBy: agent
    updatedAt: "2026-06-06T00:00:00+08:00"
```

字段草案：

| Field | Owner | Meaning |
| --- | --- | --- |
| `profile` | Agent / template | 当前 context memory 所属 profile key。 |
| `version` | system | 文件格式版本。 |
| `updatedAt` | Agent | Agent 最近维护时间。 |
| `updatedBy` | Agent | 最近维护者，第一版可用 `agent` / `user` / `system`。 |
| `mustRead[]` | Agent | 当前 profile 认为需要优先读取的条目。 |
| `candidates[]` | Agent | 当前 profile 认为可能需要的条目。 |

条目字段草案：

| Field | Required | Meaning |
| --- | --- | --- |
| `path` | yes | Project-relative path，例如 `lorebook/...`；不要写绝对路径。 |
| `note` | no | 简短说明，给后续 Agent 理解判断。 |
| `priority` | no | Agent 维护的粗略优先级，0-100；只用于排序参考。 |
| `setBy` | no | `agent` / `user` / `system`。 |
| `updatedAt` | no | 该条目最后更新时间。 |

第一版不要求严格 schema，避免把上下文记忆做成过重配置。程序只需要能稳健读取 `path`，其他字段允许缺省。

### Markdown Body

正文不放稳定 policy，避免变成第二份 profile prompt 或 reference 文档。

正文用于：

- 当前上下文判断分析。
- 为什么某些条目重要。
- 哪些条目暂时只是候选。
- 哪些内容不该直接给该 profile。
- 最近接手需要知道的上下文记忆。
- 待确认问题。

示例：

```md
# Writer Context Notes

## 当前判断

当前 writer 主要服务第一卷前期章节。上下文重点应放在当前场景、出场角色、叙事语气和 leader/director/simulator 给出的 brief 上。

## 暂不直接读取的内容

核心世界规则和命定系统细节更适合由 leader 或 simulator 消化后转述。writer 直接读取容易把正文写成规则说明。

## 待确认

银莳萝是否在当前章节实际出场；如果只是背景相关，应保持 candidate，不升为 mustRead。
```

稳定 policy 仍应放在 profile prompt、`reference/` 或 task / workflow 文档中。

## `agent-context/{profile}/generated.md`

这是程序生成的推荐文本。它给 Agent 看，但不是 Agent 自主维护文件。

设计原则：

- 可以没有 frontmatter。
- 不使用 JSON。
- 不写长篇推荐原因。
- 保留事实数据，供 Agent 自己判断是否采纳。
- 程序可以覆盖该文件。
- Agent 可以读取它，但不应手动编辑它；需要采纳时，把结果写入 `agent-context/{profile}/context.md`。

推荐格式草案：

```md
# writer generated context

generatedAt: 2026-06-06T00:00:00+08:00
profile: writer

## strong

### lorebook/location/诺斯加德联盟/城镇/龙吼堡垒/

- score: 0.86
- signals: read:7, plot:2, handoff:1
- lastAccessedAt: 2026-06-06T00:00:00+08:00
- sessions: 3

## possible

### lorebook/character/银莳萝/

- score: 0.54
- signals: read:2, related:1
- lastAccessedAt: 2026-06-05T22:12:00+08:00
- sessions: 1

## avoid

### lorebook/system/AI指令/

- signals: imported-prompt
- scope: migration-material
```

区块语义：

| Section | Meaning |
| --- | --- |
| `strong` | 程序认为当前 profile 很可能需要的条目。 |
| `possible` | 可能相关，但需要 Agent 结合任务判断。 |
| `avoid` | 程序认为不应默认进入该 profile 上下文的条目或目录。 |

条目只保留事实数据：

- `score`：程序计算出的推荐分。
- `signals`：证据计数或标签，例如 read、plot、handoff、retrieval、explicit。
- `lastAccessedAt`：最近访问时间。
- `sessions`：涉及 session 数。
- `scope`：简短分类，例如 `migration-material`。

不写“推荐原因：因为……”这类长句。解释工作交给 Agent 在自主 context memory 中整理。

## `.nbook/context-access/{profile}.json`

这是程序私有状态文件，按 Project Workspace 分割。它记录访问事实和未来推荐算法需要的原始信号。

草案：

```json
{
    "version": 1,
    "project": {
        "slug": "ming-ding-zhi-shi"
    },
    "profile": "writer",
    "updatedAt": "2026-06-06T00:00:00+08:00",
    "entries": [
        {
            "path": "lorebook/location/诺斯加德联盟/城镇/龙吼堡垒/",
            "kind": "lorebook",
            "title": "龙吼堡垒",
            "lastAccessedAt": "2026-06-06T00:00:00+08:00",
            "accessCount": 7,
            "sessions": [
                {
                    "sessionId": "agent-session-id",
                    "lastAccessedAt": "2026-06-06T00:00:00+08:00",
                    "accessCount": 3
                }
            ],
            "signals": {
                "readTool": 7,
                "explicitInput": 1,
                "retrievalSelected": 2,
                "handoffMentioned": 1
            },
            "score": {
                "value": 0.82,
                "updatedAt": "2026-06-06T00:00:00+08:00"
            },
            "visibility": {
                "allowedProfiles": ["writer"],
                "sourceProfiles": ["leader.default", "retrieval"]
            }
        }
    ]
}
```

约束：

- `path` 必须是 Project-relative path，例如 `lorebook/...`、`manuscript/...`、`simulation/...`。
- 不保存绝对路径。
- 不作为 Agent 默认可读上下文。
- 程序可以频繁更新。
- `score` 和 `signals` 是程序事实与算法结果，不等于 Agent 已采纳。

第一阶段可以只设计该状态文件，不立即实现完整算法。

## Profile Isolation

硬规则：

- 当前 profile 只能自动读取自己的 context memory：
  - `agent-context/{profile}/context.md`
  - `agent-context/{profile}/generated.md`
- 当前 profile 不能自动读取其他 profile 的 context memory：
  - `writer` 不能读取 `lorebook/context/leader.default.md`。
  - `writer` 不能读取 `lorebook/context/simulator.leader.md`。
  - `writer` 不能读取 `lorebook/context/generated/leader.default.md`。
  - `writer` 不能读取 `.nbook/context-access/leader.default.json`。
- 跨 profile 信息流只能通过显式 handoff：
  - `leader.default -> writer_safe_brief -> writer`
  - `simulator.leader -> writer_safe_brief -> writer`
  - `director -> writer_handoff -> writer`
  - `retrieval -> entries[] -> caller -> writer.lorebookEntries`
- `writer` 默认不读取 god-view lorebook。它读取：
  - 当前 profile 的 context memory。
  - 当前 profile 的 generated recommendations。
  - 本次 invocation 显式传入的 `lorebookEntries`。
  - 上游显式提供的 writer-safe brief。
  - 当前章节 Plot / manuscript 任务上下文。

## Agent Usage

每次 profile 启动或 prepare 时：

1. 读取当前 profile 的 `agent-context/{profile}/context.md`，如果存在。
2. 读取当前 profile 的 `agent-context/{profile}/memory.md`，如果存在。
3. 读取当前 profile 的 `agent-context/{profile}/generated.md`，如果存在。
4. 结合用户任务、Plot、当前章节、当前路径和上游 handoff，决定读取哪些 lorebook 条目。
5. 若采纳程序推荐，把条目写入自己的 `mustRead` / `candidates`，并在正文或 memory 中留下简短分析。
6. 不把 generated recommendation 当成强制上下文；它只是事实化推荐。
7. 不读取其他 profile 的 context 文件。

Agent 可以维护 `agent-context/{profile}/context.md` 和 `agent-context/{profile}/memory.md`，但不应编辑 `agent-context/{profile}/generated.md`。generated 文件由程序覆盖。

## Program Usage

程序侧分三层：

1. 访问事件记录：
   - 观察 read 工具调用。
   - 观察 `writer.lorebookEntries`。
   - 观察 retrieval 输出被 caller 采纳的 entries。
   - 观察 leader / director / simulator handoff 中显式引用的条目。
   - 后续可加入 Plot 引用、当前章节路径、session summary、跨 profile 信号。
2. 状态更新：
   - 归一化路径为 Project-relative。
   - 更新 `.nbook/context-access/{profile}.json`。
   - 维护 `accessCount`、`lastAccessedAt`、session 统计和 signals。
3. 推荐渲染：
   - 根据访问状态和算法结果生成 `agent-context/{profile}/generated.md`。
   - 只输出结构化事实。
   - 不写长篇推荐原因。
   - 不直接修改 `agent-context/{profile}/context.md`。

## Implementation Plan

### Phase 1: Documentation And Templates

- 新增或更新稳定 reference，说明 profile context memory 取代 `inject` 的目标模型。
- 更新 Project Workspace 模板，生成：
  - `lorebook/context/leader.default.md`
  - `lorebook/context/simulator.leader.md`
  - `lorebook/context/director.md`
  - `lorebook/context/writer.md`
  - `lorebook/context/generated/.gitkeep` 或空目录策略。
- 第一版模板正文只写 context notes scaffold，不写稳定 policy。
- 更新相关 profile / reference，让 profile 知道只读取自己的 context memory 和 generated recommendation。

### Phase 2: Remove Content Node `inject`

- 更新 `server/workspace-files/content-node-schema.ts`：
  - 从默认 frontmatter 中移除 `inject`。
  - 更新 schema 描述。
- 更新前端新建内容节点模板，移除 `inject`。
- 更新 workspace-files tests 中对 `inject` 的断言。
- 更新 `reference/content/retrieval.md`，把旧 `inject` 口径改为 lorebook context memory + retrieval。
- 硬切删除 `inject` 运行时合同，不做 legacy 兼容；旧文件残留的 `inject` 只作为无效历史字段处理。

### Phase 3: Program Access State

- 在工具调用或 session write 边界记录 read 事件。
- 只记录 Project Workspace 内的 Project-relative path。
- read 访问按内容节点目录归一；`index.md` 与同级 `state.md` 都合并到同一内容节点 path，并用 signal 区分访问类型。
- 按 running profile 写入 `.nbook/context-access/{profile}.json`。
- 第一版只实现 read tool 信号和 `lorebookEntries` 信号，不实现复杂跨 session / 跨 profile 算法。
- 后续实现程序自动生成时，可以考虑接入现有 runtime hooks，或扩展 Harness 支持全局 Hooks，用于统一观察 read 工具调用、profile 运行边界和 session write 事件。

### Phase 4: Generated Recommendations

- 根据 `.nbook/context-access/{profile}.json` 渲染 `agent-context/{profile}/generated.md`。
- 第一版算法可以非常保守：
  - 最近访问次数高的条目进入 `possible`。
  - 当前 profile 显式 lorebookEntries 多次出现的条目进入 `strong`。
  - `lorebook/system/AI指令/` 等迁移提示词材料可进入 `avoid`。
- 输出结构化事实，不写长篇推荐原因。
- 后续推荐算法可以考虑跨 session / 跨 profile 信号，但跨 profile 推荐只允许暴露事实计数和标签，不暴露 source profile 私有 context。

### Phase 5: Agent Adoption

- `leader.default` / `simulator.leader` / `director` / `writer` 的 prompt 或 imported reference 中加入 context memory 使用说明。
- `writer` 特别强调：
  - 不读取其他 profile context。
  - 不默认展开 god-view lorebook。
  - 仅采纳自己 profile 的 recommendations。
  - 需要上游过滤后的 brief 或显式 `lorebookEntries`。

## Decisions

- 删除内容节点级 `inject.profiles` / `inject.always` 是合理方向；它不适合大型 worldbook 的 profile-scoped 上下文治理。
- `agent-context/{profile}/context.md` 是 Agent 自主维护的 context selection 和 profile 运行说明入口，不是全局 policy 文件。
- `agent-context/{profile}/context.md` 的 frontmatter 可以有 `mustRead`、`candidates`，由 Agent 设置和维护。
- `mustRead` 不是无条件 prompt 注入，也不是新版 `inject.always`。它表示当前 profile 在任务开始时应优先检查 / 读取的条目，但仍受 token、任务目标和 profile 权限约束。
- `agent-context/{profile}/memory.md` 保存 profile-scoped cross-session memory，不由程序覆盖。
- 稳定规则仍属于 profile prompt、`reference/` 或 workflow/task 文档。
- 程序推荐放在 Project Workspace 内的 `agent-context/{profile}/generated.md`，让 Agent 可读。
- generated recommendations 不用 JSON，也可以不用 frontmatter；输出结构化 Markdown 事实即可。
- 推荐文件不写啰嗦原因，优先保留 score、signals、lastAccessedAt、sessions 等事实。
- generated recommendations 默认可见，但属于程序覆盖产物，不是作者手写 canon；以后 Project Workspace 进入 Git 时，是否追踪 generated 文件可由 Project 配置决定。
- `.nbook/context-access/{profile}.json` 只作为程序私有状态，不作为 Agent 默认上下文入口。
- 最近访问状态必须按 Project Workspace 分割。
- read 工具访问记录按内容节点目录归一：读取 `lorebook/foo/bar/index.md` 记录为 `lorebook/foo/bar/`；读取同级 `state.md` 也记录到同一节点，并可增加 `state-read` signal，避免推荐被文件名打散。
- profile context 必须隔离；`writer` 不能看到 `leader.default` 或 `simulator.leader` 的私有 context。
- 跨 profile 信息只通过显式 handoff / brief / invocation input 传递。
- 跨 profile 推荐可以出现，但只能渲染事实信号，不能泄漏 source profile 的私有 context 内容。例如 `writer` 的 generated 文件可以出现 `signals: leader-read:3`，但不能展开 `leader.default.md` 的分析正文。
- 第一版对旧 `inject` 硬切，不做 legacy。新模板不生成 `inject`，schema / 文档 / UI 都迁到 context memory 口径；历史文件中的 `inject` 不再作为运行时核心合同。
- generated recommendation section 命名采用 `strong` / `possible` / `avoid`。

## Files Changed

2026-06-06 V2 implementation update:

- `lorebook/context/` 已提升为 Project root 下的 `agent-context/`。
- generated recommendation 输出路径改为 `agent-context/{profile}/generated.md`。
- `server/agent/context-access/lorebook-context-access.ts` 已更名为 `profile-context-access.ts`。
- 默认 Project 模板删除 `simulation/config.yaml`、`simulation/cast.yaml`、`simulation/simulator.md` 和 `simulation/writer.md`，profile 专用运行说明改放 `agent-context/`。
- `simulator.leader` 读取 `AGENTS.md` 与 `agent-context/simulator.leader/context.md`；`rp.writer` 的 profile input 为空，若项目维护 `agent-context/rp.writer/context.md`，由上级读取后把可写偏好注入 writer brief。

2026-06-13 default template display metadata update:

- 默认 Project 模板的 `lorebook/` 及其分类目录新增或更新 `index.md`，使用 `type: note` + `subtype: directory-index` 承载文件树默认中文 title / icon；`lorebook/` 显示为“世界书”。
- `manuscript/index.md` 的显示标题从 `manuscript` 调整为“正文”。
- `manual/`、`agent-context/`、`reference/`、`upload/` 和 `simulation/` 顶层补齐目录索引；`simulation/entities/` 显示为“实体”，`simulation/subjects/` 显示为“主体”，`simulation/runs/` 显示为“模拟记录”。
- 关键二级分类目录也补齐目录索引：`manual/player-guide/`、`manual/player-guide/playable-characters/`、`agent-context/{profile}/`、`simulation/runs/ticks/`。

- `docs/tasks/38-lorebook-context-memory/README.md`
- `reference/agent/profile-context-memory.md`
- `reference/content/retrieval.md`
- `reference/content/README.md`
- `reference/content/project-structure.md`
- `reference/agent/project-workspace-guide.md`
- `docs/README.md`
- `docs/operator-bridge.md`
- `reference/README.md`
- `server/workspace-files/content-node-schema.ts`
- `server/workspace-files/workspace-files.test.ts`
- `server/agent/context-access/profile-context-access.ts`
- `server/agent/context-access/profile-context-access.test.ts`
- `server/agent/tools/file-tools.ts`
- `server/agent/tools/file-tools.test.ts`
- `server/agent/tools/types.ts`
- `server/agent/harness/neuro-agent-harness.ts`
- `server/agent/tools/plot-tools.test.ts`
- `server/agent/tools/task-tools.test.ts`
- `server/agent/variables/variables.test.ts`
- `server/agent/profiles/builtin/retrieval.profile.tsx`
- `server/agent/profiles/builtin/writer.profile.tsx`
- `server/agent/profiles/builtin/leader-default.profile.tsx`
- `assets/workspace/.nbook/agent/profiles/builtin/retrieval.profile.tsx`
- `assets/workspace/.nbook/agent/profiles/builtin/writer.profile.tsx`
- `assets/workspace/.nbook/agent/profiles/builtin/simulator.leader.profile.tsx`
- `assets/workspace/.nbook/agent/profiles/builtin/rp.writer.profile.tsx`
- `assets/workspace/.nbook/agent/profiles/builtin/simulator.actor.profile.tsx`
- `assets/workspace/.nbook/templates/content-node-templates/**/index.md`
- `assets/workspace/.nbook/templates/project-directory-templates/agent-context/**`
- `assets/workspace/.nbook/templates/project-directory-templates/lorebook/**/index.md`
- `assets/workspace/.nbook/templates/project-directory-templates/manual/**/index.md`
- `assets/workspace/.nbook/templates/project-directory-templates/manuscript/**/index.md`
- `assets/workspace/.nbook/templates/project-directory-templates/reference/index.md`
- `assets/workspace/.nbook/templates/project-directory-templates/simulation/**/index.md`
- `assets/workspace/.nbook/templates/project-directory-templates/upload/index.md`
- `PROJECT-STATUS.md`
- `app/components/novel-ide/workspace/workspace-frontmatter-profile.ts`
- `app/components/novel-ide/workspace/WorkspaceFilePanel.vue`
- `app/components/novel-ide/workspace/WorkspaceCharacterPanel.vue`
- `app/components/novel-ide/workspace/WorkspaceLorebookDetailPanel.vue`
- `app/components/novel-ide/workspace/WorkspaceCharacterDetailPanel.vue`
- `app/components/novel-ide/workspace/WorkspaceRuleProfileDialog.vue`
- `app/components/novel-ide/workspace/WorkspaceLocationProfileDialog.vue`

## Verification

- `bun scripts/build/profile.ts check builtin/simulator.leader.profile.tsx --system` 通过；提示 stale 后已重新编译。
- `bun scripts/build/profile.ts check builtin/rp.writer.profile.tsx --system` 通过；提示 stale 后已重新编译。
- `bun scripts/build/profile.ts check builtin/simulator.actor.profile.tsx --system` 通过；提示 stale 后已重新编译。
- `bun scripts/build/profile.ts compile --all --system` 通过，刷新 10 个系统 profile artifact。
- `bun run profile:metadata` 通过。
- `bun x vitest run server/agent/context-access/profile-context-access.test.ts server/agent/tools/file-tools.test.ts` 通过。
- `bun x vitest run server/workspace-files/workspace-files.test.ts` 通过。
- `bun x vitest run server/agent/profiles/rp-profiles.test.ts server/agent/profiles/simulation-director-profiles.test.ts` 通过。
- `bun x vitest run server/agent/context-access/profile-context-access.test.ts` 通过。
- `bun x vitest run server/agent/tools/file-tools.test.ts -t "read 成功读取 lorebook|read 在 Workspace Root cwd" --testTimeout=60000 --hookTimeout=60000` 通过。
- `bun x vitest run server/agent/tools/task-tools.test.ts server/agent/tools/plot-tools.test.ts server/agent/variables/variables.test.ts --testTimeout=60000 --hookTimeout=60000` 通过。
- `bun x vitest run server/workspace-files/workspace-files.test.ts -t "内容节点 schema 由 Zod 生成并保留字段描述|角色内容节点模板包含 frontmatter 注释与正文结构|复制默认小说目录模板" --testTimeout=60000 --hookTimeout=60000` 通过。
- `bun x vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets 会管理 Agent skills、模板和 CLI 辅助文件" --testTimeout=60000 --hookTimeout=60000` 通过。
- review 修复后，active `server/agent` 的 `read` 工具已经接入 context access；不再依赖已归档的 `server/agent-v2`。
- review 修复后，workspace assets 同步测试中的 simulation 断言已改为当前 `agent-context/` 与 runtime-state 模板合同。
- `bun x tsc --noEmit --pretty false` 仍失败；新增 `profile-context-access.ts` 的 null 类型问题已修复，剩余错误来自既有 unrelated 类型问题：
  - `server/agent/profiles/catalog.ts`
  - `server/agent/profiles/rp-profiles.test.ts`
  - `server/agent/skills/silly-tavern-card-cli.test.ts`
- `bun x tsc --noEmit --pretty false 2>&1 | Select-String -Pattern "ToolExecutionContext|profileKey|file-tools|neuro-agent-harness|tools/types|plot-tools.test|task-tools.test|variables.test"` 无输出；本轮新增 `profileKey` 工具上下文字段未留下相关类型错误。
- 定向 `rg` 已确认 active schema / UI / templates / reference / builtin profile 中不再保留内容节点级 `inject` 合同；archived task 与 ST research 中的历史 `inject` 说明未清理。

## TODO / Follow-ups

- 后续推荐算法可以接入 runtime hooks 或扩展 Harness 全局 Hooks，统一观察 read 工具调用、profile 运行边界、session write、handoff、Plot 引用与跨 session 信号。
- 后续决定 Project Workspace 进入 Git 管理时，generated recommendation 文件是否默认纳入版本控制。
- 后续如需要跨 profile 推荐，只暴露事实信号，不暴露 source profile 私有 context 正文。
