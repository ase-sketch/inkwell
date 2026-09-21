# AGENTS.md — Inkwell 项目规矩

## 项目定位
小说创作辅助 agent（苏格拉底式追问，不代写正文）。fork 自 neuro-book，AGPL-3.0。

## 铁律
- 基座不动，改造集中：只碰 I1 访谈 profile / I2 会话闸门 / I3 聊天面板 / I4 阅读模块（详见 ARCHITECTURE.md）——2026-09-21 起放宽：不跟进上游后此条约束力降为风险控制，基座层确有必要可改，走决策笔记
- 文档驱动：动代码前看 docs/ 与 .agents/notes/；决策推翻必须同步回写旧文档并留废弃说明
- 里程碑收口三件套：测试绿 + 架构边界审查 + 决策笔记（规范见 .agents/notes/README.md，流程见 docs/workflow.md）
- 文档位置固定：docs/{spec,milestones,tech-stack,architecture,workflow}.md

## 环境
- 原生 Windows 环境；Bun 运行时；fork 为一次性取材、**不跟进上游**（2026-09-21 拍板）；基座层可按路线需要改动，非平凡改动走决策笔记
- 项目位于 **E:\projects\inkwell**（原生 NTFS 分区，此前 Linux 时代的 ext4 软链与 ntfs3 递归遍历/删除红线已随平台迁移失效，2026-09）
