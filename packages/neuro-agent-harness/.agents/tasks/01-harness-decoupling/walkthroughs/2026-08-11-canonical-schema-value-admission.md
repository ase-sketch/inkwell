# 第五十一轮：Canonical Schema Value Admission

## 状态

public red→green、兼容返修、focused/full/package gate、历史竞态测试诊断与 production、API/domain、test-sensitivity 三路窄复审均已完成；ADR-0030 已在 standalone Canonical Schema Value Admission 范围接受，第五十一轮收口。本轮只修改 `neuro-agent-harness`，继续保护 `docs/architecture.md`、`docs/pi-adapter-design.md` 与 `tests/context.test.ts`。

## 规划取证

1. `ValueSchema.parse()` 返回 `TValue`，原合同没有声明只校验、幂等或禁止转换。
2. direct invoke 在 `startOnce()` 解析 payload，`ResolvedProfile.prepare()` 又解析同一个值；Session initial 也在 create 与 prepare 两处解析。
3. durable follow-up 入队保存第一次 parse 的结果，消费时由 `startOnce()` 再 parse，prepare 再 parse。Registry replacement 可形成 `v2(v1(raw))`。
4. retry 把 `previous.input` 重新当 raw request；approval resume 则在 claim 后由 prepare 再解析 durable input。
5. `SessionEntryCodec.draft()` 保存 parse 结果，`parse(entry)` 再调用同一个 parser。
6. Tool approval 的 `ApprovalRequest.arguments` 与 transcript 保存 provider raw arguments；approval prompt 与恢复后 execute 分别从同一 raw 值独立解析，不是 parsed-on-parsed。
7. NeuroBook 当前 TypeBox parser 是 validate-and-return，因此重复调用隐含幂等；standalone 不能从该实现外推 transformation 安全。
8. Cosmos 仍无真实 Harness consumer，Phase 1 继续使用 `pi-ai`；该缺口应由通用 schema/durable input 合同修复，不引入 Cosmos DTO。

三路规划分别建议拆分 decode/validate、保存 raw queue/current Profile 重解析，以及先建 public tracer matrix。集成审计拒绝默认持久化 raw：parser 可能有意移除未知字段或 secret，保存 raw 会扩大 durable 数据面。最终采用 normalized-authoritative + explicit parsed-value validation。

## 决定

- `parse(raw)` 只负责外部 ingress，结果称为 **Parsed Value**。
- durable Session initial、Invocation input、follow-up payload 与 codec draft payload 都是 Parsed Value，不是 raw input。
- 新增可选 `ValueSchema.validateParsed()`；它验证 parsed representation，但必须返回 JSON-equal 值。
- 未提供时回退调用 `parse(parsed)` 并比较 JSON equality；validate-and-return 与幂等 normalizer 零迁移，真正非幂等 decoder 需显式提供 validator。
- follow-up consume、retry、approval resume 与 codec projection 只验证 Parsed Value，不再次转换。
- current Profile 若不能接受 durable Parsed Value，在 consume/start/approval claim 和外部副作用前 fail closed；Core 不自动迁移。
- schema callback 必须 pure + deterministic。Tool transcript/approval request 继续保存 provider raw arguments，approval prompt 与恢复后的 execution 可以从同一 raw 值各自 decode。
- 不增加 durable marker、raw payload、Profile closure、dependency 或产品概念。

稳定取舍记录在 [ADR-0030（Accepted）](../../../adr/0030-canonical-schema-value-admission.md)。

## 实现

### Schema 公共合同

- `ValueSchema<T>.validateParsed?` 为 transformation schema 提供显式 canonical validator。
- `defineSchema({parse, validateParsed, jsonSchema})` 新增 object form；旧 `defineSchema(parse, jsonSchema)` 保持兼容。
- `parseSchemaValue()` 只在 ingress decode 一次，并立即确认结果满足 Parsed Value 合同。
- `validateParsedSchemaValue()` 只验证 durable value，并返回传入的原对象；validator 若返回非 JSON-equal 表示继续转换，抛 `SchemaCanonicalValueError`。
- JSON equality 递归比较 primitive、array 与 object，object key 顺序不影响结果。
- helper 保留 schema method receiver；object-form `defineSchema()` 也保留原对象。

### Profile、Harness 与 durable reuse

- 第一方 `ProfileRegistry` 的 initial/payload/output ingress 改用 `parseSchemaValue()`；`prepare()` 只验证已经 admitted 的 initial/payload。
- `ResolvedProfile.validateInitial/validatePayload` 保持 optional，避免外部消费者手工构造的 pre-ADR-0030 shape 编译破坏。缺少 hook 时 Harness 使用 parse + JSON equality fallback。
- `createSession()`、direct invoke 与 caller follow-up 各自只在外部边界 decode。
- follow-up consume 与 retry 通过内部 `payloadAdmission: "parsed"` 验证并复用 durable payload。
- direct start 在 durable Invocation commit 前验证 current Profile 是否仍接受 Session initial；incompatible replacement 不产生新 Invocation。
- approval resume 在 durable claim、Capability、prepare、Tool 与 Provider 前验证 Session initial 和 Invocation input，损坏值保持 waiting。
- `SessionEntryCodec.draft()` decode 一次，`parse(entry)` 只验证 projection。
- Profile、Session、Invocation、follow-up 注释明确区分 Raw Value 与 Parsed Value。

### Tool 与 approval 边界

- Tool 普通 dispatch 和 approval request ingress 统一使用 `parseSchemaValue()`，不稳定 arguments parser 在副作用或 approval persistence 前失败。
- `ApprovalRequest.arguments` 与 assistant transcript 仍保存 provider raw arguments。approval prompt 与 resume execution 从同一 raw 值独立 decode，不持久化可能已移除字段的另一个 raw 副本。
- public tracer 证明 durable arguments 为 `{value: 5}`，approval callback 与 execute 都收到一次 decode 后的 `{value: 6, decodedBy: "tool"}`。

## Public TDD 与回归矩阵

新增 17 条 public regression，覆盖：

1. direct invoke initial/payload 只 normalization 一次；
2. follow-up queue → consume → Invocation/prepare/provider；
3. JSONL restart 后消费；
4. retry；
5. approval resume 的 malformed durable input 在 claim 前拒绝；
6. codec durable projection；
7. object-form `defineSchema`；
8. 无 validator 的 unstable fallback 在 mutation 前拒绝；
9. current Profile initial incompatibility；
10. Tool dispatch 与 approval request；
11. schema method receiver；
12. compatible/incompatible Profile replacement；
13. transformed output persistence；
14. approval prompt 与恢复后 execution 从同一 raw arguments 得到相同 Parsed Value；
15. pre-ADR-0030 `ResolvedProfile` 无 validator 的 runtime 兼容。

扩大 focused：

```text
bun test \
  tests/canonical-schema-value-admission.test.ts \
  tests/active-profile-steer-admission.test.ts \
  tests/profile-version-approval-admission.test.ts \
  tests/approval.test.ts \
  tests/recovery.test.ts \
  tests/follow-up-consume-recovery.test.ts

43 pass / 0 fail / 138 assertions
6 test files
```

## 审查发现与返修

首次 production reviewer 报告 Tool approval 可能发生 `parse(parse(raw))`。沿 durable data flow 复核后，该 finding 的前提不成立：request/transcript 保存 raw，approval callback 与恢复后 execution 分别从同一 raw 独立 decode。新增上述 public tracer，并在 ADR/README 明确 pure + deterministic 合同，避免未来把两次独立 decode 误改为持久化 Parsed Value。

API/domain reviewer 的兼容 finding 有效：若在 `ResolvedProfile` 上新增 required validator，外部 pre-ADR-0030 结构体会直接编译失败。两项 hook 已改为 optional；Harness 添加 receiver-safe fallback，runtime tracer 和 Node package type tracer 都使用无 validator 的旧 shape。

最终 reviewer 基础设施先后经历 Codex tool markup 未执行、no-tool bundle 超时、Claude/OpenCode provider 超时；这些调用均没有修改工作区，也不计作结论。随后使用冻结源码分片完成可复核的独立窄审：

- production reviewer 最初提出 legacy retry、follow-up admission、fallback transformation、Tool double decode 与 initial double-validation 等 6 条怀疑；补齐完整 ingress/consume/resume/helper 片段后逐项撤销。durable retry/follow-up、approval raw arguments、legacy fallback/receiver、resume/start 四个 post-context 分片均为 `No P0/P1/P2 findings.`。
- API/domain/package reviewer 的 schema 与文档分片无 finding；package 分片提出 Bun tracer 没有像 Node tracer 一样显式 generic 的 P2，已补为同一 `<{value:number; parsed:true}>` object form。post-fix package 复审为 `No P0/P1/P2 findings.`。
- test-sensitivity reviewer 的 Tool error finding不成立，因为测试已经精确断言第二轮 provider request 中的 error `toolResult`；其余 4 个 P2 有效：receiver 只直测 helper、compatible queue 未直测出队、incompatible rejection 未锁定允许的 unpause fact、initial rejection 未验证后续恢复。四项均已补 public assertions；post-fix 复审为 `No P0/P1/P2 findings.`。

返修后的测试还明确证明：incompatible `resumeFollowUps()` 可以先持久化唯一的 `harness.followUp.paused {paused:false}`，但不得 consume queue 或启动 Invocation；这是 public resume 的既有控制面事实，不是 schema validation 的部分写入。

ADR-0030 因而只在 standalone Core canonical-value admission 范围接受；schema migration、宿主接入、第三方 Store 与 Transport 语义不由本轮结论覆盖。

## 全仓门禁与历史测试绕道

返修后的首次 `bun run verify` 为 304 pass / 1 fail / 1389 assertions。唯一失败来自 2026-08-09 已存在的 JSONL 双 Harness anchor test：

```text
expected actualActiveLeafId not to be null
Received: null
```

该测试的初始 Session 没有 entry，因此 anchor leaf 本来就是 `null`。失败方若在赢家 `startInvocation` 已提交、首条 assistant message 尚未提交时获得 Store lock，同一 reducer 边界的合法诊断就是：

```text
expectedVersion=0
actualVersion=1
expectedActiveLeafId=null
actualActiveLeafId=null
```

反馈环与诊断证据：

```text
原断言 100 次：99 pass / 1 assertion fail
带临时诊断 200 次：195 pass / 5 assertion fail
五次失败均为 version 0→1、leaf null→null
```

因此只修正测试：`actualVersion === anchor.version + 1` 时 leaf 必须仍等于 anchor；更晚版本才必须已有非空 message leaf。生产 reducer、JSONL Store 与 Harness 均未修改。临时 `[DEBUG-canonical51-anchor]` 诊断已删除。

修正后的 50 次反馈环为 50/0/550。200 次同进程极限循环为 196 pass / 4 timeout，四次都在约第 99 次后超过 Bun 默认 5 秒，没有再出现 leaf assertion；该资源饱和绕道不作为正常门禁，也没有据此放宽 timeout。

本轮同时新增进程级测试兜底基础设施：`bunfig.toml` 保持用例级默认 5 秒超时，`scripts/test-with-timeout.ts` 在 300 秒总时限后强制终止整个测试进程（顶层挂起/`beforeAll`/`dispose` 挂死兜底），`package.json` 的 `test`/`verify` 脚本改为经该 wrapper 执行；`pack:smoke` 的 prepack 也走同一路径。它不是对用例级 timeout 的放宽，而是把不可恢复的进程级挂死变成可诊断的 `124` 退出。

最终正常门禁：

```text
bun run verify
305 pass / 0 fail / 1395 assertions
45 test files
typecheck + build passed

bun run pack:smoke
prepack: 305 / 0 / 1395
109 files
118.8 kB package / 564.5 kB unpacked
Bun + Node ESM consumers passed
```

package consumer 同时执行 object-form schema、两个 helper、typed canonical error export，并让 Node TypeScript 编译一个无 validator 的 legacy `ResolvedProfile`。

## 当前未验证

真实 NeuroBook/Cosmos Adapter、真实 Provider/外部 Tool、第三方 Store、HTTP/SSE Transport、跨进程 EventHub、权限/审计、schema migration 与产品验收仍未验证。本轮不修改 NeuroBook/Cosmos，不 push、发布或部署。
