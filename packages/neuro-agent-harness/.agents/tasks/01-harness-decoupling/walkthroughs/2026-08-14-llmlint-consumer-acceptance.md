# 第一百一十六轮：llmlint consumer acceptance

## 状态

- 日期：2026-08-14。
- 状态：`accepted`。
- 本轮只验证已有公开包被真实 tracked consumer 组合；没有修改 `src/`、公共类型、导出、durable schema、依赖或消费者仓库。
- Goal control-plane 状态保持原样；本轮不执行 push、release、deployment 或真实产品写入。

## Tracked consumer 证据

- `../llmlint/package.json` 精确声明 `@notnotype/neuro-agent-harness: 0.1.0`。
- `../llmlint/node_modules/@notnotype/neuro-agent-harness/package.json` 的版本为 `0.1.0`，入口为 `./dist/index.js`，类型入口为 `./dist/index.d.ts`。
- 在 Harness 根仓构建后，`bun import.meta.resolve('@notnotype/neuro-agent-harness')`（工作目录 `../llmlint`）返回当前仓库的 `dist/index.js`。当前 `dist/index.js` 与消费者解析到的 `dist/index.js` SHA-256 相同：`068c21002fec94031ddb0e537105912412b52664686e1d82a664aa5cc43e8b73`。
- llmlint 的真实组合根位于 `web/server/agent/index.ts`：宿主组装 `NeuroAgentHarness<string, LlmlintHostContext, LlmlintModelConfig>`，并注入 `ProfileRegistry`、`PrismaSessionStore`、`LlmlintPiModelRuntime`、Capability Provider 与 `MachineLlmReviewProjector`。
- llmlint 工作树在验收前后未被本轮写入；执行时观察到既有 `?? .worktree/`，未修改或清理。

## 公开合同映射

- `web/server/agent/neuro-agent-harness/adapter.ts` 使用 Core 的 `createSession`、`snapshot`、`invoke`、`abort`、`retry`、`write` 和 `subscribe`，在宿主侧负责 user ownership、Revision 约束、`invoke`/`advanceRevision` 的同 Session 命令串行化、HTTP 409、SSE DTO 与业务 timeline 投影；`abort`/`retry` 走各自的宿主 admission 路径。
- `pi-runtime.ts` 实现 provider-neutral `ModelRuntime<LlmlintModelConfig>`。Pi message/tool 类型、`AssistantMessageEvent`、模型解析、token cap、`AbortSignal` 透传和 `toolcall_end` 完整参数映射均留在宿主 Adapter；Core 未引入 Pi 依赖。
- `prisma-session-store.ts` 实现 `SessionStore<string, LlmlintHostContext>`，在 Prisma transaction 中复用 `reduceSessionWritePlan`，持久化 Invocation/Entry/Snapshot projection，并用版本/CAS 与 `reconcileInterrupted()` 对齐恢复事实。
- `analysis-capability.ts` 将 revision、scan、detector 和历史 review 读取作为 Capability；`profile.ts` 仅通过 Profile/Tool/Hook/prepare write 编排 llmlint 业务；`review-observer.ts` 以 `SessionCommitObserver` 幂等补齐 `MachineLlmReview`，业务物化视图不进入 Core。
- `NeuroAgentHarnessAdapter` 的 `subscribeEvents()` 直接包装 Core replay/live subscription；workspace、timeline、runtime event 与 `agent_end` 的 llmlint SSE envelope 映射留在宿主。

## 执行验证

1. Harness 根仓：`git status --short --branch` → `master...origin/master [ahead 119]`，仅有受保护的四个既有 dirty 文件。
2. Harness 根仓：`bun run build` → exit 0。
3. llmlint：
   ```text
   bun node_modules/vitest/vitest.mjs run tests/neuro-agent-harness-adapter.test.ts tests/neuro-agent-harness-analysis-capability.test.ts tests/neuro-agent-harness-pi-runtime.test.ts tests/neuro-agent-harness-prisma-store.test.ts tests/neuro-agent-harness-profile.test.ts tests/neuro-agent-harness-review-projector.test.ts tests/agent-session-rebuild.test.ts
   ```
   → `Test Files 7 passed (7)`；`Tests 47 passed (47)`；exit 0。
4. llmlint：`bun run typecheck` → exit 0，`tsc --noEmit --pretty false`。
5. 关键可观察合同全部由上述测试通过：optimize 的 edit/finish 返回新正文并保留 edit entry；Snapshot/replay 含 workspace 与 `agent_end`；abort/retry/Revision 链闭合；Capability 与 observer 投影通过；Prisma 双 client 同版本提交恰一成功一 `SessionConflictError`，running 恢复为 interrupted 而 waiting 保持 waiting；Pi runtime 测试覆盖 message/tool 转换、`start`/`text_delta` 事件、thinking/text 结果、usage 与 token cap；rebuild 成功重跑、失败后续跑且重复执行幂等。
6. Harness 回归：`bun run typecheck` → exit 0；`bun run verify` → exit 0，内部 typecheck/build 通过，`bun test` 为 `524 pass / 0 fail / 2187 expect() calls`，覆盖 `94 files`。

## 未验证边界与绕道

- 没有运行 `../llmlint/.agent/workspace/neuro-agent-real-smoke.ts`。该脚本需要真实凭据和数据库，并会写产品 Session/Revision；本轮禁止真实产品副作用。
- 这些测试使用 `ScriptedModelRuntime`、注入的 `runTurn` 和临时 SQLite/Prisma 数据库。它们证明真实 llmlint 生产 Adapter 与当前 Harness 包的 deterministic compatibility，不证明真实网络 Provider、凭据、模型限流、生产数据库、浏览器或无限流 HTTP/SSE。
- Cosmos 仍直接使用 `pi-ai`，没有 tracked Harness Adapter 或可执行 `agent.invoke@1` 接线；NeuroBook 也没有 standalone 包依赖。本轮不创建假接入、不修改外部仓库。
- 未运行 `bun run pack:smoke`：本轮没有 public export、manifest、dependency 或包内容变化；沿用已有 package boundary 证据。

## 结论

当前 `@notnotype/neuro-agent-harness@0.1.0` 的公开 seam 已被 llmlint 的真实宿主链以当前构建产物消费并通过七个聚焦测试文件的 47 条 deterministic tests 与生产 TypeScript 类型检查。没有发现需要修改 Harness Core、公开合同、durable schema 或依赖的兼容缺口。下一轮回到规划，仅在新的真实 consumer/provider/Transport 证据出现时评估增量。

## 独立审查

- 独立只读 review 初始指出两处 P2 文档过度概括：将 Adapter 的局部命令串行化写成全部 Invocation 命令，以及将 Pi 测试写成覆盖全部 event/error/`AbortSignal` 映射。
- 本记录已收窄为源码和实际断言覆盖的范围；`AbortSignal` 透传和 `toolcall_end` 映射仍是宿主实现边界，但本轮聚焦测试不把它们列为已断言的完整事件矩阵。
- 修正后未发现 P0/P1/P2。
