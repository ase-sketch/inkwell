# Agent Note: 代写引擎整体下线（M1c）

Status: implemented

## Problem
Inkwell 定位「不代写正文」，但 fork 基座 neuro-book 自带 writer 代写引擎（writer profile + Discord/RP/SillyTavern 预设圈的文风预设：writer.home/styles/ 53 个 + references/ 1 个）。这批预设在 M1b 新壳已不可达（profile 下拉是硬编码白名单，只有 leader.default + interview.new-book），是死资产；只要基座 writer profile 还在，就留着一条与定位相悖的代写路径，其契约测试也持续制造维护噪音（含 HANDOFF 登记的既有 server 红）。

## Decision
代写引擎已整体下线，作为独立小里程碑 M1c（M1b 收口后、M2 开工前）执行完毕。实际移除范围：

- **Profile**：`writer`、`rp.writer`、`director`、`rp.leader`、`simulator.leader`、`simulator.actor` 六个 builtin profile 文件删除；builtin 由 15 个降为 9 个（留 leader.default / leader.assets / interview.new-book / memory.curator / researcher / retrieval / summarizer / world.engine / inline.editor）。
- **资产**：`writer.home/`（54 个文风/参考预设）、`assets/reference/agent/rp-tick/`（8 个 RP Tick 协议文档）、两个 workflow（`chapter-write-review-revise`、`write-review-loop`）连同各自的运行级测试一并删除。
- **Host 代码**：`server/agent/profiles/writer-writing-style.ts`、`writer-writing-reference.ts`、`profile-sdk/writing.ts` 删除；`profile-artifact-compiler.ts` 与 `profile-command.ts` 的 `allowedSdkSpecifiers` 收敛为 `["nbook/profile-sdk"]`；`novel-workspace.ts` 移除 writer.home 的白名单例外与历史资产兼容映射；Product Authoring Kit 的 `profile-sdk/writing` 投影边、声明入口与裸入口重写表同步移除。
- **Prompt**：`leader.default` 删除「必须使用 writer」规则、director/writer brief 提及、writer 调用推进链（主链止步于「更新 Plot」）与 autonomous 说明；`leader.assets` 删除 writer.home 提示句。两条随 profile 注入的 reference（`profile-routing.md`、`leader-default.md`）同步改写，不再把用户路由到已删除的 profile。
- **前端**：Agent 新建菜单/会话抽屉/关联面板里已删 profile 的显示名、图标与 linked-agent 分支，以及 zh-CN / en-US 中对应的 i18n 键一并移除；diff-workbench preview 的 mock 路径换成 `leader.default.profile.tsx`。
- **测试**：整文件下线的 4 个契约测试（writer-profile-contract / rp-profiles / simulation-director-profiles / chapter-write-review-revise.workflow）与 2 个 smoke 脚本删除；profile-sdk-contract、leader-assets-profile、workspace-files、profile-compile-worker、compile.post、preview-prepare.post、profile-artifact-dependency-gate、system-assets-projection、system-asset-installation、runtime-artifact-authoring-interface、novel-writing-mode-entries、workflow-catalog、workflow-builtins 改断言或换用存活 profile。
- **文档**：ACKNOWLEDGEMENTS.md 删除「## Presets」整节（5 组预设声明）；manual-eval 的 chapter-writing 旅程归档到 `docs/archived/testing/manual-eval/journeys/` 并加废弃说明。

文风参考改由写作 skill 项目（oh-story-claudecode、chinese-novelist-skill 等，见 docs/spec.md 参考集）承载，经 M2 的 Skill 双轨骨架接入。

**明确不在本次范围**：`inline.editor` profile 及其内联 AI 编辑功能（NovelPromptBar、useInlineEditorAgentController、AgentChatSurface 内联会话注入、builtin-contracts 的 InlineEditor Schema、会话兼容层、i18n）保留现状，是否属于「辅助」而非「代写」留待 M2.5 码字基本盘里程碑统一设计边界。

## Alternatives considered
- 只删预设目录、保留 writer profile：2026-09-21 实测不可行——writer.profile.tsx 的 buildWritingPrompt 强制读 writer.home/styles/，目录缺失直接抛 `Writing styles directory not found`，连锁 15+ 个 profile 契约测试变红（writer-profile-contract / rp-profiles / simulation-director / leader-assets / profile-sdk-contract 等）；该次尝试已 git checkout 回滚（54 个文件）。
- 保留代写引擎、仅在新壳隐藏：死资产与契约测试负担持续存在，「不代写」在代码层不成立，后续里程碑要一直绕着它走。
- 合入 M2 顺带做：减法与新功能混在一个里程碑里验收口径模糊；且 M2 的 Skill 双轨要承接文风参考职能，先清场再接入顺序更顺。
- 连 `inline.editor` 一并下线：内联编辑是用户可见的编辑器功能本体（NovelPromptBar + controller + AgentChatSurface 内联会话 + 会话兼容层），量级等同删一个功能模块而非删 profile 引用；且它是否算「代写」需要产品判断，故移出本里程碑，测绘好的引用面清单留作 M2.5 任务书底稿。

## Consequences
收益：代码层落实「不代写」定位，消除死资产与相关测试红，M2 Skill 双轨获得干净接入面。影响：涉及 profile、资产目录、文档、测试、prompt 五个面，已一次性做净。

执行中发现的、超出原笔记预估的连锁（已一并处理）：
- 两个 workflow 的删除牵连 `workflow-catalog.test.ts`（键与 phase 硬列）、`workflow-builtins.test.ts`（真跑 write-review-loop 的用例）、`scripts/smoke/writing-workflow.ts` 与 `scripts/smoke/real-model/writing-workflow.test.ts`，均随工作流同步处理。
- `profile-sdk/writing.ts` 的删除牵连 Product Authoring Kit 的投影清单、tsc 声明入口、裸入口重写表与 `product-authoring-kit.test.ts` 的 smoke 探针与别名表。
- `profile-sdk-contract.test.ts` 中断言「编译器只放行正式 writing SDK 子入口」的用例失去意义，改写为「只放行 profile-sdk 正式入口」并换用真实的非法子路径。
- 删除 `assets/reference/agent/rp-tick/` 后，`assets/reference/content/subjects.md` 中两条指向 `../agent/rp-tick/subject-creation-guide.md` 的链接失效；`profile-routing.md`、`leader-default.md` 则因被存活 profile Import 而必须改写（否则注入的 prompt 会继续把用户路由到不存在的 profile）。

权衡：M2 Skill 骨架落地前文风参考暂缺（本来新壳也不可达，无实际损失）。上游若再更新 writer 相关代码，跟进策略为「不再跟随」。
