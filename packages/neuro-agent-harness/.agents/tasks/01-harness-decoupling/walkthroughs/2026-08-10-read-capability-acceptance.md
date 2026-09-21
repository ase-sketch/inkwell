# 第二十三轮：ReadCapability shape-only acceptance

## 结论

ADR-0006 已在 standalone Core shape-only 范围内接受。接受内容是 `ReadRequest`、`ReadResult`、`ReadCapability` 的最小 host-neutral 类型，以及它对既有 Invocation-scoped Capability 生命周期的复用。

本轮没有增加默认 `read` Tool、文件系统 Adapter 或共享 token singleton。真实路径解析、权限、Workspace、图片和输出策略仍由宿主负责。

## NeuroBook 对照

NeuroBook 当前 `read` 是完整产品 Tool：

- `offset` 是 1-based 行号，`limit` 是最大行数；
- Project-bound Session 使用 Project Workspace / Project File Address；
- 绝对路径、symlink 和跨 Project 访问经过宿主授权；
- 图片返回 attachment，并受字节/像素预算约束；
- lorebook/manuscript read 会写 Context Access 辅助状态；
- bash output locator、行号格式、截断提示和输出预算属于产品 UX。

这些语义无法从 `ReadCapability` 的 opaque reference 推导，也没有进入 Core。standalone 的 numeric offset/limit 不指定单位、起点或范围；Tool schema 和 Provider 必须共同定义并校验。

## 发现并修正的安全边界

原 ADR 声称 Core 不把 reference 写入 Session。这个表述与真实 transcript 合同相反：

- 模型产生的 Tool call arguments 会作为 assistant message 持久化；
- Tool Adapter 返回的 details 会作为 ToolResult message 持久化；
- 因此 reference、provenance、truncated 和 nextOffset 可能出现在 Snapshot、replay、export 或日志。

本轮新增公开 Snapshot 断言冻结该行为，并同步修正 `src/capability.ts` JSDoc、README、CONTEXT 与 ADR。Capability 对象和授权视图本身仍不持久化，但 reference/provenance 必须使用可持久化的非 secret identifier，不能携带 credential、签名 URL 或 bearer secret。

## API 取舍

### Token ownership

Core 不导出全局 read token。定义 Tool/Profile 的集成模块创建 token，并把同一 token instance 交给 Provider。这样多个宿主或 authority 不会只因为名字相同而碰撞。

### Pagination

`offset` / `limit` 只是 numeric hint。Core 不规定：

- 行、字节、记录还是其它单位；
- 0-based 或 1-based；
- integer/range/max page size；
- continuation 是否仍被授权。

这些由宿主 schema/Provider 决定。

### Truncation

Provider 省略资源内容时必须返回 `truncated: true`；如果存在 numeric continuation，可以返回 `nextOffset`。部分内容不一定存在可继续位置，Core 也不从 `nextOffset` 推断权限、完整性或资源是否稳定。

`ReadResult` 保持结构化 host contract，Core 不增加运行时 validator；不一致组合是 Provider/Tool Adapter 缺陷，不由 Harness 猜测修复。

## 测试变化

- fixture 明确标注自己选择 zero-based offset，避免把测试 schema 误读为 Core 语义；
- Provider 拒绝不再由 fixture Tool 自己 catch，而是直接抛出，证明 Harness 通用 Tool error path 生成 `isError` result；
- 成功场景核对 opaque request、content/provenance/truncated/nextOffset 透传，并从公开 Snapshot 验证 durable transcript。

Generic Capability tests 继续覆盖每 Invocation open、多 turn 复用、结束 close、缺失 Provider、失败和 abort/late-open cleanup。

## 验证

Focused：

```text
bun test \
  tests/read-capability.test.ts \
  tests/context-provider-capability.test.ts \
  tests/harness.test.ts

13 pass
0 fail
63 expect() calls
```

全仓：

```text
bun run verify

122 pass
0 fail
613 expect() calls
Ran 122 tests across 32 files.
```

包边界：

```text
bun run pack:smoke
```

`prepack`、npm tarball、Bun runtime consumer 和 Node ESM TypeScript consumer 均通过；消费者直接从包根编译 `ReadRequest` / `ReadCapability`。

## 独立审查

独立只读 reviewer：

- 未发现 P0；
- 未发现 Core 实现层 P1；
- 发现 durable reference 文档错误这一项 P1；
- 发现 continuation 组合与 fixture offset 起点两项 P2；
- 确认 token 不需要 singleton，Provider error 走通用 Tool error path，shape-only seam 修正上述表述后可以接受。

本轮已修复全部 reviewer finding。第二次 post-fix 独立只读复核确认 P1/P2 均已关闭，没有新增 P0/P1 或 scope overclaim。

## Residual

仍未验证或不属于本 ADR：

- 真实 NeuroBook/Cosmos consumer 与迁移；
- 默认 `read` Tool、Workspace/cwd、路径/symlink/绝对路径授权；
- 图片/二进制、附件存储、输出预算和敏感内容策略；
- reference/provenance 的宿主脱敏、审计与 export policy；
- 资源版本、稳定读取、cursor continuation 和跨 Invocation cache；
- 浏览器/产品验收与生产部署。

下一轮转向 ADR-0004 JSONL commit lock 的最终 acceptance review。
