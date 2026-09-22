# M2c Skill 双轨骨架：作者级 skill 目录 + $key 真注入 + 红线物理落地

Status: implemented
Date: 2026-09-22
相关：docs/milestones.md（M2c 节）、docs/research/2026-09-21-feature-gap-analysis.md（双轨制调研）、.agents/notes/implemented/feature/2026-09-22-m2a-context-injection.md（注入管线）

## Problem

创作方法论（追问库/审稿量表）需要作者可手搓、可分享的交付形态，TSX profile 只有开发者能写。基座已有 SkillCatalog 半成品：只认 <项目>/.nbook/agent/skills（与系统内置混居）、$key 唤起只提醒不注入正文（文档与实现不符）、交互型 profile 持有 write/edit/applyPatch/bash 且无路径白名单（红线不成立）。

## Decision

三项拍板（2026-09-22 访谈）：

1. **作者级目录**：新立 <项目>/.nbook/skills/{name}/SKILL.md 根，跟书走。SkillCatalog 三级遮蔽：.nbook/skills > .nbook/agent/skills > Install Root；同名整体遮蔽，损坏隔离不回退。harness 三处 ctx.skills 注入点统一传 project root。
2. **显式唤起真注入**：新 turn context kind `skill-activation`（M2a 管线复用）。pendingUserMessage 抓到 $key → SkillCatalog.resolve(key, projectRoot)（窄接口，list+匹配+读正文封装在 catalog 侧）→ 注入 SKILL.md 正文（单技能 4000 字符截断带标记、单轮 3 个上限）。project 早退放宽为逐 kind 判定（skill-activation 不依赖 project）。描述匹配维持提示词层。三个新 turn-context 组件一并注册进可视化编辑器白名单。
3. **红线物理落地**：新模块 profile-write-scope.ts——按 profileKey 的写域白名单（lorebook/ outline/ references/ agents/ .agent/plan/ + 项目根一层 *.md；manuscript/ 及其余一律拒绝），经 ToolExecutionContext.profileKey 现成通道传入 authorized-file-operation；只作用于 write/edit/apply_patch，读不限。leader.default 摘 bash（interview 本无 bash）；两 profile System 区置顶「skill 仅作分析参照、无正文写入权限」声明。

## Alternatives considered

- 沿用 .nbook/agent/skills/ 一个目录：与系统内置混居、种子投影区语义冲突——被否。
- 作者全局 Install Root 共享：失去「跟书分享」形态——被否（可作后续补充，不冲突）。
- 整工具摘除（write/edit 全摘）：lorebook 沉淀链路（M1a/M2a）要改专用工具，开发量大——被否，选路径域白名单。
- 宿主侧关键词匹配注入：误注率高、每轮多一次扫描——被否，描述匹配维持提示词层（与 Claude Code/DSH 同形态）。
- $key 命中后仍只提醒（MentionedSkillsReminder 现状）：验收口径要求「注入其内容」——被否，升级为真注入；未命中 key 仍由旧提醒兜底（两者共存）。

## Consequences

- 收益：作者拷一个文件夹即装方法论；$key 唤起即刻注入正文；不代写红线从提示词自觉升级为授权层物理强制。
- 影响：基座改动面——skill-catalog（+resolve）、profile-turn-context（早退放宽）、harness（+skillResolver 接线）、authorized-file-operation（+profileKey）、profile-dsl-source-parser 与模板编辑器（三组件注册）。
- 已知限制/缺口：① 白名单只管项目相对路径，项目外绝对路径不加新拒绝（拍板口径 b）；② 白名单是 profileKey 硬编码表，新增交互型 profile 须登记（fail-open，可另开任务改 fail-closed）；③ $key 正则吞 CJK 句末标点（既有口径，未改）；④ MentionedSkillsReminder 文案滞后于真注入（未改，避免范围蔓延）。
- **新发现的 M1c 遗留**：install root 仍有 novel-writer-execution 等代写相关 skill，导致模型在红线拦截后会建议「走 writer profile」（已下线）。需另开小任务清理代写 skill 资产。
- 运维教训：profile.ts compile 单文件命令会重写共享 .compiled/manifest.json（T7 实测两次踩坑）；profile 验证统一用 prepare-system-assets.ts --force 或相关测试。

## Confirmation

- 测试：skill-catalog 11 条（三级遮蔽）+ skill-activation 10 条 + 写域 10 条 + 红线 8 条 + dsl/turn-context 扩展用例全绿；agent 域全量 1518 绿 / 5 红全为既有基线（逐条核对）；typecheck EXIT=0。
- 真实 LLM 验收（2026-09-22，项目 m2a-yan-shou-2）：拷入 jin-ji-qiu-wen SKILL.md 即生效，$jin-ji-qiu-wen 唤起后 skill-activation 注入含三问正文+来源+定位语，模型按三问法展开；要求写 manuscript 被物理拒绝且正文文件未被改动（agent 自述「硬红线」）；删除 skill 文件夹后注入消失。