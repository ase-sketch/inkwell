# Issue 225 Product Repository Root 修复与验证

## 结论

Issue #225 的 `The "paths[0]" property must be of type string, got undefined` 根因已修复：Product/Portable 启动链现在把 Installation/Application Root 显式写入 `NEURO_BOOK_REPOSITORY_ROOT`；Profile DSL 不再从 Product bundle 缺失的 `import.meta.dirname` 推断根目录。缺少显式根时改为 fail closed，并给出包含环境变量名的诊断。

修复保持 `Application Root`、`Product Runtime Image Root`、`State Root` 和 `Cache Root` 的现有所有权边界；没有修改 Import 允许路径集合、Profile DSL 公共 API、Provider 配置或 Manager `yaml`/`semver` 依赖闭包。

## 改动

- `packages/neuro-book-contracts/src/product-runtime/environment.ts`
  - `ProductRuntimeEnvironmentInput.repositoryRoot` 改为必填。
  - 环境合并完成后固定 `NEURO_BOOK_REPOSITORY_ROOT`，State `.env` 不得覆盖受管根。
- `packages/neuro-book/server/runtime/product-start-command.mjs`
  - Product wrapper 用 `applicationRoot` 传入 `repositoryRoot`，同时保留显式 `productImageRoot`。
- `packages/neuro-book/server/runtime/product-command.ts`
  - Product command 子进程固定继承 `NEURO_BOOK_REPOSITORY_ROOT: applicationRoot`。
  - 保留 `readProductRuntimeContract(imageRoot)` 与 `NEURO_BOOK_PRODUCT_IMAGE_ROOT`。
- `packages/neuro-book/server/agent/profiles/profile-dsl.ts`
  - `Import` 的仓库级路径只消费显式 `NEURO_BOOK_REPOSITORY_ROOT`。
  - 删除 `resolve(import.meta.dirname, ...)` fallback；缺根时抛出明确错误。
- Manager、Container、部署验收和 Windows Product 验证入口补齐同一环境合同。
- 回归测试覆盖环境覆盖优先级、Portable 根读取、缺根错误、bundle fallback 合同和 Product start 合同。
- `leader-assets-profile.test.ts` 增加受控测试根，避免 fail-closed 合同让现有 Profile 测试隐式依赖宿主环境。

## 验证

已执行并通过：

- `bun run nuxt:prepare`：生成 `.nuxt` 类型配置。
- `bun run generate`（`packages/neuro-book`）：生成 SQLite 与 Project Prisma Client。
- `bun run test -- --run server/agent/profiles/profile-dsl.test.ts server/agent/profiles/leader-assets-profile.test.ts server/agent/profiles/catalog.test.ts server/agent/profiles/profile-artifact-dependency-gate.test.ts`：4 files、110 tests passed。
- `bun run test -- --run src/product-runtime/environment.test.ts`（Contracts）：1 file、3 tests passed。
- `bun --bun ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts --run src/app-commands.test.ts src/docker.test.ts`（Manager）：2 files、59 tests passed。
- `bunx vitest run --config scripts/vitest.config.ts scripts/build/product-command-bundle.test.ts scripts/build/product-runtime-bundle.test.ts scripts/build/product-runtime-contract.test.ts`：3 files、16 tests passed。
- `bun run test -- --run server/runtime/product-startup.test.ts`：1 file、6 tests passed。
- `bunx vitest run --config scripts/vitest.config.ts scripts/deploy/product-start.test.ts`：Product Runtime 构建、镜像验证、migration gate、系统资产安装、HTTP readiness 和 shutdown smoke 通过；1 test passed、1 test skipped（2 total）。构建使用 `windows-x64` Product policy，并在系统临时测试根生成载荷。
- `bunx tsc --noEmit --pretty false -p packages/neuro-book/tsconfig.json`：通过；先生成 Prisma Client 解决初次缺失的 generated module。
- `bunx tsc --noEmit --pretty false -p packages/neuro-book-manager/tsconfig.json`：通过。
- `bunx tsc --noEmit --pretty false -p scripts/tsconfig.json`：通过。
- `node --check packages/neuro-book/server/runtime/product-start-command.mjs`：通过。
- `git diff --check`：通过。

## 偏差与未运行项

- 首次主包 TypeScript 检查因 `server/generated/prisma/client` 尚未生成而失败；执行既有 `bun run generate` 后重新检查通过。这是验证前置生成物缺失，不是本改动引入的类型错误。
- 未执行真实浏览器人工验收，也未重新通过 Agent HTTP/API 发送用户文本；该动作属于独立受限授权。Product start smoke 证明真实 Product payload 可以启动并完成运行期门禁，但不宣称已完成 Agent 首轮调用验收。
- 未执行真实 Provider/Model、Portable release archive `pack-check`、发布构建、push、PR、合并、部署或远端 Issue 写入。
- Manager `yaml`/`semver` 外部依赖缺包和 State Root shadow workspace integrity 风险仍保持独立范围。

## 代码审查

按 correctness、readability、architecture、security、performance 五轴检查 16 个修改文件：未发现需要阻塞交付的 finding。

- 根目录来源现在是显式环境合同，没有 `cwd`、checkout fallback 或 `import.meta.dirname` 回退。
- Product Image Root 仍与 Application/Installation Root 分离。
- State 环境不能覆盖生命周期所有权路径，`NODE_PATH` 仍被删除。
- 现有 containment 检查未改变；新增测试断言可观察 Import 结果和错误语义。
- 未新增依赖、秘密、持久化数据或用户数据清理动作。

## 变更边界

本 Task 修改 16 个 tracked 文件，全部属于 Product Runtime 环境、Agent Profile Import、Manager/Container 适配、部署验收或对应回归测试。没有新增 Spec，因为现有 Agent Asset/Import 与 Product Runtime Spec 已规定显式根和 fail-closed 行为；本实现是补齐已有合同。
