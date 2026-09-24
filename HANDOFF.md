# HANDOFF — Inkwell 交接文档

> 给在本工作区新开会话的 Agent：按本文档快速进入上下文，已敲定的事实与决策无需向用户重新核实。

## 1. 项目定位与核心事实

- **核心定位**：Inkwell 是 fork 自 [neuro-book](https://github.com/notnotype/neuro-book)（基座 commit 4590627，一次性取材、不跟进上游）改造的小说创作辅助 agent。以苏格拉底式追问帮助作者理清设定与剧情，**绝不代写正文**。
- **关键澄清**：不代写正文不等于只做聊天室——Inkwell 本质是小说创作工作台，作者真实在其中码字。因此**码字体验、编辑器手感与写作工作流同样是系统核心面**，评估任何改动时不可偏废。
- **仓库信息**：GitHub 远端为 `https://github.com/ase-sketch/inkwell`（`origin/master`）。
- **视觉身份**：定稿为**暖色编辑风**（赤陶橙 + 米白 + 全局衬线），样式位于 `packages/neuro-book/app/styles/editorial-font.css`。所有 UI 界面判定须契合此调性。

## 2. 当前状态

- **里程碑进度**：M0 / M1a / M1b / M1c / M2a / M2c / M2b / M2.5a / M2.5b 全部收口 ✅，下一步：**M2.7 知识库呈现层**。
- **索引指向**：
  - 需求、各阶段可验证能力与完整验收记录见 [docs/milestones.md](docs/milestones.md)。
  - 架构变更、实现权衡与被否方案详见 [.agents/notes/](.agents/notes/)（目录树即索引，不设中心索引文件）。

## 3. 怎么跑

在仓库根目录执行常用命令：

- **开发服务器**：`bun run --cwd packages/neuro-book dev`（启动后访问 http://127.0.0.1:3000/；全新环境首次运行须先在 `packages/neuro-book` 下执行 `bun run migrate:deploy` 与 `bun run migrate:application-state -- --apply`）。
- **单元与集成测试**：在 `packages/neuro-book` 下执行 `bunx vitest run`（或靶向单测 `bun run --cwd packages/neuro-book test -- <file-or-pattern>`；测试 runner 统一为 vitest，新测试严禁使用 bun:test 导入）。
- **类型检查**：在 `packages/neuro-book` 下执行 `bun run typecheck`。

## 4. 环境陷阱（单行备查）

- **Bun 真实路径与 PATH 修法**：真实二进制位于 `C:\Users\pass\AppData\Roaming\npm\node_modules\bun\bin\bun.exe`，npm shim 会导致 Node 内部 `spawn("bun")` 报 ENOENT/EINVAL，调用前须补全 PATH（如 `$env:PATH = 'C:\Users\pass\AppData\Roaming\npm\node_modules\bun\bin;' + $env:PATH`）。
- **杀 Dev Server 要连子进程**：停止开发服务须同时终结 `inkwell.*nuxi` 子进程，否则残余进程会占用端口并锁死 `runtime.lease`。
- **持久化状态根**：本地运行数据存放于 `C:\Users\pass\AppData\Local\Inkwell\data`（含 `workspace/`），非源码目录。
- **Profile 编译命令**：修改系统 profile 后，在 `packages/neuro-book` 下执行 `bun scripts/build/prepare-system-assets.ts --force` 重新编译系统资产。
- **仓库历史重置说明**：2026-09-22 仓库已同名重建为单一干净初始提交（彻底移除旧 git alternates 依赖），历史版本备份留存于 `E:\projects\inkwell-backup-2026-09-22\`。

## 5. 给接手 Agent 的话

- **遵守决策规范**：非平凡修改前必读 [.agents/notes/README.md](.agents/notes/README.md) 并遵循五段式笔记模板；涉及已有模块优先查找并更新其归属笔记（Owning Note），不建立重复笔记。
- **尊重既成事实**：`docs/` 与 `.agents/notes/` 中记录的决策均已经用户确认，除非用户主动推翻，不得擅自推翻或重新讨论已敲定的设计方案。
