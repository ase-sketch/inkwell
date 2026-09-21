# 第一百零七轮：ADR-0038/0039/0040 升格 Accepted

## 状态

纯文档轮：三份 Proposed ADR 的证据门禁已分别在第 100/103/104 轮通过独立审查，本轮补录验证数字与审查结果并升格 Accepted。无 src/测试行为变更（工作区口径，含用户保护 tests/context.test.ts 的前序未提交改动，未纳入本轮）。

## 外部证据复核

- NB（HEAD 844abc29）server/agent 自 08-08 仍无新提交；Cosmos（HEAD 61ed21e）无新提交、Task 06/07 仍走 nb-workflow 收敛路线——无新吸收项，转入 ADR 升格。

## 升格依据（逐份）

- ADR-0038（窗口保护）：NB assertContextWithinWindow 证据 + model-context-window 5 条测试 + 第 100 轮审查（无 P0；1 条 P1 假阳性钉子已修复，3 条 P2 吸收后无未解决 P0/P1）；focused 104/0/423、全量 491/0/2007、pack:smoke 通过。
- ADR-0039（自动注入）：NB 产品测试（neuro-agent-harness.test.ts:6685/6726-6767）+ 消费方迁移 + auto-inject 范围测试 + 第 103 轮审查（无 P0/P1）；focused 77/0/417、全量 500/0/2031、pack:smoke 通过。
- ADR-0040（内容块）：NB 黑盒 #3/#6 语义 + 4 条 seam 测试 + 第 104 轮审查（无 P0/P1）；focused 79/0/420、全量 504/0/2047、pack:smoke 通过。

## 变更

- 三份 ADR：Status 升格 Accepted（standalone Core scope），Evidence 节补录验证数字、审查代理与吸收结论，并保留真实宿主/Provider 验收边界。
- Task README：第 100/103/104 轮 bullet 与 checklist 的 ADR 状态同步为 Accepted；CHANGELOG Unreleased 补升格条目。

## 门禁

- - 纯文档轮：无 src/测试行为变更（用户保护 tests/context.test.ts 的前序改动除外），不重跑测试；第 105/106 轮基线（全量 87 files、508/0/2059、pack:smoke 152.1 kB）仍为当前基线。

## 未验证与保留边界

- 各 ADR 正文保留的真实宿主/Provider 验收边界不变（真实 hydrate、双写迁移、窗口口径）。

## 独立审查

- 待独立审查代理复核（只读）：三份 ADR 的升格证据与第 100/103/104 轮 walkthrough/审查结论一致、Status 与 Task README/CHANGELOG 同步、无过度声明。
