# Task 133：文风评测与默认预设收口

> 状态：已完成并归档（2026-08-15）。

## 用户请求

在固定模型和配对题目下评测多种文风写法，收集人类对 AI 味与想继续读的评分，蒸馏跨题材文风预设，并为参与者提供普通人可读的研究报告和可分发数据包。

## 目标

- 完成四臂盲评：无文风约束、当前默认文风、清爽候选、蒸馏候选。
- 使用人类盲评作为主要证据，机器扫描与外部检测只作对照。
- 输出跨题材蒸馏文风、最终提示词约束和参与者版报告。
- 用最终候选预设对 5 个 brief 各生成 3 次，展示生成稳定性，不把复跑当作新的偏好结论。
- 脱敏并打包报告、数据、预设和复跑正文。

## 最终事实

- 正式人评：20 份正文，5 组 pair，78 条评审提交，owner-primary 完成 20/20。
- owner-primary 四臂中位数，顺序均为 `AI 味 / 想继续读`：
  - control：`1 / 3`
  - current-default：`3 / 2`
  - beileng-clean：`2 / 1`
  - distilled：`2 / 2`
- n=5 只支持方向性描述，不声明统计显著胜者。双侧精确符号检验即使 5/5 同向，最低 p 也为 `0.0625`。
- 蒸馏输入：5 个题组的 26 篇 reference；prompt version `style-distill-v1`；模型 `deepseek/deepseek-v4-flash`；canonical input fingerprint `sha256:830cc7df815d9171697420c89efbb1ae6ef9fb23f4d20157a77639e345ea33f3`；output fingerprint `sha256:57a28676032a471ddb498e89f43212615002eb9bc8ca12995920275908e79`。
- 最终参与者复跑：`deepseek/deepseek-v4-flash`，`render-v2`，5 个 brief × 3 次，共 15/15 成功；15 个正文 body hash 均唯一。
- 复跑使用的 style fingerprint：`sha256:05be52a98a42aa35d080314ed3b933966608c27d00822d03616b773e2a35bf32`。
- 复跑 guide fingerprint：`sha256:890cc47198cc82d69beb5bf3cfe7e559e0afd64cb0bd7dcb89a30ff6e7b3b6c8`。
- 组合约束 fingerprint：`sha256:19e3aa4ba90bb8b5608be638eb984650bf7abdd7acc73ed04a6b8ddcf3d7d6d7`。

## 参与者报告

最终产物在 llmlint 本地临时目录生成，不进入 Git：

- `t133-task-133-participant-report.html`
- `t133-style-participant-report.zip`

报告结构为：结论、阅读词典、比较方法、最终预设、人评结果、最终复跑、边界与下载。报告删除了 OAuth、SSO、部署 walkthrough，只保留预设、提示词组织、人评结果和复跑样例。

报告修复了流程箭头的 Unicode 显示，桌面和 390px 移动视口均无横向溢出，浏览器无 pageerror。

## 验证

- 复跑 manifest：`totalRuns=15`、`successfulRuns=15`、`failedRuns=0`。
- ZIP：28 个条目，必需 HTML、脱敏 JSON、style、蒸馏 JSON、guide、组合约束、manifest 和 15 个正文均存在。
- ZIP 内 `style.md` 指纹与 manifest 一致。
- 脱敏检查未发现 `passwordHash`、`neuroBookUserId`、`AgentInvocation`、`userId` 等字段。
- 页面桌面验收：7 个章节、4 个 KPI、5 个复跑卡片、流程箭头均存在。
- 页面移动验收：`390×844` 下 `scrollWidth=390`，无横向溢出。

## 计划出入

- 原计划将报告输出命名为固定的 `t133-style-participant-report.html`，实际最终报告文件名保留了任务编号前缀：`t133-task-133-participant-report.html`。
- 构建器首跑发现 bundle 子目录未提前创建，补齐 `report/`、`data/`、`preset/`、`final-rerun/` 目录后重建成功。
- 首版 CSS 箭头在浏览器计算样式中显示为转义文本，改为构建时写入真实 `→` 字符后通过验收。
- 报告初版移动端因长指纹溢出，增加 `.footer span { overflow-wrap: anywhere; }` 后通过移动验收。
- 复跑 guide 是 standard、无 eval profile 的参与者演示口径，不声称与生产四臂 guide 完全一致。

## 后续

- NeuroBook 默认文风切换和 writer/critic 反思管线不属于本次 llmlint 归档产物，另行建立产品任务。
- llmlint 下一阶段研究聚焦公开检测入口、竞技场数据模型、作者与 reviewer 双群体评估，先做领域模型和小规模离线实验，再改 Web。
