# GitHub 贡献体系第一期

> 当前状态：Implemented and remotely verified (2026-07-31) / 五类结构化表单、单一原生 Security 入口、标签与 GitHub Actions 均已远端验证；Issue chooser 视觉人工验收待执行。

## User Request / Topic

- 为公开仓库建立可实际使用的 GitHub contribution 体系，包括贡献指南、Issue 规范、标签、PR 模板、安全报告和 PR 检查。
- 贡献指南需要覆盖开发规范、开发 Agent 协作以及现有 Task walkthrough 体系。
- GitHub Issues 同时承载错误、功能建议和使用帮助，不把使用问题导向外部社区。
- 2026-07-31 追加提示词与内置 Agent 资产入口、其它问题兜底入口，并移除重复的 Security chooser 链接。

## Goal

建立从公开 Issue 提交、维护者分流、实现与 Agent 协作、Task 记录、PR 验证到私密安全报告的完整入口，并保证：

- 中文贡献指南为主入口，英文镜像保持同等语义；
- 外部贡献者不需要先理解全部内部 Task 规则，也不会自行抢占 Task 编号；
- Issue 和 PR 能收集维护者实际需要的信息，并明确隐私边界；
- 标签和表单引用由仓库内清单与自动校验约束；
- 当前已知的类型检查和全量测试基线被如实展示，不通过 required check 锁死快速开发。

## Current State

实施前 GitHub Community Profile 健康度为 42%，只识别到 README 和 LICENSE；仓库没有贡献指南、Issue/PR 模板、安全政策或分支 ruleset。远端只有 GitHub 默认标签，10 个历史 Issue 中 6 个没有标签，4 个历史 PR 均没有标签。

本地基线调查确认：

- `bun run docs:build` 通过，约 39 秒；
- `bun run typecheck` 被 `server/agent/skills/llmlint.test.ts` 中 26 处既有测试 fixture 类型漂移阻断，主要是缺少新必填 `ignoreTerms`；
- 全量 `bun run test -- --reporter=dot` 在本地 240 秒内未收敛，并出现 Windows worker 终止和既有测试隔离问题。

## ADR / Decisions / Discussion

- 继续使用 `AGPL-3.0-only`，不引入 CLA、DCO 或双重许可。
- `CONTRIBUTING.md` 解释人类贡献工作流；`AGENTS.md` 继续承担开发 Agent 的详细执行规则，避免两套细则漂移。
- “开发 Agent”与“NeuroBook 产品 Agent”明确分开。使用 AI 工具无需强制披露，但贡献者必须理解、审查并承担全部改动责任。
- 新功能、跨模块改动和架构变化先经过 Issue 讨论并进入 `status: ready`；拼写、链接和小型文档修正可直接提交。
- Task 是重大实现的持续上下文，不是 Issue 副本。外部贡献者默认不自行分配 Task 编号或修改 `RELEASE.md`。
- 第一批标签保持四个维度：type、status、area、platform；保留 GitHub 发现入口 `good first issue`、`help wanted` 和 `duplicate`。
- Issue chooser 禁止公开空白 Issue，提供错误、功能建议、使用与安装、提示词与内置 Agent 资产、其它问题五个双语结构化表单。安全漏洞只走 GitHub Private Vulnerability Reporting 的原生入口。
- 暂不创建 `CODE_OF_CONDUCT.md`，等待确定可执行的私密投诉渠道后再讨论。
- 代码基线工作流标记为 Advisory，不设置 branch required checks；基线修复另建公开 Issue。
- 不建立 Discussions、CODEOWNERS、stale bot、欢迎机器人或其它当前贡献规模不需要的自动化。

## Implementation Walkthrough

### 贡献入口

- 新建中英文贡献指南，覆盖本地开发、稳定编码规范、隐私、Agent 协作、Task/ADR/Reference 分工、Git、PR、Review 和许可证。
- 在中英文 README、文档索引和 `AGENTS.md` 增加贡献入口。
- 新建双语 PR 模板和安全政策。

### Issue 与标签

- 建立错误报告、功能建议、使用与安装问题、提示词与内置 Agent 资产、其它问题五个 Issue Form；每个表单都要求隐私确认和重复检查，提示词贡献额外要求内容授权确认。
- `.github/labels.yml` 当前作为 23 个标签的仓库内真相源。
- 五个表单都自动添加一个 `type:*` 和 `status: needs-triage`；提示词与内置 Agent 资产表单另外自动添加 `area: agent`，platform、其它 area 和后续状态由维护者根据内容分流。

### 自动校验与 CI

- 新建 `scripts/ci/validate-community-files.ts`，解析所有新增 YAML，检查标签唯一性、颜色、双语描述、表单字段 ID、必填字段、标签引用、隐私确认和中英文贡献指南章节数量。
- 新建 Community and Docs Checks，对社区文件和文档改动执行清单校验与文档构建。
- 新建 Code Baseline (Advisory)，把 typecheck 与全量测试拆成独立 job，分别留下真实结果；当前不作为合并门禁。

## Verification / Test

- 第一阶段首次验收时 `bun scripts/ci/validate-community-files.ts` 通过：22 个标签、3 个 Issue Form、8 个 YAML；标签引用、字段 ID、必填字段、隐私确认、中英文贡献指南和三条工作流结构合同全部成立。
- `bun run docs:build` 通过；只有既有 chunk size warning。
- `git diff --check` 对本任务文件通过；只有仓库既有 CRLF 转换提示。
- 中英文贡献指南均为 10 个二级章节，并通过互链、章节数量和分流状态关键合同自动校验。
- 已知非本任务基线：typecheck 26 处 llmlint fixture 错误；全量 Vitest 本地 240 秒未收敛。
- GitHub 远端复核通过：22 个标签的名称、颜色和双语描述与 `.github/labels.yml` 一致；#5、#6、#10、#12、#14 的分流符合本任务决定；CI 基线 Issue 为 [#15](https://github.com/notnotype/neuro-book/issues/15)。
- GitHub Private Vulnerability Reporting、Secret Scanning 和 Push Protection 均为 enabled；两条新增工作流均被 GitHub 识别为 active。
- Community Profile 健康度从 42% 升至 85%，已识别 `CONTRIBUTING.md` 和 PR 模板。该 API 不返回 Security 字段，且本次查询仍未把 YAML Issue Form 填入 `issue_template` 字段；表单文件、YAML 校验和配置路径均已独立验证，实际 Issue chooser 留作人工验收。
- 按仓库规则不自动执行浏览器验收；Issue chooser 视觉检查留作可选人工验收。

## Remote Changes

- 默认 `bug`、`enhancement`、`documentation`、`question` 已原地重命名为对应 `type:*` 标签，保留历史关联；保留的 `good first issue`、`help wanted`、`duplicate` 已更新双语描述；`invalid`、`wontfix` 已删除。
- 第一阶段新增 15 个 type/status/area/platform 标签，当时远端标签总数为 22。
- 已分流开放 Issue：#14 feature/agent/needs-design；#12 feature/localization/needs-design；#10 bug/install-release/macos/needs-triage；#6 bug/agent/needs-triage；#5 bug/install-release/windows/needs-design。
- 已创建 [#15](https://github.com/notnotype/neuro-book/issues/15) 追踪可强制执行的 PR 质量门禁基线。
- 已开启 Private Vulnerability Reporting、Secret Scanning 和 Push Protection。
- 本期不创建 branch ruleset，不调整 merge/rebase/squash 设置。

## Deviations

- GitHub Community Profile API 只确认贡献指南和 PR 模板；它在本次查询中没有返回 YAML Issue Form 或 Security Policy 的识别字段。没有为了追求 API 健康度改回旧 Markdown Issue Template；YAML Form 是本项目需要的结构化入口，文件存在性和静态合同已经验证。

## Audit Remediation (2026-07-28)

### Findings and Decisions

- 审查发现新建 Community workflow 与既有 Deploy Docs 都在 `bun install` 后直接执行 `docs:build`。本地残留 `.nuxt` 使第一期验证误判为通过；GitHub 干净 Runner 最近 5 次均因缺少 `.nuxt/tsconfig.json` 失败。
- Code Baseline paths 漏掉 Nuxt plugin、Prisma/Uno/Bun 配置、根类型声明、Docker Compose、配置样例和 Release migration 声明；这些入口此前可以在不触发新代码检查的情况下变更。
- `.github/labels.yml` 当时只有仓库内静态引用校验，没有可重复的远端 drift 检查或同步命令。开放 Issue 也没有机器可执行的 type/status 唯一性和社区发现标签合同。
- `PROJECT-STATUS.md` 已公开链接本地未提交的 Task 129/130 文档，远端均返回 404。对应文档分别为 179/479 行且关联大量在途实现，不应夹带到本任务。
- 采用维护者显式命令同步标签，不给 Actions 增加 `issues: write`；`help wanted` 与 `good first issue` 只允许出现在 `status: ready` Issue。

### Implementation and Verification

- Community and Docs Checks 与 Deploy Docs 现在都执行 `bun run nuxt:prepare` 后再构建文档；静态校验锁定安装、prepare、校验、构建的顺序以及只读/Pages 权限和 15/10 分钟超时。
- Code Baseline 补齐审查发现的真实源码、类型和构建配置 paths；typecheck/test 继续保持独立 Advisory job 和 15/30 分钟超时，不建立 required check。
- 新增共享标签清单解析、精确远端差异和开放 Issue 分流审计，以及 `github:labels check/apply` 维护命令。默认 apply 只 upsert；额外标签只有显式 `--delete-extra --yes` 才删除。
- `bun run test -- scripts/ci/community-labels.test.ts --reporter=dot`：4/4 通过，覆盖完全匹配、缺失/元数据/额外差异、type/status 唯一性和社区标签 ready 前置条件。
- 审查修复当时 `bun scripts/ci/validate-community-files.ts`：通过，22 个标签、3 个 Issue Form、8 个 YAML。
- `bun run nuxt:prepare` 与 `bun run docs:build`：通过；文档构建只有既有 chunk size warning。
- 审查修正前 `github:labels check` 只报告 #12 的 `help wanted + needs-design` 冲突；移除 `help wanted` 后当时远端 22 个标签和全部开放 Issue 分流合同通过。
- 第一笔修复提交为 `e5fc30a8`。GitHub [Community and Docs Checks #30328099856](https://github.com/notnotype/neuro-book/actions/runs/30328099856) 与 [Deploy Docs #30328077845](https://github.com/notnotype/neuro-book/actions/runs/30328077845) 均在干净 Ubuntu Runner 上成功。
- 远端 `PROJECT-STATUS.md` 暂时移除 Task 129/130 状态行；当前工作副本和未提交 Task 文档均保留，待对应实现正式提交时恢复。

### Remaining Boundaries

- 没有 dispatch Code Baseline：它的 typecheck 和全量 Vitest 仍是 #15 记录的已知失败/超时基线，本轮只验证结构合同，没有把它描述成通过。
- 没有自动进行浏览器验收；登录后的 Issue chooser 视觉检查仍由人工执行。

## Issue Intake Follow-up (2026-07-31)

### Findings and Decisions

- 人工截图确认 Issue chooser 同时显示 GitHub 根据安全政策生成的原生 “Report a security vulnerability” 和 `config.yml` 手工添加的安全链接，形成重复入口。保留原生入口，删除手工 `contact_links`。
- 禁用公开 Blank issue 后，外部贡献者在现有三类表单都不适用时没有公开逃生口；维护者专用 Blank issue 不能替代公开贡献入口。新增“其它问题”结构化表单，并继续保持 `blank_issues_enabled: false`。
- 通用功能建议无法稳定收集 Profile、Skill、Workflow 和其它提示词资产所需的目标路径、真实场景、预期行为、评测样例与内容授权。新增独立表单，但继续复用 `type: feature`、`area: agent` 和现有状态机。
- “其它问题”新增 `type: other`；`area: agent` 的双语描述扩展到 Skill 和其它提示词，不为每类 Agent 资产继续拆分更多标签。

### Implementation

- 新增 `prompt-contribution.yml`，覆盖优化现有资产和贡献新资产两类请求；要求资产类型、目标名称或路径、实际场景、期望行为、内容授权、隐私与重复检查，可选提交草案和脱敏评测样例。
- 新增 `other-request.yml`，要求主题、现有入口不适用的原因和详细情况，并明确安全漏洞仍需私密报告。
- 社区校验把表单合同从 3 个扩展到 5 个、YAML 清单从 8 个扩展到 10 个，锁定每个表单恰好一个 `type:*` 与一个 `status:*`，并禁止再次手工加入 Private Vulnerability Reporting chooser 链接。
- 中英文贡献指南同步增加两个入口并说明“其它问题”不能绕过安全报告或必要设计讨论。

### Local Verification

- `bun scripts/ci/validate-community-files.ts`：通过，当前清单为 23 个标签、5 个 Issue Form、10 个 YAML。
- `bun run docs:build`：通过，VitePress 约 15 秒完成；只出现既有的大 chunk warning。
- `git diff --check` 对本轮贡献体系文件通过；PowerShell 仅提示仓库既有的 LF/CRLF 转换行为。

### Remote Verification

- 实现提交 `146375d0` 已推送到 `master`；远端 `config.yml` 只保留 `blank_issues_enabled: false`，两个新增 Issue Form 均可通过 GitHub Contents API 读取。
- `bun run github:labels -- apply --yes` 已创建 `type: other` 并更新 `area: agent` 描述；随后 `bun run github:labels -- check` 通过，23 个远端标签及全部开放 Issue 的 type/status 合同一致。
- GitHub Private Vulnerability Reporting API 返回 `enabled: true`；移除手工 contact link 后仍保留 GitHub 原生私密漏洞报告能力。
- [Deploy Docs #30611776367](https://github.com/notnotype/neuro-book/actions/runs/30611776367) 与手动触发的 [Community and Docs Checks #30611854690](https://github.com/notnotype/neuro-book/actions/runs/30611854690) 均在提交 `146375d0` 上成功。
- 按仓库规则没有自动执行浏览器验收；API 能确认文件与配置落地，但不把它描述成 Issue chooser 的视觉呈现已经通过。

## Clean-runner CI Follow-up (2026-07-31)

### Findings and Remediation

- 第一轮审查修复没有覆盖干净 Runner 的 Nuxt 生成前置；`ff26055e` 为两个文档工作流加入 `bun run nuxt:prepare`，并将 Issue Form 文件改为带数字前缀的确定顺序 `01`、`02`、`03`、`04`、`99`。
- Community workflow 原先只在 pull request 触发，已补 `master` push；Community、Deploy Docs 和 Code Baseline 三条贡献体系工作流显式使用 Node 24。Code Baseline 的 paths 也补齐 plugins、根类型声明、Prisma/Uno/Bun 配置、Docker、配置样例和 release migration 等入口。
- `9551c27e` 把 Nitro patch 校验从依赖 Vitest bootstrap 的测试中抽为 standalone 脚本；`a6f27f81` 再兼容 Linux clean Runner 的 Bun nested `.bun/.../node_modules/nitropack` 布局。标签描述的 `null` 远端值统一归一为空字符串，避免静态清单与 API 结果误报漂移。
- Nitro patch 的实际 unified diff 坐标也被校正：第二个 hunk 从 `1280` 开始，第三个旧起点 `1496` 在前面累计增加三行后应为 `1499`。Task 130 另行记录该根因；非法安装产物由 standalone 校验直接解析语法和语义，不再由 Vitest 启动间接覆盖。

### Verification Evidence

- 本地 `bun install --frozen-lockfile`、`bun scripts/ci/validate-nitropack-patch.ts`、`bun scripts/ci/validate-community-files.ts`、Nitro 与标签聚焦测试（2 files / 6 tests）、`bun run github:labels -- check`、`bun run nuxt:prepare` 和 `bun run docs:build` 均通过；文档构建只有既有大 chunk warning。`bun.lock` 没有因 patch 文本坐标变化而产生变更。
- `ff26055e` 后的 [Community and Docs Checks 30620002275](https://github.com/notnotype/neuro-book/actions/runs/30620002275) 与 [Deploy Docs 30620002220](https://github.com/notnotype/neuro-book/actions/runs/30620002220) 失败，原因是 clean checkout 中 Vitest bootstrap 被仓库另一项未提交的 tsconfig 修复阻断；不是贡献文件合同失败。
- `9551c27e` 后的 [Community and Docs Checks 30620260863](https://github.com/notnotype/neuro-book/actions/runs/30620260863) 与 [Deploy Docs 30620260853](https://github.com/notnotype/neuro-book/actions/runs/30620260853) 失败，原因是 standalone 校验错误假设顶层 `node_modules/nitropack` 存在；随后由 `a6f27f81` 修复 nested Bun 路径。
- 最终 [Deploy Docs 30620354444](https://github.com/notnotype/neuro-book/actions/runs/30620354444) 与 [Community and Docs Checks 30620354426](https://github.com/notnotype/neuro-book/actions/runs/30620354426) 在 GitHub Ubuntu clean Runner 上成功。Deploy 仍有既有 Actions Node 20 deprecation warning，但仓库已用 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 强制 Node 24，未影响结果。
- 没有 dispatch Code Baseline：typecheck 的 26 处 llmlint fixture 漂移和全量 Vitest 超时仍由 #15 跟踪，不能描述成通过，也没有建立 required checks。

### Remote and Acceptance Boundaries

- 三笔实现提交 `ff26055e`、`9551c27e`、`a6f27f81` 均已推送到 `master`；GitHub API 复核确认五个数字前缀表单、旧文件名消失、`config.yml` 只有 `blank_issues_enabled: false`、Private Vulnerability Reporting 为 enabled，`bun run github:labels -- check` 通过。Secret Scanning 与 Push Protection 也保持 enabled。
- 本轮没有修改 `bun.lock`，没有触碰 Product Platform、发布工作流、branch rules 或 required-check 策略；早期审查为避免夹带 Task 129/130 在途实现而做的状态行索引补丁没有覆盖工作副本，后续对应任务提交已使这些状态行重新出现在远端，当前工作副本仍保留用户的完整改动。
- 按仓库规则没有自动进行浏览器验收；Issue chooser 的登录后桌面/窄屏视觉检查，以及确认只显示一个原生 Security 入口，继续留作人工验收。

## PR-Intent and Claimed Follow-up (2026-08-07)

### Findings and Decisions

- 2026-08-06 远端标签色板已按维度统一（type 蓝、status 绿、area 紫、platform 灰、pr 黄、priority 橙、source 粉），但 `.github/labels.yml` 未同步，且 `pr:*`、`priority:*` 六个标签从未登记进清单，`github:labels check` 持续报告元数据漂移与清单外标签。本次把清单对齐当前远端色板并补登缺失标签，恢复清单作为真相源。
- 为减少重复 PR，四个表单（bug、feature、prompt、other）新增必选下拉 `pr-intent`：创建者声明是否愿意实现并提交 PR；support 问答表单不涉及代码实现，不添加。
- 新增 `status: claimed` 作为实现授权信号：创建者在表单中声明愿意实现且范围确认后，维护者添加该标签作为授权，创建者才开始实现。已 `claimed` 的 Issue 不并行实现，重复 PR 会关闭或择优合并。

### Implementation

- `.github/labels.yml` 新增 `status: claimed`（绿 `0E8A16`），补登 `pr: pending-review`、`pr: blocked`、`priority: urgent/high/normal/low`，并把全部标签颜色对齐当前远端色板。
- `01-bug-report.yml`、`02-feature-request.yml`、`03-prompt-contribution.yml`、`99-other-request.yml` 在隐私确认前插入必选 `pr-intent` 下拉；`04-support-request.yml` 不变。
- 中英文贡献指南在「开始之前」「维护者分流」「Pull Request 要求」三处同步 `status: claimed` 与重复 PR 合同。

### Verification

- `bun run github:labels -- apply --yes` 创建 `status: claimed` 并保持其余标签与远端一致；`bun scripts/ci/validate-community-files.ts` 通过，标签清单、五个表单和 YAML 合同成立。
- `bun run github:labels -- check` 的标签清单合同通过；开放 Issue 分流仍可能因未分流 Issue（如 #71 缺 type/status）报告违规，属独立分流事项。
- 按仓库规则不自动执行浏览器验收；新表单字段在 Issue chooser 的实际呈现留作人工验收。

## TODO / Follow-ups

- 修复类型检查和全量测试基线后，再讨论 required checks 与 `master` ruleset。
- 确定社区行为投诉的私密处理渠道后，再讨论 `CODE_OF_CONDUCT.md`。
- 人工打开 GitHub Issue chooser，检查五个表单在桌面和窄屏下的实际呈现，并确认只显示一个原生 Security 入口。
