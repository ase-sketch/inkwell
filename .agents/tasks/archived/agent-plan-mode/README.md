# Agent Plan Mode

## 需求

- 参考 Claude Code 的 system reminder 与 Plan Mode 机制，为当前 `server/agent` 增加 thread 级软 Plan Mode。
- 不实现 Explore agent。
- `enter_plan_mode` 作为无参数工具；`exit_plan_mode` 可选携带 `planFilePath`。模型主动调用时需要用户审批，审批通过后才切换当前线程状态。
- 前端支持 `/plan`、`/plan off`，以及输入框聚焦时用 `Shift + Tab` 切换 Plan Mode。

## 实现边界

- 当前实现是软模式：运行时不硬拦截写工具，靠 prompt reminder 与工具说明约束模型。
- Plan Mode 状态保存在 thread metadata 的 `planMode` 字段，并通过 thread snapshot/detail 投影给前端。
- reminder 在 leader TSX prompt 中渲染，分为 full、sparse、re-entry 和 exit 四类。
- reminder 明确禁止 Explore agent，并要求只读规划；计划优先在聊天中对用户可见。当前 thread 工作目录 `workspace/{novel-name}/.agent/{thread_id}/` 可放可选 Markdown plan file、walkthrough file 或调研记录。

## 关键变更

- 后端增加 `enter_plan_mode` / `exit_plan_mode` 工具，并注册进默认 leader 工具集；模型调用时复用 `request_user_input` 的 waiting_user 挂起链路进行审批。
- Agent run 派发时推进 Plan Mode reminder 计数，通过 `runtime.options.planModeReminder` 交给 prompt template 注入。
- 前端 Agent drawer 增加 Plan Mode 状态按钮、状态 badge、`/plan` 命令和 `Shift + Tab` 快捷键。
- `AgentThreadSummaryDto` 增加 `planMode.active`，用于前端展示当前线程状态。
- `leader.default` Plan Mode prompt 改为要求先把计划和关键发现报告给用户；Markdown 工作文件不再是必需产物，只在需要持久化或长文审阅时写入 thread 工作目录。
- 提示词层窄优化：强化工具说明、leader reminder 和 skill catalog 触发规则。Agent 主动进入 Plan Mode 前应先用普通回复说明原因，Plan Mode 中应持续报告发现、未决点和当前方向。
- 计划文件发现与退出预览调整：`enter_plan_mode` 保持无参数，审批通过后不绑定文件名。`exit_plan_mode` 默认基于聊天中可见计划发起退出审批；只有显式传入当前 thread 工作目录内的 `planFilePath` 时，后端才读取该 Markdown 文件作为 UI-only preview。未传参时不再自动选择最新 `.md`。
- 前端为 `exit_plan_mode` 使用专用正文式气泡展示计划文件路径和 Markdown 内容预览；预览区域限制高度并允许滚动，审批完成后默认折叠并保留摘要。选择“追加建议”会让 Agent 继续规划，点击忽略/终止本轮才暂停 ReAct loop。
- `edit_file` 恢复工具输出增量，前端编辑气泡会显示流式结果和最终替换结果。
- Workspace 枚举与 thread 工作文件访问提示词收紧：Leader 不应为了了解结构递归扫描整个小说 workspace，优先使用 `rg --files` 与精确过滤；常规任务以当前小说 workspace 为边界；Plan Mode 只能读写当前 thread 工作目录，不枚举或读取其他 session/thread 的文件。
- Skill catalog 继续首轮持久化进 `HistorySet`；显式 `$skill` 或明显匹配 catalog 时，`skill` 工具是读取完整 `SKILL.md` 的前置入口，不通过 `read_file` 绕过。

## 验证

- 工具 schema 测试覆盖新增无参数工具。
- 工具 description 继续保持英文、非空且无 CJK；Plan Mode 工具仍是无参数。
- Prompt 测试覆盖 full/sparse/exit reminder 的 thread 工作目录引用、只读限制、`exit_plan_mode` 审批语义，以及 Skill catalog 的启用规则。
- Prompt 测试覆盖 workspace 枚举边界、`rg --files` 优先、当前小说 workspace 边界，以及不访问其他 session/thread 工作文件。
- AgentSystem 测试覆盖 enter/exit metadata 更新。
- AgentSystem / ThreadRunCoordinator 测试覆盖 Plan Mode 工具审批挂起、无计划文件仍可审批、最新计划文件选择和批准/追加建议分支。
- Typecheck 覆盖 DTO、前端和 prompt TSX 类型链路。
