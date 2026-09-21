# llmlint Rule Registry

## User Request / Topic

围绕 `llmlint` 的下一阶段规则系统设计：从当前 `static-rules.json` / `llm-rules.json` / `category-suggestions.json` 的分裂结构，升级为可融合多来源规则包的扁平化 Rule Registry。

用户提供了 `旧中文规则样本目录` 作为真实规则样本，包含 Claude / Gemini / deepseek / 通用 / 轻量等多个规则包。样本呈现出“规则包 -> 分类组 -> subRules”的来源形态，但长期设计应转为一条规则一条记录，便于检索、合并、覆盖和用户安装。

## Goal

设计并实现 llmlint 的规则注册表：

1. 规则记录扁平化：一个 lint 规则就是一条独立记录。
2. 支持多个已安装 ruleset，自由组合启用。
3. `id` 全局唯一，用于定位具体规则来自哪个规则包、哪条规则。
4. `namespace` 可重复，用于规则分类、聚合展示和批量覆盖。
5. 不再单独维护 `category` / `subcategory` / `category-suggestions.json`；namespace 承担分类职责。
6. 支持不同规则包向同一个 namespace 追加规则，也支持规则包或用户配置覆盖已有规则。
7. 用户 config 可以自由选择已经安装的 ruleset，并按 namespace 或 rule id 继续覆写。

## Current Decisions

### 2026-06-29 初始设计

**规则身份**
- `id`：全局唯一，定位具体规则。
- `namespace`：非唯一，承担分类、聚合和批量配置职责。
- `ruleset`：可安装、可启用、可组合的规则包来源。
- `category` / `subcategory`：删除，不进入新 schema；如果需要层级分类，用 namespace 字符串表达。

**namespace 语义**
- namespace 不仅能聚合同类规则，也能作为覆盖面。
- 多个规则包可以向同一个 namespace 添加规则，例如 `modifier` 或 `形副词系`。
- 推荐 namespace 使用稳定英文 key；允许中文 namespace 作为导入兼容和本地自用形态。
- 需要 alias / normalization，把常见中文组名映射到稳定英文 key，例如 `形副词系 -> modifier`。
- 同 namespace 不同 id：视为追加规则。
- 同 id：视为覆盖同一条规则，必须提醒用户来源、旧规则与新规则。
- namespace 不负责整组替换；规则融合只按 `id` 判断追加或覆盖。
- namespace 级配置只用于批量启停或调整 level，不改变规则定义本身。

**ruleset 与用户 config**
- 规则包是安装单元；用户 config 只选择已经安装的 ruleset，不直接依赖任意散落 JSON 文件。
- config 可以按 ruleset、namespace、rule id 三层配置。
- 推荐覆盖优先级：rule id override > namespace override > ruleset setting > rule 默认 enabled / level。
- 规则加载需要产出 summary：启用了哪些 ruleset、每个 namespace 聚合了多少规则、发生了哪些覆盖或冲突。

**规则融合**
- 加载顺序由用户 config 中的 `rulesets` 顺序决定。
- 如果后加载 ruleset 定义了新 id，例如已有 `abc.efg.A` / `abc.efg.B`，新包定义 `abc.efg.C`，则 append。
- 如果后加载 ruleset 定义了已有 id，例如再次定义 `abc.efg.A`，则覆盖旧规则，并产生 diagnostics。
- 最终 registry 中同一个 id 只保留最后加载的规则；diagnostics 记录被覆盖规则的来源。

**detector**
- v1 只保留两种：
  - `regex`：确定性定位。
  - `llm`：需要 Agent / LLM 语义判断。
- 规则 registry 的正式格式只接受标准 regex，不支持 `simple` 花括号模板。
- 现有样本里的 `text` 可在导入时 escape 成 regex；`simple` 必须在导入前或导入工具中转换成标准 regex，不能进入 registry。

**action**
- v1 只保留两种：
  - `replace`：提供替换候选。
  - `suggest`：只提示，不提供确定替换。
- 删除类规则用 `replace` 且 `replacements: [""]` 表达；报告层展示为“建议删除”。

**未来扩展**
- 后续可以提供自定义代码段类型，用一个可执行 rule handler 替代 `detector + action`。
- 自定义代码段属于高级扩展，v1 可以先设计 schema，但不急于默认执行；需要清晰的权限、可移植性和安全边界。
- 代码段规则默认不信任第三方 ruleset；用户需要通过 config 显式信任 ruleset 后才能执行。
- handler 沙盒后续优先复用项目内已有沙盒能力；第一版不实现 handler 执行，只保留设计方向。

## Candidate Record Shape

```typescript
type LintRuleRecord = DeclarativeRuleRecord | HandlerRuleRecord;

type BaseLintRuleRecord = {
    id: string;
    namespace: string;
    ruleset: string;
    title: string;
    level: "high" | "medium" | "low";
    enabled?: boolean;
    note?: string;
    examples?: Array<{
        bad: string;
        good?: string;
        reason?: string;
    }>;
    source?: {
        version?: string;
        importedFrom?: string;
    };
};

type DeclarativeRuleRecord = BaseLintRuleRecord & {
    detector:
        | {type: "regex"; targets: string[]; flags?: string}
        | {type: "llm"; prompt: string};
    action:
        | {type: "replace"; replacements: string[]}
        | {type: "suggest"; message: string};
};

type HandlerRuleRecord = BaseLintRuleRecord & {
    handler: {
        type: "module";
        path: string;
        export?: string;
    };
};
```

handler API 第一版保持很小，只允许检查文本并返回 issue，不直接写文件：

```typescript
type LintRuleHandler = {
    meta?: {
        description?: string;
        deterministic?: boolean;
    };
    check(input: LintRuleHandlerInput): Promise<LintRuleIssue[]>;
};

type LintRuleHandlerInput = {
    text: string;
    filePath: string;
    rule: HandlerRuleRecord;
    options: {
        cwd: string;
    };
};

type LintRuleIssue = {
    ruleId: string;
    namespace: string;
    message: string;
    level?: "high" | "medium" | "low";
    range?: {
        start: number;
        end: number;
    };
    suggestions?: Array<{
        title: string;
        replacement?: string;
    }>;
};
```

安全约束：
- `handler.path` 必须是 ruleset 内部相对路径，不能通过 `..` 跳出 ruleset。
- handler 不获得 shell、写文件能力或 Agent 工具，只接收文本和规则元数据。
- 未被用户信任的 ruleset 中如果包含 handler rule，加载时跳过并产生 warning。
- handler rule 返回 suggestion，不直接修改文件。
- 后续真正执行第三方 handler 前，需要补充 sandbox / trust / deterministic policy。

## Candidate Config Shape

```typescript
type LlmlintConfig = {
    rulesets: string[];
    trustedRulesets?: string[];
    rulesetOverrides?: Record<string, "off" | "on">;
    namespaces?: Record<string, "off" | "low" | "medium" | "high">;
    rules?: Record<string, "off" | "low" | "medium" | "high">;
};
```

示例：

```typescript
export default {
    rulesets: [
        "builtin/default",
        "community/claude-daily",
        "user/local-overrides",
    ],
    trustedRulesets: [
        "user/local-overrides",
    ],
    namespaces: {
        modifier: "medium",
        "vocabulary.r18": "off",
    },
    rules: {
        "community.claude.daily.remove-empty-modifier-shell": "off",
    },
};
```

## Compatibility Notes

- 实现前 `llmlint` 的 `presets` / `customRules.static` / `customRules.llm` 是过渡结构；本任务已迁移到 `rulesets` + flat rule records。
- 现有 `static-rules.json` 与 `llm-rules.json` 可迁移为同一 `rules.jsonl` 或 `rules.json`。
- 现有 `旧中文规则样本目录` 中的 `text` / `simple` / `regex` 三类来源格式，应先归一化为标准 regex；registry 内不保留 `simple` mode。
- 样本规则中 `simple` 数量较多，导入器必须负责把花括号候选表达式转换为标准 regex；转换失败时不能静默丢弃，必须产生 diagnostics。
- 样本规则中存在 `/.../g` 形式的 JavaScript regex literal，导入器需要解析为 `pattern + flags`；scanner 也需要支持 rule detector 自带 flags，而不是固定追加 `g`。
- 样本规则中存在 `enabled: false` 的组和“可选”组，导入时应保留为规则默认 enabled 状态或 ruleset profile metadata，不能默认全部启用。
- 样本规则中 `replacements: []` 表示删除，迁移为 `action: {type: "replace", replacements: [""]}`；多个 replacements 表示多个候选替换。
- 现有 `category-suggestions.json` 不作为独立文件继续扩展；其中有价值的建议迁移到具体 rule 的 `action` / `note` / `examples`。
- handler rule 是新能力，不从现有 `旧中文规则样本目录` 样本直接推导；它服务于未来复杂规则扩展。
- 第一版迁移不实现 handler 执行，避免在 rule registry 迁移时引入沙盒与信任边界风险。

## Code Feasibility Audit

### 2026-06-29 代码调研结论

实现前代码适合迁移到 Rule Registry：

- `src/rules.ts` 已经使用 `Map<string, Rule>` 以 `id` 为键合并规则，和新设计里的 append / override 语义接近。
- 当前 static / llm 分成两个集合，导致同 id 跨类型覆盖需要互相删除；新 registry 应统一为单一 `LintRuleRecord` 集合，再由 detector 类型分流到 scanner 或 LLM 审查输出。
- `src/config.ts` 当时只支持 `presets`、`customRules`、`rules`；现已迁移到 `rulesets`、`trustedRulesets`、`rulesetOverrides`、`namespaces`、`rules`。
- `src/scanner.ts` 当前只扫描 `StaticRule.pattern`，且固定 `new RegExp(rule.pattern, "g")`；新 scanner 需要读取 `detector.type === "regex"` 的 `targets` 和 `flags`。
- `src/reporter.ts` 当前报告结构只面向 static issue 和 LLM rule 列表；新 reporter 需要输出 registry diagnostics，例如 ruleset 覆盖、handler 跳过、导入转换失败、namespace alias 命中。
- `SKILL.md`、`references/cli-usage.md`、`references/workflow.md` 和 `llmlint.config.example.ts` 当时仍是旧 `presets/customRules` 口径；现已同步到新 ruleset registry 口径。
- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts` 当前通过，可作为迁移前基线。
- `bun run typecheck` 当前失败集中在 llmlint：`.ts` extension import 与全仓 tsconfig 不匹配，以及 reporter 数组索引 strict undefined。registry 重构应顺手修复这些类型问题，避免把新设计建立在已知 typecheck 债上。

### Assets / Catalog Audit

- `SkillCatalog` 已硬切隐藏 `anti-ai-slop` key，并能列出 `llmlint`。
- 系统 assets 同步会递归同步 `.nbook` 下非黑名单文件，新增 `rulesets/**`、alias 表、ruleset metadata、导入说明文件都可被同步。
- 实现前 deleted managed assets 清单尚未包含 `agent/skills/anti-ai-slop/` 前缀；现已补充 deleted prefix 与对应测试。

## Implementation Acceptance Checklist

- 默认无 config 时加载 builtin ruleset，行为不低于现有 `anti-ai-slop` preset。
- `rulesets` 按配置顺序加载；新 id append，同 id override，并产出 diagnostics。
- 同 namespace 不同 id 可来自不同 ruleset，并在 summary 中聚合统计。
- `namespaces` 覆盖只影响 enabled / level，不修改规则定义。
- `rules` 覆盖优先级高于 namespace 和 ruleset。
- `regex` detector 支持多个 targets、标准 flags、regex literal 导入归一化。
- `llm` detector 能被 `show-llm-rules` 或新等价命令完整展示。
- `replace` action 支持删除、单候选替换、多候选替换；`suggest` action 支持纯提示。
- handler rule 第一版只校验 / 跳过 / warning，不执行第三方代码。
- 迁移后全仓 `bun run typecheck` 不再因 llmlint 失败。
- assets 同步测试覆盖 `rulesets/**` 文件复制，以及受管旧 `agent/skills/anti-ai-slop/` 清理。

## User / Agent Path Acceptance

最后需要按真实使用路径做一轮验收，而不是只跑模块单测：

### 用户路径

1. 用户在 Project Workspace 内创建 `llmlint.config.ts`，只选择已安装 ruleset。
2. 用户运行 `bun .nbook/agent/skills/llmlint/bin/llmlint.ts check <file>`，能看到 static regex issue、规则来源、namespace、level 和替换建议。
3. 用户运行 LLM 规则展示命令，能理解哪些规则需要 Agent 全文审查。
4. 用户关闭某个 namespace、关闭某条 rule、调整某条 rule level 后，CLI 输出符合配置。
5. 用户启用多个 ruleset，遇到同 id 覆盖时能看到明确 warning：哪个 ruleset 覆盖了哪个 ruleset 的哪条 rule。
6. 用户使用中文 namespace alias 或稳定英文 namespace key，配置结果一致且可解释。
7. 维护者重建官方默认 ruleset 时，生成报告能说明转换了多少 `text` / `simple` / `regex`，跳过了哪些失败规则。

### Agent 路径

1. Skill catalog 中只出现 `llmlint`，不出现系统 `anti-ai-slop`。
2. Agent 读取 `SKILL.md` 后，会按新 ruleset 配置说明执行，不再推荐 `presets/customRules`。
3. Agent 的 workflow 文档明确区分 CLI 候选定位、LLM 语义审查、用户审批式修复。
4. Agent 使用 `show-llm-rules` 或后续等价命令时，能把 `llm` detector 规则转化为本轮审查清单。
5. Agent 在修复计划里引用 rule id、namespace、ruleset source，方便用户追踪“这个建议从哪里来”。
6. Agent 遇到 diagnostics 时会向用户解释：覆盖是正常机制，warning 是提醒来源变化，不等同于执行失败。
7. Agent 文档、profile routing、draft testing guide、Task 51 walkthrough 中的命令和配置示例全部同步到新口径。

## Open Questions

- 覆盖提醒第一版落在 CLI stylish 的“规则加载提示”和 JSON report 的 `diagnostics` 字段；暂不新增 `llmlint rules explain`。
- namespace alias/normalization 第一版内置常见中文组名映射，后续可继续从用户 ruleset 中扩展。

## Implementation Log

### 2026-06-29 Rule Registry 实现

已完成：

- `src/types.ts` 改为 flat `LintRuleRecord` / `DeclarativeRuleRecord` / `HandlerRuleRecord` 类型。
- `src/config.ts` 改为 `rulesets`、`trustedRulesets`、`rulesetOverrides`、`namespaces`、`rules` 配置。
- `src/rules.ts` 实现 ruleset loader、namespace alias、同 id override diagnostics、ruleset / namespace / rule 覆盖优先级和 registry summary。
- `src/scanner.ts` 改为扫描 `regex` detector，支持多个 targets 和 detector flags。
- `src/reporter.ts` 在 stylish / JSON 中输出 ruleset、namespace、registry summary 和 diagnostics。
- `旧中文规则样本目录` 仅作为内置默认规则集的策展素材，不提供公开单文件导入入口。
- `curated-import` 作为内部模块用于重建官方默认 ruleset，不作为用户 CLI 能力。
- 默认规则迁移到 `rulesets/builtin/default/ruleset.json` 与 `rules.json`，删除旧 `presets/anti-ai-slop/*.json` 分裂规则文件。
- `llmlint.config.example.ts`、`SKILL.md`、`references/cli-usage.md`、`references/workflow.md`、`references/patterns.md` 同步到新口径。
- 系统 assets 同步新增 `agent/skills/anti-ai-slop/` deleted prefix，清理未手改旧副本。
- Task 51 walkthrough 与 `PROJECT-STATUS.md` 更新当前状态。

计划出入：

- 原设计说 handler 第一版“保留 schema，不执行”。实现中对 handler rule 做校验和 warning，但不进入 active registry，也不执行第三方代码。
- 原设计曾讨论过单文件导入；当前硬切为只保留官方默认规则集策展生成，不提供旧格式兼容入口。
- `category-suggestions.json` 未迁移为独立资源；相关建议已收敛进 rule `note` / `action` / `examples`。

验证结果：

- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts`：通过。
- `bun run typecheck`：通过。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets 会管理 Agent skills、模板和 CLI 辅助文件"`：通过。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets 会清理未手改的旧 anti-ai-slop skill 副本"`：通过。
- `bun assets/workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts check docs/tasks/77-llmlint-rule-registry/README.md`：通过，输出 no problems。
- `bun assets/workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts show-llm-rules`：通过，输出 8 条 LLM detector 规则。
- 内部 `importCuratedRulesets()`：通过，生成官方默认 ruleset。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets"`：超时；已改跑本轮相关的两个精确同步用例，均通过。

### 2026-06-29 中文规则样本策展合并

已完成：

- 新增 `src/curated-import.ts`，用于读取 `旧中文规则样本目录*.json`，并与人工基础规则一起生成官方默认 ruleset。
- 新增内部 `curated-import` 模块，用于读取 `旧中文规则样本目录*.json` 并重建官方默认 ruleset。
- 新增内置 ruleset：`builtin/default`。
- 默认配置改为只启用 `builtin/default`。
- `builtin/default` 合并原人工 anti-ai-slop 规则与中文策展规则，默认包含并启用 R18 / 成人词汇规则；用户可用 `namespaces: {"vocabulary.r18": "off"}` 关闭。
- 重复规则按 namespace + canonical regex targets + flags 去重；同 target 不同 replacements 合并为候选并集。
- 中文 rule id 改用显式英文语义 slug：`cn.<namespace>.<semantic-slug>`，不再暴露 hash，例如 `cn.vocabulary.body.skull-head`。
- 正式 rule schema 不记录旧格式来源结构；生成报告只保留转换计数、跳过项、合并计数等审计信息。
- rule `source.canonicalKey` 记录内部 canonical detector key，供策展生成器去重与追踪使用。
- namespace alias 扩展到策展样本中的中文组名。
- `src/namespaces.ts` 统一维护中文组名 alias，生成器与运行时 loader 共享同一份映射，避免后续漂移。
- `src/base-rules.ts` 保存人工维护的基础规则；`src/curated-slugs.ts` 保存中文规则 canonical key 到语义 slug 的显式映射，缺失时生成失败。

生成结果：

- 源文件数：11。
- 生成时处理 target 记录：533。
- 去重后最终 rule id：292（27 条人工基础规则 + 265 条中文策展规则）。
- `builtin/default`：292 rules，263 active。

计划出入：

- 策展素材源文件 `旧中文规则样本目录` 保留，不删除。
- 旧单文件导入入口已硬切删除；官方默认规则集生成只保留内部模块路径。
- 曾短暂实现 `cn-light` / `cn-standard` / `cn-strong` / `cn-extreme` 四档方案；按用户反馈“取其精华合并成一个规则集”收敛为单一 `builtin/cn`，不再暴露四档内置 ruleset。
- 随后按用户反馈继续把 `builtin/anti-ai-slop` 与 `builtin/cn` 合并为单一 `builtin/default`，不保留两个旧公开入口。
- 高风险组名包含 `[可选]`、`[选开]`、`冲突` 时默认 disabled；`极其杀手.json` 来源默认 disabled；`builtin/default` 的 `vocabulary.r18` 按本轮决策强制启用。

验证结果：

- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts`：通过，包含默认 `builtin/default`、语义 slug、缺失 slug 映射失败、LLM rules 输出等断言。
- `bun run typecheck`：通过。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets 会管理 Agent skills、模板和 CLI 辅助文件"`：通过，确认 `agent/skills/llmlint/rulesets/builtin/default/ruleset.json` 会同步。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets 会清理未手改的旧 anti-ai-slop skill 副本"`：通过。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets 会清理未手改的旧 llmlint 内置 ruleset 副本"`：通过。
- `bun assets/workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts check .agent/workspace/test-llmlint-default.md`：通过，默认加载 `builtin/default` 并命中 `cn.vocabulary.body.skull-head` 等中文规则，输出 ruleset、namespace、level 与替换候选。
- `bun assets/workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts show-llm-rules`：通过，输出合并进 `builtin/default` 的 8 条 LLM detector 规则。
- 内部 `importCuratedRulesets()` 临时输出验证：通过，复现单一 `builtin/default` ruleset 统计：533 target、292 unique rules、263 active、9 个 replacement merge；临时验证输出已清理。

### 2026-06-29 去除旧格式兼容字段硬切

已完成：

- 正式 rule schema 删除旧格式来源数组，`rules.json` 不再携带旧文件、旧组名、旧 mode、原始 target、原始 enabled 等结构。
- 删除公开单文件导入模块和 CLI 入口；`旧中文规则样本目录` 只作为官方默认规则集的策展素材。
- `curated-import` 内部命名改为 source / curated 语义，生成的 `builtin/default` 规则看起来是 llmlint 原生规则。
- loader 遇到已移除的旧格式来源字段会报错，避免旧结构重新进入规则文件。
- `SKILL.md`、CLI reference、patterns、Task 51 和 `PROJECT-STATUS.md` 已同步到硬切口径。
- 旧入口收尾继续删除 `import-curated` CLI 和 `llmlint <file>` 兼容用法；当时公开 CLI 收口为 `check` 与 `show-llm-rules`，后续已扩展为 `check <files...>`、`fix <files...>` 与 `show-llm-rules`。

验证目标：

- `rulesets/builtin/default/rules.json` 不包含旧格式来源字段。
- 内部 `importCuratedRulesets()` 仍能生成 292 条官方默认规则，并保留转换计数、跳过项和合并计数报告。
- 用户配置仍只面向 `rulesets`、`namespaces`、`rules`。

### 2026-06-29 硬切审查与遗漏修复

已完成：

- 删除公开 `import-legacy` / `legacy-import` 残留入口；当时 CLI 帮助只保留 `check` 与 `show-llm-rules`，后续已扩展为当前的多文件 `check`、`fix` 与 `show-llm-rules`。
- 系统 assets 删除清单补充 `agent/skills/llmlint/src/legacy-import.ts`，同步时会清理未手改的旧受管副本。
- 复查公开内置 ruleset：系统 assets 中只保留 `rulesets/builtin/default/`，旧 `builtin/anti-ai-slop` 与 `builtin/cn` 只在清理代码、清理测试和历史 walkthrough 中出现。
- 更新当前测试指南和 Task 51 当前状态，避免继续把当前 CLI 称为 Anti-AI-Slop 或把默认 ruleset 写成旧入口。
- 修复 `llmlint.test.ts` 中非法 source schema 测试的类型绕过：正常 ruleset fixture 继续使用 `LintRuleRecord`，非法 JSON fixture 通过 `writeRawRuleset()` 写入。

验证结果：

- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts`：通过。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets 会清理未手改的旧 llmlint 受管文件"`：通过。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets 会管理 Agent skills、模板和 CLI 辅助文件"`：通过。
- `bun run typecheck`：通过。
- `bun assets/workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts --help`：通过，未显示旧导入命令或裸文件参数入口。
- `bun assets/workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts show-llm-rules --format json`：通过，默认 registry 为 `builtin/default`，292 rules / 263 active。
- `bun assets/workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts check docs/tasks/77-llmlint-rule-registry/README.md`：通过执行并命中新默认规则，证明真实 CLI 路径会加载 `builtin/default`。

### 2026-06-29 用户侧 llmlint 半同步状态修复

问题：

- 更广审查发现系统源 `assets/workspace/.nbook/agent/skills/llmlint/` 已硬切，但真实用户侧 `workspace/.nbook/agent/skills/llmlint/` 仍处于半新半旧状态。
- 用户侧 `src/cli.ts` 还引用已删除的 `legacy-import.ts`，导致 `bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts --help` 直接失败。
- 用户侧还残留旧 `presets/anti-ai-slop/` 和短暂四档 `cn-light` / `cn-standard` / `cn-strong` / `cn-extreme` ruleset，污染“已安装规则集”心智。

已完成：

- 扩展 user-assets deleted prefix：补充 `agent/skills/llmlint/presets/` 和旧四档 `rulesets/builtin/cn-*`。
- 同步逻辑新增硬切旧官方目录扫描：只清理 llmlint 旧官方前缀；有 sync state 且用户已手改的文件仍保留并 warning；无 sync state 的旧官方残留会被清理。
- 扩展同步测试：覆盖旧 presets、旧 `builtin/cn`、旧四档 `cn-*`、旧 `cli.ts` / `rules.ts` 被系统源覆盖，以及用户侧真实 `llmlint --help` 可运行。
- 执行 `bun scripts/build/prepare-system-assets.ts --sync-user-assets --force-sync-user-assets`：更新 10 个受管 assets，把真实用户侧 llmlint 拉齐到系统源。
- 当前用户侧公开内置 ruleset 只剩 `rulesets/builtin/default/`。

验证结果：

- `bun vitest run server/workspace-files/workspace-files.test.ts -t "旧 llmlint"`：通过。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "同步系统 assets 会管理 Agent skills、模板和 CLI 辅助文件"`：通过。
- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts`：通过。
- `bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts --help`：通过，只显示 `check` 和 `show-llm-rules`。
- `bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts show-llm-rules --format json`：通过，默认 registry 为 `builtin/default`，292 rules / 263 active。

后续修正：

- 修复手改旧 llmlint 官方文件的重复 warning：deleted-state 清理阶段已经报告“用户覆盖已手改”后，hard-cut 目录扫描不再对同一个 asset 追加第二条 warning。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "旧 llmlint"`：通过，覆盖手改旧文件保留且仅产生 1 条 warning。
- `bun run typecheck`：通过。

### 2026-06-29 CLI 输出格式优化

问题：

- `check` 的 stylish 输出只截取命中前后各 20 个字符，长句上下文不完整，不利于 Agent 按行号定位修稿。
- 原来的 `^^` 指示线在中文双宽字符下视觉对齐不可靠。
- 长文默认规则命中较多，缺少 CLI 级别过滤手段，只能靠配置关闭规则。

已完成：

- `src/scanner.ts` 的 issue context 改为完整命中行三段式：`before` / `current` / `after` 覆盖整行。
- `src/reporter.ts` 的 stylish 输出改为 high / medium / low 分段，再按 rule 分组；命中位置用 `<mark>...</mark>` 标注，不再输出 caret 指示线。
- `check` 新增 `--min-level high|medium|low`，默认 `low`；过滤时 stylish 和 JSON 都记录隐藏数量。
- JSON check report 新增可选 `filter` 字段：`minLevel` 与 `hiddenIssues`。
- `SKILL.md`、`references/cli-usage.md`、`references/workflow.md` 同步到新输出格式。
- 通过 user-assets 同步更新真实 `workspace/.nbook/agent/skills/llmlint/` 副本。

修复方式统计：

- 默认 `builtin/default` 中 regex 静态规则共 284 条。
- `replace` action 269 条，其中删除建议 126 条，替换候选 143 条。
- `suggest` action 15 条。
- 第一版仍不自动 `--fix`；修复由 Agent 根据上下文和用户审批执行。

验证结果：

- `bun vitest run server/agent/skills/llmlint.test.ts`：通过，覆盖 severity 分段、完整行 `<mark>` 标注和 `--min-level` 过滤。
- `bun run typecheck`：通过。
- `bun scripts/cli/sync-user-assets.ts`：通过，`updatedAssets=1`。
- `bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts check --help`：通过，显示 `--min-level <level>`。
- `bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts check workspace/ming-ding-zhi-shi-2/manuscript/001-volume/001-chapter/index.md --min-level medium`：通过，输出完整行 `<mark>`，显示 343 条 medium，隐藏 6 条 low。
- `bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts check workspace/ming-ding-zhi-shi-2/manuscript/001-volume/001-chapter/index.md --min-level high`：通过，未发现 high，隐藏 349 条较低级别命中。

计划出入：

- 本轮没有新增自动修复；只优化候选报告和过滤体验。
- 真实章节验证显示默认规则在中文小说上 medium 候选仍偏多，尤其破折号、比喻、泛词类规则需要后续做规则质量和误伤治理。

### 2026-06-29 CLI 紧凑输出模式

问题：

- 完整行 `<mark>` 输出在同一行有多条命中时会反复打印同一原文行，长文报告噪声过高。

已完成：

- `Issue` 增加 `endLine` / `endColumn`，JSON 输出保留完整 context 并携带结束位置。
- stylish 默认输出改为紧凑模式：`line:start-end  match: 命中文本`，不显示完整原文行。
- `check` 新增 `--show-lines`，显式开启完整行 `<mark>` 输出；该 flag 只影响 stylish，不影响 JSON。
- `--min-level` 可与 `--show-lines` 组合使用。
- `SKILL.md`、`references/cli-usage.md`、`references/workflow.md` 同步为默认紧凑输出口径。

验证目标：

- 默认 stylish 输出不包含完整原文行或 `<mark>`。
- `--show-lines` 输出完整命中行并包含 `<mark>`。
- JSON 输出继续包含 `context`，并新增 `endLine` / `endColumn`。

后续修正：

- 更广审查发现 `endColumn` 对 surrogate pair 字符会多算 1，例如 `😀` 被输出为 `1:1-2`，不符合“人类可读字符列”契约。
- 修复 scanner 的结束位置计算：起点仍按 code point 前缀计数，终点改为用匹配 exclusive end 统计 code point 闭区间列；跨行命中继续显示 `startLine:startColumn-endLine:endColumn`。
- 增加 emoji、emoji + 普通字符、跨行命中的单测。
- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts`：通过。
- `bun run typecheck`：通过。
- `bun scripts/cli/sync-user-assets.ts`：通过，用户侧 `workspace/.nbook/agent/skills/llmlint/src/scanner.ts` 已同步系统源。
- 边界验证：`😀` 输出 `1:1-1:1`，`😀A` 输出 `1:3-1:4`，`甲\n乙` 输出 `2:1-3:1`。

### 2026-06-29 Review / Fixability 维度与默认降噪

问题：

- 默认 `check` 把标点、比喻、泛词等 regex 命中一并刷给 Agent，真实章节默认 349 条 medium 候选，噪声过高（上一轮“CLI 紧凑输出模式”遗留）。
- `level` 同时承担严重度、是否喂 LLM、退出码三件事，受众语义被挤压。

决策（按本轮讨论收敛）：

- `level` 保持 3 档只表严重度，不细分。
- 新增独立维度 `review`（agent / human / none）决定一条命中默认进入哪个审查出口；用 `agent` 而非 `llm` 避免与 `detector.type === "llm"` 撞名。
- 新增独立维度 `fixability`（auto / candidate / manual）描述机械修复能力，本轮只展示、不实现 `--fix`。
- curation 主交付物是命名空间策略表 `DEFAULT_NAMESPACE_POLICY`（`src/namespaces.ts`），不是 schema 本身；review/fixability 在 loader 加载时解析，不重生成 `rules.json`。

已完成：

- `src/types.ts`：新增 `Review` / `Fixability` / `RuleOverrideObject`；`RuleOverride` 扩成「字符串简写 | 对象形态」；`BaseLintRuleRecord` 加可选 `review` / `fixability`，`ActiveRuleRecord` 加解析后必有的 `review` / `fixability`；`CheckJsonReport.filter` 改为必有的 `{review, hiddenByReview, minLevel, hiddenByLevel}`。
- `src/namespaces.ts`：新增 `DEFAULT_NAMESPACE_POLICY`，把 `punctuation.dedup` 降为 review:none/fixability:auto，把 `punctuation.dash*`、`proliferation.mixed`、`metaphor*`、`modifier*`、`absolute`、`abstraction.hollow`、`paragraph.*`、`rhythm`、`numeral.three` 降为 review:human。
- `src/rules.ts`：loader 解析 review/fixability，优先级 `用户config规则 > 用户config命名空间 > 规则自带字段 > 命名空间策略表 > detector/action 推导`；`applyOverride` 支持对象覆盖只调整不禁用。
- `src/config.ts`：`namespaces` / `rules` 覆盖同时接受字符串和 `{level,review,fixability}` 对象，并校验非法 review/fixability/level 值。
- `src/reporter.ts`：规则来源行展示 `级别/审查/修复`；新增 review 过滤表头与 review/level 双桶隐藏统计；JSON filter 重构。
- `src/cli.ts`：`check` 新增 `--review agent|human|none|all`，默认 `agent`；两段过滤（先受众后级别）各自独立统计隐藏数。
- `SKILL.md`、`references/cli-usage.md`、`references/workflow.md`、`llmlint.config.example.ts` 同步新口径，并明确 `detector:llm`（检测手段）与 `review:agent`（审查受众）是互补的两个 Agent 审查面。

计划出入：

- 不引入单独的 NormalizedRuleOverride 类型：为避免破坏 `loadRules({namespaces:{tone:"low"}})` 等传字符串的既有测试，改为把 `RuleOverride` 扩成联合类型、消费端兼容两种形态。
- 不改 `curated-import.ts`、不重生成 `rules.json`：review/fixability 全部 load 时解析；命名空间策略表是唯一改动单点。
- fixability 本轮只标注与展示，未实现 `--fix`；`auto` 仅为后续自动修复预留能力标注。
- 命名空间策略首批只覆盖最响的噪声主犯；`sentence.compound`、`regex.advanced`、`punchline` 等仍默认 `agent`，按项目偏好可继续调表（改表不需重生成 rules.json）。

验证结果：

- `bun run typecheck`：通过。
- `bun vitest run server/agent/skills/llmlint.test.ts`：通过，27 个用例（含 review/fixability 解析、对象覆盖优先级、CLI review 过滤、JSON filter、非法值 schema 错误 5 个新用例）。
- `bun scripts/cli/sync-user-assets.ts`：通过，`updatedAssets=10`，真实用户侧 workspace 已拉齐。
- 真实章节 `workspace/ming-ding-zhi-shi-2/manuscript/001-volume/001-chapter/index.md`：默认 `--review agent` 61 条（隐藏 288）、`--review all` 349 条（旧基线）、`--review human` 288 条（modifier / punctuation.dash / proliferation.mixed / modifier.measure / metaphor / absolute / numeral.three）、`--review none` 0 条；来源行与 review 表头渲染正确。

### 2026-06-30 Override 语义统一（修审查发现 #1/#2/#3/#4）

问题（high-effort code review 发现）：

- #1：对象形态覆盖无法启用「默认禁用」的规则（applyOverride 对象分支不碰 enabled），与字符串 `"medium"` 会启用不对称，迁移时静默丢规则。
- #2：对象形态覆盖会复活被 `rulesetOverrides off` 关闭的规则（isExplicitlyEnabled 把任何非 off 真值覆盖判为显式启用），与「对象只调整」文档矛盾。
- #3：默认 `--review agent` 把 human/none 桶的 high 命中排除在退出码外（潜在）。
- #4：隐藏数量在过滤表头和总结行重复打印。

根因：override 有「字符串 / 对象」两种形态，而 `applyOverride`（应用）与 `isExplicitlyEnabled`（门控）两处各自解释，对「对象是否算启用」判断不一致。

决策（用户确认）：

- 对象覆盖暴露显式 `enabled?: boolean`；字符串成为它的语法糖（off→{enabled:false}、warn/error/level→{enabled:true,level:X}）。
- 退出码跟随可见视图，保持现状，只加注释与文档说明。

已完成：

- `src/types.ts`：新增内部归一形态 `NormalizedRuleOverride`；`RuleOverrideObject` 加 `enabled?`；`NormalizedLlmlintConfig.namespaces/rules` 改为 `Record<string, NormalizedRuleOverride>`，loader 输入契约变为「已归一」。
- `src/config.ts`：`normalizeOverrideValue` 把字符串与对象都归一为单一 patch（唯一去糖点 `expandStringOverride`）；对象允许 `enabled`，warn/error→level 映射从 rules.ts 上移到此。
- `src/rules.ts`：`applyOverride` 改为无分支字段 patch；`isExplicitlyEnabled` 改为只看 patch 的 `enabled`（rule 覆盖显式 enabled 决定，否则看 namespace `enabled===true`）；删除 `normalizeLevel`。两个解释器合一。
- `src/reporter.ts`：总结行不再重复隐藏统计，非空结果只由顶部 `formatFilterHeader` 展示一次。
- `src/cli.ts`：退出码处加注释说明跟随可见视图。
- `SKILL.md`、`cli-usage.md`、`llmlint.config.example.ts`：补 `enabled` 字段、字符串=语法糖语义、退出码过滤说明。

设计约束（防再犯）：override 现在只有 config 一处去糖、一个归一形态，消费端无分支 patch，结构上杜绝「两处解释器跑偏」。

验证：

- `bun run typecheck`：通过（仅 3 处直传 loadRules 字符串的测试需改归一对象，已改）。
- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts`：35 通过，含新增「对象 enabled 启用默认禁用规则」「纯属性对象不复活 off ruleset / 显式 enabled 才复活」「config 字符串语法糖仍启用」3 例。
- `bun scripts/cli/sync-user-assets.ts`：`updatedAssets=8`。
- 真实章节默认 `--review agent` 仍 61 条，隐藏统计只在表头出现一次（#4）。
- 真实 CLI + config 文件 e2e：关闭 ruleset 后，纯属性 `{review:"human"}` 不复活（✓ No problems），`{enabled:true,review:"human"}` 复活并在 `--review human` 可见（#1/#2）。

### 2026-06-30 Rules 目录硬切自动加载

问题：

- `builtin/default/rules.json` 已膨胀到约 18 万字符，所有人工基础规则、中文策展规则和 R18 词汇混在一个大 JSON 中，维护与审查都不方便。
- 上一版 `ruleFiles` 清单把文件组织继续写进 `ruleset.json`，会制造新的维护清单；旧根目录 `rules.json` 回退也会让内置默认规则存在双入口风险。

决策：

- 不拆公开 ruleset；`builtin/default` 仍是唯一默认入口，继续包含 R18。
- 本轮硬切，不保留 `ruleFiles`、`rulesRoot` 或旧根目录 `rules.json` 兼容。
- 每个 ruleset 固定从根目录下 `rules/` 递归扫描所有 `.json` 规则数组文件，按相对路径字典序加载。
- 目录层级只服务人工维护，不参与规则语义；唯一语义来源仍是 rule record 内的 `namespace`。
- 内置默认规则按 namespace 生成层级文件：单段 namespace 写 `rules/<namespace>/index.json`，点号 namespace 写 `rules/<a>/<b>.json`，例如 `rules/absolute/index.json`、`rules/abstraction/hollow.json`、`rules/vocabulary/r18.json`。用户开关类别仍使用 `namespaces`，不要手改内置规则文件。

已完成：

- `src/types.ts`：`RulesetManifest` 删除 `ruleFiles`，不新增 `rulesRoot`。
- `src/rules.ts`：loader 拒绝 manifest 中的 `ruleFiles` / `rulesRoot`，拒绝根目录 `rules.json`，要求 `rules/` 存在且至少包含一个 `.json` 文件；JSON 不是数组或 rule schema 非法时错误带 ruleset 相对路径与数组索引。
- `src/curated-import.ts`：生成前删除旧 `rules.json` 并清空 `rules/`，按 namespace 输出层级规则文件，生成的 `ruleset.json` 只保留元信息与 `namespaceAliases`。
- `rulesets/builtin/default/`：已重建为层级 `rules/` 目录；总计仍为 292 rules / 263 active，其中 `rules/vocabulary/r18.json` 为 20 条 R18 规则。
- `server/workspace-files/novel-workspace.ts`：user-assets 同步新增受管目录 stale asset 清理，能删除上一版未手改的旧平铺文件，例如 `rules/vocabulary.r18.json`；手改旧受管文件 warning 保留。
- `SKILL.md`、`references/cli-usage.md`、`references/patterns.md`、`PROJECT-STATUS.md` 同步到新口径。

验证：

- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts`：通过，2 files / 38 tests，覆盖递归加载、目录不参与 namespace 语义、旧 `ruleFiles` / `rulesRoot` / 根 `rules.json` 拒绝，以及 curated import 层级规则文件结构。
- `bun vitest run server/workspace-files/workspace-files.test.ts -t "llmlint|系统 assets"`：通过，17 passed / 67 skipped，覆盖新 `rules/vocabulary/r18.json` 同步、旧 `rules/vocabulary.r18.json` 清理和手改旧受管文件 warning 保留。
- `bun scripts/cli/sync-user-assets.ts`：通过，`copied=47, skipped=204, updatedProfiles=0, updatedAssets=7`，真实 user-assets 已同步新层级规则文件并清理旧入口。
- `bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts show-llm-rules --format json`：通过，真实用户侧默认 registry 仍为 `builtin/default`，292 rules / 263 active，`vocabulary.r18` 20 active。
- 结构审计：系统源与真实 workspace 均无 `ruleFiles` / `rulesRoot`、无根 `rules.json`、无旧平铺 `rules/vocabulary.r18.json`；`rules/vocabulary/r18.json` 存在，47 个规则文件，292 rules / 263 active，重复 id 为 0。
- `bun run typecheck`：通过。

计划出入：

- 相比上一版“`ruleset.json` 写 `ruleFiles` 清单”，本轮按用户决策改为零清单递归扫描。
- 不再为了测试 fixture 或未来自定义 ruleset 保留旧 `rules.json` 回退；所有 ruleset 都必须迁移到 `rules/`。
- 本轮没有把 R18 做成独立 ruleset；它只是拆到 `rules/vocabulary/r18.json`，配置仍用 `namespaces: {"vocabulary.r18": "off"}` 控制。

### 2026-06-30 Rules 目录硬切审查修复

审查发现：

- `rules` 路径如果被误建为文件，loader 会冒出底层 `ENOTDIR`，不如其它 ruleset 错误清晰。
- 规则 JSON 语法错误直接冒出 `JSON.parse` 原始错误，缺少 ruleset 相对路径，不利于维护。
- Task 51 当前状态仍写旧 `rules.json` 产物，容易让后续维护者误读当前结构。

已完成：

- `src/rules.ts`：校验 `rules/` 必须是目录；JSON 语法错误会报告 `规则包 <id> 的 <relative-rule-file> 不是合法 JSON`。
- `server/agent/skills/llmlint.test.ts`：新增 `rules` 为文件、规则 JSON 语法损坏两个负向用例。
- `docs/tasks/51-anti-ai-slop-skill/README.md`：当前状态与产物清单改为 `rules/` 层级目录口径，保留早期历史段落。

验证：

- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts`：通过，2 files / 39 tests。
- `bun scripts/cli/sync-user-assets.ts`：通过，`copied=0, skipped=257, updatedProfiles=0, updatedAssets=1`。
- `bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts show-llm-rules --format json`：通过，真实用户侧默认 registry 仍为 `builtin/default`，292 rules / 263 active。
- `bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts check assets/workspace/.nbook/agent/skills/llmlint/SKILL.md --format json`：通过，registry 无 diagnostics。
- `bun run typecheck`：失败，但失败不在 llmlint；当前错误为 `server/agent/tools/control-tools.ts(95,24)` 找不到 `buildRequestUserInputFormSpec`。

### 2026-06-30 v1 规则内容建设：取三同类项目精华

- 需求：让 llmlint 规则内容成体系、默认即最佳实践，从用户提供的三个同类项目（`.local/github/`）取精华。v1 原则：规则越多越细越好、容忍误杀、尽量 static。

决策（用户确认）：三项目 = shuorenhua（主矿，中文原生）/ avoid-ai-writing（44 类 taxonomy + 通用机械规则）/ humanizer（Wikipedia 概念清单）；保留并扩充现有 292 条、合并进 builtin/default；扩展生成器（手写规则进 base-rules，curated-import 仍是唯一源头，绝不手改生成产物 `rules/`）。

已完成：

- `src/base-rules.ts` 改为聚合器：保留原 27 条核心规则为 `CORE_BASE_RULES`，新增规则按主题拆到 `src/base-rules/` 目录（openers/inflation/transitions/attribution/assistant/jargon/translationese/tier2），共 34 条新 static 规则。
- 主来源 shuorenhua/phrases-zh.md，按其 severity Tier 模型映射：Tier1 → agent 桶（medium），Tier2/3 密度类 → human 桶（low）。误杀防护 11 条写进规则 `note`。Tier3 单字常用词（重要/关键/核心）故意不收（逐次 regex 误杀过大）。
- 新增 agent 桶命名空间：`opening.cliche` / `inflation.significance` / `transition.summary` / `attribution.vague` / `cliche.uplift` / `sycophantic`；新增 human 桶命名空间：`jargon.engineer` / `jargon.social` / `translationese` / `structure.fragment`。
- `src/namespaces.ts`：`DEFAULT_NAMESPACE_POLICY` 给 4 个 human 桶新命名空间定策略；`DEFAULT_NAMESPACE_ALIASES` 补中文组名 alias。
- 重生成 `builtin/default`：326 rules / 297 active（原 292 / 263，+34）。`llmlint.test.ts` 计数 292→326、263→297 已更新，并加 `opening-cliche-announce` / `inflation-novelty` 断言。
- 文档：`SKILL.md` / `references/patterns.md` / `llmlint.config.example.ts` 同步新命名空间、Tier→桶映射、规则来源与最佳实践用法。

验证：

- `bun run typecheck`：通过。
- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts`：39 通过。
- 重生成报告：源 11 文件 / 533 target / 326 unique / 297 active。
- `bun scripts/cli/sync-user-assets.ts`：通过。
- 样例文本（含「值得一提的是/前所未有/综上所述/赋能/研究表明/让我们拭目以待」）：8 条新规则全部命中并给出动作。
- 真实小说章节默认 `--review agent` 仍 61 条（新规则多为 article/chat 腔，在干净小说里休眠、不增噪），`--review all` 349→352；human 桶正确捕获 `structure.fragment` 戏剧化碎句。registry 57 namespaces。

计划出入：

- 新规则在真实小说章节几乎不命中——这是预期：这批主要是 AI 文章/聊天腔，面向小说时休眠、面向 AI 生成文章时密集命中，不给小说默认视图增噪。
- 规模约 34 条（覆盖 shuorenhua Tier1 主体 + 关键 Tier2）；Tier3 密度类与英文字面 regex 按计划不搬。

### 2026-06-30 审查后补充：机械痕迹包 + 覆盖扩充

审查发现两处缺口：①规则数 34 低于计划的 50–80；②avoid-ai-writing 的通用机械检测器（语言无关）完全没挖。另修了 3 处 target 重叠双命中（众所周知 / 不可否认 / 闭环）。

已补：

- 新增 `src/base-rules/mechanical.ts`（移植自 avoid-ai-writing，语言无关、高精度）：`mechanical.zero-width`（零宽字符，review:none/auto 直接删）、`mechanical.homoglyph`（西里尔/希腊同形字，review:human）、`mechanical.placeholder`（未填充占位符 `{{}}`/`[姓名]`/`（此处…）`，agent）、`mechanical.chatbot-artifact`（`:contentReference`/`oaicite`/Bing 角标/chatgpt utm 泄漏，agent）。
- 扩充 shuorenhua 覆盖：sycophantic（郑重预告/身份认证夸奖）、inflation（不仅是…更是/最后比拼的是/宏大叙事）、openers（更重要的是/具体来说）、jargon.engineer/social 补充、translationese（基于…）、attribution（泛化共识）。
- 共 +14 条，新规则累计 48；`builtin/default` 重生成为 **340 rules / 311 active**。`namespaces.ts` 加 `mechanical.zero-width`(none/auto) 与 `mechanical.homoglyph`(human) 策略。
- 测试计数 326→340、297→311 已更新，加 `mechanical-zero-width` 断言。`SKILL.md` / `patterns.md` 同步机械痕迹包。

验证：

- `bun run typecheck`：通过。`bun vitest run ...llmlint... ...skill-catalog...`：39 通过。
- 机械规则实测命中：ZWSP、`[姓名]`/`[XX]` 占位符、`:contentReference[oaicite:0]{index=0}` 均命中。
- 真实小说默认 `--review agent` 仍 61 条（机械/article 规则在干净小说休眠不增噪）。registry 340/311/61 namespaces。

### 2026-06-30 GitHub 发布骨架收口

需求：把 llmlint 按 GitHub-only + Bun CLI + Agent Skill 的形态准备为独立上游仓库，neuro-book 继续保留 bundled vendored snapshot，不引入 submodule。

决策：

- 独立 repo 工作副本放在 `早期 scratch llmlint 工作副本`，仓库名按计划固定为 `llmlint`。
- 第一版不做 npm、Homebrew、Docker、VS Code/Cursor 扩展；`package.json.private` 保持 `true`，`bin.llmlint` 保留给本地 link 或未来改 npm 使用。
- 当时许可证使用 PolyForm Noncommercial 1.0.0；2026-07-10 起由 Task 103 统一迁移为 `AGPL-3.0-only`。
- 版本源为 `package.json.version`；`SKILL.md metadata.version` 和 `src/version.ts` 必须同步，当前均为 `2.0.0`。
- `assets/workspace/.nbook/agent/skills/llmlint` 是 neuro-book runtime vendored snapshot；`package.json` 保留发布名称、版本、许可、repository、bin 和运行依赖，但有意不带独立 repo 的 `scripts`、`devDependencies`、测试和发布脚本，避免 bundled skill 内出现无效脚本入口。

已完成：

- `早期 scratch llmlint 工作副本` 已初始化为独立 git 工作副本，并保留 `SKILL.md`、`references/`、`rulesets/`、`src/`、`bin/`、`llmlint.config.example.ts`。
- 独立 repo 新增 `README.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`AGENTS.md`、`LICENSE`、`tsconfig.json`、`scripts/verify-release.ts`、`tests/llmlint.test.ts`、`.gitignore`、`.gitattributes` 和 `bun.lock`。
- 独立 repo 与 bundled source 的默认规则资产已对齐为 61 个规则文件、340 rules / 311 active；`rules/vocabulary/r18.json` 仍为 20 条 `vocabulary.r18`，mechanical 规则文件也纳入发布校验。
- neuro-book `workspace-files` 集成测试已从旧包名 `@neuro-book/llmlint-skill` 更新为断言 `name/version/license`，包名硬切为 `llmlint`。

验证：

- 独立 repo：`bun install` 通过，`bun test` 9 通过，`bun run typecheck` 通过，`bun run verify` 通过，`bun bin/llmlint.ts --version` 输出 `2.0.0`。
- 独立 repo CLI：`show-llm-rules --format json` 输出 340 total / 311 active；`check README.md --format json` 输出 340 / 311 且可正常返回 issues。
- neuro-book：`bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts` 2 files / 39 tests 通过。
- neuro-book：`bun vitest run server/workspace-files/workspace-files.test.ts -t "Agent skills|旧 llmlint" --hookTimeout 60000` 2 passed / 82 skipped，通过新 package 断言和旧 llmlint stale asset 清理。
- neuro-book：`bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts show-llm-rules --format json` 通过，真实 workspace registry 为 340 / 311。
- neuro-book：`bun run typecheck` 通过。

计划出入：

- 未创建 GitHub remote、commit 或 tag；本轮只收口本地独立 repo 骨架和 neuro-book vendored 集成。
- 第一次 `bun install` 曾 120 秒超时，但留下的安装状态可复用；重试后 `bun install` 通过并生成/确认 `bun.lock`。
- bundled runtime snapshot 没有完整复制独立 repo 的测试和发布脚本；这是有意裁剪，避免 user-assets 内出现对 bundled skill 不成立的开发脚本。

### 2026-06-30 GitHub 发布骨架审查修复

审查发现：

- `早期 scratch llmlint 工作副本` 曾在早期 `git add` 后继续更新，git index 处于半旧状态，`bun.lock` 和 `rules/mechanical/*.json` 仍未追踪；如果直接提交会漏发布文件。
- 真实 `workspace/.nbook/agent/skills/llmlint/package.json` 还未同步 bundled snapshot 的 `repository` 字段。

已修复：

- 在独立 repo 工作副本执行 `git add -A`，当前发布文件全部 staged，未追踪文件为 0。
- 当时执行 `bun scripts/cli/sync-user-assets.ts`，结果 `copied=1, skipped=279, updatedProfiles=0, updatedAssets=3`；真实 workspace package 当时包含 `name=llmlint`、`version=2.0.0`、`license=PolyForm-Noncommercial-1.0.0` 和 `repository=https://github.com/notnotype/llmlint.git`。当前许可证以 Task 103 的 `AGPL-3.0-only` 迁移结果为准。

验证：

- `git status --short`（独立 repo）：只剩新增文件 staged，无 untracked。
- `bun workspace/.nbook/agent/skills/llmlint/bin/llmlint.ts show-llm-rules --format json`：通过，registry 仍为 340 total / 311 active / 29 disabled。

### 2026-06-30 CLI 能力扩展：--fix(auto) + 多文件/目录 + Markdown 感知

需求：把 CLI 从「单文件提示器」做成「稿件级工具」，补三块已实测的短板（代码块/链接误杀、`--fix` 名存实亡、不支持多文件）。

实现（三个独立测试切片）：

- **Markdown 区域遮罩**（新增 `src/markdown-mask.ts`）：纯函数 `computeMaskedRanges` 标出 frontmatter / 围栏代码块 / 行内代码 / 链接图片 / 裸 URL 区间；`scanText` 新增 `maskedRanges` 选项跳过落入其中的命中，不动 `Issue` 类型与行列定位。`.md`/`.markdown` 默认开，`--scan-all` 关。
- **多文件 / 目录**（`src/cli.ts`）：`check` 与 `fix` 参数改 variadic `<files...>`；目录递归收集 `.md/.markdown/.txt`。单文件 JSON 形态不变（`kind:check`，回归保护），多文件用 `kind:check-multi`（顶层 registry/diagnostics/filter 全局 + `files[]` + 聚合 `summary`）；退出码跨文件取或。
- **`fix` 命令**（auto 桶）：`fix <files...>` 只应用 `fixability:auto` 规则（当前 = `mechanical.zero-width` + `punctuation.dedup`）；用原生 `String.replace` 支持 `$1` 反向引用与 lookbehind（dedup 规则 `([,，。~！?？])\1+`→`$1`、`(?<=……)[….]+`）；按 masked ranges 分段应用，不改动代码块 / frontmatter；默认 dry-run（有待修退出 1，可做 CI 门禁）、`--write` 落盘。candidate/manual 仍交 Agent + 审批写 `polish-output.md`，不在 `fix` 范围。

变更文件：新增 `src/markdown-mask.ts`；改 `src/scanner.ts`（masked 跳过 + 导出 `ensureGlobalFlags`）、`src/cli.ts`（多文件 + fix + `expandInputs`/`resolveMaskedRanges`/`applyAutoFix`）、`src/reporter.ts`（多文件聚合 + fix 报告 + `revealInvisible` 显形零宽）、`src/types.ts`（`MaskedRange`/`CheckFilterInfo`/`CheckMultiJsonReport`/`Fix*`）；文档 SKILL.md / cli-usage.md / patterns.md；测试 `server/agent/skills/llmlint.test.ts` +11。

验证：

- `bun vitest run server/agent/skills/llmlint.test.ts server/agent/skills/skill-catalog.test.ts`：2 files / 50 passed（llmlint 34→45，+11）。
- `bun run typecheck`：0 错误（本轮新代码零类型错误；早前 2 个 `server/agent/tools/*` 无关错误已由并行工作修复）。
- 真实样本：`.md` 默认跳过代码块内 `其实` 与 `[note](url)`，`--scan-all` 复现；`fix` dry-run 退出 1 不改文件、`--write` 删零宽 + `？？？→？` 退出 0，代码块内 `？？？` 完整保留。
- 真实章节 `ming-ding-zhi-shi-2/.../001-chapter/index.md`：默认 `--review agent` 仍 61（与基线一致），`--scan-all` 也 61（该章无代码块/链接，遮罩零影响），`fix` dry-run 0 处（干净小说无机械垃圾）。
- 双拷贝：`bun scripts/cli/sync-user-assets.ts`（updatedAssets=2）后 `diff -rq` `assets` 与 `workspace` 两副本 src+SKILL+references 零差异。

计划出入：

- 原计划 glob 用 `Bun.Glob`；实测仓库未装 bun-types（`Bun` 全局无类型，测试传递性 typecheck 会报错），且 bash globstar 默认关、`@types/node` 的 `globSync` 不可靠。改为强类型零依赖的 `node:fs` 目录递归（`readdirSync recursive`）+ 显式多文件，覆盖「扫整部稿件」的真实需求，不留类型债；代价是不支持裸 `*.md` glob 模式（用目录递归或 shell 展开替代）。
- 标准 GitHub 发布仓库 `早期 scratch llmlint 工作副本` 本轮未同步、未 republish；属独立发布动作，留作后续。

### 2026-06-30 CLI 体验打磨：tinyglobby glob + picocolors 彩色 + 依赖自包含

需求：继续打磨 CLI 输入/输出，并确定依赖模型。用户三条决定：依赖写进 skill `package.json` 并在 skill 目录 `bun install`（自包含，解决上一轮「产品端依赖供给」不确定性）；优先用 NeuroBook 已有库；glob 用 tinyglobby（非 ripgrep）。

实现：

- **依赖自包含**：`package.json` 增 `tinyglobby`/`picocolors`（均为仓库根现有传递依赖，最轻同类件）；skill 目录 `bun install` 生成本地 `node_modules` + `bun.lock`；新增 skill 本地 `.gitignore` 忽略 `node_modules`（仓库根 `.gitignore` 只忽略 `/node_modules`）。sync 会把 node_modules 复制到 workspace 部署副本使其自包含（`workspace/` 整体 gitignore，无 git 污染）。
- **glob 输入**（`src/cli.ts` `expandInputs`）：改 tinyglobby `globSync` —— 字面文件保留「不存在」语义；目录以自身为 cwd 递归 glob（避免绝对路径跨盘符在 tinyglobby 下不匹配）；glob 模式（含 `* ? { } [ ] !`）相对 cwd 直通，支持 `**`/`!` 排除/花括号。`fix` 复用同一展开。
- **彩色输出**（`src/reporter.ts`）：picocolors `createColors(color)`，各 formatter 加 `color` 参数；严格门控 `resolveColor = output!==json && stdout.isTTY && !NO_COLOR`（`src/cli.ts`）。级别 high 红/medium 黄/low 暗、规则 id 青、命中黄、汇总红/绿、fix 预览红/绿、诊断红/黄；json/管道/Agent 抓取一律纯文本。

变更文件：`package.json`、新增 `.gitignore`、`src/cli.ts`（expandInputs 改 tinyglobby + `resolveColor` + color 下传）、`src/reporter.ts`（formatter +color + createColors）；测试 `server/agent/skills/llmlint.test.ts` +3；文档 cli-usage.md / SKILL.md。

验证：

- `cd assets/.../llmlint && bun install`：5 包（commander/picocolors/tinyglobby + fdir/picomatch），`--version` 正常。
- `bun vitest run ...llmlint.test.ts ...skill-catalog.test.ts`：2 files / 53 passed（llmlint 45→48）。
- `bun run typecheck`：0 错误（两包自带类型）。
- 真实样本：`check 'manuscript/**/*.md'` glob 递归命中、`!drafts/**` 排除生效、目录递归仍工作、不存在路径报「不存在」；管道 / `--format json` 输出 0 个 ANSI 字节（Agent 安全），`createColors(true)` 证明着色机制。
- 部署副本：从 `workspace/.../bin/llmlint.ts` 跑 glob 通过，自包含 node_modules 正确解析 tinyglobby/picocolors（registry 仍 340/311）。
- 双拷贝：`sync-user-assets`（copied=49 含 node_modules）后源码/文档/package.json `diff -rq` 零差异；两处 node_modules 与 `workspace/` 均 gitignore，`bun.lock` 可入库。

计划出入：

- glob 选型在用户决策下从上一轮的 `node:fs` 目录递归升级为 tinyglobby，获得真 glob 模式；目录分支改为「以目录自身为 cwd」glob，修掉绝对路径在 tinyglobby 下不匹配的回归。
- ripgrep 经评估不采用：外部二进制、项目未捆进产品、依赖 PATH，与「JS 依赖装 skill 目录」模型不符。
- 独立发布仓库 `早期 scratch llmlint 工作副本` 的依赖与 republish 仍留作后续。

### 2026-07-01 文档/运行时收口 + 整体审查：skills CLI 安装、Node+tsx 运行时、发布模型澄清

需求：把 llmlint 当独立可发布项目收口文档与运行时，并做整体审查（检查任务遗漏、各链路是否通顺）。用户三点：README 推荐用 `skills` CLI 安装；运行时不再只强调 Bun，Node 也要能跑；SKILL 提到可手动 `npm install` 装依赖。随后整体审查。

实现 / 审查发现：

- **安装推荐**：README / README.en / SKILL 增「`npx skills add notnotype/llmlint`」（vercel-labs `skills` CLI，skills.sh）作为首选；Agent Skill 段补「装好后在 skill 目录跑一次 `npm install` / `bun install` / `pnpm install`」。
- **运行时澄清（关键纠错）**：实测裸 `node bin/llmlint.ts`（含 `--experimental-strip-types`）失败 —— 源码 40 处无扩展名 TS 相对导入，Node 自带类型剥离不补 `.ts`，报 `ERR_MODULE_NOT_FOUND`。真相是 **Bun（原生）或 Node + `tsx`（`npx tsx …`）**，裸 node 不行。修正 README / README.en / SKILL / cli-usage 之前「node 直接运行」的过度声称。让裸 node 跑需给 40 处导入加 `.ts` + `allowImportingTsExtensions`，牵动全仓 typecheck，代价大收益小（tsx 即 node），不做。
- **审查修复的遗漏**：(a) cli-usage.md「fixability 预留给未来 `--fix`」与「FAQ：第一版不支持自动修复」均与已落地的 `fix` 命令矛盾 → 改为指向 `fix`；(b) `src/types.ts` Fixability 注释同样「预留未来」→ 更新为 fix 已落地；(c) `package.json` description「Bun CLI」→ 运行时中性；(d) README.en 整体落后（Runtime 仅 Bun、无 skills CLI、无 npm install）→ 镜像中文 README。
- **发布模型澄清（历史，已被 Task 84 取代）**：本轮曾把独立发布源临时收口到 `assets/workspace/.nbook/agent/skills/llmlint`。2026-07-01 后当前模型已改为 sibling `../llmlint` 开发仓 + NeuroBook vendored snapshot；不要再把 assets 目录当发布源。

变更文件：README.md / README.en.md / SKILL.md / references/cli-usage.md（运行时 + skills CLI + fix 文案）、`src/types.ts`（注释）、`package.json`（description）；PROJECT-STATUS Task 51 行发布位置纠正。

验证：

- `bun vitest run ...llmlint.test.ts ...skill-catalog.test.ts`：2 files / 53 passed。
- `bun run typecheck`：0 错误。
- 运行时三态：Bun ✓ 原生；Node + `tsx` ✓ 全功能（check / glob / fix / json，assets 与部署副本均通）；裸 node ✗。
- 双拷贝：`sync-user-assets`（updatedAssets=4）后 `diff -rq`（排除 node_modules / .git / evals）零差异。

计划出入 / 留作用户决定：

- 嵌套发布仓（`assets/.../llmlint`）现有本轮未提交的文档修正；commit + push 到 notnotype/llmlint 留作用户手动。
- 废弃 scratch 克隆 `早期 scratch llmlint 工作副本`（无 remote）建议删除或确认保留，未擅自删除。

### 2026-07-01 独立开发仓硬切：sibling source + skill snapshot

需求：llmlint 复杂度继续上升（评测、未来 web），不再让 NeuroBook assets 目录同时承担发布源和 runtime snapshot。用户明确决定：独立仓根是开发仓，真正的 skill 是其中一个目录；`evals/` 可以进入 git。

已完成：

- 新真相源切到 sibling `../llmlint`；仓库根承载开发 `package.json`、`tests/`、`evals/`，可安装 runtime package 固定在 `skill/`。
- NeuroBook `assets/workspace/.nbook/agent/skills/llmlint/` 只保留从 `../llmlint/skill` 镜像来的 vendored snapshot；旧嵌套 `.git`、`node_modules`、`evals` 和 `.gitignore` 均已移除。
- 新增 `scripts/cli/sync-llmlint-skill.ts`，从 sibling `skill/` 同步到 bundled snapshot；user-assets 同步硬切清理真实 runtime 副本中的旧开发目录。
- `evals/` 进入 sibling llmlint 仓 git，作为评测 harness / fixture / 语料 / 基线报告开发资产；不属于 `skill/`，也不随 NeuroBook user-assets 同步。

计划出入：

- 旧 `旧中文规则样本目录` 已不存在；独立仓测试改用最小 fixture 覆盖 curated import 行为，不再依赖历史 scratch 目录。
- “skill 依赖自包含并同步 node_modules 到部署副本”的上一轮策略已被硬切：runtime 依赖由 package 声明，NeuroBook 内置运行时从仓库根 `node_modules` 解析，`node_modules` 不再同步进 user-assets。

## References

- 当前 llmlint source：`../llmlint/`
- 当前 llmlint skill package：`../llmlint/skill/`
- NeuroBook bundled snapshot：`assets/workspace/.nbook/agent/skills/llmlint/`
- 当前历史任务：[51 anti-ai-slop / llmlint skill](../51-anti-ai-slop-skill/README.md)
