# 第二十二轮：Invocation ownership acceptance

## 结论

ADR-0007 已具备在 standalone Core 范围内接受的实现与恢复证据。`expectedActiveInvocationId` 在 Store 原子边界阻止旧 Invocation 写入；run-attempt fence 阻止同一 Harness 中已取消或已 terminal attempt 的迟到结果和 runtime event 继续生效。

本轮没有修改生产代码或公共 API。接受不外推到跨进程 EventHub、真实 provider/tool、第三方 Store、Transport 或 NeuroBook/Cosmos 产品接入。

## 接受范围

- reducer 精确区分 owner 字符串、`null` 和字段省略；
- Harness 为 Invocation-owned plan 自动附加 owner，start admission 保留既有冲突诊断；
- abort/dispose 先使 attempt 失效，再通知外部依赖取消；
- Model、sequential/parallel Tool、Hook、ContextProvider、Compactor、Approval 和 Capability 的 post-await 结果受 fence；
- `settleFailure` race、terminal callback/runtime event 和组合 start 受相应 owner/attempt 边界约束；
- Memory/JSONL reconcile 使旧 Harness 的迟到 plan 失效，新 Harness 可以恢复或 retry。

公开 `harness.write()` 省略 `expectedActiveInvocationId` 仍是刻意保留的 Workflow/宿主组合能力，不属于安全漏洞或待迁移旧 API。

## 补测判断

计划要求只在 `resume()` / `dispose()` 暴露独立窗口时补回归。核对结果是：

- waiting 后的旧 run 已结束，`resume()` 创建新的、不可复用 attempt；
- approval resume、最新 Snapshot、JSONL 新 Harness 恢复已有回归；
- `dispose()` 下的非合作式依赖、forced completion 和迟到正常返回已经由 ADR-0008 的 bounded-abort tests 覆盖；
- `resume()` 和 `dispose()` 没有绕开 Harness Invocation-owned commit path 的额外写入入口。

因此本轮没有制造重复测试，也没有为接受状态扩张 API。

## 验证

Focused：

```text
bun test \
  tests/invocation-ownership.test.ts \
  tests/abort-boundary.test.ts \
  tests/recovery.test.ts \
  tests/commit-observer.test.ts

37 pass
0 fail
141 expect() calls
```

全仓：

```text
bun run verify

122 pass
0 fail
610 expect() calls
Ran 122 tests across 32 files.
```

本轮没有公共导出、构建产物或 package consumer 变化，因此没有重复运行 `bun run pack:smoke`。

## 独立审查

第一次高预算只读 reviewer 超时，没有修改文件或产生可采用结论。第二次独立 reviewer 对照 ADR、Harness/Store 实现和 focused matrix，结论是可以接受，未发现 P0/P1。

Reviewer 另外单独运行：

```text
bun test tests/invocation-ownership.test.ts

19 pass
0 fail
55 expect() calls
```

## Residual

仍未验证或不属于本 ADR：

- 跨进程 EventHub fencing 与 terminal event 全局唯一性；
- 真实 provider/tool、第三方 Store Adapter 和 Store 外部事务；
- 父 Workflow signal、HTTP/SSE Transport、权限与审计；
- 真实 NeuroBook/Cosmos consumer、浏览器/产品验收和生产部署；
- 非合作式依赖的 bounded completion，由 ADR-0008 负责。

## 下一步

回到规划后优先审查 ADR-0006 的 shape-only `ReadCapability`。只接受 host-neutral 数据合同；默认文件工具、路径/Workspace 策略、二进制/图片和真实消费者仍留在宿主或后续独立任务。
