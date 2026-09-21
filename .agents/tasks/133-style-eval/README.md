# 文风蒸馏默认值实验 walkthrough

## 目标

在固定 `deepseek/deepseek-v4-flash` 下，用同一 brief 比较无文风约束、当前默认文风、清爽候选和蒸馏候选，随后落地一个可回滚的实验性默认候选；人工盲评和跨题材复核仍是后续门槛。

## 当前证据边界

- 已验证：`.agent/tmp/t133-style-arm-v1c/gongdou/zhenhuan-zhuan/` 有 1 个完整四臂配对，共 4 篇正文；模型为 `deepseek/deepseek-v4-flash`。v1/v1b 是同一题组的缺 control 旧批次，不能合并计数。
- 已验证：蒸馏器输入 5 篇分析，规范输入指纹在普通顺序与 `--shuffle` 下保持一致；普通顺序和反转顺序的审计输入指纹不同。
- 已验证：私有盲评池 API 只返回匿名正文字段，当前本地池有 4 篇、1 个 brief 配对；本地报告生成成功，但当前没有人工 judgment（`judgedRowCount: 0`）。
- 已验证：当前样本的机器读数为 control/current-default/beileng-clean/distilled 的 docScore `9.513/9.243/9.270/6.627`；外部 docPAi 仅存在于磁盘报告，约为 `0.963/0.625/0.370/0.635`，不构成统计结论。
- 未验证：跨 5 个题材的本轮四臂复跑；当前工作区只有 gongdou 的 1 个完整四臂 pair，不能据此宣称跨题材稳健。
- 未验证：用户真实浏览器盲评完成；页面已完成 SFC 解析、请求存在性检查和进度恢复代码检查，但未进行浏览器验收。

因此这一阶段只建立候选与评测链路，不代表“用户已选出胜者”或“跨题材统计已完成”；全局默认在终审前保持不变。

## 2026-08-13 续跑：共享 llmlint guide 的轻小说筛选

- 写前约束使用 `llmlint guide --tier standard --profile evals/report/report.json` 生成；产物为 `71 / 266` 条 active 规则，规范化 SHA-256 为 `d69fdcadc71570f6ccc03c4d0cdefc1b199991f9403b7c2ce00c08c90b41de67`。
- 四臂均注入同一份 guide，再分别追加无文风、原默认文风、北棱清理候选或蒸馏候选；因此这一轮比较只改变文风，不把 guide 收益混入某一臂。
- 新批次版本为 `style-arm-v2`，输出到 `.agent/tmp/t133-style-arm-v2-light-novel/`，目标是 `light-novel/villain-loli` 的 5 个 brief，共 20 篇。旧 `style-arm-v1*` 不参与续跑。
- 私有盲评使用独立数据库 `.agent/tmp/t133-style-arm-v2-private-pool.db`；公开页面只返回 `blindId/body/charCount/pairRef`，不返回 arm、模型、来源或 Revision ID。
- 用户评分使用 `AI 味 0–5`、`想读下去 0–5` 和自由评论；`想读下去` 是舒服度主判据。完成全部匿名评分后再揭示 arm 并生成配对报告。
- 在用户评分和跨题材复核前，NeuroBook 默认值保持原来的 `reborn-villain-loli-magic-girl.first-three-chapters.style`；蒸馏文风仅作为 disabled 候选。

## 实现变更

- `server/agent/profiles/writer-writing-style.ts`：默认预设仍为 `styles/reborn-villain-loli-magic-girl.first-three-chapters.style.md`；蒸馏候选通过独立 bundled 文风资源参与实验，终审后再决定是否切换。
- `assets/workspace/.nbook/agent/profiles/builtin/writer.home/styles/distilled-light-comic-close-perspective.style.md`：新增 bundled 文风，包含定位、视角、句式节奏、对话、情绪、示例、禁区和生成自检。
- sibling `llmlint`：私有盲评池、匿名映射、按 brief/题材报告和蒸馏顺序稳定性工具已落地在对应 worktree；其类型检查仍有既存 `tests/revision-text-workspace.test.ts` 生成类型错误。

## 验证
- NeuroBook：`bun run test -- server/agent/profiles/writer-profile-contract.test.ts server/agent/profiles/leader-assets-profile.test.ts`：19 tests passed。
- NeuroBook 真实加载：`loadWritingStylePresets()` 找到新资源，`buildWritingStyle()` 默认输出 `<writing_style>` 且包含蒸馏正文；legacy/home key 互转结果正确。
- llmlint：盲评页面 SFC 解析成功，且 `loadReviews()` 含 `/api/style-review` 请求；修复 `selectScore` 闭合后关键页面脚本结构可解析；公开 DTO 已收紧为 `blindId/body/charCount/pairRef`，不含 `revisionId`、arm、model、source；草稿恢复改用 `blindId` 索引。
- llmlint：盲评报告重跑成功，`rowCount: 4`、`judgedRowCount: 0`、`pairs: 1`、`judgedPairCount: 0`，机器 `docPAi` 为空是数据库未导入外部检测结果的真实状态。
- llmlint：`bun run typecheck` 修复了本轮 `blind-manifest.ts` 的 arm 类型错误后，剩余既存错误为 `tests/revision-text-workspace.test.ts:97:39` 的 `ruleVerdicts` 缺失。
- 未运行：真实浏览器盲评、五题材四臂生成、用户 judgment 和 docPAi 入库；不能把这些写成通过。
- llmlint web 类型检查：`bun run typecheck` 执行 registry 构建成功，但 `vue-tsc` 输出 `[Vue] Load plugin failed: vue-router/volar/sfc-route-blocks` 后退出码为 0；因此未将其记录为类型检查通过，SFC 解析检查仍单独通过。
