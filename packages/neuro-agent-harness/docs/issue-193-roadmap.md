# Issue #193 候选路线

本文件是 [Issue #193](https://github.com/notnotype/neuro-book/issues/193) 的非绑定路线图，只保存可能需要研究或设计的后续阶段。它不是 Task 合同：没有 Task ID、状态、owner、允许文件或执行授权，Tasker 不得据此执行。

当前唯一活动合同是 [`t01-product-host-success-research`](../../../.agents/works/w00002-neuro-agent-harness-redesign/tasks/t01-product-host-success-research/README.md)。该 Task 完成前不创建下一 Task；其结果改变候选顺序或范围时，Leader 先原地更新本路线图，再创建唯一完整的 current Task。

## 候选阶段

| 候选阶段 | 上游必须产生 | 新 Leader 必须重新核对 |
| --- | --- | --- |
| 首版场景 | 首要宿主与可观察成功标准已有持久决定 | 哪些用户旅程必须进入首版，哪些延后或明确排除；现有证据是否足以形成单一范围 |
| Session 与恢复 | 首版场景边界稳定 | 中断、进程重启、重试和外部效果未知分别需要什么可观察行为；哪些责任属于宿主 |
| Runtime 候选 | 场景与 Session 行为已确定 | Pi、OMP、其它 runtime 或宿主自带 runtime 的官方事实、许可证、维护和运行边界；是否仍需要候选比较 |
| Session canonical facts | Session 行为与 Runtime 结论可用 | 为恢复行为最少保存哪些事实，哪些 Provider 内容、凭据或秘密禁止保存 |
| 持久化 owner | canonical facts 已固定 | Harness、宿主或组合方案分别拥有哪些持久化责任；并发、迁移和失败承诺是否需要公开合同 |
| Capability owner | 产品、Runtime、Session 与持久化边界足够稳定 | 首版每项能力是否存在、唯一 owner 是 Core、Adapter、宿主还是后置；是否仍有跨 owner 冲突 |
| API、包与运行时边界 | Capability owner 已唯一 | 宿主组合方式、公开 API、包拓扑、Node/Bun 隔离和 runtime 注入能否形成单一设计问题 |
| Proposal / Spec 切片 | API 和 owner 设计成熟 | 哪些长期取舍需要 Proposal、哪些可观察合同需要 Spec、哪些实现可以直接进入 Task；每个正式产物是否有唯一 owner |
| llmlint consumer exit | 持久化、API 和正式合同已确定，且实现范围已获批准 | 旧 Harness 消费路径应删除还是隔离；数据、调用方和验证矩阵是否已完整切换 |

## 创建下一 Task 的规则

1. Leader 读取 Issue #193、current Work/Task README/context、最新 walkthrough/evidence 和本路线图。
2. 只有 current Task 的 `Leader 继续条件` 已满足，才选择一个候选阶段。
3. Leader 重新调查 current 代码与合同，不继承本路线图中的假设为事实，不恢复已删除的 03–11 草案。
4. Leader 在 `w00002-neuro-agent-harness-redesign/tasks/` 创建一个完整 current Task，写清 Agent 工作、开发者参与、任务产物、完成门禁和继续条件，然后按其 canonical role 派发并停止。
5. 并行只用于上游合同已固定，且文件、接口和状态 owner 不重叠的已创建 Task；路线条目本身不能并行派发。

## Issue 导航边界

Issue正文应只链接当前 Task、这份路线图、总体验收和重大阻塞，不复制 Task 的步骤、Gate、允许文件或验证命令。远端 Issue 更新需要单独授权；本文件更新不代表远端正文已同步。