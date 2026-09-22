# M2b 卡文追问：划词入口 + interview.stuck 薄骨架 + ka-wen skill 载荷

Status: implemented
Date: 2026-09-22
相关：docs/milestones.md（M2b 节）、.agents/notes/proposed/feature/2026-09-21-m2-design-refinement.md（形态拍板）、M2a/M2c 两份 implemented 笔记（注入管线与 skill 骨架）

## Problem

作者写作中卡住时，agent 此前只能泛泛安慰；没有「基于当前章节与世界状态的苏格拉底式追问」通道。M2 细化拍板：追问脚本以 skill 形态交付（零返工），划词触发为主入口、聊天手动进入为兜底。

## Decision

三层装配（2026-09-22 访谈拍板）：

1. **薄骨架 profile interview.stuck**：自动继承 M1a 追问闸门（interview. 前缀命中 turn-continuation）；tools 只读 plot + lorebook 写域（无 bash）；登记进 INTERACTIVE_PROFILE_KEYS 物理禁写 manuscript/；AppendingSet 挂 PromiseLedger + MentionedEntities + SkillActivation 三件套。
2. **追问脚本 = ka-wen skill**（assets/workspace/.nbook/agent/skills/ka-wen/SKILL.md）：意图→阻力→代价三连问，一轮只推一层、复述确认再进下一层；软引用 M2a 注入物。
3. **划词主入口**：MarkdownSelectionMenu 加「卡文追问」项 → 复用 inline 选区链路（locateSelectionRange + chip）→ index.vue 切对话态、复用或新建 interview.stuck 会话、自动发出「选段 chip + $ka-wen + 引导语」首条消息。聊天兜底 = 新建会话白名单加 interview.stuck。
4. **顺带 UX 修复**（巡视 UX-1/3/4/5）：有会话自动选最近、会话行加相对时间副行、术语泄漏清理（Session/Workflow/entryType/原始目录名）、「新访谈」入口传对 profileKey。

## Alternatives considered

- AgentMode 加第四值：shared enum + 穷尽 switch + 只读判定 + 前端 + i18n 全动，且 mode 语义是读写权限不是追问脚本——被否。
- 纯 skill 唤起（无 profile）：skill 只在已有对话里由 $key 触发，解决不了划词入口与追问闸门——被否。
- 划词入口复用 inline.editor 通道：inline.editor 不在红线白名单内、仍可写 manuscript（M2.5 才定边界），把追问接在不受红线约束的 profile 上会开口子——被否，走 interview.stuck。inline.editor 缺口已登记 M2.5。
- 划词后由用户手打 $ka-wen：多一步且可忘——被否，入口消息自动带 $ka-wen。

## Consequences

- 收益：卡文场景有了从选段到逐层追问的完整闭环；追问库后续以 skill 形态生长（作者可手搓分享）；UX 四个 P1 清除。
- 影响：profile 白名单三处（前端创建菜单/显示名/i18n）；红线白名单 +1；skill 目录 +1；前端选区链路 +1 事件。
- 已知限制：ka-wen 由入口消息带 $key 触发，聊天手动进入时作者需自己打 $ka-wen 或模型按描述匹配自取（提示词层）；inline.editor 红线缺口留 M2.5。

## Confirmation

- 测试：interview-stuck-profile 10 例 + 红线/闸门扩展 + stuck-interview 8 例 + 显示名契约 3 例全绿；app novel-ide 377 绿；全量 440 绿/3 红全为既有基线；typecheck EXIT=0。
- 真实验收（2026-09-22，项目 m2a-yan-shou-2）：① 浏览器自动化（Playwright/Edge headless）真实划词点击「卡文追问」→ 切对话态、建会话、自动发问、agent 引用选中句追问（开场白/转场句之问）；② 回答后第二轮逐层深入（「这轮只推阻力层」+复述确认）；③ skill-activation 注入 ka-wen 正文、promise-ledger 注入未决伏笔；④ request_user_input 阻塞+结构化选项。