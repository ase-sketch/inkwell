# 第七十九轮：CHANGELOG 补录与全量对应审计

## 状态

第六十六轮审查（Planck P2-2）曾指出 CHANGELOG 未补「（及 63–65 轮）」的公共
行为变化记录，一直未收尾。本轮做全量对应审计：发现 0.1.0 之后 46 个 feat/fix
提交中 11 个（含第六十三轮与第六十二轮 compaction guard）无任何 Unreleased
条目，全部补录。纯文档轮；用户保护文件未纳入范围。

## 规划依据

- 第六十六轮审查（Planck P2-2）明确提示：「CHANGELOG 随包发布、第六十二轮
  同类变更曾记录，本轮（及 63–65 轮）未补」。
- 逐项核对口径：改变公共行为或合同的分支（feat/fix）需要 CHANGELOG 条目；
  纯测试/审计轮（64 探针、65 gates、70-78 消费切片）不写条目；文档轮在改变
  公共合同状态时也会写条目（第 74 轮 ADR-0035 Accepted 即为例）。

## 变更

- `CHANGELOG.md` Unreleased 补录 11 条：第六十三轮 parent admission；
  第六十二轮 compaction guard；ADR-0005 contextProviders；ADR-0006
  ReadCapability；ADR-0007 owner fence；ADR-0008 abortGraceMs；ADR-0010
  modelContextAppending；ADR-0011 MessageIdentity；ADR-0012
  createAgentMessageEntryDraft；ADR-0013 turn_end(failed)；interrupted
  reconciliation 收敛。

## 对应审计（2026-08-12）

`git log --oneline 07d1ae8..HEAD` 共 81 个提交、46 个 feat/fix 提交；其中
35 个已有条目（34 个自带 + `031edae` 被第四十七轮 dispose 条目覆盖），
**11 个本轮补录**：`8142656`（parent admission）、`f5e8f8b`（compaction
guard）、`08e63f6`（contextProviders）、`c6480a4`（ReadCapability）、
`768e5c9`（owner fence）、`cfa905b`（abortGraceMs）、`6a195f0`
（modelContextAppending）、`5744744`（MessageIdentity）、`fd1a9df`
（createAgentMessageEntryDraft）、`54b5ead`（turn_end failed）、`0da0cf7`
（interrupted 收敛）。其余提交为 docs/test 轮，按口径不需要条目
（`de9b41f`、`3f7ab83`、`c3d5138`、`bbf9022` 与 70-78 各轮）。

Unreleased 现有 48 条（含本轮补录 11 条），与 0.1.0 之后全部 feat/fix
分支对应；README/CONTEXT 抽查无漂移（parent admission、forkSession、
invocationResultFromSnapshot 已在各自轮次同步）。

## 门禁

- 纯文档轮：`bun run verify` 基线沿用第七十八轮 `419 pass / 0 fail /
  1746 assertions`（67 files，typecheck/build 通过）；pack smoke 基线
  `419/0/1746`（113 files）——本轮无 src/测试变更，不重复运行。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE 连接、浏览器/产品和生产验收仍未运行。
- 审计覆盖 0.1.0 之后的 feat/fix 分支；更早提交（0.1.0 内）不再追溯。

## 独立审查

- 只读独立审查（Aquinas）：补录条目与实现逐点吻合（reducer 三态解析、
  `assertSessionEntryGraph` 六类 fail closed、ADR-0035 状态准确）、格式一致；
  保护文件未触碰。**No P0 findings。**
- P1 已吸收（审查发现审计完整性声称不成立）：0.1.0 之后 46 个 feat/fix 提交
  中另有 10 个无条目（ADR-0005/0006/0007/0008/0010/0011/0012/0013、
  interrupted 收敛、第六十二轮 compaction guard），全部补录（共 11 条）；
  walkthrough 表格误报 compaction 已覆盖的行已修正。
- P2 已吸收：归因修正为第六十六轮审查（Planck P2-2）；叙事区分「纯测试轮
  不写条目」与「文档轮改变合同状态时写条目」（第 74 轮为例）；「一一对应」
  表述改为按 feat/fix 分支口径。
