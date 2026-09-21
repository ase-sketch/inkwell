# 第三十五轮：Reserved follow-up facts

## 结论

`harness.followUp.*` 现在是 Core-owned Session Entry namespace。宿主仍可通过公开 `harness.write()`、Profile Hook 和 Tool effect 写自己的 entry kinds，但不能绕过 Coordinator 直接 queue、consume、cancel、pause 或 reorder。

已有 Memory/JSONL follow-up records 继续读取；边界只作用于经过 Harness `commit()` 的新写入。full/package/review acceptance 均已完成，ADR-0018 已在 standalone Core 范围接受。

## 为什么是状态机权限，不是 JSON 校验

`projectFollowUps()` 会解释五种 facts：

```text
harness.followUp.queued
harness.followUp.consumed
harness.followUp.cancelled
harness.followUp.paused
harness.followUp.ordered
```

伪造者即使提供完全合法的 JSON，也能：

- 绕过 Profile payload parser 与 active owner queue admission；
- 绕过 caller/message identity 默认和来源；
- 跳过 cancel/reorder observed-version CAS；
- 伪造 consumed，使真实 pending input 从 projection 消失；
- 直接改变 pause 状态。

因此只校验 payload shape 不足；必须限制谁能产生 Core projection 事实。

## 决策边界

- 只保留已有明确 Core projector 的 `harness.followUp.*`；
- 不在本轮保留整个 `harness.*`，避免无证据破坏宿主扩展；
- public `SessionWritePlan` 与 `harness.write()` 继续存在；
- 受信任宿主直接操作自己的 Store 不属于 Harness 可执行的权限边界；
- legacy Store records 继续恢复，不迁移、不重写；
- 不引入 public capability token、namespace registry、Store ACL 或插件沙箱。

详细取舍见 [ADR-0018](../../../adr/0018-reserved-follow-up-coordination-entries.md)。

## TDD seam

### Host write

使用 public `harness.write()` 提交一个 shape-valid queued fact，并通过 public `snapshot()` / `followUpState()` 观察。初始 red：

```text
0 pass
1 fail
1 expect() call

Expected promise that rejects
Received promise that resolved
```

这证明不是无效 payload 被忽略，而是公开 write 实际提交了 Core queue fact。

### Profile effect

Profile `beforeTurn` Hook 返回包含 `harness.followUp.paused` 的 write plan。目标行为：

- Invocation 明确 failed；
- error 指向 Harness 保留 fact；
- Model 不运行；
- follow-up state 保持 `{paused: false, items: []}`。

Tool write plan 与 Hook 共用 `applyEffect() → commit()` seam，因此不单独制造实现耦合的 Tool 重复测试。

## 实现

`InvocationCommitOptions` 增加私有：

```ts
allowFollowUpFact?: boolean
```

`commit()` 在任何 Store 操作和事件前扫描 append entries：

```ts
entry.kind.startsWith("harness.followUp.")
```

默认拒绝为 `SessionInvariantError`。以下内部路径显式放行：

1. queue；
2. pause；
3. cancel；
4. reorder；
5. resume/unpause；
6. `startInvocation + consumed` 原子 admission。

permission 不公开，不能由 Host/Profile/Tool 构造。

## Post-green coverage

host test 枚举 queued、consumed、cancelled、paused、ordered 五种 facts，并确认所有拒绝后：

- Session version 不变；
- entries 为空；
- queue projection 为空。

Profile effect test确认 Invocation-owned plan 也不能利用自动 owner CAS 绕过 namespace permission。最终：

```text
2 pass
0 fail
12 expect() calls
```

## Legacy fixture 绕道

首次 focused 发现 `tests/message-identity.test.ts` 的 legacy compatibility fixture 通过 public `harness.write()` 注入旧 queue：

```text
53 pass
1 fail
224 expect() calls

SessionInvariantError:
harness.followUp.* 是 Harness 保留的 coordination fact
```

测试改为直接使用受信任 `MemorySessionStore.commit()` 注入 pre-reservation record。这样同时证明：

- 新 public Harness write 不能伪造；
- 已存在、缺失 identity 的旧 record 仍按 `"user"` 恢复并可实际消费。

生产实现没有为 fixture 增加后门。

## Focused 验证

```text
bun test \
  tests/follow-up-reserved-facts.test.ts \
  tests/coordination.test.ts \
  tests/follow-up-admission-jsonl.test.ts \
  tests/follow-up-admission-race.test.ts \
  tests/follow-up-consume-recovery.test.ts \
  tests/message-identity.test.ts \
  tests/message-identity-legacy-jsonl.test.ts \
  tests/recovery.test.ts \
  tests/harness.test.ts \
  tests/invocation-ownership.test.ts

54 pass
0 fail
231 expect() calls
```

`bun run typecheck` 与 `git diff --check` 通过。

## Full 与 package 验证

```text
bun run verify

183 pass
0 fail
906 expect() calls
39 test files
```

typecheck 与 build 同时通过。

```text
bun run pack:smoke

exit code 0
prepack: 183 pass / 0 fail / 906 expect() calls
tarball: 101 files / 96.1 kB / 466.1 kB unpacked
```

Bun 与 Node ESM tarball consumer 均通过。

## 独立审查

post-fix reviewer 限定检查 public write、Profile/Tool effect、Store/event ordering、六类内部放行、legacy records、私有 permission 与 namespace 边界，结论为：

```text
No P0/P1/P2 findings.
```

reviewer 自身的 full/package 尝试受只读沙箱对 `dist/` 的写权限限制，不作为门禁证据；上面的主流程验证在正常工作区独立完成。

## 未验证

- 不可信宿主进程或直接 Store writer；
- 通用 namespace registry 与其它未来 Core-owned kinds；
- 第三方 Store Adapter；
- 真实 NeuroBook/Cosmos consumer、Provider/Tool；
- HTTP/SSE、浏览器、发布与生产。

## 收尾

ADR-0018 已接受，Task TODO 已关闭。本轮创建 checkpoint 后回到第三十六轮规划；不把不可信插件、直接 Store writer、第三方 Store、HTTP/SSE 或产品验收外推为已完成。
