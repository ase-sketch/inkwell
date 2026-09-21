# Task 133：文风蒸馏评测与默认预设收口

> 状态：已完成并归档（2026-08-15）。本文件保留历史实验与执行证据；后续产品默认文风已切换到跨题材蒸馏候选。

## 目标

在固定 `deepseek/deepseek-v4-flash` 下，用同一 brief 比较无文风约束、当前默认文风、清爽候选和蒸馏候选；完成 20 份四臂盲评、跨题材蒸馏、参与者报告和最终预设复跑，并将最终候选切换为 NeuroBook writer 的默认文风。

## 最终事实

- 正式人评：20 份正文、5 组 pair、78 条提交，owner-primary 完成 20/20。
- owner-primary 中位数按 `AI 味 / 想继续读`：control `1 / 3`，current-default `3 / 2`，beileng-clean `2 / 1`，distilled `2 / 2`。
- n=5 只支持方向性描述，不宣布统计显著胜者；双侧精确符号检验即使 5/5 同向，最低 p 也为 `0.0625`。
- 蒸馏输入为 5 个题组的 26 篇 reference。蒸馏版本 `style-distill-v1`，模型 `deepseek/deepseek-v4-flash`，canonical input `sha256:830cc7df815d9171697420c89efbb1ae6ef9fb23f4d20157a77639e345ea33f3`，output `sha256:57a28676032a471ddb498e89f43212615002eb9bc8ca12995920275908e79`。
- 最终候选复跑使用 `render-v2`，5 个 brief 各生成 3 次，共 15/15 成功；15 个正文 body hash 均唯一。
- 默认文风文件：`assets/workspace/.nbook/agent/profiles/builtin/writer.home/styles/distilled-light-comic-close-perspective.style.md`。
- 默认预设常量：`styles/distilled-light-comic-close-perspective.style.md`。

## 参与者报告

参与者版研究报告聚焦最终预设、提示词工程、人评结果和 5 个 brief 的三次生成样例，删除 OAuth、SSO、部署 walkthrough。报告已通过桌面与 `390×844` 移动端验收，流程箭头显示为 `→`，无 pageerror 或横向溢出。

## 实现变更

- `server/agent/profiles/writer-writing-style.ts`：默认预设切换为 `styles/distilled-light-comic-close-perspective.style.md`。
- `assets/workspace/.nbook/agent/profiles/builtin/writer.home/styles/distilled-light-comic-close-perspective.style.md`：更新 label、sourcePreset、name 和 `enabled: true`，正文保持最终复跑采用的 style 合同。
- sibling `llmlint`：完成 20 份盲评冻结、26 篇跨题材蒸馏、5×3 最终复跑和参与者版分发包；llmlint 产物不进入 NeuroBook 仓库。

## 验证

- `loadWritingStylePresets()` 能加载新默认资源，`buildWritingStyle()` 输出包含新预设正文。
- 原有 writer profile contract 测试中的 `defaultWriterSettings()` 使用 `DEFAULT_WRITING_STYLE_PRESET`，随常量切换到新文件。
- 最终预设正文的规范 trim 指纹：`sha256:05be52a98a42aa35d080314ed3b933966608c27d00822d03616b773e2a35bf32`。
- 旧默认预设文件保留，供用户已有配置和回滚使用；系统默认值不再指向旧文件。

## 计划出入

- 原 walkthrough 在人评和跨题材复核完成前要求保持旧默认。实际在最终 15 次复跑、报告和 ZIP 验收完成后，按用户明确请求切换默认，因此旧的“候选未切换”描述不再适用。
- 参与者版复跑 guide 是 standard、无 eval profile 的演示口径，不声称与生产四臂 guide 完全一致。

## 后续

- writer/critic 反思管线、公开检测入口和竞技场生态另立任务，不在本任务中混入实现。
