# ADR-0041: First-party SSE Frame Serialization

- Status: Accepted (standalone Core scope)
- Date: 2026-08-13
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

用户的 Harness 能力清单包含「SSE 能力」；既有边界（ADR-0001、多轮 walkthrough）把 HTTP/SSE DTO 与 HTTP 服务保留在宿主层。第 71 轮的 SSE 消费切片要求宿主自行实现 frame 编码（toSseFrame），该编码是纯格式化、与 HTTP 无关，但每个宿主都要重写一遍；Core 已有 EventSubscription/游标/字节预算等事件 seam。

## Decision

- `src/sse.ts` 提供第一方、opt-in 的帧序列化并根导出：`serializeSseEvent`（WHATWG event-stream 帧；本实现固定 event/id/retry/data 顺序、多行 data 拆分、空行终止）、`serializeSseComment`、`serializeSseJsonEvent`（JSON 便捷面）。
- 校验：单行字段（event/id/comment）拒绝 CR/LF；data 拒绝 CR；retry 必须是非负整数。
- HTTP 服务、连接管理、replay/字节预算与 DTO 仍归宿主（既有事件 seam 不变）；本模块不引入 HTTP server、不承诺 SSE over HTTP 的端到端。

## Alternatives

- Core 内置 SSE HTTP server/adapter：拒绝——HTTP/SSE DTO 是宿主域（长期边界）。
- 每个宿主自写 frame 编码：拒绝——第 71 轮消费切片证明这是必然重复的样板，第一方 helper 是「常用工具/SSE 能力」的最小形态。

## Verification gate

- 4 条序列化测试（字段顺序/多行/comment/非法输入/JSON 往返）；第 71 轮消费切片改用本 helper 后全绿；focused、全量、pack:smoke 与独立审查。

## Evidence and acceptance

- focused 47/0/164（8 files）；全量 512/0/2074、88 files；pack:smoke 通过（prepack verify 512/0；tarball 117 files / 153.9 kB）；独立审查（Euler）无 P0/P1，5 条 P2 全部吸收（字段顺序归因措辞、覆盖矩阵 22 个方法、CONTEXT 重复条目、retry 安全整数、非法输入测试补全）。
- 2026-08-13 升格 Accepted：WHATWG 帧格式合规 + 第 71 轮切片采用 + 独立审查满足验收；真实 HTTP Transport 端到端仍归宿主未运行。
