# SillyTavern Import Skill Hardening

## User Request

- 新建一个 task。
- 根据现有讨论出的 NeuroBook 目录规范、信息控制、写作 workflow / emulation 规范，优化、加强 [`SillyTavern角色卡导入`](../../../assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/) skill。

## Goal

把 `SillyTavern角色卡导入` 从“可运行的导入说明”加强为符合当前 NeuroBook 规范的稳定导入 workflow。它的核心职责是完成第一遍 lorebook 导入：尽可能把 SillyTavern 角色卡 / worldbook 条目按 NeuroBook 目录协议分类为稳定 `lorebook/` 内容节点；难以分类、动态运行、低置信或有污染风险的内容进入报告和 `reference/silly-tavern/**`，交给后续 Agent / 作者继续分类与迁移。

本任务还要明确 `inspect -> unpack -> import` 的 artifact 边界，保留动态机制到 `reference/silly-tavern/**`，并把后续写作 / RP / emulation 初始化的衔接点说明清楚。第一版不把 ST runtime 直接搬进 NeuroBook，也不让导入器自动泄露上帝视角信息给 subject。

成功标准：

- skill 文档能指导 Agent 使用当前规范安全导入 ST 卡。
- CLI / report 合同与 skill 描述一致。
- 导入结果符合 `reference/content/directory-protocol.md`、`reference/content/information-control.md` 和 `reference/agent/novel-writing-workflow.md`。
- 相关测试覆盖稳定分类、动态跳过、RP / emulation 迁移边界和 report 输出。

## Current State

当前 skill 已具备基础导入流程：

- `inspect`：只输出临时 overview，不写文件。
- `unpack`：生成 `reference/silly-tavern/{slug}/` 解包目录。
- `import`：从解包目录读取数据，将稳定 worldbook entry 写入 `lorebook/*`。
- `--rp`：额外生成 `reference/silly-tavern/{slug}/simulation-migration/` 动态机制归档，不写入 `simulation/`。
- 动态 MVU、Prompt Template、EJS、regex、状态栏/UI 等不会直接作为稳定 lorebook fact 导入。

当前已落地：

- `novel-import-silly-tavern-card` 已是 canonical skill；旧中文目录已删除，只在历史任务记录中保留旧名。
- 导入分类已对齐当前目录协议：世界规则进 `lorebook/world/rule/`，机制进 `lorebook/system/`，AI 使用说明按风险进入 `lorebook/instruction/` 或 dynamic archive。
- `--rp` 继续生成 `simulation-migration/` 迁移候选，但候选目标已对齐 profile context V2：simulator 规则进入 `agent-context/simulator.leader/context.md`，writer 规则进入 `agent-context/rp.writer/context.md`，runtime state 仍进入 `simulation/subjects|entities|runs`。
- 对 `knowledge.md`、subject、entity、state、runs 的信息控制边界已写入 skill、report 和 follow-up workflow。
- import report 已包含 recommended next steps，指导 validate、classification review、emulation bootstrap 或 tick。

## Relevant References

- [../../../assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/SKILL.md](../../../assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/SKILL.md)
- [../../../assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/scripts/silly-tavern-card.ts](../../../assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/scripts/silly-tavern-card.ts)
- [../../../reference/content/directory-protocol.md](../../../reference/content/directory-protocol.md)
- [../../../reference/content/information-control.md](../../../reference/content/information-control.md)
- [../../../reference/agent/novel-writing-workflow.md](../../../reference/agent/novel-writing-workflow.md)
- [../../../docs/tasks/01-agent-roleplay-mode/README.md](../../../docs/tasks/01-agent-roleplay-mode/README.md)
- [../../../docs/tasks/31-novel-writing-workflow-emulation/README.md](../../../docs/tasks/31-novel-writing-workflow-emulation/README.md)
- [../../../docs/tasks/32-novel-workflow-emulation-implementation/README.md](../../../docs/tasks/32-novel-workflow-emulation-implementation/README.md)
- [../../../docs/research/st-roleplay-tooling.md](../../../docs/research/st-roleplay-tooling.md)

## Implementation Plan

## Confirmed Decisions

- `novel-import-silly-tavern-card` 是当前 canonical skill；旧 `SillyTavern角色卡导入` 目录已在 2026-06-04 skill 命名统一中移除。
- 新导入硬切：不再默认生成过时 `lorebook/rule` 路径。旧项目已有 `lorebook/rule` 不迁移、不删除。
- ST 状态栏、MVU、Prompt Template、EJS、regex、JS slash runner、Tavern Helper runtime 默认进入 dynamic archive / migration notes；不因为它们包含格式文本就进入 `lorebook/instruction/`。
- `--rp` 继续输出 `reference/silly-tavern/{slug}/simulation-migration/`，不改成 `emulation-migration/`；当前稳定目录仍是 `simulation/`。
- 导入器不生成 `simulation/subjects/*`，但可以生成 subject candidates，供后续 `novel-workflow-05-emulation-bootstrap` 人工过滤后使用。
- 导入器不创建 `simulation/entities/**`，但可以生成 entity candidates，供后续 simulator leader / emulation bootstrap 判断是否实例化。
- `import-report.md` 同时服务人类和 Agent，Markdown 为主；JSON summary 保持轻量机器可读。
- 新增 skill 后同步 `reference/agent/novel-writing-workflow.md` 的 Import Skills 表，避免 reference 与系统资产漂移。
- 混合职责条目第一版不做自动拆分；自动拆分容易误判边界，先进入 classification review queue，由后续 Agent / 作者处理。
- 低置信但包含可复用稳定设定的条目进入 `lorebook/note/`，并标记 `status: pending`；纯动态、污染风险高或无法判断的内容只进入 report / dynamic archive，不落稳定 lorebook。

### Phase 1: Skill Contract Rewrite And New Entry

新增 `novel-import-silly-tavern-card/SKILL.md`。2026-06-04 后，CLI 脚本也迁入 canonical 目录：

- 明确它是导入 workflow，不是 RP runtime、不是 ST runtime 兼容层。
- 明确本 skill 负责第一遍 lorebook 导入：尽可能按当前 NeuroBook 规范分类稳定 worldbook 条目；难以分类的内容写入 `Needs Review` / report，后续由 Agent 或作者继续处理。
- 补充与当前小说 workflow 的关系：
  - 导入稳定 canon 后，可进入 `novel-workflow-05-emulation-bootstrap` 初始化运行态。
  - 需要剧情推进时，再进入 `novel-workflow-06-emulation-tick`。
  - 正式章节写作仍由 `novel-workflow-09-chapter-writing` / 普通 `writer` 承担。
- 明确 artifact 边界：
  - 原始素材和低置信迁移材料进 `reference/silly-tavern/{slug}/`。
  - 稳定设定进 `lorebook/`。
  - subject-facing knowledge 不由导入器自动生成。
  - entity 只在后续 simulation/emulation 中按状态追踪需要创建。
- 明确 `--rp` / dynamic migration 只产生迁移参考，不初始化 `simulation/subjects`、`entities`、`runs`。

### Phase 2: Lorebook Classification Alignment

更新 skill 文档和 CLI 分类规则，使导入目标对齐当前 directory protocol：

- `character` -> `lorebook/character/`
- `location` -> `lorebook/location/`
- `faction` -> `lorebook/faction/`
- `item` -> `lorebook/item/`
- `event` -> `lorebook/event/` 或低置信 `lorebook/note/`
- 世界规则 -> `lorebook/world/rule/`
- 可运行机制 / 玩法系统 -> `lorebook/system/`
- 写作风格、回复格式、禁止项、状态栏格式等 AI 使用说明 -> `lorebook/instruction/` 或 dynamic archive，按风险区分
- unknown -> `lorebook/note/` + `Needs Review`

注意：动态 MVU / JS / regex / Prompt Template 不应因为含有格式文本就进入稳定 `instruction/`；只有作品级、静态、可复用的 AI 指导才可以迁移。

分类策略应以“尽可能导入稳定 lorebook，但不伪装不确定性”为原则：

- 高置信稳定设定直接导入对应 `lorebook/` 节点。
- 混合职责条目不自动拆分，进入 classification review queue / `Needs Review`，交给后续 Agent / 作者处理。
- 动态机制、状态栏、变量更新规则和运行时格式要求不进入稳定 lorebook。
- 低置信但可复用的稳定设定可以进入 `lorebook/note/`，frontmatter 使用 `status: pending`，避免被当成 active canon。
- 纯动态、污染风险高或无法判断内容只进入 report / dynamic archive，不创建 lorebook 节点。
- 难分类条目必须在 report 中写清“为什么难分类”和“建议后续由 Agent 如何处理”。

### Phase 3: Import Report Enhancements

增强 `import-report.md` / JSON summary：

- 显示分类统计：稳定导入、dynamic skipped、unknown review、preset-only。
- 显示 affected lorebook roots，便于后续 `workspace node validate`。
- 显示 dynamic migration summary：MVU variables、update rules、regex、Prompt Template、状态栏/UI、Tavern Helper scripts。
- 显示 classification review queue：难分类条目、混合职责条目、低置信条目和不应自动拆分的条目。
- 显示 recommended next steps：
  - `workspace node validate ...`
  - 人工 review unknown / instruction-risk 条目。
  - 如果用户要 RP / emulation：运行或人工执行 `novel-workflow-05-emulation-bootstrap`。
  - 如果要推进剧情：运行 `novel-workflow-06-emulation-tick`。
- 明确“不自动创建 subject knowledge / entity state”的原因：防止上帝视角泄露和错误实例化。

### Phase 4: Simulation / Emulation Migration Notes

强化 `simulation-migration/` 归档内容：

- 把 dynamic 机制按迁移目标分类：
  - `agent-context/simulator.leader/context.md` candidates：世界裁决规则、状态更新规则、系统玩法。
  - `agent-context/rp.writer/context.md` candidates：只影响用户可见正文的风格或格式要求。
  - `subject candidates`：可能转为 subject `knowledge.md` / `mind.md` 的角色视角材料，但必须人工过滤。
  - `entity candidates`：需要状态追踪的唯一物品、隐藏状态、变量化道具。
  - `unsupported runtime`：暂不迁移的 JS、regex、外部脚本、UI 状态栏。
- 归档只做迁移建议，不直接写入 `simulation/`。

建议结构：

```text
simulation-migration/
|-- README.md
|-- simulator-candidates.md
|-- writer-candidates.md
|-- subject-candidates.md
|-- entity-candidates.md
`-- unsupported-runtime.md
```

### Phase 5: Tests And Verification

更新或新增测试：

- `server/agent/skills/skill-catalog.test.ts`
  - 断言 `novel-import-silly-tavern-card` 可见；旧 `SillyTavern角色卡导入` 不再作为当前 catalog 入口。
- `server/agent/skills/silly-tavern-card-cli.test.ts`
  - 分类目标不再使用旧 `lorebook/rule` 作为默认规则目录。
  - dynamic 条目仍跳过稳定 lorebook import。
  - unknown 条目进入 `Needs Review`。
  - 难分类条目写入 classification review queue。
  - `--rp` 生成 `simulation-migration/`，但不创建 `simulation/subjects`、`simulation/entities` 或 `simulation/runs`。
  - import report 包含 recommended next steps 和 affected roots。
- 如修改模板或 reference，跑相关 workspace/template 测试。

建议验证命令：

```bash
bun run test server/agent/skills/skill-catalog.test.ts server/agent/skills/silly-tavern-card-cli.test.ts
```

如果新增或修改系统 skill 后影响 user-assets sync，可补跑相关 workspace-files 窄测试。

## Out Of Scope

- 不执行 SillyTavern JS、MVU、regex、EJS 或 Tavern Helper runtime。
- 不把 `reference/silly-tavern/**` 自动注入 writer / actor。
- 不自动创建 subject `knowledge.md`、`mind.md`、`state.md`。
- 不自动创建 `simulation/entities/`。
- 不把 `simulation/` 改名为 `emulation/`。
- 不实现 GraphRAG、完整 visibility schema 或 actor-safe 自动摘要。

## Risks

- ST worldbook 条目经常混合角色、系统、变量更新、格式约束和剧情事件；分类规则必须保守，宁可进入 `Needs Review`，不要把动态机制伪装成稳定 canon。
- 把静态 prompt / 状态栏格式直接导入 `lorebook/instruction/` 可能污染普通 writer 或 leader；需要区分作品级 AI 说明和 ST runtime 输出格式。
- 自动生成 actor knowledge 容易泄露上帝视角；第一版继续禁止。
- 直接实例化物品或变量会造成错误状态；entity 创建交给后续 emulation / simulator leader 裁决。

## Files To Change

预计会触及：

- `assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/SKILL.md`
- `assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/scripts/silly-tavern-card.ts`
- `assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/SKILL.md`
- `server/agent/skills/silly-tavern-card-cli.test.ts`
- `server/agent/skills/skill-catalog.test.ts`
- `reference/agent/novel-writing-workflow.md`
- `CONTEXT.md`
- `reference/content/directory-protocol.md`，仅在导入合同需要稳定化时更新。
- `PROJECT-STATUS.md`，实现完成后同步摘要。

## Acceptance Criteria

- `novel-import-silly-tavern-card` skill 明确遵守当前 directory / information-control / emulation workflow 规范。
- 旧中文 skill 目录已删除；历史文档只把 `SillyTavern角色卡导入` 作为旧名说明。
- 本 skill 明确负责第一遍 lorebook 导入，并把难分类条目写入 report 供后续 Agent / 作者处理。
- 混合职责条目不自动拆分；低置信稳定设定进入 `lorebook/note/` 且 `status: pending`，纯动态/污染/无法判断内容只进 report / dynamic archive。
- CLI 分类目标不再默认产生过时 `lorebook/rule` 路径。
- `import-report.md` 能指导 Agent 下一步做 validate、classification review、emulation bootstrap 或 tick。
- `--rp` / dynamic migration 不直接写入 subject/entity/runs。
- 相关窄测试通过，或记录与本任务无关的既有失败。

## Current Status

Implemented and continuing to harden. The canonical English skill exists, the legacy Chinese skill has been removed, the CLI no longer emits new `lorebook/rule` imports, report output exposes classification review and next steps, and `--rp` writes migration candidates without creating `simulation/` runtime state.

The latest importer contract is:

- Stable worldbook entries go to `lorebook/`.
- Dynamic worldbook entries are archived under `reference/silly-tavern/{slug}/dynamic-worldbook/`; they are no longer skipped.
- Structure-only markers such as `➡️...开始/结束` remain in raw reference and import report only.
- Card body materials go to `reference/silly-tavern/{slug}/card-body/`, including `first_mes`, `alternate_greetings`, `mes_example`, `scenario`, and `description`.
- Stable lorebook outputs do not include ST raw `ext` metadata, generated source quotes, classification reason block, or empty `（空）` placeholder.

## Walkthrough

- 2026-06-03：根据用户要求新建 task，读取当前 `SillyTavern角色卡导入` skill、tasks 31/32、RP 和 directory/information-control 规范，整理实现计划。
- 2026-06-03：经 grill-with-docs 质询确认关键决策：新增英文权威入口、硬切 `lorebook/rule` 新输出、动态 ST runtime 默认归档、`simulation-migration/` 名称保留、subject/entity 只生成候选不创建运行态、report 同时面向人类和 Agent，并把“第一遍 lorebook 导入 + 难分类报告”提升为核心目标。
- 2026-06-03：确认混合职责条目第一版不自动拆分；低置信但可复用的稳定设定进入 `lorebook/note/` 且 `status: pending`，纯动态、污染风险高或无法判断内容只进 report / dynamic archive。
- 2026-06-03：实现 canonical `novel-import-silly-tavern-card` skill，旧中文 skill 改为兼容入口；CLI 分类目标切换为 `lorebook/world/rule`、`lorebook/system`、`lorebook/event` 等当前目录协议；混合职责和低置信条目落 `lorebook/note` pending；`import-report.md` 增加 affected roots、dynamic migration summary、classification review queue、pending notes 和 recommended next steps。
- 2026-06-03：`--rp` 的 `simulation-migration/` 改为 `README.md`、`simulator-candidates.md`、`writer-candidates.md`、`subject-candidates.md`、`entity-candidates.md`、`unsupported-runtime.md`，只提供迁移候选，不创建 `simulation/subjects`、`simulation/entities` 或 `simulation/runs`。
- 2026-06-03：补齐教程和 RP task 旧口径：用户教程改用 `novel-import-silly-tavern-card`，canonical skill 作为唯一当前入口；task 01 中的导入目标同步为 `lorebook/world/rule`、`lorebook/system`、`lorebook/event` 和新 `simulation-migration/` 文件结构。
- 2026-06-03：增强分类 review 标记：状态栏/UI/好感度面板等 ST runtime 风险词不会直接进入稳定 `lorebook/system`，而是进入 pending note 与 classification review queue；普通可模拟系统仍可进入 `lorebook/system`。
- 2026-06-04：skill 命名统一后，删除旧 `SillyTavern角色卡导入` 兼容目录，`scripts/silly-tavern-card.ts` 迁入 `novel-import-silly-tavern-card/scripts/`，测试和文档入口同步使用 canonical path。
- 2026-06-06：根据命定之诗手动分类经验增强 importer：新增 `species` 分类、comment 命名模式优先规则、system 关键词扩展、location import 阶段自动嵌套、dynamic worldbook 独立归档、结构分隔标记 report-only、card-body 素材归档，并清理稳定 lorebook 中的 ST 原始 metadata 与自动生成正文块。
- 2026-06-07：同步 profile context V2 口径。`simulation-migration/` 的 simulator / writer candidates 分别指向 `agent-context/simulator.leader/context.md` 与 `agent-context/rp.writer/context.md`；旧中文 skill 名仅作为历史说明，不再是当前 catalog 入口。

## Files Changed

- `docs/tasks/34-silly-tavern-import-skill-hardening/README.md`
- `CONTEXT.md`
- `assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/SKILL.md`
- `assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/scripts/silly-tavern-card.ts`
- `assets/workspace/.nbook/agent/skills/RP模式/SKILL.md`
- `assets/workspace/.nbook/agent/skills/小说初始化流程/SKILL.md`
- `assets/workspace/.nbook/agent/skills/世界书初始化流程/SKILL.md`
- `server/agent/skills/silly-tavern-card-cli.test.ts`
- `server/agent/skills/skill-catalog.test.ts`
- `reference/agent/novel-writing-workflow.md`
- `docs/tutorials/05-import-character-card.md`
- `docs/tasks/01-agent-roleplay-mode/README.md`
- `docs/tasks/01-agent-roleplay-mode/roleplay-runtime-structure.md`
- `PROJECT-STATUS.md`

## Verification

- `bun run test server/agent/skills/skill-catalog.test.ts server/agent/skills/silly-tavern-card-cli.test.ts` passed.
- `bun assets/workspace/.nbook/agent/skills/novel-import-silly-tavern-card/scripts/silly-tavern-card.ts --help` passed.

## TODO / Follow-ups

- 后续可继续增强分类器的语义规则，但混合职责条目仍默认进入 review queue，不自动拆分。
- 后续可为 `simulation-migration/` 增加更强的 subject / entity 候选提取，但不应越过信息控制边界自动写运行态。
