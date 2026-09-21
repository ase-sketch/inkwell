# Agent Steer / FollowUp Composer

## User Request

- 前端适配 Agent harness 已支持的 `steer` 和 `followUp` 两个操作，参考 Codex app 的“引导”和“队列”交互。
- 输入框右下角发送按钮需要按状态切换：
  - 最后一条消息不是 AIMessage：`continue` 操作。
  - 当前正在 run，且输入框没有内容：停止操作。
  - 当前正在 run，且输入框有内容：默认点击为引导 `steer`。
  - 当前正在 run，且输入框有内容：Ctrl + 点击为队列 `followUp`。
- `steer` 和 `followUp` 需要显示在输入框上方。

## Goal

- 让 Agent Composer 支持运行中的用户干预：`steer` 用于当前 run 的下一次模型调用前纠偏，`followUp` 用于当前 run 本来要停止时继续排队执行。
- 队列中的 steer / followUp 在输入框上方可见，直到后端消费并通过 snapshot/event 清除。
- 保持现有 session、SSE、Composer 和 Drawer 边界，不把输入框状态重新堆回抽屉主体。

## Current State

- 已实现显式 `mode: "steer" | "followup"` API、`steerQueue`、`steer_queued` 事件和前端队列展示。
- `steer` 在模型调用前或当前 assistant turn + tool batch commit 后的 safe point all drain；drain 后作为标准 user message 写入 session，并进入当前 loop 下一次模型调用。这样 waiting_user 期间入队的 steer 会在 resolution 后的下一次模型调用前生效。
- `followUp` 在当前 loop 真正结束后 one-at-a-time drain，并重新开启 fresh loop。
- Review 后补强：idle session 会拒绝显式 `steer` / `followup`，已经越过最后可引导点、safe point drain 期间或正在 aborting 的 active run 会拒绝 queue 操作；error / abort / normal finish 会清理不可再消费的 `steerQueue`，避免生成僵尸 queue item。
- 前端 `AgentComposer.vue` 已按 running/input/Ctrl 状态切换 send / stop / steer / followup；pending approval / request_user_input 时保留原 note 输入，并额外提供运行中消息输入用于 steer / followup 入队。
- 已消费的 steer 历史消息会在前端标记为“引导”，并隐藏当前临时模型前缀 `<user_steer>...</user_steer>`，只展示用户原文；`session_entry` 增量到达时也能立即展示。
- 当前 steer 模型可见前缀暂用 `<user_steer>...</user_steer>`，等待用户提供“测试 steer”样本后替换为 Codex harness 的真实前缀。

## Implementation Plan

- 扩展 session invoke 契约：
  - `AgentInvokeRequestDto.mode` 增加 `"steer" | "followup"`。
  - `prompt` / `steer` / `followup` 必须带 `message`；`continue` 不能带 `message`。
  - 继续复用 `/api/agent/sessions/:id/invocations`，不新增独立 queue endpoint。
- 补齐 harness 队列状态：
  - 保留现有 `followUpQueue` FIFO，新增显式 `followup` 调用入口。
  - 新增 `steerQueue`，在模型调用前和当前 assistant turn + tool results 落盘后进入 safe point；无论本轮 assistant 是否产生 tool calls，只要此时存在 pending steer，当前 ReAct loop 就不结束，而是在可引导点一次性 drain 当前所有 pending steer，并在下一次模型调用前注入。
  - followUp 只在当前 ReAct loop 没有更多 tool calls、也没有 pending steer 时消费；一次消费一条并重新开启下一轮 loop，重新执行 profile prepare / compaction / model resolve。
  - Snapshot 新增 `steerQueue`；SSE 新增 `steer_queued`，并保留现有 `follow_up_queued`。
  - 消费后不新增 `*_consumed` event；通过正常 `session_entry` 展示被消费的 user message，通过后续 `session_state_changed.snapshot` 清理队列展示。
  - `mode: "steer" | "followup"` 沿用 `InvokeAgentResult`，HTTP 成功时返回 `status: "waiting"` 和 `finalMessage` 中的 queued item id；第一版不新增 `status: "queued"`。
  - abort 默认清空尚未消费的 steer / followUp 队列。
- 调整前端输入动作：
  - `AgentComposer.vue` 根据 `running`、输入内容、`canContinueWithoutInput` 和 Ctrl/Meta 修饰键 emit `send` / `stop` / `steer` / `followup`。
  - Enter 在运行中有输入时默认 `steer`；Ctrl/Meta+Enter 为 `followUp`。
  - `request_user_input` / approval pending 时保持现有回答 UI 优先，回答备注仍作为 note；另提供独立运行中消息输入，允许 steer / followUp 入队但不抢占当前 resolution。
- 显示队列状态：
  - steer / followUp 提交成功后使用 `useNotification()` 立即反馈：“消息已引导” / “消息已排队”。
  - 在输入框上方显示紧凑条目，文案使用“引导”和“队列”。
  - 显示所有未消费条目，按队列顺序排列；每条显示 message text 的单行截断预览。
  - 提交 steer / followUp 时，HTTP 入队成功后再清空输入框；失败则保留输入。
  - 消费前不追加普通乐观 user 气泡；真正 drain 时由 harness 写入 session entry，之后按普通 user message 进入历史。
  - `steer` 写入模型上下文时需要由后端 harness 增加与 Codex harness 对齐的文本前缀；前端队列预览和 notification 仍显示用户原文。
  - session history 识别当前 steer 前缀后显示为“引导”，并清洗掉模型可见 wrapper；第一版不额外扩展 rawText / renderedText。
  - 被消费 steer 的队列清理由后续 snapshot 负责；`session_entry` 目前没有 queued item id，不做文本猜测式即时清队列。
  - 运行中有输入时，发送按钮 hover tooltip 展示“引导 / 队列 Ctrl+Enter”提示；tooltip 只负责解释快捷操作，不提供额外点击功能。
- 更新 session store：
  - `useAgentSession.ts` 支持 `steer_queued`。
  - `follow_up_queued` 保留现有行为，或迁移到统一队列 helper。
  - `InvokeAgentResult` 新增可选 `queuedItem?: AgentQueuedMessageDto`，HTTP 返回后前端可立即显示 queue chip；后续 SSE 按 id 去重。
  - 新增统一 `AgentQueuedMessageDto = { id, kind: "steer" | "followup", message, createdAt }`，snapshot 仍保留 `steerQueue` / `followUpQueue` 两个数组。

## Decisions

- session invoke 入口继续承担 prompt / continue / steer / followUp；不新增独立 queue endpoint。
- steer / followUp 属于 harness control-plane，不交给 profile 或 prompt 决定。
- slash command 只在非 running 的普通发送路径生效；running 输入按 steer / followUp 处理。
- 非 running 时不提交 steer / followUp；普通输入仍走 prompt，空输入且最后一条非 AIMessage 才走 continue。
- `request_user_input` / approval pending 优先级高于 steer / followUp；回答备注输入只作为当前问题的 note，独立运行中消息输入才触发 steer / followUp。
- steer / followUp 在 queue drain 后都写成普通 user message，保证模型上下文和 session 历史一致。
- running 时普通 Enter 等同默认按钮动作，提交 steer；Ctrl/Meta+Enter 提交 followUp。
- running 且输入有内容时，默认点击提交 steer；Ctrl/Meta+点击提交 followUp。
- Composer button click 明确 `preventDefault` 后按 `ctrlKey || metaKey` 分派；`AgentReferenceInput` 的 submit 事件需要携带键盘 modifier，供 Ctrl/Meta+Enter 分派 followUp。
- `waiting_user` 状态下后端仍允许 steer / followUp 入队，但它们不抢占当前 approval / user input resolution；resolution 仍必须通过 `continue + resolution` 恢复当前 tool call。
- 第一版固定 drain mode：steer 在同一个可引导点使用 all drain，一次性消费所有 pending steer；followUp 在 ReAct loop 真正结束后 one-at-a-time drain，一次只消费一条并开启下一轮 loop。
- steer / followUp 没有同一个 drain 队列里的优先级比较；loop 结束判定顺序是先检查 pending steer，只有没有 steer 时才算当前 ReAct loop 真正结束并进入 followUp 消费。
- consumed steer / followUp 优先写成标准 user message；如果现有 session entry 已有可用来源字段，则记录 `steer` / `followup` 来源，否则不为此扩展 session entry schema。
- consumed steer 在持久化层仍是 `origin: "harness"` 的 user message；前端通过 steer wrapper 识别并投影为 `intent: "steer"`。
- steer 的模型可见文本需要带前缀；不自行发明前缀，后续通过观察 Codex harness 的 steer 前缀后复用。
- followUp 只在当前 ReAct loop 真正结束后自动重新开启一个新 loop；不会在仍有 tool calls 或 pending steer 的当前 loop 中插队。
- 队列条目显示小标签和 icon：`引导` 用 `corner-down-left`，`队列` 用 `list-plus` 或 `clock`，文本单行截断。
- UI 不提供第一版队列删除；如误发，继续发送新的 steer / followUp 纠正，或在已写入历史后使用现有 tree 操作处理。

## Files Changed

- 已实现相关代码与测试：
  - `shared/dto/agent-session.dto.ts`
  - `shared/dto/agent-session.dto.test.ts`
  - `server/agent/harness/neuro-agent-harness.ts`
  - `server/agent/harness/types.ts`
  - `server/agent/harness/neuro-agent-harness.test.ts`
  - `app/components/common/form/StructuredTextEditor.vue`
  - `app/components/markdown-studio/TipTapMarkdownEditor.vue`
  - `app/components/markdown-studio/MarkdownSourceEditor.vue`
  - `app/components/novel-ide/agent/useAgentSession.ts`
  - `app/components/novel-ide/agent/useAgentSession.test.ts`
  - `app/components/novel-ide/agent/agent-message.ts`
  - `app/components/novel-ide/agent/agent-message.test.ts`
  - `app/components/novel-ide/agent/AgentComposer.vue`
  - `app/components/novel-ide/agent/AgentReferenceInput.vue`
  - `app/components/novel-ide/agent/AgentTextBubble.vue`
  - `app/components/novel-ide/NovelAgentDrawer.vue`
  - 相关 snapshot fixture 测试补充 `steerQueue`

## Verification

- `bunx tsc --noEmit --pretty false --skipLibCheck`：通过。
- `bun test shared/dto/agent-session.dto.test.ts app/components/novel-ide/agent/useAgentSession.test.ts app/utils/agent-message-projection.test.ts app/components/novel-ide/agent/agent-message.test.ts`：通过，30 个测试。
- `bun test server/agent/harness/neuro-agent-harness.test.ts --test-name-pattern "steer|snapshot 暴露"`：通过，覆盖 steer/followUp 入队、snapshot 展示、steer all drain、followUp fresh loop。
- Review 修复后追加：`bun test server/agent/harness/neuro-agent-harness.test.ts --test-name-pattern "steer|followUp|snapshot 暴露|idle session|最后可引导点|aborting|模型错误|safe point"`：通过，覆盖 idle 拒绝 queue、late steer 拒绝、aborting 拒绝、模型错误清理 pending steer 和 safe point drain 期间拒绝新 steer。
- Waiting-user 入口修复后追加：`bunx tsc --noEmit --pretty false --skipLibCheck`、DTO/session/message projection 相关测试、harness steer/followUp 相关测试均通过；修复内容是 pending approval / request_user_input 时新增独立运行中消息输入，不再把回答 note 静默吞成无法发送的 steer/followUp。
- Waiting-user 误触发修复后追加：回答备注输入和运行中消息输入使用不同 submit handler，避免 note 框 Enter 误发送已有运行中消息。
- Waiting-user steer 恢复修复后追加：`bun test server/agent/harness/neuro-agent-harness.test.ts --test-name-pattern "steer|followUp|snapshot 暴露|idle session|最后可引导点|aborting|模型错误|safe point|waiting_user"`：通过，覆盖 waiting_user 期间入队的 steer 会在 resolution 后下一次模型调用前注入。
- Steer 展示修复后追加：`bun test app/components/novel-ide/agent/agent-message.test.ts app/utils/agent-message-projection.test.ts app/components/novel-ide/agent/useAgentSession.test.ts`：通过，33 个测试；覆盖已消费 steer 的 snapshot 展示和 `session_entry` 增量展示。
- Steer 展示修复后追加：`bunx tsc --noEmit --pretty false --skipLibCheck`：通过。
- Steer 展示修复后追加：`bun test server/agent/harness/neuro-agent-harness.test.ts --test-name-pattern "steer|followUp|snapshot 暴露|idle session|最后可引导点|aborting|模型错误|safe point|waiting_user"`：通过，8 个测试。
- `bun test server/agent/harness/neuro-agent-harness.test.ts`：本次新增相关用例通过；整文件剩余 1 个既有失败为 `profile 内 session variable definition 会进入工具 registry`，失败原因是测试中的 `variable_patch` 未先 `variable_read`，与本任务无关。
- 未自动做浏览器验证，遵循仓库指令。

## TODO / Follow-ups

- 收到用户“测试 steer”样本后，将后端 `steerText()` 的临时 `<user_steer>` 前缀替换为 Codex harness 的真实模型可见前缀。
- 如队列误发成为高频问题，再设计 queued steer / followUp 删除入口。
