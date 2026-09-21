# nb-ui 项目规则

本包位于 `packages/nb-ui`，遵循仓库共享 Agent 合同 [`../../AGENTS.md`](../../AGENTS.md)。本文件只保留 nb-ui 的项目专属规则，不复制根共享正文。

本包是 NeuroBook 的独立 Vue/Nuxt 组件库。任何修改都必须保持公共组件、主题包和 playground 三个表面一致。

## 开工前

- 修改组件、样式、主题、配色、token、playground 或导出前，必须读取 [`docs/ui-development-spec.md`](docs/ui-development-spec.md)。
- 修改视觉规则时再读取 [`docs/design-language.md`](docs/design-language.md)；修改主题格式或主题包时再读取 [`docs/authoring-themes.md`](docs/authoring-themes.md)。
- 阶段 2 以 NeuroBook 主仓 `app/components/common/` 的同名组件为功能基准；只读主仓，阶段 3 前不修改主仓业务代码。
- 修改公开符号前查完本仓引用和 NeuroBook 主仓同名组件/调用方。迁移必须更新全部本仓调用方、测试、README 与 playground 登记。

## 实施

- 规范与代码同步演进：开发、审查、微调或重构组件时，随时主动更新 [`docs/ui-development-spec.md`](docs/ui-development-spec.md) 与相关 UI 规范，使规范文档始终作为活文档与代码实现严格对齐。
- 公共交互优先由 Reka UI 原语承担；原生元素已经提供完整语义和键盘行为时保留原生实现。
- 组件只消费已登记的语义 token 与 `src/styles.css` 公共基座。新增变量先判断归属，禁止为单个消费点增加公共 token。
- playground 调试代码留在 `playground/`，不从包入口导出。组件实验必须在 `/lab` 登记；完整组合仍在 `/components` 验收。
- `dist/nb-ui.css` 是需提交的构建产物。组件类名、图标、token 或 `src/styles.css` 变化后运行 `bun run build:css`。

## 完成门禁

按顺序运行：

```bash
bun run test
bun run typecheck
bun run build:css
bun run test:e2e
git diff --check
```

UI 行为或观感变化还必须在真实 playground 中验收桌面与 390px 窄屏；读取真实元素的计算样式，不能只读变量。阶段 2 结论必须标注“未经 NeuroBook 主仓接入验证”。
