# HANDOFF — Inkwell 交接文档

> 给在本工作区新开会话的 Agent：按本文档接手，不用问用户已经敲定的事。
> 交接时间：**2026-09-22**。状态：**M0 ✅ / M1a ✅ / M1b ✅ / M1c ✅ / M2a ✅ / M2c ✅ / M2b ✅ / M2.5a ✅（码字基本盘四件套：字数状态栏+统一口径 / 分卷建归 / 阅读预览+txt导出 / 敏感词自查，Playwright 四场景实测通过）** / **M2.5b ✅（inline.editor 提案卡确认制：摘直写工具 + propose_edit 只提不写 + 就地提案卡逐条采纳，真实 LLM 验收通过）**；试用四 bug 已修 ✅；下一步 **M2.7**（知识库呈现层）。

## 第一步：按顺序读这些文档

1. `AGENTS.md` / `ARCHITECTURE.md` —— 项目铁律与结构速览
2. `.agents/notes/README.md` —— **笔记规范全文（写笔记前必读）**；目录为 `{lifecycle}/{class}/`
3. `docs/spec.md` / `docs/milestones.md` / `docs/tech-stack.md` / `docs/architecture.md` / `docs/workflow.md` —— 立项五件套（2026-09-21 已按实际进展回写）
4. `.agents/notes/implemented/feature/2026-09-20-m1b-codex-layout-shell.md` —— **M1b 归属笔记（含视觉定稿、归档/分组/空类目等全部演进记录）**
5. `.agents/notes/proposed/feature/2026-09-21-outline-documents-plan.md` —— 大纲/细纲文稿计划（已实现）
6. `docs/research/` 六份调研 —— 现行参考集（机制 / 布局 / 设定分类 / 功能缺口含 Skill 双轨制 / 知识库四流派含朋友需求实证 / M1b 壳层 UIUX 巡视）
7. `.agents/notes/implemented/process/2026-09-20-m0-execution-decisions.md` —— M0 环境坑

**以上全是已拍板结论，不要重新讨论；要改需用户明确推翻并回写旧文档。**

## 项目一句话

Inkwell = fork neuro-book 改造的小说创作辅助 agent：苏格拉底式追问帮作者想清楚设定/剧情，**不代写正文**（「不代写」指 agent 不替作者生成正文，但 Inkwell 本质是写作工具，作者会真实在里面码字——**码字体验/编辑器/写作流算核心面**，评估功能时必须算入）。UI 布局骨架借 Codex 桌面版，**视觉身份是暖色编辑风**（赤陶橙 + 米白 + 全局衬线）。

## 仓库与环境（2026-09-21 实测核实，勿信旧记录）

- GitHub：`https://github.com/ase-sketch/inkwell`（origin，master）。**2026-09-22 仓库重建**：删库同名重建、git 历史重置为单个初始提交（上游 fork 历史与旧提交不再进 git；fork 出处与基座 commit 4590627 见 ACKNOWLEDGEMENTS.md，旧历史备份在 `E:\projects\inkwell-backup-2026-09-22\`）
- 工作区 `E:\projects\inkwell`，原生 Windows
- **bun 实际位置**：`C:\Users\pass\AppData\Roaming\npm\node_modules\bun\bin\bun.exe`（npm 全局装的）。⚠️ 旧文档写的 `C:\Users\pass\.bun\bin\bun.exe` **不存在**；PATH 上的是 `bun.ps1`/`bun.cmd` shim，**Node 内部 spawn("bun") 会 ENOENT/EINVAL**
  - 症状：`migrate:deploy` EINVAL、`workspace-command.test.ts` 7 条全红 "spawn bun ENOENT"
  - 修法（跑任何 bun 相关命令前）：`$env:PATH = 'C:\Users\pass\AppData\Roaming\npm\node_modules\bun\bin;' + $env:PATH`
- ~~git alternates 失效路径问题~~（2026-09-22 仓库重建后随旧 .git 一并消除，新仓库无 alternates）
- 状态根：`C:\Users\pass\AppData\Local\Inkwell\data`（下有 workspace/）。**Linux 旧数据未迁移**（旧机器 `/home/li/.local/share/inkwell`），如需迁移找用户确认
- 开发：`bun run --cwd packages/neuro-book dev` → http://127.0.0.1:3000/
  - 全新环境首跑前：`bun run migrate:deploy` + `bun run migrate:application-state -- --apply`（在 packages/neuro-book 下）
  - **杀 dev server 要连子进程**：nuxi 子进程会残留抢端口与 runtime.lease（报 "Agent Session Store 正被另一实例使用"）。`Get-CimInstance Win32_Process | Where CommandLine -match 'inkwell.*nuxi'` 找齐再 `Stop-Process`
- profile 编译（上游已删 `--system`）：`cd packages/neuro-book && NEURO_BOOK_STATE_ROOT=assets NEURO_BOOK_CACHE_ROOT=.cache bun scripts/build/profile.ts compile builtin/<name>.profile.tsx`
- Windows 出包：GitHub Actions → `windows-portable.yml`（workflow_dispatch）
- 字体：`@fontsource-variable/noto-serif-sc`（打包分发，非网页 CDN）；全局衬线在 `app/styles/editorial-font.css`，极小字用 `.font-ui-sans` 保无衬线

## 当前进度

- [x] **M0** — Fork 基座跑通（2026-09-20）
- [x] **M1a** — 访谈引擎行为闭环（2026-09-20；用户实测通过：阻塞追问 + 逐层不跳层）
  - ⚠️ 挂账部分消解（M2a）：落盘回归已有机器层承接（interview-anchor-writeback.test.ts：schema 解析链 + 编译后 prompt 静态断言 13 条）；**真实 LLM 端到端落盘仍未实测**（需用户走完一次三阶段访谈）
- [x] **M1b — Codex 布局重排**（2026-09-21 用户手工验收通过，三批收口提交：壳代码 / harness 测试修复 / 调研文档，已推送 origin）
  - 交付：Codex 式壳、首次引导卡、会话归档/重命名、设定 9 类目全量、暖色编辑风、大纲/细纲文稿；演进记录与验收证据见归属笔记
- [x] **M1c — 代写引擎整体下线**（2026-09-21 收口）：6 代写/RP profile + writer.home 54 文件 + 代写 SDK 底层 + 2 代写工作流 + rp-tick 文档删除；leader 提示词与参考文档改写为不代写主链；14 测试文件同步；验收=编译 EXIT=0 / app 487 绿 / typecheck EXIT=0 / server 3 红全为既有（stash 对照实验验证）。原范围备注：爆炸半径已侦察复核（6 profiles + writer.home 54 文件 + SDK 底层 + 代写工作流 + 14 个测试文件）；write-review-loop 一并下线、world.engine 保留、chapter-writing.md 评测旅程归档（2026-09-21 拍板）；inline.editor 实测为整个内联 AI 编辑功能本体（NovelPromptBar+controller+会话注入+兼容层），已拍板移出 M1c、M2.5 再定；决策笔记 .agents/notes/proposed/simplification/2026-09-21-writer-engine-removal.md
- [x] **M2a — 长篇上下文三件套**（2026-09-22 收口）：promise-ledger 恒定注入（open 伏笔每轮注入，10 条/1500 字符上限）+ mentioned-entities 按需注入（用户输入+当前章节正文触发，title/aliases/slug 匹配 lorebook，top-5/800 字符）+ 锚点规范（anchors schema 字段 + lorebook-anchors.md 三来源口径 + interview/leader 沉淀 prompt 同步）。机制面：turnContext 上限按 kind 放开、harness +23 行最小接线、当前章节口径服务。验收=agent 域 1491 绿/3 红全为既有基线、profile 编译 EXIT=0、新增测试 37 条全绿+变异测试实证。决策笔记 .agents/notes/implemented/feature/2026-09-22-m2a-context-injection.md（含已知限制：章节就绪门保守、followup 轮无用户输入触发、lorebook 全量扫描无缓存）。**手工验收待用户**（milestones M2a 节场景）
- [x] **M2c — Skill 双轨骨架**（2026-09-22 收口）：作者级 <书>/.nbook/skills/ 目录（三级遮蔽）+ \$key 显式唤起真注入（skill-activation turn context）+ 红线物理落地（profile-write-scope 写域白名单，leader/interview 禁 manuscript 写入+摘 bash）。真实 LLM 验收四项全过。决策笔记 .agents/notes/implemented/feature/2026-09-22-m2c-skill-dual-track.md（含 M1c 遗留：install root 代写 skill 待清）
- [x] **M2b — 卡文追问**（2026-09-22 收口）：划词「卡文追问」入口（MarkdownSelectionMenu+选区 chip 链路）+ interview.stuck 薄骨架 profile（继承追问闸门+红线登记）+ ka-wen skill（三连问，一轮一层）+ UX-1/3/4/5 修复。真实验收：Playwright 划词点击全链路 + 两轮逐层深入 + 注入三件套同轮在场。决策笔记 .agents/notes/implemented/feature/2026-09-22-m2b-stuck-interview.md
- [x] **试用三 bug 修复**（2026-09-22）：①抽屉 watch(open) 命中全局 window.open → 两个 about:blank（改 () => props.open）；②新壳 v-else 分支吞掉 9 个全局对话框 → 设置/个人中心在新壳永不渲染（整块移出分支，模板结构契约测试锁防）；③三个 profile System 段加文案人性化纪律（面向作者 prose 禁 schema 字段名）。验收=30 条聚焦测试绿 + typecheck EXIT=0 + Playwright 实测。决策笔记 .agents/notes/implemented/bug-fix/2026-09-22-novel-ide-global-dialogs-branch.md。**教训：给既有模板加顶层分支时必须审计全局挂载块是否被吞进旧分支**
- [x] **M2.5a — 码字基本盘四件套**（2026-09-22 收口）：字数（shared/text-metrics 去标记口径 + 后端 words 换口径 + 编辑器底部状态栏当前章/选中 + 面板全书/分卷徽章）、分卷（nextVolumePath 建卷 + 拖拽/右键归卷 + 序号维护，isVolumeDirectoryPath 路径判定修复根层误判）、排版（ChapterReadingDialog newsprint+缩进+上下章 + chapter-export txt 单章/整卷/全书）、敏感词（Aho-Corasick scanner + 内置 43 条 + .nbook/sensitive-words.txt 自定义 + 结果面板行号跳转，状态栏入口）。验收=463 测试绿 + typecheck EXIT=0 + Playwright 四场景实测（含自定义词表端到端命中跳转）。决策笔记 .agents/notes/implemented/feature/2026-09-22-m2.5a-writing-fundamentals.md。**留尾：归卷保留原序号语义待试用反馈**
- [x] **M2.5b — inline.editor 提案卡确认制**（2026-09-22 收口）：摘掉 builtin.file.edit/write（只留 read）+ profile 级 propose_edit（锚点精确校验、返回待审标记、零写盘）+ 登记 profile-write-scope 红线双保险；前端就地提案卡（逐条/全部采纳、全部拒绝、再改一版、大 diff 弹 Monaco），采纳经作者保存通道落盘（USER_LOCAL_ACTOR）。契约唯一事实源 shared/inline-proposal.ts。真机验收修掉两个 live bug：流式半截快照渲染崩溃（逐条校验+diff 防御）、提案闩锁时机过早致空替换落盘（status==="success" 才建卡）。验收=36+18 测试绿 + typecheck EXIT=0 + 真实 LLM 全链路（live 出卡/采纳前磁盘不变/采纳后正确改写落盘）。决策笔记 .agents/notes/implemented/feature/2026-09-22-m2.5b-inline-proposal-cards.md。**留尾：live 单条 replacement 超 16KB 受 preview 截断限制；「再改一版」回路真机未单跑（单测覆盖）**
- [ ] 里程碑线：~~M2a → M2c → M2b~~ → ~~M2.5 码字基本盘~~ → M2.7 知识库呈现层 → M3 审稿质疑 → M4 资料阅读 → M5 访谈归档

## 路线拍板（2026-09-21 全部敲定，勿重开）

1. M2 扩为「卡文追问 + 长篇上下文策略 + Skill 双轨骨架」✅（依据 docs/research/2026-09-21-feature-gap-analysis.md）
2. 新增 M2.5「码字基本盘」（字数统计/分卷/章节排版/敏感词自查），M2 后 M3 前 ✅
3. 代写引擎整体下线为 M1c，M1b 收口后立即开工 ✅（决策笔记含备选与实测证据）
4. **知识库需求实证**（朋友，真实作者）：章节锚定的结构化角色/势力知识库 + AI 检索注入；消费时机=聊天讨论+审稿，AI 维护+人工纠偏，不做数据迁移 → M2 设计输入（docs/research/2026-09-21-knowledge-base-taxonomy.md）
5. **M2 细化（2026-09-21 两轮访谈敲定）**：M2 拆 M2a 上下文三件套 → M2c Skill 骨架 → M2b 卡文追问（追问库以 skill 形态交付，零返工）；知识库检索层并入 M2a、呈现层另立 M2.7（M2.5 后 M3 前）；验收口径见 docs/milestones.md 各节，决策与被否方案见 .agents/notes/proposed/feature/2026-09-21-m2-design-refinement.md

## 代写引擎与预设：已拍板整体下线（M1c 执行中）

**用户主张（2026-09-21）**：既然不代写，基座那套 writer 代写引擎与其文风预设（Discord 预设圈的 `writer.home/styles/` 53 个 + `references/` 1 个）就该去掉；文风参考改用写作 skill 项目（oh-story-claudecode、chinese-novelist-skill 等，已在 spec 参考集里）。

**实测结论（重要，别重犯）**：
- 这批预设**在新壳不可达**（profile 下拉是硬编码白名单，只有 leader.default + interview.new-book），确实是死资产
- **但它们被基座 writer profile 硬依赖**：`writer.profile.tsx` 的 `buildWritingPrompt` 强制读 `writer.home/styles/`，目录缺失直接抛 `Writing styles directory not found`，**连锁 15+ 个 profile 契约测试变红**（writer-profile-contract / rp-profiles / simulation-director / leader-assets / profile-sdk-contract 等）
- 本次尝试「删预设」已**回滚**（`git checkout` 恢复 54 个文件）。结论：**单独删预设不成，必须整体下线代写引擎**
- **正确做法（已拍板为 M1c）**：作为独立小里程碑——移除 writer / rp.writer / director / simulator.* 等代写相关 profile，同时清 `writer.home`、`ACKNOWLEDGEMENTS.md` 的预设段、以及引用它们的测试与 leader.default 里的「与 writer 协作」流程。**牵涉面比想象大，需要用户明确授权后专门做**

## M1b 已拍板的决策（勿重开）

1. UI 跟随 Codex 桌面版**布局骨架**；**视觉改为暖色编辑风**（赤陶橙 + 米白 + 全局衬线），不再沿用 Codex 配色
2. 首次使用用**非阻塞引导卡**（不做强制向导）
3. M1b = 布局 + 引导 + 视觉；提案卡确认制另立里程碑
4. 主区情境互换用 CSS order，**不 v-if 重挂载**（保 SSE/会话流）
5. 旧 IDE 壳**藏而不删**，功能逐步迁移
6. 保留卷章树（Plot 工作台迁移后议）；文档顶端轻量文件名标签条
7. 内部文件（agents/、world-engine/ 等）**不进作者界面**；设定抽屉只读
8. **会话列表按书隔离**（既有）+ 单书内按时间分组「今天/昨天/近7天/更早」；会话行悬停有重命名/归档
9. **设定 9 类目全量可见**（空类目标注「暂无条目」，搜索态只显示命中）
10. **大纲/细纲**：`outline/` 资产根（`outline/NNN-outline/index.md` 总纲、`outline/NNN-volume/NNN-chapter/index.md` 细纲）；码字态三区面板、聊天态右侧只读抽屉；**agent 本期只读**（写入需提案卡确认流）

## 关键事实（已核实，勿重复调研）

- 基座 commit 4590627（0.10.3-canary）
- **阻塞机制现成**：`request_user_input` 一调用，harness 即 emit `tool_user_input_required`、会话置 `waiting`、前端锁输入框
- profile 编译器自动递归扫描 `builtin/*.profile.tsx`，源码层无需登记清单
- ~~interview.new-book.profile.tsx 等 assets/workspace/ 文件需 git add -f~~（2026-09-22 已修：包级 .gitignore 锚定为 /workspace/，整树恢复正常跟踪，见 bug-fix/2026-09-22-assets-workspace-git-tracking）
- **新壳主区情境**由纯函数 `app/utils/ide-shell-layout.ts` 推导（`resolveIdeShellView`）；资产投影在 `app/utils/writing-assets.ts`（正文/大纲/细纲三投影）
- **主题纪律**：只消费 `app/utils/theme/README.md` 登记变量；不足时优先用现有变量组合，不新增 Tailwind 调色板
- `outline/` 节点会稳定产生 1 条 `external-content-node` WARN（content-node 根之外）。**对作者不可见**（新壳无 workspaceIssues UI），未处理；要清除需慎重（改 content-node 语义面大）
- **测试框架纪律**：官方 runner 是 vitest（package.json test=vitest run，345 个测试文件 vitest 导入）；bun test 能兼容跑 vitest 导入，但 vitest 跑不了 bun:test 导入——**新测试一律 from "vitest"**（M2a 曾有两个文件误用 bun:test 已修）
- `.compiled/` 编译产物按 packages/neuro-book/.gitignore:28 不入库（构建时生成）；assets/workspace/ 其余文件正常跟踪
- **全量 `server/` 测试既有红（2026-09-21 M1c 后实测，Windows）：3 条**——`profile-compile-worker-preview` 1 条（dry-run preview，stash 对照实验证明与改动无关）、`world-engine-profile` 1 条（`NEURO_BOOK_REPOSITORY_ROOT` 未设）、`file-tools` 1–2 条（bash 用例 Windows 环境抖动）。M1c 前的 9 条记录（rp-profiles/simulation-director/profile-sdk-contract/workspace-files）已随代写下线消解。**`app/` 侧全绿，不要拿 server 的红当自己改坏的**

## 工作纪律

- **证据优先**：本工作区多次中断，接手先 `git status --short` 核真实状态，别信会话记忆里的"已完成"
- 收口三件套：测试绿 + 对照 ARCHITECTURE.md 审边界 + 决策笔记（状态回写 `implemented`）
- 改既有子系统前先搜 `.agents/notes/implemented/` 找归属笔记，**更新归属笔记而非新建重复笔记**
- 子代理路由（以 `list_subagent_models` 为准）：中短任务 `antigravity/gemini-3.8-flash`，长任务/视觉 `command-code/deepseek/deepseek-v4.1-flash`
- **子代理汇报里的归因要独立复核**：本批次有子代理把「我删了文件导致的测试红」误报成「环境损坏，与本次改动无关」——验收时必须自己跑一遍失败用例看真实报错
- run_code 里跑 shell 命令记得带 PATH（见环境节）
- **会话体积纪律（2026-09-21 撞墙后立）**：路由对单次请求体有 2MiB 字节硬上限（与模型 1M token 窗口是两道独立的闸），图片 base64 是大头（8 张截图≈1MB）。① 截图/视觉审查一律派子代理，图片不进主会话，主会话只收文字结论；② 读文件 grep 先行 + 分段读，测试/构建输出重定向到文件只读尾；③ **里程碑/阶段结束即落盘（HANDOFF/notes/research）并开新会话从交接文档恢复**，不硬扛长会话；感觉会话重了主动压缩，别等撞墙（撞墙后当前路由发不出请求，只能切模型再压缩）
