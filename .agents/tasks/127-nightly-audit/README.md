# Nightly Audit / 夜间自主巡检

> Active task directory format: `NN-kebab-case-name/`. Archived tasks move to `docs/tasks/archived/<task-slug>/`.

## Relative documents refs

- Skill 本体：`~/.claude/skills/night-audit/SKILL.md`（用户级，跨仓库通用，**不在本仓库版本控制内**）
- 实现计划：`~/.claude/plans/snug-jumping-duckling.md`
- 运行时状态文件：本目录下 `AUDIT-STATUS.md` / `CHECKLIST.md` / `FINDINGS.md` / `rounds/`，由 skill 首轮自动生成

## User Request / Topic

- 在人类夜间休息时派发任务，持续详细检查当前项目。任务要能一直运行，随时可通知、可恢复。
- **只做检查和简单测试**。不动业务代码，不碰浏览器测试等可能导致系统崩溃或难以恢复的操作。
- skill 需要指定一个目录作为任务追踪目录。
- 通过 goal 或 loop 实现；每轮做了什么都要写进 walkthrough。
- 任务需要边规划边执行——Agent 自主选定方向，避免盲目审查。因此需要一个类 `PROJECT-STATUS.md` 的滚动状态文件。
- 调研 Claude Code 是否支持 loop / 自优化提示词 / Harness 自优化。

## Goal

让夜间闲置额度产出**可被人在早晨 5 分钟内消费**的巡检发现账本，且第二天可无缝续跑。

- **Outcome**：`FINDINGS.md` 持续积累去重后的真实发现；`AUDIT-STATUS.md` 的覆盖率地图逐夜推进。
- **Verification surface**：`git status` 确认改动只落在本目录；`rounds/` 文件能还原每轮的选向理由与执行过程。
- **Constraints**：不改业务代码、不改 git 状态、不起长驻进程、不跑全量测试套件。
- **Boundaries**：只允许写 `docs/tasks/127-nightly-audit/`。
- **Iteration policy**：每轮读 `AUDIT-STATUS.md` 定位 → 选一个方向 → 只读调研 + 受限验证 → 记账 → 回写状态与下一轮入口。
- **Blocked stop condition**：连续 3 轮无法推进时 `PushNotification` 通知并停止。

## ADR / Decisions / Discussion

### 调研结论：Claude Code 的 loop 能力

`/loop` 是内置 skill，签名 `[interval] [prompt]`，底层两套机制：

| 模式 | 触发 | 底层工具 | 特性 |
|---|---|---|---|
| interval | `/loop 20m <prompt>` | `CronCreate` | 到点重新入队，**不依赖上一轮成功收尾** |
| dynamic | `/loop <prompt>` | `ScheduleWakeup` | 模型自定间隔（60–3600s），**回合崩溃则 loop 死** |
| autonomous | `/loop` | sentinel `<<autonomous-loop>>` / `<<autonomous-loop-dynamic>>` | 运行时解析为自主循环指令 |

**关于自优化**：Claude Code **没有内置的 prompt 自改写机制**，loop 每轮把同一段 prompt 原样重新入队。本任务用两条途径替代：状态外置到磁盘（主力，prompt 恒定而上下文自演化，可审计可纠偏）+ 单文件有限自改写 `CHECKLIST.md`（只增不删，防漂移退化）。

### 四项拍板（勿重议）

| 项 | 决定 | 理由 |
|---|---|---|
| 循环驱动 | cron interval，间隔 **4m** | 间隔远短于单轮耗时 ⇒ cron 退化为「一轮结束立刻接下一轮」，零空闲；同时保留撞额度后自愈能力 |
| 追踪目录 | skill 接受目录参数，不绑定本仓库 | skill 装在用户级，跨仓库通用 |
| 写入门禁 | 仅靠 skill 纪律，不写 PreToolUse hook | 避免影响白天正常开发；最终防线是人工 `git status` 复查 |
| 巡检方向 | Agent 自主选定 + 覆盖率地图约束 | 既自主又不盲目重复 |
| 运行窗口 | `until <时刻>` / `for <时长>`，首轮解析成绝对时间戳落盘 | 见下节 |

### 运行窗口与自动停止（2026-07-27 追加）

`/night-audit <dir> until 07:00` 或 `for 6h`，到点自动收尾并 `CronDelete` 自己的循环。另有 `stop` 子命令供手动即时收尾。

两个设计要点：

1. **只在判定为「新运行」时解析一次，存绝对 epoch，之后每轮只做数值比较。** 每轮重解析有两种死法：`until` 跨过截止点后顺延 24 小时，`for` 每轮都算「现在+N 小时」而无限顺延。
2. **截止时间是软的。** cron 只在 REPL 空闲时 fire，到点时正在跑的一轮不会被打断。实际停止时间 = 截止时间 + 最多一轮（约 15 分钟）。需要硬停只能人工中断。

「新运行」的判据见下面的审查修复轮小节——**不能靠命令行参数判断**，cron 每轮重放的 prompt 完全相同。

### 审查修复轮（2026-07-27，xhigh 多代理审查后）

审查规模：54 agent、80 条候选、独立验证后 73 条留存，去重收敛为 **15 个真实缺陷**。其中运行窗口功能**当时完全不可用**——解析脚本被拆成三段共享 `$D` 的片段，而 Bash 工具跨调用不保留 shell 变量。

15 条不是 15 个独立 bug，是 **5 个结构性缺陷**的投影：

| # | 根因 | 投影出的缺陷 |
|---|---|---|
| 1 | 只有「配置」，没有「运行实例状态」 | 首轮无判据（续跑秒停 / `for` 无限顺延）、Phase 7 无幂等（通知风暴）、停滞计数器无字段、孤儿 round 文件 |
| 2 | 用不可靠的字符串匹配做身份识别 | 删 cron job 时路径形态不一致漏杀、前缀包含误杀 |
| 3 | 字段定义与消费点不成对 | 白名单有定义无消费、计数器有消费无定义、严重度有列无判据、预算有上限无计时 |
| 4 | 允许表与禁令表同层级冲突 | `typecheck` 必然写 `.nuxt/` 却被「禁改任何文件」禁掉 |
| 5 | 模式分派缺失 | `report` / `stop` 被 Phase 1「每轮必做不可跳过」吞掉 |

**关键设计突破：用「距上次唤醒的间隔」代替 cron 查询做运行身份判定。**

cron 每轮重放完全相同的 prompt，参数区分不出首轮，判据只能来自盘上。cron 4 分钟一轮 + 单轮预算 15 分钟 ⇒ 正常轮间隔上限约 19 分钟；超过 **30 分钟**必然中间断过（换会话、人手动重来）。这一个判据同时回答「是不是新运行」和「是不是僵尸 job 在 fire」，且不依赖 `CronList` 的输出格式——那是目前唯一没实测过的 API。即便 `CronList` 不可用，后续轮次也会因间隔判据而空转，通知风暴自动消失。

**本轮三项新决策（勿重议）**：禁止委派子代理（子代理拿不到禁令上下文会顺手改代码，数量也不受单轮预算约束）／ Phase 0 建完地基后删掉 cron job 强制人工确认 ／ 连续 3 轮无推进 = 通知并停机。

**明确不做**：不支持运行中途改窗口（冷门需求，且两种解析形态都会导致永不停止）；改窗口用 `stop` 后重开，或手工改盘上的「止」。

### 影响设计的三条机制事实

1. **cron 是往当前会话重新入队，不是开新会话。** 整夜是一个不断变长、反复 compact 的会话。⇒ 会话记忆不可信，每轮必须全文重读 `AUDIT-STATUS.md`；每轮在会话里只留 2–3 行摘要以延缓 compact。
2. **本仓库测试基线本身是噪音源。** 若不登记基线，夜审每晚会稳定产出几十条假发现。
3. **工作区是活动目标，不是快照。** 同一仓库很可能有别的会话在并行工作（人的另一个终端、别的 agent、后台任务）。这不是要加锁，而是决定了证据怎么解读——已落实为 SKILL.md 的「核心纪律二」与三处机制：
   - Phase 1 每轮取**工作区基线**（`git rev-parse --short HEAD` + 变更文件数 + `git diff --shortstat`）写进 RUN 块
   - Phase 4 跑构建型命令**前后各比对一次**：开跑前不一致 → 跳过本轮全部构建型命令降级为纯只读；跑的过程中变了 → 失败结果一律不记 finding，只记「疑似并发干扰，待复查」。理由是并发跑构建**双向污染**（本仓库 typecheck 与 vitest 并发会互相重写 `.nuxt/tsconfig`），副作用外溢到正在工作的人比自己少查一轮严重得多
   - Phase 5 要求 finding 带函数名或代码片段（行号会漂移）、未提交区里写到一半的代码不记 finding；`report` 汇报前复核 `open` 条目是否已被并发会话修掉

## Verification / Test

分三层，前两层人工在场，确认后才允许通宵。

**第 1 层 · 静态自查**（已完成 2026-07-27）

两条 `date` 命令按 skill 里写的形态各跑一次，均单次调用即输出 `epoch + 可读时间`、退出码 0：`until 07:00` → `1785106800 2026-07-27 07:00:00`（当时 02:18，取当日）；`for 6h` → `1785111534 2026-07-27 08:18:54`。末尾 `echo` 顺带消掉了 `[ ] &&` 短路返回 exit 1 被工具报成命令失败的问题。

**第 2 层 · 状态机走查**（人工在场，不真起 loop）

1. `/night-audit docs/tasks/127-nightly-audit` —— bootstrap。检查目录骨架、覆盖率地图切分、噪音基线是否完整；确认 RUN 块状态为 `awaiting-confirmation` 且 cron job 已被删（本次没起 loop，应报告零匹配）。
2. 再跑一次 —— 应识别为**新运行**（距上次唤醒 > 30 分钟），转 `running`，正常巡检一轮。检查 `rounds/` 完整性、`AUDIT-STATUS.md` 回写。
3. 立刻第三次跑 —— 应识别为**同一次运行**（间隔 ≤ 30 分钟），不重解析窗口，读上轮「下一轮入口」并换方向。
4. `/night-audit <dir> report` —— 确认只出摘要，**不建 round 文件、不动 RUN 块**。
5. `/night-audit <dir> stop` —— 确认 Phase 7 先落盘 `finished` 再删 job。
6. 全程结束 `git status` 确认改动只落在追踪目录。

**第 3 层 · 短窗口真跑**

`/loop 3m /night-audit docs/tasks/127-nightly-audit for 12m`，一次验三件事：

- cron 在 REPL 忙碌期间错过的刻度是**跳过还是堆积**成连续多次 fire（文档未写死；若堆积需调长间隔）
- **`/loop` 建的 job 能否被 `CronList` 看到并 `CronDelete`**——未实测，是 Phase 7 的核心依赖
- 短窗口**首轮豁免**是否生效：12 分钟 < 15 分钟单轮预算，应跑满一轮而非开局就收尾

若第 3 层发现 `CronList` 看不到 `/loop` 建的 job，Phase 7 会走「零匹配 → 不删 → 如实报告」分支，后续轮因间隔判据空转，不会有通知风暴；但自动停止将退化为「到点后不再干活，需人工删 job」，届时补记为已知限制。

## Implementation Walkthrough

### 2026-07-27 首轮实现

已完成：

- 调研 Claude Code loop 能力：从 CLI 二进制提取 `/loop` 签名与 sentinel 字符串，读取 `CronCreate` / `ScheduleWakeup` / `Monitor` / `PushNotification` 工具契约，确认 session-only、REPL-idle-only、7 天过期三项限制。
- 新建 `~/.claude/skills/night-audit/SKILL.md`（用户级）：Phase 0 bootstrap + Phase 1–6 轮次协议 + 禁令清单 + 预算失败纪律 + 通知策略 + 停止恢复 + 文件契约。
- 新建本任务目录 README。

**与计划的出入**：产物数量上无出入（计划中的追踪目录文件按设计由 skill 在 Phase 0 生成，未预先手写）。但**质量上有重大出入**：运行窗口的 `date -d` 只在单次 Bash 调用内验证过，写进 SKILL.md 时被拆成三段共享 `$D` 的片段，导致该功能实际不可用。见下一节。

### 2026-07-27 审查修复轮

xhigh 多代理审查（54 agent / 80 候选 / 73 条验证留存 / 收敛 15 缺陷）后按根因重构，5 个结构性根因见上方「审查修复轮」小节。

变更：

- `SKILL.md` 重构（170 → 约 210 行）：新增「分派」节与 RUN 块契约；修好运行窗口解析脚本（两条自包含单行命令）；Phase 0 收尾改为删 job + `awaiting-confirmation` 双保险；Phase 1 重写为运行身份判定表（间隔 30 分钟判据）+ 首轮豁免 + 孤儿轮检查；Phase 4 改为白名单唯一判据、禁令加构建产物豁免与禁止委派子代理；Phase 5 加严重度三级判据与 high 即时推送；Phase 6 更新 RUN 计数；Phase 7 改为先落盘再删 job、basename 完全相等且恰好一个匹配才删。
- 新建 `REFERENCE.md`：`AUDIT-STATUS.md` 其余六节、`FINDINGS.md`、`CHECKLIST.md`、`REPORT` 格式。progressive disclosure——只在 Phase 0 与 report 时读，正常轮不占上下文（对反复 compact 的长会话是实打实的收益）。
- 本 README 同步：补根因分析、修验证计划（原「分四步」实列 5 条，现重整为三层）。

**与计划的出入**：无。三项新决策按拍板落地。

**仍未实测**：`CronList` 能否看到 `/loop` 建的 job——这是 Phase 7 删 job 的核心依赖，已在验证第 3 层单列。

**待办**：验证四步尚未执行，需人工发起。

## Bootstrap 输入（供 Phase 0 使用）

- 允许命令白名单候选：`bun run typecheck`、`bun run runtime:typecheck`、`bun run manager:typecheck`、`vitest run <具体路径>`
- **已知噪音基线**（必须写进 `AUDIT-STATUS.md`）：
  - 全量 vitest 套件基线不稳定，41–53 个文件失败与具体改动无关，用例总数本身浮动
  - `typecheck` 与 `vitest` **不可并发**：nuxt 会重写 `.nuxt/tsconfig` 造成假失败
  - session / harness 套件本身有 5–7 项 flaky
  - `bun test` 子串过滤会误匹配 product 与旧副本，须用精确路径
- 初始模块切分建议：`app/`、`server/`、`shared/`、`scripts/`、`packages/neuro-book-manager/`、`assets/workspace/`、`docs/` + `reference/`（文档漂移）

## TODO / Follow-ups

- [ ] 执行验证四步（bootstrap 轮 → 正常轮 → 续接轮 → cron 堆积实测）
- [ ] 首晚通宵后复盘：发现质量、假阳性率、单轮预算是否合适
- **不同步 `PROJECT-STATUS.md`**：夜审不改业务代码，不触发仓库级状态同步要求。仅当 skill 设计本身变更时更新本 README。

## 已知限制

- 会话整夜只增不减，反复 compact 带来成本与性能代价；loop 内无法自动换 session。
- cron job **7 天自动过期**，长期使用需每周重开。
- 终端关闭或机器休眠 = 循环中断，只能靠磁盘状态第二天续跑。
- 无 hook 硬门禁，越界写入的最终防线是人工 `git status` 复查。
