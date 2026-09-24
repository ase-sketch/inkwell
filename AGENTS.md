# AGENTS.md — Inkwell 项目规矩

> 面向 AI 编码代理，只写意图、底线与验收标准，不写战术级过程。全局约定见 ~/.dsh/AGENTS.md。

## Quick Commands

- 构建：`bun run --cwd packages/neuro-book build`
- 单测：`bun run --cwd packages/neuro-book test -- <file-or-pattern>`
- 类型检查：`bun run --cwd packages/neuro-book typecheck`

## 项目定位
小说创作辅助 agent（苏格拉底式追问，不代写正文；本质是创作工具，码字体验算核心面）。fork 自 neuro-book，AGPL-3.0。视觉身份为暖色编辑风（赤陶橙 + 米白 + 全局衬线）。

## 核心红线与底线
- **基座层变更有据**：基座为一次性取材、不跟进上游（2026-09-21 拍板）；允许按路线修改，但需控制爆炸半径，非平凡改动走决策笔记。
- **文档先行与一事一处**：动工前查阅 `docs/` 与 `.agents/notes/`；架构边界见 `ARCHITECTURE.md`，设计决策见笔记；推翻决策必须回写旧文档。
- **里程碑收口门禁**：测试通过 + 架构边界审查无越界 + 决策笔记已落盘（规范见 `.agents/notes/README.md`）。
- **代码与测试规范**：测试 runner 统一使用 vitest，新测试一律 `import from "vitest"`；界面文案面向小说作者，不说工程黑话。

## 环境
- 原生 Windows 环境，Bun 运行时，工作区位于 `E:\projects\inkwell`。
