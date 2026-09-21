# 任务上下文

快照截止时间：2026-08-24T12:26:54Z
覆盖到：用户更正 Skill 名称为 `load_role`；Task 135 三份治理登记已同步，`.omp/RULES.md` 汇报格式指针已修复；2026-08-24T12:31:18Z 的 required 验证已通过；Task 当前状态为 `verifying`，当前进展以 Task README 与最新 walkthrough/evidence 为准。

## 基线与授权

- checkout：当前仓库主 checkout
- 分支：`master`
- 基线 revision：`9ecb87ae71ec7c06bce17e72903917d86cef9834`
- 授权：开发者明确选择“授权在当前 master checkout 修改”
- `actionIssueId: null`：无 Issue/Project 的本地例外
- 不授权 push、PR、合并、发布、部署或其它远端写入

## 隔离

Task 00153 的 P-005 未提交改动位于 `.worktree/t153-p005-workflow-ux`，不属于本 Task 当前 diff。当前主 checkout 建立 00154 前无未提交改动；本 Task 不修改 00153 worktree。

## 合同决策

- `report` 是 model-invoked Skill：主动给开发者报告当前状态、证据、阻塞/风险、明确动作和下一步。
- `load_role` 是 user-invoked 参数化 Skill：参数只接受 `pm`、`leader`、`tasker`、`reviewer`。
- 角色真相源继续使用 `.agents/roles/<role>/AGENTS.md`；用户提到的 `.agents/rules` 当前不存在，不创建第二套角色规则目录。
- 删除 `agent-workflow-router`，同步所有消费者、治理检查、fixture 与 accepted Proposal；不保留 alias 或兼容分支。

## 本轮修正

- `report` 的当前状态段现在强制报告 `Task`、`Issue/Project`、`worktree`、`branch`、`HEAD/最新已验证 revision`、提交状态、diff 范围和远端动作授权；无 Task/Issue 时显式写 `N/A` 或 `actionIssueId: null`。
- `walkthroughs/004-tasker-2026-08-24_10-23-report-status-card.md` 和 `evidences/final-verification.txt` 已记录本轮变更与验证。
- 历史验证窗口曾记录 Task 135 两条 hash 基线失败；修复登记后最新 `governance:check` 已为 `failures: []`、`warnings: []`，当前不再存在这两条失败。

## 本轮命名修正

- 索引、Task/Tasker 入口、治理 contract/test 和当前 Proposal 引用已统一为 `load_role`；此前 walkthrough 的 `load_rule` 保留为历史记录，并由 walkthrough 006 记录用户更正。
- 新增 walkthrough：`walkthroughs/006-tasker-2026-08-24_11-00-load-role-name-correction.md`；hash 诊断见 `evidences/task135-hash-diagnosis.txt`。
- Reviewer verdict 仍为“建议合并”；Task 135 两条 hash 基线已按授权修复并通过治理门禁，Task 保持 `verifying`。

## Advisory 修正

- `report` 与 `.omp/RULES.md` 的汇报格式引用均指向现有真相源 `.agents/skills/report/SKILL.md#报告格式`；不再引用不存在的 `AGENTS.md#汇报与提问`。
- `report` Revision 字段强制写 `HEAD`、`latest verified` 和一致性；未提交 diff 没有独立 revision 时必须显式写明。
- Task 135 README `packages/neuro-book/.agents/tasks/135-agent-asset-install-protocol/README.md` 本轮只读核对，未修改；实际改动仅为 `.agents/tasks/ownership.json` 的 Task 135 `file.sha256`、`.agents/tasks/legacy-index.json` 的对应 `destinationSha256`/顶层 `manifestSha256`、`.agents/tasks/.migration-complete` 的顶层 `manifestSha256`。`sourceRevision` 与 `sourceSha256` 保持不变。

## 本轮范围修复

- `.omp/RULES.md` 已纳入本 Task 实际修改范围，第 5 行已改为现有真相源 `.agents/skills/report/SKILL.md#报告格式`；原 `AGENTS.md#汇报与提问` 悬空指针已解决。
- 实际修改文件：`.omp/RULES.md`、`.agents/tasks/ownership.json`、`.agents/tasks/legacy-index.json`、`.agents/tasks/.migration-complete`，以及本 Task 的范围、context、walkthrough 和 evidence。
- Task 135 README `packages/neuro-book/.agents/tasks/135-agent-asset-install-protocol/README.md` 是验证输入，本轮只读核对，未修改、未回滚；其 actual `sha256:f61030bd56975e50a69edd99414a8c62c204ba151840d6f9e4d8b376c53591a7` 被登记为 destination canonical。
- `legacy-index.json.sourceRevision` 与 Task 135 mapping 的 `sourceSha256` 保持不变。
- 新增 walkthrough：`walkthroughs/008-tasker-2026-08-24_12-26-report-pointer.md`。
- Task 当前状态保持 `verifying`；本轮已完成本地验证，尚未提交或执行远端动作。
