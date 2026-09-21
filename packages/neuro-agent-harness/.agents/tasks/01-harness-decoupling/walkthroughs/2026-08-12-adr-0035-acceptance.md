# 第七十四轮：ADR-0035 Acceptance 复审

## 状态

ADR-0035（Session Entry Parent Reference Admission）自第六十三轮实现后保持
Proposed，本轮按原保留条件（同生命周期 P1 收口后重新评估）做独立复审，裁定
**升格 Accepted（standalone Core, first-party Memory/JSONL scope）**，并吸收
3 个 P2 文档项。纯文档轮（无 `src/`/测试变更）；用户保护文件未纳入范围。

## 规划依据

- ADR 目录盘点：ADR-0035 是唯一残留 Proposed（其余 0031-0034/0036 均已
  Accepted）。
- 第六十三轮审查保留条件：「要求同生命周期 P1（abort 与 waiting 同步竞态）
  收口后重新评估」。此后第六十三轮已收口该 P1（abort-boundary 14 条 gate），
  第六十四至七十三轮在同一 admission 家族累积完整证据链。
- NeuroBook parity 扫描：08-12 无 `server/agent` 新提交，本轮不并入。

## 变更

- `docs/adr/0035-session-entry-parent-reference-admission.md`：
  - Status → Accepted（standalone Core, first-party Memory/JSONL scope）；
  - Consequence 措辞修正（P2-3）：legacy 兼容明确指 draft 省略/显式 `null`
    两种写行为，持久化字段自 0.1.0 必填、缺失即 fail closed；
  - Evidence 段补保留条件收口与第六十四至七十三轮证据链（P2-2）：scale
    探针、JSONL replay gate、Invocation/Approval coherence、全仓基线
    `414/0/1703`、commit 链 `8142656 → a18fa05`。
- `docs/adr/README.md` 索引补 ADR-0036 条目并更新 0035 状态（P2-1）。
- `CHANGELOG.md` Unreleased 记录升格。

## 复审结论（Carson，只读）

- Decision 每条与当前实现一一对应（draft 三态解析、六类 fail closed、
  同批前序引用措辞、范围）；
- 三条 Consequences 经源码写入顺序核验与实跑成立（write/plan-array 零部分
  写入、历史损坏读 fail closed、legacy 写行为不变）；
- 保留条件满足：第六十三轮 abort/waiting 竞态与第六十七轮 approval 安全洞
  均收口并有 gate；64-73 轮证据链完整；与已 Accepted 的 ADR-0036 正交兼容；
- 范围排除与 ADR-0033/0036 接受口径一致，不阻塞 standalone Core acceptance。

## 门禁

- 纯文档轮：`bun run verify` 基线沿用第七十三轮 `414 pass / 0 fail /
  1703 assertions`（63 files，typecheck/build 通过）；pack smoke 基线
  `414/0/1703`（113 files，`132.0 kB`/`621.2 kB`）——本轮无 src/测试变更，
  不重复运行。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、第三方 Store（绕道 shared reducer 时只有
  其自身读取路径 fail closed）、Transport/Product 验收继续单独报告。
- 全部 ADR 现为 Accepted；下一轮回到功能演进候选（NeuroBook parity 扫描 /
  Tool·API 组合切片）。

## 独立审查

- 本轮即复审（Carson）：No P0/P1，裁定升格 Accepted；3 个 P2 已吸收
  （索引补 0036、ADR 正文补证据链、legacy 措辞修正）。
