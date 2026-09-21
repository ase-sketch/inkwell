# Agent Note: M1a 苏格拉底访谈引擎（行为闭环）

Status: implemented

## Problem

M0 基座跑通后，M1 要把「一个模糊点子 → 一版核心设定文档」的访谈闭环做出来。基座现状：leader.default 的 prompt 明确压制追问（leader.default.profile.tsx L343/L362），agent 用纯文本提问导致轮次非阻塞；空态文案笼统，首次打开「意义不明」。M1 验收：真实点子完成一轮访谈产出设定文档，agent 每轮至少一个深入追问，不代写设定。

## Decision

经两轮澄清访谈（2026-09-19 用户逐条确认），M1 分两批交付；本笔记覆盖 M1a（行为闭环），M1b（Codex 布局重排）后置。

1. **I1 新增独立 profile**：`packages/neuro-book/assets/workspace/.nbook/agent/profiles/builtin/interview.new-book.profile.tsx`。编译器自动递归扫描 `*.profile.tsx`，无需登记清单。苏格拉底追问为强制契约；访谈脚本 = 核心设定 → 主角 → 核心冲突逐层追问；追问以开放输入为主、收敛时给 2-4 候选且允许自填；三块齐备后写 lorebook 并总结收尾。leader.default 不动。
2. **I2 闸门双保险**：profile prompt 强指令「每轮末尾必须调 request_user_input」；另在 `server/agent/harness/turn-continuation.ts` 与 `prepare-next-turn.ts` 仿现成 report_result reminder 加兜底：访谈会话（profileKey 前缀 `interview.`）一轮结束时既未调工具也无 waiting → 注入 reminder 打回重跑；调用了任意工具（含写 lorebook 的收尾轮）放行。
3. **I3 最小改动**：`AgentChatFlow.vue` 空态改为居中大标题问句 + 「开始新书访谈」快捷卡片，点击经 `emit('start-interview')` → `AgentChatSurface.createSessionFromHeader('interview.new-book')` 直建访谈会话；新建会话 profile 下拉同步可见；i18n 中英文案同步。布局不动。
4. **设定文档落盘**：按主题分文件落基座法定路径——`lorebook/note/story-concept/index.md`（核心设定 + 主要矛盾）、`lorebook/character/protagonist/index.md`（主角）、待定问题记 `PROJECT-STATUS.md` Pending Questions。world-engine 官方消费 lorebook，无需改存储。
5. **验收节奏**：子代理自检 → 主代理复审 + 起 dev 冒烟 → 用户真实点子手工访谈一轮 → 通过后才进 M1b。

## 执行状态（2026-09-19）

| 项 | 状态 |
|---|---|
| I2 harness 兜底 | ✅ 已落地（turn-continuation.ts / prepare-next-turn.ts，profileKey 取值路径 `snapshot.sessionContext.profileKey` 与 `metadata.profileKey`） |
| I3 空态与入口 | ✅ 已落地（AgentChatFlow.vue / AgentChatSurface.vue / 中英 i18n） |
| I1 访谈 profile | ✅ **2026-09-20 落地**（gemini-3.8-flash 子代理）：interview.new-book.profile.tsx 112 行，manifest 收录，dev 运行时 15 profiles。前两批 v4.1-flash 零产出系机器卡顿，非任务本身问题。注意：上游已移除编译命令的 `--system` 参数，改用 `NEURO_BOOK_STATE_ROOT=assets NEURO_BOOK_CACHE_ROOT=.cache bun scripts/build/profile.ts compile builtin/<name>.profile.tsx`；该文件被 `workspace/` ignore 规则挡住，提交需 `git add -f`（与既有 builtin profiles 一致） |
| I2 既有测试 | ✅ 2026-09-20 修复（补 `needsInterviewReminder: false` 断言字段） |
| I2 新增测试 | ✅ 2026-09-20 补齐：判据层 4 条 + 注入层 1 条，两文件 13 pass / 0 fail（主代理独立复跑核实） |
| dev 冒烟 / 用户验收 | ✅ 2026-09-20 部分通过：dev 首页 200、profile 运行时编译正常；用户真实点子访谈实测确认**阻塞式追问生效、逐层不跳层**。⚠️ **三块齐备后的 lorebook 落盘未实测**（访谈未走完三阶段，UI 太难受中断；事后查数据目录 story-concept 仅为初始化模板）→ 留作 M1b 后回归项 |

## 收口记录（2026-09-20）

里程碑三件套：测试绿 ✅ / 边界审查 ✅（改动面全部落在 I1 profile、I2 harness 兜底、I3 空态面板+i18n，未碰 leader.default 与其余基座）/ 用户手工验收 ✅（范围=阻塞追问+逐层不跳层；**落盘环节未验，挂账**）。M1b（Codex 布局重排）另行立项，输入含用户 UI 反馈与 docs/research/2026-09-20-peer-projects-absorb.md 的张力点清单。

## Alternatives considered

- **直接改 leader.default prompt**：工作量略小，但追问风格污染写作主链，上游跟进冲突面大；违反「基座不动」铁律——否决。
- **仅 prompt 强指令不加 harness 兜底**：基座零改动，但模型不守规矩时该轮无阻塞追问，验收靠概率——否决，改为双保险。
- **M1 一次含布局重排**：周期过长，且布局调整约定需逐条与用户确认——拆为 M1b。
- **单一大设定文档**：演进对比与并行编辑不便——按主题分文件，且恰好吻合基座 lorebook 目录约定。
- **哨兵值判据（用 profileKey 特殊值触发）**：需改 harness 会话协议结构——用 `interview.` 前缀判据零协议改动，覆盖 interview.* 全族。

## Consequences

- M1b（Codex 布局重排）在同族 profile 上复用本批全部行为侧改动；harness 兜底判据用 `interview.` 前缀即天然覆盖 interview.stuck 等后续模式；`review.*` 届时另议。
- `turn-continuation.ts` / `prepare-next-turn.ts` 属基座文件，改动须保持极简并在跟进上游时留意冲突——这是本 fork 第二个基座行为补丁（第一个是 realpath 补丁 64a81dc）。
- 访谈完成判定交给 prompt 层（三块齐备 → 写文档 → 总结），harness 不新增访谈状态机。
- 遗留坑：I3 的 profile 下拉与空态卡片均引用 `interview.new-book`，若 I1 profile 未编译，点击入口会创建 profileKey 不存在的会话——I1 与 I3 是本里程碑不可分割的交付面。
