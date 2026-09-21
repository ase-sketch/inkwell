# 指令精简交付记录

## 范围与授权

Leader 按 Task 白名单修改 16 个既有治理/指令文件。用户已授权修改、提交和推送；未执行 PR、合并或发布。产品行为合同未变，未修改全局 Skill、产品资产或检查器。

## 验证证据

- governance:context 退出 0，failures 为空；Work、Task、role/taskRole=leader、独立 worktree 和 docs/w00008-astra-instruction-calibration 分支均匹配。
- governance:check 退出 1，warnings 为空。唯一失败为 `Work Task 缺少 README.md：.agents/works/w00003-neurobook-ui-foundation-migration/tasks/t14-agent-profile-nav-lab-migration/README.md`。主工作区运行同命令得到同一失败；origin/master 的该目录仅跟踪 evidences/product-exclusion-2026-09-04.json，证明是既有无关缺口，未修复。
- docs:check 首次发现 Tasker 相对链接越界，已改正；最终结果以本次交付命令输出为准。
- 未运行产品测试、typecheck、构建、浏览器或真实 Provider/Model；没有模型性能对比数据。

## 审查修复复核

- 修正 `.agents/works/README.md` 的编号登记顺序：登记提交须先进入远端 `master`，实现 worktree 才从包含该提交的基线创建；同步规则明确主工作区被其它 Agent 占用或有未发布改动时不操作、不切换、不强行同步。
- 修正 `docs/testing/README.md` 的纯文档门禁：不运行产品测试、typecheck、产品构建或浏览器；VitePress 投影仍按目录合同运行 `bun run docs:build`。本轮未修改 VitePress 投影，因此未运行 `docs:build`。
- 修复后 `bun run docs:check` 退出 0，`failures: []`，`checkedFiles: 5396`。
- 修复后 `bun run governance:context -- --work w00008-astra-instruction-calibration --task t01-calibrate-instructions` 退出 0，`failures: []`。
- 修复后 `bun run governance:check` 退出 1；唯一失败仍为既有的 `.agents/works/w00003-neurobook-ui-foundation-migration/tasks/t14-agent-profile-nav-lab-migration/README.md` 缺失，warnings 为空；未修复无关缺口。

## 六个场景语义核对

1. 仅检查文档：根 Conventions 与 doc-review 均只读，不生成额外执行链。
2. 改错字并提交：按目标和适用入口读取，testing 的纯文档分支要求结构、链接与语义，不要求产品测试。
3. 按现有合同修 bug：Tasker 与 diagnosing-bugs 允许先源码/日志，再选择聚焦复现，无固定假设数量。
4. 授权任务所需检查通过：testing 复用有效证据，report 不设置回复继续门禁。
5. 未授权真实模型或数据删除：根授权与 .omp 受限清单保留，只阻塞依赖动作。
6. 报告能否推送：report 要求相关 branch、revision、工作树、提交范围、证据与远端授权状态。

以上是 Leader 文档语义自审，不是模型运行时实验。报告格式与验证门禁锚点存在；技能调用模式不被解释为文件读取权限。敏感 Git 历史处置正文未修改。

## 来源与生效

- [OpenAI 模型指导](https://developers.openai.com/api/docs/guides/latest-model)
- [Eric Provencher 原文](https://x.com/pvncher/status/2095991462416490862)

提交推送结果由最终交付报告记录，不预填成功。仓库文本更新不改写当前会话已注入规则，下一次宿主加载才读取新内容。
