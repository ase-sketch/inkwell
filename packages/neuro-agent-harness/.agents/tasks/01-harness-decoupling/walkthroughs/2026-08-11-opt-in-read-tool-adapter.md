# 第五十九轮：Opt-in Read Tool Adapter

## 状态

public red→green、focused/full/package gate、production / API-domain / test-sensitivity 三路窄复审均已完成；ADR-0033 已在 standalone Core Read Tool Adapter 范围接受，第五十九轮收口。本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

1. ADR-0006 A1 只拒绝全局 token、默认 filesystem-backed `read` Tool 和路径/Workspace policy；它没有禁止一个由消费者显式绑定 Capability 的纯适配器。
2. 当前 consumers 重复编写相同代码：基础 `reference/offset/limit` 参数 schema、`context.capabilities.require(token)`、`ReadResult.content` 到 Tool content、`provenance/truncated/nextOffset` 到 Tool details。
3. 这组映射不解释 host semantics：
   - `reference` 仍是 opaque string；
   - `offset`/`limit` 只做 finite-number 基础 shape 校验，不固定整数、起点、范围或单位；
   - 权限、path/URI、Workspace、approval 与 provider lifecycle 仍由宿主负责。

## 领域决定

- **Read Tool Adapter** 是把宿主授权的 `ReadCapability` 事实映射为模型可见 ToolResult 的可选适配层。
- `createReadTool({capability, name?, description?})` 必须由调用方显式提供 CapabilityToken；默认 `name`/`description` 只是 Tool metadata convenience，不是默认注册。
- factory 不创建 token、不打开 Provider、不读取文件、不决定路径权限、不添加 approval policy；宿主需要更强 schema 或审批时仍可手写 Tool。

ADR-0033 已接受：[Opt-in Read Tool Adapter](../../../adr/0033-opt-in-read-tool-adapter.md)。

## 实现

- 新增 `src/read-tool.ts`，导出 `ReadToolArguments`、`ReadToolOptions`、`createReadTool`。
- `ReadToolArguments` 使用 `JsonObject & {reference; offset?; limit?}` type alias，避免公开 `.d.ts` 在 `exactOptionalPropertyTypes` 下出现 index-signature 冲突。
- `createReadTool` 复用普通 `defineTool`/CapabilityScope，保留定义的 `provenance`、`truncated`、`nextOffset`，无 optional details 时省略 `details`。
- 根 `src/index.ts` 导出 factory 与两项 public types。
- `scripts/pack-smoke.ts` 的 Bun/Node consumers 同时编译并执行 factory、Capability token、arguments/options types。

## Public TDD 与审查

新增 `tests/read-tool-factory.test.ts` 3 条测试：

1. custom name/description、opaque request、context capability、完整 details 和 durable transcript；
2. invalid reference / non-finite pagination 被基础 schema 拒绝，EOF 结果省略空 details；
3. Provider failure 进入普通 Tool error path。

初次 test-sensitivity review 提出 4 个 P2：缺 description 断言、缺空 details、缺 schema invalid、对 Scripted runtime 的覆盖范围。前三项已补；ScriptedModelRuntime 是现有 provider-neutral 黑盒 runtime，未引入真实 provider 依赖，post-fix review 无 P0/P1/P2。

## 全仓门禁

```text
bun test tests/read-tool-factory.test.ts tests/read-capability.test.ts
5 pass / 0 fail / 30 assertions

bun run verify
341 pass / 0 fail / 1469 assertions
52 test files
typecheck + build passed

bun run pack:smoke
prepack: 341 / 0 / 1469
113 files
122.1 kB package / 578.4 kB unpacked
Bun + Node ESM consumers passed
```

## 当前未验证

真实 NeuroBook/Cosmos read Tool、真实文件系统/Workspace、权限与 approval policy、图片/二进制、HTTP/SSE Transport、第三方 Provider/Store 与产品 read UI 仍未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
