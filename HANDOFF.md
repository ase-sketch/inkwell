# HANDOFF — Inkwell 交接文档

> 给在本工作区新开会话的 Agent：按本文档快速进入上下文，已敲定的事实与决策无需向用户重新核实。

## 1. 项目定位与核心事实

- **核心定位**：Inkwell 是 fork 自 [neuro-book](https://github.com/notnotype/neuro-book)（基座 commit 4590627，一次性取材、不跟进上游）改造的小说创作辅助 agent。以苏格拉底式追问帮助作者理清设定与剧情，**绝不代写正文**。
- **关键澄清**：不代写正文不等于只做聊天室——Inkwell 本质是小说创作工作台，作者真实在其中码字。因此**码字体验、编辑器手感与写作工作流同样是系统核心面**，评估任何改动时不可偏废。
- **仓库信息**：GitHub 远端为 `https://github.com/ase-sketch/inkwell`（`origin/master`）。
- **视觉身份**：定稿为**暖色编辑风**（赤陶橙 + 米白 + 全局衬线），样式位于 `packages/neuro-book/app/styles/editorial-font.css`。所有 UI 界面判定须契合此调性。

## 2. 当前状态

- **里程碑进度**：M0 / M1a / M1b / M1c / M2a / M2c / M2b / M2.5a / M2.5b / M2.7a / M2.7b / M3 / M4 / M5 全部收口 ✅。2026-09-29 用户拍板把缺口调研剩余 P1 注册为 M6–M11（见 docs/milestones.md 末节），**当前进行中：无（M6 已收口）；下一个：M7 章节快照时光机**；后续序：M7 快照时光机 → M8 查找替换 → M9 本章备忘 → M10 会话管理 → M11 全屏专注。
- **索引指向**：
  - 需求、各阶段可验证能力与完整验收记录见 [docs/milestones.md](docs/milestones.md)。
  - 架构变更、实现权衡与被否方案详见 [.agents/notes/](.agents/notes/)（目录树即索引，不设中心索引文件）。

## 3. 路线规划（M6–M11，新会话按此直接执行）

> 2026-09-29 用户拍板：缺口调研（docs/research/2026-09-21-feature-gap-analysis.md）剩余 P1 按此序逐个做。**每个里程碑都走既定 L2 流程**：读本节与对应笔记 → 访谈拍板 → 决策笔记落 proposed → 派发实现 → 真实验收 → 收口（笔记转 implemented + milestones 打 ✅ + 回写本节进度）。划线作者便签（M3 挑刺的另一半）明确未纳入本轮。

| 里程碑 | 目标一句话 | 关键复用点（别重造） | 状态 |
|---|---|---|---|
| M6 对话一键沉淀设定卡 | 消息/选段 → AI 起草设定卡 → 确认 → 落 lorebook | 蓝本=M3 submit_critiques 全链路（shared 契约+窄工具+确认卡+双入口）；归因吃 M5 演进 | ✅ 2026-09-29 收口 |
| M7 章节快照时光机 | 正文打快照 + 快照 diff + 一键还原 | M5 已铺 nb-history timeline/textDiff/restore 与演进区块；快照=在历史日志上打标记点 | 待开工 |
| M8 富文本查找替换 | 章内高亮查找 + 全书替换 | TipTap 挂查找替换插件（Monaco 源码模式已有）；全书替换跨文件注意作者写通道 | 待开工 |
| M9 本章备忘 | 随章节切换的便签区 | 存放别污染字数统计与检索注入；候选位置随访谈定 | 待开工 |
| M10 会话管理补全 | 置顶 + 消息级分支 Fork | M1b 已做归档/重命名/时间分组，在既有会话树上加 | 待开工 |
| M11 全屏专注+打字机滚动 | 快捷键只留稿纸；光标固定中上方 | 纯前端；布局状态已有 ide-shell-layout 三态可扩 | 待开工 |

## 4. 怎么跑

在仓库根目录执行常用命令：

- **开发服务器**：`bun run --cwd packages/neuro-book dev`（启动后访问 http://127.0.0.1:3000/；全新环境首次运行须先在 `packages/neuro-book` 下执行 `bun run migrate:deploy` 与 `bun run migrate:application-state -- --apply`）。
- **单元与集成测试**：在 `packages/neuro-book` 下执行 `bunx vitest run`（或靶向单测 `bun run --cwd packages/neuro-book test -- <file-or-pattern>`；测试 runner 统一为 vitest，新测试严禁使用 bun:test 导入）。
- **类型检查**：在 `packages/neuro-book` 下执行 `bun run typecheck`。

## 5. 环境陷阱（单行备查）

- **Bun 真实路径与 PATH 修法**：真实二进制位于 `C:\Users\pass\AppData\Roaming\npm\node_modules\bun\bin\bun.exe`，npm shim 会导致 Node 内部 `spawn("bun")` 报 ENOENT/EINVAL，调用前须补全 PATH（如 `$env:PATH = 'C:\Users\pass\AppData\Roaming\npm\node_modules\bun\bin;' + $env:PATH`）。
- **杀 Dev Server 要连子进程**：停止开发服务须同时终结 `inkwell.*nuxi` 子进程，否则残余进程会占用端口并锁死 `runtime.lease`。
- **持久化状态根**：本地运行数据存放于 `C:\Users\pass\AppData\Local\Inkwell\data`（含 `workspace/`），非源码目录。
- **Profile 编译命令**：修改系统 profile 后，在 `packages/neuro-book` 下执行 `bun scripts/build/prepare-system-assets.ts --force` 重新编译系统资产。
- **仓库历史重置说明**：2026-09-22 仓库已同名重建为单一干净初始提交（彻底移除旧 git alternates 依赖），历史版本备份留存于 `E:\projects\inkwell-backup-2026-09-22\`。

## 6. 给接手 Agent 的话

- **遵守决策规范**：非平凡修改前必读 [.agents/notes/README.md](.agents/notes/README.md) 并遵循五段式笔记模板；涉及已有模块优先查找并更新其归属笔记（Owning Note），不建立重复笔记。
- **尊重既成事实**：`docs/` 与 `.agents/notes/` 中记录的决策均已经用户确认，除非用户主动推翻，不得擅自推翻或重新讨论已敲定的设计方案。
