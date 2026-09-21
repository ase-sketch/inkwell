# 第八十九轮：followUp 默认 caller 对齐（NeuroBook parity P1 吸收）

## 状态

第八十八轮 parity 深度对照产出的第二个 P1（代理 C/Jason 的 C2）：
`followUp()` 不带 `caller` 时的默认值分歧。对齐为 `{kind: "user"}`；
`src/` 行为变更 + ADR-0011/CHANGELOG 同步；用户保护文件未纳入范围。

## 规划依据

- Jason 对照证据：NeuroBook `normalizeInvokeCaller` 缺省
  `{kind: "user"}`（neuro-agent-harness.ts:1411-1418），`enqueueFollowUp`
  原样入队（:1609），drain 回退 `{kind: "user", sessionId}`（:6220），Pi
  trace 直接使用 `mode: frame.caller.kind`（:5097）；standalone
  `followUpOnce` 缺省 `{kind: "system", name: "followUp"}`
  （harness.ts:458），drain 回退同（:1781）。
- 影响面：用户提交的 follow-up 对 `prepareRun`/`prepareTurn` hooks、Pi
  trace 模式和任何 caller 授权逻辑呈现为 system，与 NeuroBook 不一致；
  且 standalone 自己的 `invoke()`/`retry()` 缺省都是 `{kind: "user"}`
  （startOnce / retry 签名），follow-up 是唯一 system 缺省的入口。
- ADR-0011 检查：决策节只声明「queue 保存 caller、drain 使用保存值」，
  未记录 follow-up 的 caller 缺省——实现里是静默选择，无文档、无测试锁定
  （唯一锁定它的断言是第八十七轮 follow-up-events 测试）。

## 变更

- `src/harness.ts` 两处默认值改为 `{kind: "user"}`：
  `followUpOnce` 的 queue item（:458）与 `startNextFollowUp` 的 legacy
  回退（:1781）。显式 `caller` 透传不变。
- `tests/follow-up-events.test.ts`：默认 caller 断言改为 `{kind: "user"}`，
  并新增自动启动 Invocation 的 `invocations[1].caller` 断言（durable
  侧同样为 user）。TDD：先改期望跑 red（收到 system/followUp），再改实现
  转 green。
- `docs/adr/0011-caller-message-identity.md` Decision 节第 3 项补缺省
  记录（含修正原因）；`CHANGELOG.md` Unreleased 新增 fix 条目。

## 门禁

- focused：`bun test tests/follow-up-events.test.ts tests/message-identity.test.ts
  tests/message-identity-legacy-jsonl.test.ts tests/coordination.test.ts
  tests/host-error-events.test.ts tests/follow-up-process.test.ts
  tests/follow-up-admission-jsonl.test.ts` → `19 pass / 0 fail /
  114 assertions`（7 files；审查 P2 吸收后 legacy-jsonl 增加 1 条 caller
  断言）。
- `bun run verify`：`446 pass / 0 fail / 1831 assertions`，75 test files；
  typecheck/build 通过（42.57s，串行模式）。
- `bun run pack:smoke`：通过——prepack 446/0/1830，tarball 113 files、
  137.5 kB / 641.1 kB unpacked，Bun 与 Node ESM consumer 均通过。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 绕道：bun test 并行 worker 间歇性挂死（已修复）

- 现象：第 89 轮收尾期间 `bun run verify` 连续被 300s/900s 兜底杀掉
  （今日第 82-89 轮累计 6+ 次），杀掉时输出都停在 wait-for-invocation
  附近；CPU 负载仅 15%、无残留进程，排除整机过载与孤儿进程。
- 排查：全量默认并行（worker = CPU 核数）间歇性整体挂死；`bun test
  --parallel=1` 串行 42.2s 稳定通过（446/0/1831）；后半段 11 个文件单独
  跑 1.72s 全过，排除单个测试文件本身问题。
- 修复：`scripts/test-with-timeout.ts` 的 spawn 参数增加 `--parallel=1`
  （含注释说明），使 `bun run verify` / `prepack` 门禁恢复确定性；串行只
  多约 3-5s 墙钟。注：串行后仍观察到一次 300s 默认上限下的瞬时限时命中，
  900s 上限下两次连续通过（42.2s / 42.57s），残留偶发性属 bun/Windows
  环境行为，不再影响门禁可用性。

## 结论

- 三个启动入口的 caller 缺省现在一致为 user：`invoke()` / `retry()` /
  `followUp()`（含 follow-up 自动启动的 legacy 回退）；显式 system caller
  （如 Workflow `{kind: "system", name: "workflow"}`）透传不变，
  message-identity 测试已锁定。
- 与 NeuroBook `normalizeInvokeCaller` 的已验证行为对齐，消除了 hooks /
  Pi trace / 授权逻辑上「用户 follow-up 被当作 system」的静默分歧。
- 测试门禁恢复确定性（串行模式），为后续轮次移除主要操作风险。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 下一候选（parity 审计产出）：compaction 切分/二次压缩/toolResult cut/
  skip/悬挂 firstKeptEntryId 测试收口（Hume B 组，行为存在零断言，含
  C2 previous-summary 预算语义决策）；prepareWrites 当前 invocation
  可见性陷阱（P3）文档+测试钉住；`turn_end waiting`、pausedBy/自动 pause、
  per-event 字节预算（P2）。

## 独立审查

- 只读独立审查（Descartes）：两处默认值改动完整（全仓无 `system/followUp`
  默认残留；`src/harness.ts` 全部 4 处 caller 缺省——steer/followUpOnce/
  startOnce/legacy 回退——一致为 user）、显式 caller 透传不受影响
  （message-identity system/workflow 用例绿）、`invocations[1]` 断言有效
  非空转；focused 数字实测一致。**No P0/P1 findings。**
- P2 已吸收：
  - ADR-0011 措辞修正：旧缺省并非「无测试锁定」（第八十七轮
    follow-up-events 已锁定旧值），改为「ADR 未记录缺省，仅第八十七轮
    测试锁定旧值」；
  - `message-identity-legacy-jsonl.test.ts` 补 legacy drain 回退的直接
    断言（无 caller 的 queue item 自动启动后 caller 为 `{kind: "user"}`），
    此前该行（harness.ts:1781）行为零断言。
