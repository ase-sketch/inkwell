# 第一百零二轮：appendEntries 便捷 API + JSONL 会话枚举（规划 A-C2 落地）

## 状态

第一百零一轮规划代理 A 的 C2 与文档偏差（(d)）落地：`harness.appendEntries` 免手拼 SessionWritePlan，`JsonlSessionStore.listSessionIds()` 提供重启枚举；README 新增「实现自定义 SessionStore」节并修正两处文档偏差。纯新增 API + 文档轮。

## 规划依据（规划代理 A）

- C2 证据：`harness.write()` 要求五层完整 plan（src/harness.ts write/writeOnce）；draft 助手只到 draft 层；JSONL 无会话枚举（宿主自维护 sessionId 索引，重启漂移即丢会话）。
- (d) 证据：README compactSession 未写 ContextCompactor 前置条件（未配置抛裸 Error）；createAgentMessageEntryDraft 选项漏 parentId；根导出清单漏 caller/entry-codec/错误族。
- C1 文档节：SessionStore 六方法职责与 normalize/reduce 复用点此前零文档。

## 变更

- `src/harness.ts`：新增 `appendEntries(sessionId, drafts, {cause?, expectedVersion?, expectedActiveInvocationId?})`——组装 appendEntries plan 走既有 `writeOnce`/commit 守卫（Core-owned kind 拒绝不变），空 drafts 抛错，返回带游标的 HarnessSnapshot。
- `src/storage/jsonl.ts`：新增 `listSessionIds()`——扫描 sessions 目录（与 reconcile 同源），返回排序正数 ID；目录不存在返回空。
- 新增 `tests/append-entries-api.test.ts` 5 条：Memory 追加+游标、空 drafts 拒绝、Core-owned kind 拒绝、expectedVersion 过期冲突、JSONL 枚举+跨实例恢复。
- README：appendEntries/listSessionIds 说明、compactSession 前置条件、createAgentMessageEntryDraft parentId、根导出清单补 caller/entry-codec/错误族、「实现自定义 SessionStore」节；CHANGELOG/CONTEXT 同步。

## 门禁

- - focused：82 pass / 0 fail / 378 expect（10 files）。
- focused：84 pass / 0 fail / 384 expect（10 files，含审查 P2-2 补的 2 条）。
- - 全量逐文件循环：84 files、496 pass / 0 fail / 2018 expect。
- 全量逐文件循环：84 files、498 pass / 0 fail / 2023 expect。
- - typecheck 通过；pack:smoke 通过（prepack 单命令 verify 496/0；tarball 113 files / 148.8 kB；Bun/Node consumer）。
- typecheck 通过；pack:smoke 通过（prepack 单命令 verify 498/0；tarball 113 files / 149.0 kB；Bun/Node consumer）。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、HTTP/SSE、浏览器/产品和生产验收仍未运行。
- store-contract 套件仍不随包分发（C1 的 testing 导出留待消费者证据）。

## 独立审查

- 待独立审查代理复核（只读）：appendEntries 组装与守卫复用、listSessionIds 扫描口径、5 条测试一致性、README 文档节准确、focused/全量数字。
- 独立审查（Heisenberg，只读）：无 P0/P1。2 条 P2 全部吸收：P2-1 扫描口径收紧为严格十进制解析（拒绝 01.jsonl/1e3.jsonl 等非规范拼写，reconcileInterrupted 与 listSessionIds 共用 numericSessionFileName，顺带修复 reconcile 在杂散文件上的潜在崩溃）；P2-2 补 2 条测试（expectedActiveInvocationId 透传 null/幽灵 owner、非规范文件名过滤与 [2,10] 数值升序 + reconcile 不抛）。focused 实测 82/0/378（吸收前）。
