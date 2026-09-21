# Agent Session Management

## User Request

- `AgentSessionDialog.vue` 做成更强的 session 选择弹窗，支持筛选条件，显示近期 session，默认只显示 leader。
- `NovelAgentDrawer.vue` 的关联 Agent 入口能同时显示当前 session 绑定了谁，以及当前 session 被谁绑定。
- 参考 `PlotWorkbenchSidebar.vue` 的搜索、筛选面板和紧凑列表交互。

## Goal

- Session 弹窗不再只是本地搜索列表，而是通过 `/api/agent/sessions` 查询筛选后的近期 session。
- 默认筛选 leader profile：`leader.default`、`leader.assets` 或 `leader.*`。
- 关联 Agent 面板同时展示双向关系：
  - 当前 session 绑定出去的 agent。
  - 绑定当前 session 的上游 agent。
- 保持 session snapshot 是前端恢复真相，不把关系展示做成临时前端猜测。

## Implementation Result

- `AgentSessionListQueryDto` 增加 `profileGroup`、`status`、`relation` 和 `limit`。
- `JsonlSessionRepository.listSessions()` 支持 profile、归档、关系和数量筛选；`NeuroAgentHarness.listSessions()` 再叠加运行期 `running/waiting` 状态。
- `AgentSessionSnapshotDto` 增加 `linkedByAgents`，由 harness 在同 workspace 内扫描 session reduce 后得到。
- `AgentSessionDialog.vue` 增加筛选浮层、状态统计、profile/status/relation/limit 控制、归档开关和近期列表展示。
- `AgentLinkedAgentPanel.vue` 改为双区块展示 `ownedAgents` 与 `linkedByAgents`，保留 detached 关系并弱化显示。
- `NovelAgentDrawer.vue` 接入默认 leader session 查询，并把 linked agent badge 改成双向总数。

## Verification

- `bunx vitest run server/agent/session/session-repo.test.ts server/agent/http.test.ts`
  - 结果：通过，2 个测试文件，15 个测试。
- `bunx vitest run server/agent/session/session-repo.test.ts server/agent/http.test.ts server/agent/harness/neuro-agent-harness.test.ts -t "session 列表支持|listAgentSessions|session snapshot 返回当前 session 被哪些 agent 绑定"`
  - 结果：通过，3 个测试文件，3 个目标测试。
- `bunx tsc --noEmit --pretty false --skipLibCheck`
  - 结果：通过。
- 全量 `server/agent/harness/neuro-agent-harness.test.ts` 当前被本地 `leader.default` compiled profile stale 阻塞：`profile leader.default 的源码或依赖已变化，需要重新编译`。这不是本轮 session 管理逻辑的直接失败；本轮新增的 linkedBy 回归测试改用自注册测试 profile 避免依赖 compiled builtin profile。

## Notes

- 本轮未做自动浏览器验证，符合当前仓库指令；需要时可手动打开 Agent 抽屉检查弹窗筛选、归档、切换和双向关系跳转。
- 反向绑定只在当前 workspace 的 session 范围内查询，避免跨 workspace 关系语义不清和不必要扫描。
