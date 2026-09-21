# 第一百零八轮：第一方 SSE 帧序列化（ADR-0041）+ 公开入口覆盖收口

## 状态

两个产出：(1) 覆盖矩阵扫描确认 22 个公开方法全部有测试文件钉住、无缺口；(2) 用户能力清单中「SSE 能力」的最小形态落地——第一方 SSE 帧序列化 helper（WHATWG event-stream 帧，无 HTTP），第 71 轮消费切片改用本 helper 作为采用证据。src + 测试 + 文档轮。

## 规划依据

- 第 71 轮 SSE 消费切片要求宿主自写 toSseFrame；该编码纯格式化、与 HTTP 无关、每个宿主重复；HTTP/SSE DTO 归宿主的长期边界不变。
- - 覆盖矩阵：harness.ts 公开方法 22 个（abort/appendEntries/cancelFollowUp/compactSession/createSession/dispose/followUp/followUpState/forkSession/invoke/invokeAt/pauseFollowUps/reorderFollowUps/resume/resumeFollowUps/retry/snapshot/steer/subscribe/waitForFollowUpQueueDrain/waitForInvocation/write）均有测试文件引用。

## 变更

- - `src/sse.ts`（新，根导出）：`serializeSseEvent`（本实现固定 event/id/retry/data 顺序、多行 data 拆分、空行终止、CR/单行字段校验、retry 非负安全整数）、`serializeSseComment`、`serializeSseJsonEvent`。
- `tests/sse-serialization.test.ts` 4 条；`tests/sse-transport-consumer.test.ts` 的宿主 toSseFrame 改用本 helper（采用证据）。
- `docs/adr/0041-sse-frame-serialization.md`（Proposed）；CHANGELOG/CONTEXT/README 同步。

## 门禁

- - focused（SSE/事件域）：47 pass / 0 fail / 164 expect（8 files）。
- - 全量逐文件循环：88 files、512 pass / 0 fail / 2074 expect。
- - typecheck/build 通过；pack:smoke 通过（prepack verify 512/0；tarball 117 files / 153.9 kB；Bun/Node consumer。首次运行撞上已知 Windows 间歇停滞后重试通过）。

## 未验证与保留边界

- HTTP 服务、连接管理、真实 Transport 端到端、浏览器/产品和生产验收仍归宿主/未运行。

## 独立审查

- - 独立审查（Euler，只读）：无 P0/P1。5 条 P2 全部吸收：字段顺序措辞改为「本实现固定顺序」（WHATWG 规范无顺序要求）；覆盖矩阵 24→22 个公开方法；CONTEXT 重复 retry 条目删除；retry 改安全整数校验（拒绝 1e21 科学计数法）；非法输入测试补 event CR/id LF/retry 小数与大数。ADR-0041 升格 Accepted。focused 实测 47/0/160（吸收前）。
