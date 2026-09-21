# 第六十六轮：Session Invocation Coherence Admission

## 状态

第四十四轮只在写侧收紧 `setStatus`，读侧 `normalizeSessionSnapshot()` 仍接受
reducer 永远无法产生的矛盾 Invocation/Session 状态。本轮补齐读侧 admission：
重复 Invocation ID、悬挂/terminal active owner、非 active 的 running/waiting
Invocation、以及无 active owner 的 `running`/`waiting`/`aborting` 组合全部
在 read/reconcile 前 fail closed。只改 `src/session.ts` 与 `CONTEXT.md`，不新增
公共类型/API/ADR；用户已有的 `docs/architecture.md`、`docs/pi-adapter-design.md`
与 `tests/context.test.ts` 未纳入范围。

## 规划依据

- 第六十五轮独立审查 P2-2 指出：JSONL read admission 只覆盖 entry 图，invocation
  数组一致性是预存边界，建议列为后续候选。
- 只读探针（手工构造 JSONL + Memory read + `reconcileInterrupted`）确认四种
  矛盾状态当前全部被接受：重复 Invocation ID；`activeInvocationId` 悬挂
  （"ghost"）；Session `running` 无 active owner；Session `idle` 配 `running`
  Invocation（reconcile 也跳过，形成永不收口的僵尸 owner）。
- 这些状态只能来自损坏/手工文件，公开写入路径（reducer）从第三十二/四十四轮起
  已经保证：startInvocation 拒绝重复 ID、setStatus 拒绝状态与 owner 不一致、
  finish/wait/resume 要求目标存在且状态正确。读侧 admission 与第 63 轮
  Entry graph admission 同族，把「矛盾历史必须 read fail closed」扩展到
  Invocation 维度，不给损坏文件留 reconcile/abort 盲区。
- 明确不做：不校验旧记录缺失的可选字段（profileVersion/messageIdentity/
  caller/input/turnCount 由 normalize 与既有 legacy 兼容路径处理）；不自动修复
  或迁移历史数据；不扩展公共类型或 Store 合同。

## 变更

- `src/session.ts` 新增内部 `assertSessionInvocationCoherence()`，在
  `normalizeSessionSnapshot()` 中与 `assertSessionEntryGraph()` 并列调用
  （Memory/JSONL 的 read 与 reconcile 经 read 共用该入口；`activeInvocationId`
  缺失按 null 归一，避免误导消息）：
  - Invocation ID 在同一 Snapshot 内唯一 → `Invocation X 重复`；
  - `activeInvocationId` 非空时必须命中已存在 Invocation →
    `active Invocation X 不存在`；
  - active owner 必须处于 `running` / `waiting` → 否则
    `active Invocation X 状态为 Y，不能作为 active owner`；
  - 非 active Invocation 不得 `running` / `waiting`（僵尸 owner）→
    `非 active Invocation X 不能是 Y`；
  - 无 active owner 时 Session 不得 `running` / `waiting` / `aborting`；
  - `idle` / `interrupted` / `archived` 不得携带 active owner；
  - `running` / `waiting` Session 的 active owner 状态必须精确匹配。
- `CONTEXT.md` 新增 Invocation Coherence 术语与 read-side admission 不变式。
- `CHANGELOG.md` Unreleased 记录公共行为收紧（只影响先前可读的损坏历史）。
- 新增 `tests/session-invocation-coherence.test.ts` 10 条：8 条矛盾状态拒绝
  + 1 条合法状态组合（idle/interrupted/archived 无 owner、running/waiting/
  aborting 配精确 owner、多 terminal 历史）+ 1 条 JSONL read fail closed 与
  合法文件可读；P2 吸收后再补缺失 `activeInvocationId` 归一回归（共 11 条）。

## TDD 证据

初始 red（探针与断言一致，旧实现全部放行）：

```text
bun test tests/session-invocation-coherence.test.ts
1 pass / 9 fail / 17 assertions
```

实现后 focused：

```text
bun test tests/session-invocation-coherence.test.ts
11 pass / 0 fail / 19 assertions
```

## 门禁

- focused 5 文件（coherence + parent admission + replay gates + recovery +
  legacy identity）：`35 pass / 0 fail / 97 assertions`。
- `bun run verify`：`377 pass / 0 fail / 1568 assertions`，57 test files；
  typecheck/build 通过；全部 legacy fixture（缺字段 invocation、legacy waiting、
  durable aborting overlay 等）无一误伤。
- `bun run pack:smoke`：exit 0；prepack `377/0/1568`，113 files，package
  `127.0 kB`，unpacked `603.4 kB`；Bun/Node ESM consumers 通过。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、HTTP/SSE
  Transport、浏览器/产品和生产验收仍未运行。
- 第三方 Store Adapter 若绕过 shared reducer 直接写坏 invocation 数组，只有其
  自身读取路径 fail closed；不宣称所有 Store 自动修复或迁移历史数据。
- 不校验 pendingApprovals 内部一致性、Invocation 与 Entry 的
  invocationId 引用关系、turnCount 单调性等更细事实；本轮只钉结构级矛盾。
- JSONL `create` 直接构造初始 Snapshot 不经 normalize（Memory `create` 经过）；
  初始状态由构造保证一致，无功能缺口。
- 既有 JSONL 若真实存在上述矛盾状态，将按损坏历史处理（read fail closed），
  需人工修复；本轮不提供迁移工具。

## 独立审查

- 只读独立审查（Planck）逐状态枚举 reducer 可达终态并与 admission 对齐：
  **No P0/P1 findings**；aborting overlay、compaction、legacy 缺字段记录、
  全部既有 fixture 无一误伤；放置点（共享 normalize 入口）与第 63 轮
  entry graph admission 同族。
- P2 已吸收：缺失 `activeInvocationId` 归一为 null（新增回归测试，避免
  "active Invocation undefined 不存在" 误导消息）；CHANGELOG Unreleased
  补公共行为收紧记录；walkthrough/README 措辞修正为 read/reconcile 共用
  入口（JSONL create 不经 normalize）。
