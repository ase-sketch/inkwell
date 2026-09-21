# 检测工作台 E2E 规格

> 状态：Accepted（2026-08-16，第二轮前端旅程）。  
> 目标：用真实浏览器验证上传后的每版盲评、查看修改、DraftSession、检测和 Agent 用户合同。  
> 当前事实：仓库没有 Playwright runner、没有 HTTP 集成测试；`web/package.json` 只有 `playwright-core`。

## 1. 测试层次

重构后的测试分四层：

| 层 | 验证对象 | 工具 | 是否启动 Web |
| --- | --- | --- | --- |
| 纯函数 | selector、reducer、fingerprint、span、适应度 | Vitest/Bun test | 否 |
| 合同/API | DTO、权限、D2、命令 handler、artifact | Nitro/H3 测试 harness + 临时 DB | 可以进程内 |
| 浏览器 E2E | 用户旅程、路由、DOM 不泄露、面板联动 | `@playwright/test` | 是 |
| 离线实验 | evals/evolution 可复放结果 | Bun CLI/harness | 否 |

E2E 只覆盖高价值主流程和跨层不变量，不重复穷举每个纯函数分支。

## 2. E2E 运行拓扑

每个 worker 使用独立资源：

```text
Playwright browser context
  ↕
llmlint Web node-server（随机端口：避免并行 worker 互相抢占监听端口）
  ↕
临时 SQLite/libSQL 文件
  ↘ fake OIDC issuer
  ↘ fake OpenAI-compatible LLM
  ↘ fake detector adapter 或明确 unavailable adapter
```

要求：

- DB、cookie、运行端口、缓存和 artifact 目录按 worker 隔离。
- 测试结束回收服务器和临时目录。
- 不访问生产 NeuroBook、生产 detector 或真实 LLM。
- 不读取开发者真实 `.env`、`eval.config.json` 或 secret。
- 时间相关行为使用可控 TTL/clock 或合理等待 API，不用任意 sleep。

## 3. 真实边界与 fake 边界

### 3.1 E2E 必须真实运行

- Nuxt/Nitro 路由和页面。
- Prisma/libSQL 持久化和 migration。
- session cookie 与 OAuth callback 后的本地 user mapping。
- `POST /api/texts`、revision、judgment、reveal、workspace、annotation、operation、Agent API。
- `skill` 的确定性 regex/handler 扫描。
- D2 服务器闸门、owner 404、防枚举和 DTO 剥离。
- SSE transport、snapshot 恢复和浏览器重连。
- Workspace route/URL/revision/panel 状态。

### 3.2 必须 fake

#### NeuroBook OAuth provider

本地 fake OIDC/OAuth server 提供 discovery、authorize、token、userinfo。测试真实 PKCE、state、callback、session cookie 和 user mapping，但不接生产域名。

#### LLM provider

本地 OpenAI-compatible fake server 提供 `/chat/completions`、SSE 流和必要的模型发现。响应由场景 fixture 决定，可模拟成功、结构化工具调用、超长、断流和重试。

#### 外部 detector

目标代码必须提供 `DetectorAdapter` seam，E2E 注入 fake。不得用 hosts 劫持生产硬编码域名。Fake 能产生固定 P(AI)、热力 chunks、失败、取消和 retry。adapter 协议细节另由单元/合同测试覆盖。

### 3.3 不能用 fake 掩盖的行为

- 不能 mock 页面 `$fetch` 后宣称 E2E 通过。
- 不能直接往前端 store 塞 WorkspaceSnapshot 跳过 API。
- 不能在测试中手工设 `revealedAt` 代替 reveal 命令。
- 不能跳过 OAuth callback 后直接写 cookie。
- 不能用内存数组代替 revision、judgment 和 operation 数据库事实。

## 4. 基础测试数据

使用小而有确定命中的中文 fixture：

- 正文 A：包含 2 至 3 个稳定规则命中，长度足以生成两个 heat chunks。
- 修订 A1：移除一个命中并保留一个命中。
- 正文 B：包含中文、换行和 emoji 代理对，用于 UTF-16、IME 与选区测试。
- 两个 DetectorIdentity 不同的 detector fixture，各有独立 docPAi 和 chunks；primary 明确声明且不是数组首项。
- Agent fixture：对指定 DraftSession generation/body fingerprint 的段落提出一处替换，包含可追踪 invocation/proposal id。
- rev0 盲评分：AI 味 3、想继续读 2。
- rev1 盲评分：AI 味 2、想继续读 3、改得好 4、评论固定文本。

fixture 不使用受版权 corpus，不依赖 Task 133 私有数据。

## 5. 核心 E2E 场景

### E2E-01 OAuth 登录并安全返回入口

沿用首轮认证场景。它继续验证 PKCE、state、callback、cookie、redirect 和本地 user mapping，但不属于本轮前端交互设计范围。

### E2E-02 上传正文并进入稳定工作区

**步骤**：填写正文和元数据 → 上传。  
**断言**：

- 导航到 `/workbench/:textId?revision=:revisionId`。
- DB 恰好创建一个 Text 和 hidden rev0。
- 上传响应和 Workspace 都不含 machine details。
- 首屏直接进入 rev0 的 `blind-review`。
- 刷新 URL 仍进入同一 Text 和阶段。

### E2E-03 每个 revision 先盲评再揭示

**前置**：当前 head hidden；后台任务可分别停在未创建、queued、running、succeeded 和 failed。  
**步骤**：逐个后台状态打开工作区并捕获 DOM、可访问性树、Workspace、公开 `snapshotVersion` 和 SSE → 选择正文 span 并保存评价 → 直接请求 reveal → 提交合法盲评 → reveal → 重复 reveal。  
**断言**：

- `DocumentEditorSurface` 居中、只读，可选择、复制和提交 revision annotation。
- reveal 前五种后台状态的可观察投影相同，不含规则、分数、detector identity、Agent、D5 或 operation；hidden 更新不发送 invalidation，也不推进公开 `snapshotVersion`。
- `GET machine` 返回 403；没有 judgment/skip 的 owner reveal 返回 409。
- 带 `blind/userId/id/createdAt` 等 server-owned 字段的 judgment 返回 400，不写库。
- 合法 judgment 的 userId 来自 session，blind 由服务器计算为 true。
- judgment 成功后 `canReveal=true`；首次 reveal 才返回 machine 和 operations。
- 重复 reveal 返回同一 `revealedAt` 和当前 projection，不重跑任务、不创建 operation。

另测显式 skip：`POST /api/judgments/skip` 不创建 judgment；刷新后 skip 仍存在且不重复阻塞。skip 后可 reveal，对应 D5 human leg 为 `indeterminate`。judgment 与 skip 互斥，revealed revision 不能补写二者。

### E2E-04 从首次阅读进入查看修改

**前置**：rev0 已完成 blind judgment。  
**步骤**：reveal → 清空 heatmap 偏好并让 detector 数组反序 → 切 Overview/Rules/Agent → 从 Rules 点击命中 → 选择第二个 detector heatmap → 刷新。  
**断言**：

- reveal 后同一正文从居中阅读布局进入左侧主列，右侧出现三个面板。
- 首轮没有 Revisions tab、历史选择器或版本比较入口。
- Rules hit 与正文聚焦使用同一 hit id。
- Overview 列出全部 detector identity；无偏好时选择服务器声明的非首项 primary，手动选择后正文只绘制该 heatmap。
- 数组重排不改变默认 primary 或 D5 policy；aggregationVersion 不同的结果独立展示、不计算趋势、不触发重跑。
- Overview 显示风险方向和 coverage，不把风险描述成文章质量。
- URL 恢复当前 panel；heatmap 选择按 revision 恢复。

### E2E-05 DraftSession 自动保存与恢复

**前置**：当前 head 已 reveal。  
**步骤**：同一 owner 的两个 BrowserContext 并发点击开始修改 → 两端基于同一 generation 提交不同 edit → 胜出端应用一组规则建议 → 等待自动保存 → 刷新。  
**断言**：

- 两端 `open-draft` 返回同一 draft id，DB 始终只有一个 active DraftSession。
- 同 generation 的并发写入至多一个成功；另一端返回 409/412，body/ledger 没有部分或重复 edit。
- 人工和规则 edit 写入同一 generation ledger；规则组任一 suggestion stale 时整组不写入。
- 自动保存完成后刷新会提示并恢复同一个 draft id、generation、body、dirty 和 undo/redo capability。
- 原 Revision body 不变。
- discard 响应携带更高 snapshotVersion 和 activeDraft=null；延迟旧响应不能复活它。

组件输入、失败自动保存与 overlay 隔离由 E2E-13 至 E2E-15 覆盖。

### E2E-06 延后：历史浏览与版本比较

本场景本轮不实现，也不作为合并门槛。未来另立 Draft spec；已确认比较采用正文内联 diff，不采用左右双栏。

### E2E-07 保存新 Revision、再次盲评与 D5 v2

**前置**：rev0 已盲评并 reveal；当前 DraftSession 已持久化。  
**步骤**：提交带伪造 server 字段的 commit → 合法 commit → 在 rev1 盲评页提交四维评分 → reveal rev1。  
**断言**：

- 非法 commit 返回 400，不创建 Revision。
- 合法 commit 只发送 text/base/draft identity、generation 和 body fingerprint。
- 服务器从同一 generation 派生 body、transition 和 provenance v2，创建恰好一个 `revealedAt=null` 的 rev1。
- rev1 成为 head 并自动选中，页面立即进入 rev1 `blind-review`；commit 不自动 reveal、不返回 machine payload。
- rev1 judgment 在 reveal 前落库，`blind=true`；`improvementScore` 只允许有 parent 的 revision。
- rev1 reveal 后，judgment 响应、reveal 响应和随后 Workspace 返回相同 inputFingerprint 的 canonical D5。
- `d5-owner-v2` 比较 rev0 与 rev1：两端 judgment 都 blind、wantReadOn 不降、primary DetectorIdentity 全同且 docPAi 下降时 passed。
- 任一版 skip、非盲、缺 wantReadOn、缺 detector 或 identity 不匹配时为 `indeterminate`。
- Overview 只消费 canonical projection，不在客户端重算。

### E2E-08 Agent invocation 绑定版本和草稿

**前置**：当前 head 已 reveal，有已保存且无待确认 edit 的 DraftSession。  
**步骤**：发送 Agent 优化 → 记录冻结 target → 流式接收时继续修改草稿 → Agent 返回 proposal → 尝试接受 stale proposal → 创建第二 invocation 并尝试跨 draft/跨 invocation 应用 → 合法重试。  
**断言**：

- invocation context 始终显示冻结的 revision、draft id、generation、body fingerprint 和 selection quote。
- 草稿 generation 变化后旧 proposal 标记 stale；接受返回 409/412，不改变 body/ledger。
- invocation A 的 proposal 不能应用到 invocation/draft B；合法来源才增加 DraftEdit，并复制 model/prompt/target identity。
- abort 只作用目标 invocation；retry 创建绑定明确当前 target 的新 invocation。
- blind-review 阶段不能 invoke Agent 或读取机器数据。

### E2E-09 恢复不会启动或泄露工作

**步骤 A**：以 hidden head 刷新或从历史入口重新进入。  
**断言 A**：恢复到 blind-review，不隐式 reveal、retry 或 invoke；Workspace、SSE 和 UI 中没有该 hidden revision 的 terminal/in-flight operation timeline。本地未提交评分或 pending annotation 按恢复策略提示。

**步骤 B**：以 revealed head 和其 active DraftSession 重新进入。  
**断言 B**：恢复到 inspect-edit 并提示草稿；只恢复该 revealed revision 的 terminal timeline，在途 operation 按服务器 operation version 恢复，恢复动作本身不启动工作。

### E2E-10 通道失败隔离

**步骤**：让一个 detector 失败、另一个成功、LLM unavailable、本地 scan 成功。  
**断言**：

- blind-review 仍可阅读、评价、skip 和 reveal，不泄露后台具体结果。
- inspect-edit 中成功通道可用，失败通道显示 failed/unavailable，不显示 0。
- retry 创建新 operation/attempt；cancel 只取消目标 operation。
- 一个通道失败不覆盖其他通道数据。

### E2E-11 延迟旧响应不能污染当前状态

**前置**：fake adapter 可控制 response/SSE 返回顺序。  
**步骤**：同 draft 的 generation N 响应延迟 → 确认 N+1 → 释放旧响应；同 operation 的 terminal version 先到 → 释放旧 running version；旧 head refresh 延迟 → commit 新 head → 释放旧响应。  
**断言**：

- 旧 generation 不覆盖 working body、authoritative generation、fingerprint 或 ledger。
- terminal operation 不回退到 running；retry/cancel 只按 operation id/version 更新目标。
- 旧 head 结果只归属旧 revision；新 head blind-review 不出现机器数据或右侧面板。
- Text A 的延迟 Agent/detector 结果在进入 Text B 后仍只归属 Text A。

### E2E-12 第二用户与未实现 study 路由隔离

**前置**：用户 A 拥有 private Text A，用户 B 有独立 session。  
**断言**：

- 用户 B 不能读取 Text A 正文、machine、Agent timeline、DraftSession 或 owner operation。
- 不存在和无权限统一为 404；machine/reveal 不形成枚举旁路。
- owner API 对 assignment/study identity 使用 exact-object 校验并拒绝。
- 独立 assignment API spec Accepted 前不注册 participant route，也不构造 `study-assignment` 页面 context。

### E2E-13 UTF-16、IME 与选区失效

使用正文 B 执行一次中文 composition、emoji 前后选择、粘贴、剪切、undo 和 redo。断言 `compositionend` 最多产生一个 splice；所有 start/end 等于 JavaScript `body.slice` 的 UTF-16 半开坐标；服务器 generation 单调递增。正文 working version 变化后提交旧 selection/annotation 必须拒绝并要求重选；panel/overlay 切换不丢失仍有效的原生 selection。

### E2E-14 自动保存失败与离页保护

让 autosave 分别 timeout、500 和 offline。断言 working body、selection 与待确认队列保留，saveState 显示 failed/offline，commit、Agent、suggestion 和 undo/redo 禁用；刷新/导航触发未保存提示或 browser-local 恢复。网络恢复后按同一 authoritative generation 重试，只应用一次 edit；复制与显式放弃可用，退出登录清除本地恢复数据。

### E2E-15 Overlay 隔离与窄屏 sheet

向当前 draft 注入旧 generation、错误 working version/fingerprint 和越界 span 的 rule/heatmap/annotation overlay；断言全部不渲染并产生诊断，合法同 identity overlay 仍可见。窄屏打开 Rules sheet 后验证可访问名称、可见关闭按钮、Escape、焦点约束和背景滚动锁；关闭后焦点回触发控件，正文滚动位置、selection、draft 和 overlay identity 不变。

## 6. API/合同测试优先项

浏览器 E2E 前先覆盖：

1. `POST /api/texts` 原子 Text+hidden rev0 和 D2 响应。
2. 每版 judgment/skip 互斥、blind 派生和 exact-object 校验。
3. reveal 的 owner 404、hidden machine 403、无 judgment/skip 409 和幂等性。
4. hidden Workspace/命令/SSE/公开版本不可区分后台任务状态。
5. DraftSession 单 active、并发 open/write、generation、undo/redo、discard version 和 stale。
6. static suggestion 整批原子应用；commit 创建 hidden Revision、parent/head 和 provenance v2。
7. Operation version、乱序 SSE、retry/cancel identity 与多 detector projection。
8. Agent invoke/proposal 的 revision/draft/generation/fingerprint 绑定和反串拒绝。
9. `d5-owner-v2` 的双 blind judgment、primary detector、hard-fail 锚点和 indeterminate 原因。
10. owner 防枚举、study identity 拒绝和 participant route 未注册。

## 7. Runner 和 CI

目标结构：

```text
web/e2e/
  fixtures/
  support/
  detection-workbench.spec.ts
web/playwright.config.ts
```

- 使用 `@playwright/test`，不手写 ad-hoc `playwright-core` runner。
- `web/package.json` 增加 `test:e2e` 和 `test:e2e:ui`。
- CI 先跑合同/API 测试，再构建 Web，再跑 Chromium 单浏览器主流程。
- Firefox/WebKit、移动 viewport 和视觉回归在主流程稳定后增加。
- 失败时保留 trace、截图、浏览器 console 和服务器日志；日志必须经过 secret scrub。

## 8. 完成门槛

评判工作区重构至少满足：

- E2E-01 至 E2E-05、E2E-07 至 E2E-15 通过。
- E2E-06 明确不在本轮实现，也没有相应空壳入口。
- `DocumentEditorSurface` 的 UTF-16、IME、working body、失败恢复、undo/redo 和 overlay identity 场景均有可执行断言。
- D2、owner、revision、DraftSession、Operation version 和 Agent target identity 同时有 API 合同测试与浏览器跨层场景。
- E2E 不访问真实外部服务；CI 实际执行测试。