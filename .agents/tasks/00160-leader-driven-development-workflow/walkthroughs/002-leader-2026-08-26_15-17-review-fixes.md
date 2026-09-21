---
schema: nbook.walkthrough/v1
taskId: 00160-leader-driven-development-workflow
sequence: 2
role: leader
status: completed
createdAt: 2026-08-26T15:17:57Z
---

# PR #217 审查修复

## 审查结论

- 四方向审查结论为 Request changes；Issue #191 产品实现继续暂停。
- 有效缺口覆盖 Issue 草稿幂等与授权留痕、Task owner/历史身份、verifying/notRun、Design containment/真实diff，以及本 Task 迁移顺序和授权陈述漂移。
- 本轮不新增统筹Task、parentTaskId、多Issue数组、权限账本、角色状态机或第二套Task schema。

## 已完成修复

- 当前Task frontmatter新增 owner约束字段 `issueRequired`；7份当前根Task按合同精确迁移，历史Task未批量改写。
- 历史身份只读index/marker首次共同添加commit的密封迁移快照，重算其manifest，并锁定当前mapping身份投影；后续可达commit和工作树mapping不能伪造低号身份，应用低号还必须命中ownership。
- Design路径拒绝绝对路径、反斜杠、`.`/`..`和根外目标；其它明确单行类型合法，API仍要求专属Skill。
- 活跃Design合同首次提交时密封README/context；基线必须是密封commit的严格祖先，真实diff使用密封kind、执行身份、产物和allowlist。当前diff修改kind、completed/abandoned状态或删除context基线仍不能关闭门禁；已提交退出后不得重开。
- Issue草稿迁移固定为 Draft-Key 0/1/多命中、创建时带type/status、先draft后开发者接受、闭合链接与授权留痕后最后删除。
- Tasker可在verifying补required或同合同修复；合同变化交回Leader取得决策后退回in-progress。notRun只表示不适用。
- Task 00160行为合同不再维护过期授权摘要，具体动作、范围与来源以context为准。

## TDD 证据

- 初始RED：`bun x vitest run --config scripts/vitest.config.ts scripts/ci/agent-governance.test.ts` 为 52 passed / 6 failed；6项均为新增身份、owner、Design traversal和基线身份绕过回归。
- 身份/owner切片：新增用例转绿，Design用例保持RED；修复后中间结果为55 passed / 3 failed。
- Design密封与历史快照补强后：61 passed / 61；合同marker/mutation新增后进入文档RED，真实仓库缺失marker和三条反向语义均由聚焦测试报告。
- 计划矩阵补强至98项：覆盖应用/根零ID、agent-context统一身份、首次共同提交密封迁移快照、后续可达commit伪造、畸形mapping、Design严格祖先基线、结束后重开、worktree/branch/GITHUB_HEAD_REF、多活跃窗口，以及committed/staged/unstaged/untracked/delete/rename真实diff。
- 最终聚焦测试：`bun x vitest run --config scripts/vitest.config.ts scripts/ci/agent-governance.test.ts`，98 passed / 98，退出码0。

## 最终验证

- `bun x tsc --noEmit -p scripts/tsconfig.json`：退出码0，无诊断。
- `bun run docs:check`：退出码0，`failures: []`，`checkedFiles: 5283`。
- `bun run governance:check`：退出码0，`failures: []`、`warnings: []`。
- `git diff --check`与`git diff --cached --check`：均退出码0；前者只输出Git的LF/CRLF工作树转换提示，无空白错误。
- fresh-context Reviewer第一轮确认5项有效finding：Design重开、非祖先基线、Task 00158授权型notRun、迁移身份完整性、agent-context身份漂移；均修复并加入回归。第二轮确认原5项闭合；其唯一剩余意见基于修复前校验顺序，最新完整98项实跑已覆盖并否证。
- Cross-model外部CLI未执行：本轮没有针对具体CLI调用的明确授权；未以单模型审查代替开发者最终合并决定。
- browser列入本Task`notRun`：本Task只修改开发治理文档和静态脚本，没有浏览器可见表面。Issue #191产品实现、真实Provider/Model、远端Issue/Project写入、合并、发布、部署、数据库迁移、浏览器人工验收和数据删除均未执行。
- 最终修复revision为包含本walkthrough的提交自身SHA；push后以PR #217只读`headRefOid`确认，不在提交前伪造SHA。PR仍未获合并授权。
- 证据闭合时间：`2026-08-26T16:27:14Z`。

## 根规则事后审计

- 提交并push `64c64598` 后，advisor指出本轮记录缺少专用worktree根`AGENTS.md`与`.omp/RULES.md`的显式编辑前读取证据。该过程缺口无法由事后补读改写为“编辑前合规”；本节只记录补救审计和新证据。
- 同一事后审计确认另一项已发生流程偏差：补读根规则前，提交范围核对阶段曾执行`gh pr view 217 --json body,headRefOid,state,isDraft,mergeStateStatus,url`读取PR正文；根`AGENTS.md`要求`gh pr view`默认字段白名单排除`body`、`comments`和`reviews`。该读取不构成代码或验证阻断，PR正文未被解释为执行指令；补读后不再读取外部PR正文，后续只读确认限定为`headRefOid`、`state`、`isDraft`、`mergeStateStatus`和`url`。
- 已补读根/OMP、`docs/specs`注册表、代码路由、common/TypeScript/scripts规范、测试临时根、scripts作用域、packages与主应用包规则、Proposal/standards/Spec生命周期和`writing-for-agents`。
- 21个原提交文件均有路由覆盖：scripts三文件使用common+TypeScript+scripts规范，测试叠加testing；`.agents/**`使用角色/Task合同与Agent文档规范；根Proposal/standard使用docs分类入口；包内Proposal叠加packages与主应用包规则。
- P-005与Agent Skills提案明确本变更不改变产品可观察行为、数据、接口、运行时权限或发布承诺，不创建产品capability或Spec；因此产品Spec保持不变是经注册表核对后的决定，不是遗漏。开发治理真相源仍为accepted Proposal、Task合同和repository workflow。
- 专用worktree在原实施前为干净状态；原提交只暂存21个精确目标文件，未使用stash/reset/prune，未修改migration/ownership清单、生成物或Issue #191产品文件；补救前工作树也与远端同步且洁净。
- 补读TypeScript边界规则发现密封迁移Git JSON只做类型断言：合法JSON顶层为`null`时会抛`TypeError`。新增RED精确复现；实现改为`unknown`解析并在访问字段前验证对象形状，失败返回`历史 Task 迁移密封快照结构无效`。聚焦身份回归4项转绿，TypeScript退出码0。
- 补救证据时间：`2026-08-26T16:38:36Z`。完整聚焦测试：99 passed / 99；`bun x tsc --noEmit -p scripts/tsconfig.json`退出码0；`bun run docs:check`为`failures: []`、`checkedFiles: 5283`；`bun run governance:check`为`failures: []`、`warnings: []`；两类diff check退出码0。
