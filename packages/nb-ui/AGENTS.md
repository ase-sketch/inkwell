# nb-ui 项目规则

`@notnotype/nb-ui` 是独立 Vue/Nuxt 共享 UI 组件库，提供基础原语、设计 token 与主题支持。

## 边界与依赖方向
- 纯 UI 呈现库：供前端主应用消费，严禁反向依赖主应用页面、业务 store 或业务 API。
- 隔离调试：Playground 调试代码仅保留在 `playground/`，严禁从包入口导出。

## 底线与验收
- 语义规范：组件样式仅消费已登记的语义 token 与 `src/tailwind.css`，禁止为单个组件侵入公共基座。
- 产物构建：`dist/nb-ui.css` 是提交资产，组件类名、样式或 token 修改后必须运行 `bun run build:css`。
- 验收标准：改动后运行 `bun run test`、`bun run typecheck` 与 `bun run build:css` 确保全绿。
