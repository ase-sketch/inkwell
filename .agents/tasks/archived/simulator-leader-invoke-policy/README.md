# Simulator Leader Invoke Policy

> Active task directory format: `NN-kebab-case-name/`. Archived tasks move to `docs/tasks/archived/<task-slug>/`.

## User Request

- 调整 `simulator.leader`：它需要维护 `simulation/` 目录，包括创建 subjects、管理或创建 simulator，因此需要 `bash` 工具。
- 给 `simulator.leader` 注入 bash / workspace CLI 相关 reference；如果当前没有合适的共享 reference，可以从 `leader.default` 中抽取，供 leader 类 profile 共用。
- 理解并重新设计 `必须使用 report_result 工具返回最终结果。请不要只回复普通文本。` 这条限制提醒。
- 不新增 profile-level `reportResultPolicy`；优先从 `invoke` caller identity 解决用户直聊与 agent 调用的行为差异，用户 caller 默认不触发 `report_result` reminder。
- `simulator.leader` 可以不需要 `report_result` 工具，让它返回普通文本；提示词中引导它应该返回什么，给它最大的自由。
- `simulator.leader` 的 `OutputSchema` 字段太多；新方向是移除或弱化它，不再绑定复杂 `report_result.data`。
- `simulator.leader` 的提示词需要重新分析：主要任务是维护 `simulation/` runtime，包括创建 subjects、管理 / 创建 simulator，而不是只做一次性裁决输出。

## Goal

实现一组针对 `simulator.leader` 与 Agent invocation contract 的合同调整：让 `simulator.leader` 拥有维护 `simulation/` 的工具和提示词边界，让 `report_result` reminder 由 invoke caller identity 控制，并让 `simulator.leader` 退出结构化 report_result 合同，改用普通文本输出。

成功标准：

- 明确 `simulator.leader` 应新增的工具权限和 reference 注入。
- 明确共享 bash / workspace CLI reference 的抽取方向。
- 明确 `report_result` reminder 当前实现与后续 caller identity 控制设计。
- 明确 `invoke` caller identity 的字段草案和来源。
- 明确用户 caller 默认不触发 `report_result` reminder。
- 明确 `simulator.leader` 不再需要 `report_result` 工具和复杂 OutputSchema。
- 明确 `simulator.leader` prompt 的职责重心调整。

## Current State

- active builtin profiles 位于 `assets/workspace/.nbook/agent/profiles/builtin/`。
- `simulator.leader` 当前 `allowedToolKeys` 包含：
  - `read`
  - `write`
  - `edit`
  - `apply_patch`
  - `create_agent`
  - `invoke_agent`
  - `get_agent`
  - `get_agent_profile`
  - `get_session`
  - Plot read tools
  - `report_result`
- `simulator.leader` 当前不包含 `bash`。
- `simulator.leader` 当前 HistorySet 注入：
  - `AGENTS.md`
  - `reference/content/project-structure.md`
  - `reference/content/simulation.md`
  - `reference/agent/project-workspace-guide.md`
  - `reference/plot/system.md`
- `leader.default` 已通过 `reference/agent/leader-default.md` 获得工具使用、bash、workspace CLI、多 Agent 协作等说明。
- `reference/agent/leader-default.md` 中已有可抽取的通用规则：
  - 读文件用 `read`，不要用 `bash` 调 `cat` / `head` / `tail` / `sed` / `python` 代替。
  - `bash` 只用于真实终端操作：`rg`、`find`、`ls`、`git`、测试、构建、workspace CLI、脚本验证等。
  - 搜索文本优先用 `rg`。
  - `bash` 命令必须按 bash 语法编写；工具已绑定 workspace root，不要传 `workdir`。
  - 不要用 `bash` 拼接高风险写入命令替代 `edit`、`apply_patch` 或 `write`。
- `report_result` 强制提醒当前不是普通 profile prompt，而是 runtime continuation：
  - `agentRuntimeBuiltins.reportResult()` 在 `prepareRun` 返回 `builtinBehavior.reportResultReminder: true`。
  - harness 将其写入 RunFrame 的 `reportResultReminderEnabled`。
  - 本轮结束时如果没有 `report_result`、没有 steer、没有继续工具循环、还没提醒过且当前可用工具包含 `report_result`，则注入下一轮 user reminder。
  - reminder 文案是：`你必须使用 report_result 工具返回最终结果。请不要只回复普通文本。`
- 当前 `SimulatorLeaderOutputSchema` 字段偏多；新方向是不让 `simulator.leader` 依赖 `report_result.data`：
  - `summary`
  - `status`
  - `world_state_report`
  - `committed_files`
  - `state_change_requests`
  - `subject_results`
  - `writer_safe_brief`
  - `director_handoff`
  - `plot_handoff`
  - `open_questions`
- `simulator.actor` 的输出合同更精简，仅包含角色可见反应、台词和内心反应。

## Design

### 1. `simulator.leader` Tool Access

`simulator.leader` 应新增 `bash`。

理由：

- 它是 `simulation/` runtime owner，需要发现和验证目录结构。
- 维护 subjects / entities / runs 时，经常需要 `rg --files`、`find`、`ls`、`workspace node validate` 等命令。
- 只用 `read/write/edit/apply_patch` 可以完成局部写入，但不适合高效检查 simulation 目录全貌。

`bash` 使用边界：

- 搜索、枚举、验证、运行 workspace CLI。
- 不用 `bash` 代替 `read` 读取普通文件正文。
- 不用 `bash` 拼接高风险写入命令替代 `write/edit/apply_patch`。
- 写入文件仍优先使用 `write/edit/apply_patch`，除非运行的是明确的 workspace CLI。

### 2. Shared Tool Reference

不要让 `simulator.leader` 直接 import `reference/agent/leader-default.md`，因为它包含 leader.default 的协作边界和主对话行为。

推荐新增共享 reference：

```text
reference/agent/workspace-tool-use.md
```

内容范围：

- `read/write/edit/apply_patch/bash` 的选择规则。
- `bash` 的安全边界。
- `rg --files`、`rg`、`find`、`ls` 的推荐用法。
- workspace CLI 稳定入口：`workspace node ...`。
- Workspace Root cwd 与 Project Workspace path 约定。
- Windows / bash 路径分隔注意事项，优先 `/`。

后续导入关系：

- `leader.default` import `workspace-tool-use.md` + `leader-default.md`。
- `simulator.leader` import `workspace-tool-use.md` + `reference/content/simulation.md` + `reference/agent/project-workspace-guide.md`。
- `retrieval` 可后续选择是否复用共享工具 reference；第一阶段不强求。

### 3. `report_result` Reminder And Caller Identity

当前 `report_result` reminder 已经是 hook / runtime behavior，但启用条件仍偏粗。

问题：

- `allowedToolKeys.includes("report_result")` 只表示 profile 有能力返回结构化结果，不等于用户直接对话时也必须返回结构化结果。
- 同一个 profile 可能有两种场景：
  - 用户直接聊天：允许自然回复，不强制 `report_result`。
  - 被其他 agent 调用：需要机器可消费结果，应强制 `report_result`。

实现方向：

- 第一版不新增 profile-level `reportResultPolicy`。
- `agentRuntimeBuiltins.reportResult()` 在 `prepareRun` 读取 invocation caller。
- caller 为 `user` 时默认不启用 reminder。
- caller 为 `agent` / `sidecar` / `system` 且当前 profile 允许 `report_result` 时，启用 reminder。
- harness 继续复用现有 `reportResultReminderEnabled`、`resolveTurnContinuation()` 和 `prepare-next-turn` 机制。
- 不需要结构化返回的 profile 直接不暴露 `report_result` 工具。

### 4. Invoke Caller Identity

建议在 `invoke` contract 中加入 caller identity。

第一版字段草案：

```ts
caller: {
    kind: "user" | "agent" | "sidecar" | "system";
    sessionId?: number;
    profileKey?: string;
    toolCallId?: string;
}
```

也可以先实现更轻字段：

```ts
callerKind: "user" | "agent" | "sidecar" | "system";
```

推荐完整 `caller`，因为后续 profile 可能需要知道是谁调用：

- `profileKey` 可用于 caller-specific handoff 策略。
- `sessionId` 可用于读取 source session dialogue content。
- `toolCallId` 可用于审计和 trace。

来源约定：

| Caller | Source |
| --- | --- |
| `user` | 前端用户直接输入、普通 Chat Surface prompt/followup/steer。 |
| `agent` | `invoke_agent` 工具由 harness 自动填入 source session/profile/toolCall。 |
| `sidecar` | Sidecar run 由 harness 自动填入。 |
| `system` | summarizer、automation、后台任务等系统发起 invocation。 |

安全约束：

- 前端用户入口不能自由伪造 `agent` / `sidecar` / `system` caller。
- 用户直接输入默认是 `caller.kind = "user"`。
- `agent` / `sidecar` / `system` caller 只能由 harness 内部创建。
- 旧请求或没有显式 caller 的调用按 `user` 处理。
- 本任务实现时硬切，不保留 legacy 行为分支。

Profile / runtime hook 可读：

```ts
ctx.invocation?.caller.kind
```

### 5. Profile Behavior Matrix

第一版推荐：

| Profile | User direct chat | Agent invoke | Rule |
| --- | --- | --- | --- |
| `leader.default` | 不强制 | 通常不强制 | 不暴露 `report_result` |
| `simulator.leader` | 不强制 | 不强制，返回普通文本 | 不暴露 `report_result` |
| `director` | 不强制 | 若保留 `report_result` 则强制 | caller identity 控制 |
| `retrieval` | 不强制 | 强制 | caller identity 控制 |
| `simulator.actor` | 不强制或少用用户直聊 | 强制 | caller identity 控制 |
| `summarizer` | 不面向用户直聊 | 强制 | caller identity 控制 |
| `writer` | 先保持现状 | 先保持现状 | 待定 |
| `rp.writer` | 不强制 | 不强制 | 不暴露 `report_result` |
| `researcher` | 不强制 | 不强制 | 不暴露 `report_result` |

关键原则：

- “允许 `report_result` 工具”和“强制使用 `report_result`”必须分离。
- 用户直接对话优先自然协作。
- agent-to-agent / system-to-agent 调用如果目标 profile 暴露 `report_result`，则优先结构化结果，方便上游稳定读取。
- `simulator.leader` 是例外：它应获得最大的自然语言自由，不强制结构化 report，由提示词约定输出内容。

### 6. `simulator.leader` Output

当前 schema 过重，容易让模型把工作重心放在填表，而不是维护 simulation runtime。

新方向：`simulator.leader` 不暴露 `report_result`，通过普通 assistant 文本返回。

提示词中约定返回内容，而不是强制 `report_result.data`：

- 本轮裁决 / 推演总结。
- 实际修改的 simulation 文件路径。
- 给 writer 的 writer-safe brief。
- 给 director 的剧情结构 handoff。
- 需要用户 / leader / director 确认的问题。
- 推荐使用轻结构标题：
  - `## 模拟结果`
  - `## 已修改文件`
  - `## Writer Brief`
  - `## Director Handoff`
  - `## 待确认`
- 这些标题是提示词引导，不是 JSON schema；任务不适合时可以自然回复。

如果未来仍需要程序读取结构化字段，应由调用方在 message 中明确要求某种文本格式，或新增专门工具 / sidecar，而不是让 `simulator.leader` 默认绑定复杂 OutputSchema。

可以删除或废弃：

- `SimulatorLeaderOutputSchema` 中的复杂字段。
- `simulator.leader` prompt 中要求 `report_result.data` 的描述。
- `simulator.leader` `allowedToolKeys` 中的 `report_result`。

### 7. `simulator.leader` Prompt Direction

提示词应从“本轮裁决输出器”转向“simulation runtime owner”。

核心职责建议：

- 维护当前 Project 的 `simulation/` runtime。
- 创建 / 更新 `simulation/subjects/**`、`simulation/entities/**`、`simulation/runs/**`。
- 根据 task / user action / director request 推演世界运行态。
- 创建或复用 `simulator.actor`，并把 god-view context 过滤成 actor-facing packet。
- 综合 actor response 与 canon / state 做世界裁决。
- 把结果过滤成 `writer_safe_brief` 与 `director_handoff`。

权限边界建议：

- 可以创建最小 subject scaffold：当任务明确需要模拟某个 subject，且路径 / 身份可以从上下文确定时，不必每次先问用户。
- 可以创建 entity / run 记录：当本轮任务明确要求推进模拟或记录裁决时可以直接维护。
- 重大不可逆裁决、核心用户角色行动、长期世界状态大改、用户明确未授权的新核心设定，进入 `open_questions`。
- subject 创建约定可以分层定义：
  - 本轮 invocation 明确指令优先。
  - `agent-context/simulator.leader/context.md` 可由用户自定义并覆盖更具体的 Project 规则。
  - `simulator.leader` 自身提示词给出默认规则。
  - `AGENTS.md` 仍作为项目级最高规则参与约束。
- 不写正式章节正文。
- 不抢 director 的长期 Plot System 职责。
- 不把隐藏真相直接传给 subject / writer。

## Implementation Plan

### Phase 1: Shared Reference

- 新增 `reference/agent/workspace-tool-use.md`。
- 从 `reference/agent/leader-default.md` 抽取通用工具规则。
- 更新 `leader.default` import，避免重复描述工具规则。
- 更新 `simulator.leader` import 共享工具 reference。

### Phase 2: Simulator Leader Tools And Prompt

- 给 `simulator.leader` 增加 `bash`。
- 在 profile prompt 中明确它是 `simulation/` runtime owner。
- 调整 subject/entity 创建规则：明确任务需要时可创建最小 scaffold，重大不可逆变化才需要确认。
- 更新相关 profile tests。

### Phase 3: Invoke Caller Identity

- 扩展 `AgentInvokeRequestDto` / harness invoke input，加入 `caller` 或 `callerKind`。
- 前端用户输入填 `caller.kind = "user"`。
- `invoke_agent` 工具填 `caller.kind = "agent"`，并带 source session/profile/toolCall。
- sidecar / system run 填对应 caller。
- 将 caller 暴露到 `ProfilePrepareContext.invocation` 和 `AgentRuntimeHookContext`。

### Phase 4: Report Result Policy

- 不新增 profile-level `reportResultPolicy`。
- 更新 `agentRuntimeBuiltins.reportResult()`：根据 caller identity 决定是否启用 reminder。
- 用户 caller 默认不提醒。
- 非用户 caller 且当前 profile 暴露 `report_result` 时提醒。
- 保留现有 `prepare-next-turn` reminder 机制。
- 从 `simulator.leader` 移除 `report_result`，让它永远不被 reminder 约束。
- 确认用户直接和任何 profile 对话时默认不会被强制 report_result。
- `invoke_agent` 的返回合同保持当前形态，不为 `simulator.leader` 额外新增结构化解析；上游继续按现有 final message / report result 合同消费。

### Phase 5: Simulator Leader Output Simplification

- 移除或弱化 `SimulatorLeaderOutputSchema`。
- 建议 `simulator.leader` 的 OutputSchema 为空对象或等价弱 schema，且不暴露 `report_result`。
- 从 `simulator.leader` prompt 移除 report_result.data 要求。
- 在 prompt 中以自然文本格式引导它汇报：裁决总结、改动文件、writer_safe_brief、director_handoff、open_questions。
- 更新 tests 中 schema 字段断言。
- 检查 `director`、`leader.default` 调用 `simulator.leader` 时是否依赖旧 report_result 字段；如有依赖，同步迁移到普通文本读取。

### Phase 6: Hard Cut Verification

- 同一轮完成 `simulator.leader` 工具 / prompt / OutputSchema 调整和 invoke caller identity。
- 不做 legacy 兼容分支。
- 更新 DTO、harness、profile tests 和相关 prompt tests，使旧期望直接失败并被新合同替代。

## Decisions

- `simulator.leader` 应拥有 `bash`，因为它负责维护 `simulation/` runtime，不只是读写单个文件。
- bash / workspace CLI 使用规则应抽成共享 reference，而不是让 `simulator.leader` 直接依赖 `leader.default` 的 profile 专用 reference。
- `report_result` 强制行为应该保持 runtime hook 机制，不应退回成纯 prompt 文案。
- `allowedToolKeys` 和 `report_result` 强制策略必须分离。
- `invoke` 需要携带 caller identity，让 profile / runtime 区分用户直聊与 agent 调用。
- 不新增 profile-level `reportResultPolicy`；第一版只用 caller identity 控制 reminder。
- 用户 caller 默认不触发 `report_result` reminder。
- 前端不能伪造非用户 caller；`agent` / `sidecar` / `system` caller 由 harness 内部生成。
- 缺省 caller 按 `user` 处理。
- `simulator.leader` 不需要 `report_result` 工具，应返回普通文本，提示词中引导输出内容。
- `simulator.leader` 输出建议使用轻结构 Markdown 标题，但不强制 JSON 或 schema。
- `retrieval`、`simulator.actor`、`summarizer` 等保留 `report_result` 的 profile 在非用户 caller 下继续强制。
- `simulator.leader` OutputSchema 可以移除或弱化，不要让模型为填复杂表格而偏离 simulation runtime 维护。
- `simulator.leader` 的核心定位是 `simulation/` runtime owner：创建 / 管理 subjects、entities、runs，并编排 actor simulator。
- subject 创建规则优先级：本轮 invocation 明确指令 > `agent-context/simulator.leader/context.md` > `simulator.leader` 默认规则；`AGENTS.md` 仍作为项目级最高约束参与。
- `invoke_agent` 返回合同保持现状，不为了 `simulator.leader` 新增额外解析层。
- 本任务实现时硬切，不做 legacy 遗产兼容。

## Files Changed

- `docs/tasks/39-simulator-leader-invoke-policy/README.md`
- `reference/agent/workspace-tool-use.md`
- `reference/agent/leader-default.md`
- `assets/workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx`
- `assets/workspace/.nbook/agent/profiles/builtin/simulator.leader.profile.tsx`
- `server/agent/profiles/builtin-contracts.ts`
- `server/agent/profiles/define-agent-runtime.ts`
- `server/agent/profiles/types.ts`
- `server/agent/harness/types.ts`
- `server/agent/harness/run-kernel-types.ts`
- `server/agent/harness/run-frame-state.ts`
- `server/agent/harness/neuro-agent-harness.ts`
- `server/agent/http.ts`
- `shared/dto/agent-session.dto.ts`
- `server/agent/tools/builtin-tools.ts`
- `shared/dto/agent-session.dto.test.ts`
- `server/agent/http.test.ts`
- `server/agent/profiles/define-agent-runtime.test.ts`
- `server/agent/profiles/simulation-director-profiles.test.ts`
- `server/agent/profiles/rp-profiles.test.ts`
- `server/agent/profiles/leader-assets-profile.test.ts`
- `server/agent/harness/neuro-agent-harness.test.ts`
- `server/agent/harness/run-frame-state.test.ts`
- `server/agent/harness/turn-transaction.test.ts`
- `server/agent/harness/turn-failure.test.ts`
- `server/agent/harness/prepare-next-turn.test.ts`
- `assets/workspace/.nbook/agent/profiles/.compiled/**`
- `assets/workspace/.nbook/agent/profiles/.compiled/manifest.json`

## Implementation Notes

- 新增共享 reference `reference/agent/workspace-tool-use.md`，抽出 `read/write/edit/apply_patch/bash` 选择规则、`rg` / `workspace node ...` 用法和 Workspace Root / Project Workspace 路径约定。
- `leader.default` 和 `simulator.leader` 都导入共享 tool-use reference；`leader-default.md` 保留 profile 专属协作、多 Agent、SQL、Plan Mode 等规则。
- `simulator.leader` 新增 `bash`，移除 `report_result`，弱化 `SimulatorLeaderOutputSchema` 为 `Type.Object({})`，并在 prompt 中明确它直接返回普通 assistant 文本。
- `simulator.leader` prompt 已改为 `simulation/` runtime owner：维护 `simulation/subjects/**`、`simulation/entities/**`、`simulation/runs/**`，按需创建最小 subject scaffold，调度 `simulator.actor`，并输出 writer / director 可用 handoff。
- subject 创建规则已写入 prompt：本轮 invocation 明确指令 > `agent-context/simulator.leader/context.md` > `simulator.leader` 默认规则；`AGENTS.md` 仍作为项目级最高约束参与。
- 新增内部 `AgentInvokeCaller`，kind 为 `user | agent | sidecar | system`，缺省归一化为 `user`。
- HTTP 用户 invocation 固定为 `caller.kind = "user"`，前端 DTO 不暴露可伪造的内部 caller 字段。
- `AgentInvokeRequestDtoSchema` 显式拒绝前端提交 `caller` 字段；HTTP helper `toInvokeInput()` 固定填入 `caller: {kind: "user"}`。
- `invoke_agent` 工具调用目标 session 时写入 `caller.kind = "agent"`，带 source session/profile/toolCallId。
- summarizer / follow-up 等内部触发写入 `system` caller；sidecar run 内部 RunFrame 与 `SidecarContext.caller` 使用 `sidecar` caller，但保持现有 sidecar report reminder 关闭策略。
- `ProfilePrepareContext.invocation.caller` 和 `AgentRuntimeHookContext.invocation.caller` 已可读。
- `agentRuntimeBuiltins.reportResult()` 改为 prepareRun 可执行 hook：用户 caller 不启用 reminder，非用户 caller 启用 reminder；最终是否注入仍受目标 profile 是否暴露 `report_result` 约束。
- `invoke_agent` 返回合同保持现状；不为 `simulator.leader` 增加额外结构化解析。

## Verification

- `bun scripts/build/prepare-system-assets.ts`
  - 通过，prepared system profiles: 10 profile(s), compiled 0 stale profile(s)。说明当前 compiled artifacts 已是 fresh。
- `bun vitest run server/agent/profiles/define-agent-runtime.test.ts server/agent/profiles/simulation-director-profiles.test.ts server/agent/profiles/rp-profiles.test.ts server/agent/profiles/leader-assets-profile.test.ts server/agent/harness/run-frame-state.test.ts server/agent/harness/turn-transaction.test.ts server/agent/harness/turn-failure.test.ts server/agent/harness/prepare-next-turn.test.ts`
  - 通过，8 files / 46 tests。
- `bun vitest run shared/dto/agent-session.dto.test.ts server/agent/http.test.ts server/agent/profiles/define-agent-runtime.test.ts server/agent/profiles/simulation-director-profiles.test.ts server/agent/profiles/rp-profiles.test.ts server/agent/profiles/leader-assets-profile.test.ts server/agent/harness/run-frame-state.test.ts server/agent/harness/turn-transaction.test.ts server/agent/harness/turn-failure.test.ts server/agent/harness/prepare-next-turn.test.ts`
  - 通过，10 files / 58 tests。
- `bun vitest run server/agent/harness/neuro-agent-harness.test.ts -t "prepareRun sidecar 可以注入主 run runtime context|用户 caller 直接对话时不触发 report_result reminder|缺少 report_result 时会自动提醒一次并收集第二轮 report|runtime_only transcript 下 report_result reminder"`
  - 通过，1 file / 4 selected tests。
- `bun tsc --noEmit`
  - 本任务相关类型错误已清掉；当前仍失败于既有无关错误：
    - `server/agent/profiles/catalog.ts` 的 `type_artifact_missing` / `type_artifact_changed` 类型联合不匹配。
    - `server/agent/skills/silly-tavern-card-cli.test.ts` 的若干 possibly undefined / string | undefined 严格空值错误。

## TODO / Follow-ups

- 如后续实现程序自动推荐或跨 session/profile 推荐算法，可在 caller identity 基础上继续接 Hooks 或扩展 Harness 支持全局 Hooks。
- 后续如需要程序读取 `simulator.leader` 的稳定结构化结果，应新增专门工具、sidecar 或调用方明确文本格式，而不是恢复默认复杂 OutputSchema。
