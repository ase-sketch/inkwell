# 目标宿主与成功标准恢复卡

## 当前状态

- Current Task：`t01-product-host-success-research`，所属 Work 通过目录表达；Work 关联 `i193`。
- Legacy 来源：`02-product-host-success-research`，迁移前为 `nbook.task/v1`、`actionIssueId: 193`、`in-progress`。
- 证据阶段已完成：`walkthroughs/001-host-evidence-and-observation.md` 与 `evidences/host-evidence-manifest.json` 已生成。
- 当前停止在开发者参与点：开发者观察仍为 `not-recorded`；Agent 不得代填、写 002 简报或形成产品决定。
- `D-PRODUCT-01` 和 `D-PRODUCT-02` 均为 `open-developer-observation-pending`。

## 恢复顺序

1. [Issue #193](https://github.com/notnotype/neuro-book/issues/193)：公开目标和整体进度。
2. [`packages/neuro-agent-harness/docs/issue-193-roadmap.md`](../../../../../packages/neuro-agent-harness/docs/issue-193-roadmap.md)：非绑定候选阶段；不能执行。
3. [`README.md`](README.md)：current Task 协作合同。
4. [`walkthroughs/001-host-evidence-and-observation.md`](walkthroughs/001-host-evidence-and-observation.md) 与 [`evidences/host-evidence-manifest.json`](evidences/host-evidence-manifest.json)：当前证据和开发者观察入口。
5. 存在时读取 002/003 与 current diff；不存在不得推断其内容。

聊天不是执行授权或决定的持久记录。

## 固定输入与 provenance

| 输入 | 固定值 |
| --- | --- |
| Issue #193 revision | `updatedAt=2026-08-26T14:44:10Z`; body SHA-256 `8f12f047d24cc3e24c73a3113e6d61b5e922438fae88fb8dece507780e47f88a` |
| legacy 原始 accepted README revision | `385e49b692d29fb56dba84ea158f839fa636f3b725dd41e9b17160c1315855bb` |
| legacy 修复后 accepted README revision | `88b68203334db53e7e6a476b75058fe34032dd924d0cc742f45f99bf31ec972f`; 接受时间 `2026-08-27T09:29:32+08:00` |
| legacy 接受后执行 revision | `a479c0216298a0f6405a0f37de3d8d9360e7938b1b32785330d3b7565f57c380`（只记录旧运行状态元数据） |
| 仓库代码/文档基线 | `bf07359d3966900ddf9bfc4ad0031fa2b956f29d` |
| 外部来源访问日期 | `2026-08-27`；canonical URL、版本空值规则和覆盖见 manifest |

上述 Task revision 只作 legacy provenance。001 与 manifest 保留生成时的 `02-product-host-success-research` 标识，不回写伪造的新 revision。当前执行以 v2 README、本 context、001/manifest 和后续追加产物为准。

## 失败作业事实

- `R1HostEvidence` 已取消且无输出。
- `R1EvidenceResearch` 因外部服务返回 `524 A timeout occurred` 失败且无产物。
- Leader 随后完成证据阶段；001 与 manifest 是唯一正式证据，不消费失败作业潜在输出。

## 决策与范围

| 决策编号 | 人话问题 | 当前状态 | owner |
| --- | --- | --- | --- |
| `D-PRODUCT-01` | 第一版首先服务哪类宿主？ | `open-developer-observation-pending` | 开发者判断；Agent 准备材料，Leader 记录 |
| `D-PRODUCT-02` | 第一版怎样才算成功？ | `open-developer-observation-pending` | 开发者判断；Agent 准备材料，Leader 记录 |

本 Task 不决定 Runtime、Session 字段、Store、API、包拓扑、Proposal 或 Spec。现有 Core、Pi/OMP、单包 subpath 和 Node+Bun 都只是后续待复核假设。

## 下一合法动作

开发者阅读 001 与 manifest 并填写 001 中的“空白开发者独立观察模板”。完成前 Agent 和 Leader 停止，不写 002/003、不更新产品定位、不创建后续 Task。观察完成后 Agent 核对覆盖和证据缺口，再按 README 写 002。
