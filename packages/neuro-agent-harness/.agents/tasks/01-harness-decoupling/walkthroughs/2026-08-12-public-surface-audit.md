# 第九十七轮：公开 API 面全面审计

## 状态

第 61 轮 Read Tool surface audit 之后新增了 8+ 个公开 API（forkSession、
invocationResultFromSnapshot、waitForInvocation、waitForFollowUpQueueDrain、
compactSession、pausedBy、turn_end waiting、followUp caller 变更），
本轮交叉核对 root exports ↔ README ↔ CHANGELOG ↔ pack consumer。文档 +
脚本修正（无 `src/` 变更）；用户保护文件未纳入范围。

## 规划依据

- 第 61 轮审计距今 ~35 轮；目标要求「API 要好用」与 public surface 一致性
  （AGENTS.md：公共合同变化同步类型、导出、测试和文档）。
- pack-smoke 是包消费者对公开合同的编译/运行时防线，新增 API 必须进入
  双 consumer 检查。

## 审计结果

**已覆盖（无需修改）**：
- README：compactSession / waitForInvocation / waitForFollowUpQueueDrain /
  forkSession / invocationResultFromSnapshot / pausedBy（本轮补）全部有
  条目；CHANGELOG 对 round 68/69/80/81/89/92/93/95 的公开变更均有条目；
- root index 导出 `CompactSessionOptions`（经 harness.js 通配导出）。

**发现并修复**：
1. **pack-smoke 缺 `compactSession`**：Bun 与 Node consumer 均补
   `CompactSessionOptions` 类型导入 + `prototype.compactSession` 检查
   （此前新增 API 后未同步消费者防线）；
2. **README「开发」节过时**：描述的还是第 93 轮前的「全局 5 分钟进程级
   兜底」行为；修正为默认 `bun test --parallel=1` 串行（第九十三轮起），
   进程级兜底移至 `test:bounded`；
3. **README follow-up 段缺 pausedBy**：补自动 pause / pausedBy /
   cancel→resume 恢复闭环说明。

## 门禁

- `bun run verify` 组件：typecheck / build 通过；全量
  `472 pass / 0 fail / 1940 assertions`，80 test files（40.17s；
  verify 包装命令两次 960s 无输出超时为瞬态负载，组件拆开跑即通过）。
- `bun run pack:smoke`：通过（49.9s；prepack 验证 + tarball + Bun/Node
  consumer 均含 compactSession 检查）。
- `git diff --check` 仅 Windows LF/CRLF warning。

## 结论

- 公开 API 面一致性恢复：新增 API 全部进入 README/CHANGELOG/双 consumer
  防线；文档与第 93 轮起的测试脚本行为一致。
- 无 `src/` 变更、无 API 缺口、无导出遗漏。

## 未验证与保留边界

- 真实 NeuroBook/Cosmos consumer、真实 provider/tool、第三方 Store、
  HTTP/SSE、浏览器/产品和生产验收仍未运行。
- 仍为候选：窗口保护（C10，需 Model contextWindow 来源，证据不足暂缓）、
  自动注入（等真实消费者证据）。

## 独立审查

- 只读独立审查（Volta）：pack-smoke 双 consumer 补丁对称且与
  `CompactSessionOptions` 根导出（harness.ts:134 → index.js 通配导出）与
  `prototype.compactSession`（:801）一致；README 开发节与 package.json
  scripts（test / test:bounded / verify）逐项一致；CHANGELOG Unreleased
  对 68/69/80/81/89/92/93/95 轮公开变更 8/8 覆盖；focused 实测
  `13/0/46`。**No P0/P1 findings。**
- P2（良性，记录）：
  - verify 数字来自组件拆分运行（包装命令两次瞬态超时），walkthrough
    已如实标注，审查按记录引用；
  - `!compactSessionOptions` 是恒真条件，用途是编译期引用
    `CompactSessionOptions` 类型面（与既有 consumer 类型引用模式一致），
    无运行时校验意图，保持现状。
