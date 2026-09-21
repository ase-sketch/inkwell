# Agent Works

`.agents/works/` 是 current Work 与 Task 的唯一入口。Work 是 current Task 的强制容器；一个 Work 包含一个或多个 Task，并可通过 `issueId` 引用零或一个 GitHub Issue。Proposal 独立存在，可被多个 Work 引用。

## 目录与身份

```text
.agents/works/
└── w00001-work-title/
    ├── README.md
    └── tasks/
        └── t01-task-title/
            └── README.md
```

- Work 目录使用 `w`、五位非零序号和 kebab-case 名称，例如 `w00001-work-title`。
- Work README 使用 `schema: nbook.work/v1`，`workId` 与目录一致，`issueId` 为 `i<正整数>` 或 `null`。
- Task 目录在所属 Work 内使用 `t`、两位非零序号和 kebab-case 名称，例如 `t01-task-title`。
- Task README 使用 `schema: nbook.task/v2`，`taskId` 与目录一致，并指定唯一正式 `role`：`pm`、`leader`、`tasker` 或 `reviewer`。
- Task 不保存 `actionIssueId`、`agentWorkflow`、`kind`、`worktreeId` 或 `branchId`。Task 正文可记录目标、范围、产物和验证，供协作参考；治理门禁只校验身份、容器和 role。
- `.agents`、`.agents/works`、Work、`tasks` 与 Task 五级 current 路径必须由真实目录项组成；symlink/junction 不形成 Work/Task identity，`governance:check` 与 `governance:context` 都明确拒绝。

## 编号分配与记录位置

Work 的五位序号在项目内唯一，名称不同也不能复用同一序号。各实现 worktree 不独立选择“下一个编号”。

1. 创建新 Work 前，Leader 先与当前并行执行者明确唯一编号分配者；从查号到登记提交完成串行执行。无法确认分配归属时暂停新编号分配，不妨碍已有 Work 的执行。
2. 分配者在保持 `master` 的主工作区核对已登记 Work，以及本地分支、linked worktree 中尚未合入的 Work；已占用编号不复用。多台机器协作时须通过同一个分配者协调，不能各自从本机最大值递增。
3. 在主工作区从当前 `master` 创建最小 Work README 和一个已知可执行的首个 Task，精确暂存并提交这些登记文件；保护用户改动，不混入其它文件。该登记提交必须先经单独授权，并通过 fast-forward 推送或保留该登记提交祖先关系的非 squash 最小 PR 进入远端 `master`，成为后续实现分支的共同基线；在此之前不创建实现 worktree。登记是范围内本地治理动作，不因登记本身授予 push 或其它远端权限。
4. 从包含已进入远端 `master` 的登记提交的最新基线创建实现 worktree。后续 Task、过程记录和证据只在实现分支维护，随实现集成；不同时在 `master` 回填另一份进度。纯规划或跨任务协调 Work 可继续在主工作区维护。

发现两个不同 Work 撞号时，先暂停冲突身份的集成，由分配者确定保留项，并为另一项重新登记未占用编号。同步修改 Work 目录、`workId`、当前引用及关联执行路径，再用 `governance:context` 核对实际身份；Task 的局部序号无需因 Work 改号改变。已发布的历史记录保留原始身份，在当前记录中说明映射。已提交或推送的内容通过后续提交修正，不覆盖另一项工作，不为改号重写历史或强制推送。

这是协作规则，不是自动锁或跨机器编号服务；治理检查通过不能代替分配协调。规则不追溯搬迁已有 Work；现有冲突按上述方式处理。

## 创建与执行

Leader 按已知结果创建 Work，并在 `tasks/` 下创建至少一个可执行 Task。Tasker、PM 或 Reviewer 从 Task 的 `role` 加载 `.agents/roles/<role>/AGENTS.md`；CLI 使用 `--work <workId>`，需要具体 Task 时追加 `--task <taskId>`，显式 `--role` 必须与 Task role 一致。

需要隔离代码改动时，同一 Work 默认共享 `.worktree/<workId>`；branch 继续使用根规则的 `{type}/{refs}-{slug}`，其中 `refs` 使用 Work 编号。恢复时运行 `governance:context` 记录实际 worktree 与 branch；默认路径已属于其它仓库、Work 或不匹配 branch 时报告冲突并停止，不覆盖或另建第二身份。执行身份不写入 Work/Task frontmatter。

Task 产物按需写入所属 Task：叙事记录与 Reviewer 结论进入 `walkthroughs/`，原始命令输出或结构化证据进入 `evidences/`。没有对应产物时不创建空目录；目录、文件名与正文链接不作为治理门禁。

旧 `.agents/tasks/` 与包级 `.agents/tasks/` 只保存 legacy `nbook.task/v1` provenance，不接收 `nbook.task/v2`。历史名称、worktree、branch、PR 与 Task 不迁移。
