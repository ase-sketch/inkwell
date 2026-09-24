# llmlint 包规则

`packages/llmlint` 是 AI 文本润色检测与规则审查工具，包含 Agent Skill/CLI、评测 harness 和独立 Web 检测站。

## 边界与依赖方向
- 独立工具包：通过 workspace 依赖 `@notnotype/neuro-agent-harness`；严禁依赖主应用（`packages/neuro-book`）。
- 子工程隔离：`skill/`（可安装发布的 Skill/CLI）与 `web/`（Nuxt/Nitro 检测站）保持各自独立的依赖与 lockfile，不与根 workspace 混淆。

## 底线与验收
- 规则库双向服务：任何规则修改必须同时兼顾写作期引导（`guide`）与审查期检测/修复（`check`/`fix`/`rules`）。
- 语料与隐私安全：私有评测语料、真实模型秘钥及运行数据库严禁提交到仓库。
- 保持 AGPL-3.0-only 许可证边界。
- 验收标准：常规改动通过 `bun run --cwd packages/llmlint typecheck` 和 `bun run --cwd packages/llmlint test`。
