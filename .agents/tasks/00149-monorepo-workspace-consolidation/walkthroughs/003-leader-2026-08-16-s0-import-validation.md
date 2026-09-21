---
schema: nbook.walkthrough/v1
taskId: 00149-monorepo-workspace-consolidation
sequence: 003
role: leader
status: in-progress
createdAt: 2026-08-16T15:28:00Z
---

# Leader：S0 原仓清单与只读验证

## 清单

六个 sibling 的当前内容已从原 checkout 只读复制到系统临时快照。逐文件候选 path、bytes、SHA-256、排除原因、remote、branch、HEAD、upstream、ahead/behind 和 porcelain status 保存在系统临时根；Task 证据保存摘要和每个清单 SHA-256。

- `nb-history`：`master` / `68c54caed73c4499eac44e92931895aa130672b3`，无可验证 remote，dirty。
- `nb-workflow`：`master` / `cf34d1567181f77b49f12721648f8f73c3385120`，`origin/master`，ahead 0 / behind 19，dirty。
- `nb-memory`：`master` / `0676cd446b55f212885625468c4498007afd97a1`，origin/master 同步，clean。
- `nb-ui`：`refactor/t146-reka-tailwind-base` / `6296c693e21751c984f3ac8bdefbb899d0244cf9`，clean，无 upstream。
- `neuro-agent-harness`：`master` / `1e4774f299eae78dc304ca750d105ce2584e5cff`，origin/master 同步，clean。
- `llmlint`：`master` / `7d23292694039df2c0572611aff93b97165ba0f9`，dirty；`.worktree`、私有 corpus、runtime/build/secret路径按计划排除。

## 验证结果

History、Workflow、Memory、nb-ui（先生成 Nuxt playground 类型文件）、Harness（先生成 dist）和 llmlint Skill CLI均有真实通过证据。llmlint 根 `verify` 在干净快照中仍有 7 fail / 7 errors 的路径别名错误；这是真实的 inherited package gap，未删测试、未改快照、未写成通过。llmlint Web 在安装独立 island 依赖、Nuxt prepare 后完成 db/typecheck/build；没有私有 corpus，report verdict 按仓库自身 documented degraded mode运行。

## 偏差与下一步

S0 common root command `bun run governance:check` 在 baseline tag 的 root `package.json` 尚未包含（当前 root 用户工作树才有该未暂存命令）；脚本直接调用和 root 当前 worktree governance 已通过，S1 会按计划收敛 root manifest/script allowlist。llmlint verify alias gap在S2导入后必须解决或明确阻塞，不得静默跳过。

S0 源仓证据已完成；下一步提交 Task 证据更新，进入 S1 test-support 与治理门禁。
