# 第六十一轮：Read Tool Adapter public surface audit

## 状态

完成 `createReadTool` 公共 surface、声明类型、package consumer 与 ADR-0006/0033 交叉审计；没有发现遗漏或冲突。本轮为只读审计 + 文档增量，不修改生产代码、测试或 public API。

## 审计范围

- 根导出：`src/index.ts` 导出 `createReadTool`、`ReadToolArguments`、`ReadToolOptions`；
- 实现：`src/read-tool.ts` 的显式 CapabilityToken、基础 schema、details mapping 与 Tool error path；
- package：`scripts/pack-smoke.ts` 的 Bun/Node ESM value/type import、factory 实例化与 strict TypeScript compile；
- 合同：README、CHANGELOG、CONTEXT、ADR-0006、ADR-0033、Task walkthrough；
- 受保护文件：`docs/architecture.md`、`docs/pi-adapter-design.md`、`tests/context.test.ts` 仍未进入本轮范围。

## 证据

- `rg` 全仓检索确认新名称、ADR、root export、Task link 和 package smoke 引用均存在且指向同一 opt-in 语义；
- `bun run verify` 已通过 `341 pass / 0 fail / 1469 assertions`；
- `bun run pack:smoke` 已通过 `113 files`，Bun/Node consumer 同时检查 value 与 type exports；
- 首次 pack smoke 的 `.d.ts` optional index-signature 冲突已由 `ReadToolArguments = JsonObject & {...}` 修复，并在 Node strict compile 中复验。

## 结论

- 没有新增 API、ADR 或代码修复；
- ADR-0006 的“无默认 Tool/无全局 token/无 filesystem/path policy”与 ADR-0033 的“显式 Capability-bound factory”不冲突；
- 真实 NeuroBook/Cosmos read Tool、文件权限与产品 UI 仍未验收，不能由 package smoke 外推。
