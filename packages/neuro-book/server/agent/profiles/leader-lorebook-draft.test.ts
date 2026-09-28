import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import leaderDefaultProfileDefinition, {submitLorebookDraftTool} from "../../../assets/workspace/.nbook/agent/profiles/builtin/leader.default.profile";
import {SUBMIT_LOREBOOK_DRAFT_TOOL} from "nbook/profile-sdk";
import {normalizeAgentProfile} from "nbook/server/agent/profiles/define-agent-profile";
import {createTestRuntimeSession as testSession} from "nbook/server/agent/profiles/test/runtime-session";
import {createTestVariableAccessor} from "nbook/server/agent/variables/test-utils";

const TEST_REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
process.env.NEURO_BOOK_REPOSITORY_ROOT ??= TEST_REPOSITORY_ROOT;

const PROFILE_SOURCE_PATH = resolve(
    "assets",
    "workspace",
    ".nbook",
    "agent",
    "profiles",
    "builtin",
    "leader.default.profile.tsx",
);

const leaderDefaultProfile = normalizeAgentProfile(leaderDefaultProfileDefinition);

/** leader.default 的 settings schema 无可选字段，必须给全。 */
const LEADER_DEFAULT_SETTINGS = {
    collaborationMode: "default",
    neuroBookFamiliarity: "default",
    questionStrategy: "default",
    leaderPersonaPreset: "personas/caihui-lite.md",
    customTopSystemPrompt: "",
    fileChangeAwareness: "full",
} as const;

async function prepareLeaderPrompt() {
    const prepared = await leaderDefaultProfile.prepare!({
        session: testSession({
            profileKey: "leader.default",
            currentProjectRoot: "lorebook-draft-tool",
            customState: {},
            linkedAgents: [],
            archived: false,
            agentMode: "normal",
        }),
        initial: {},
        vars: createTestVariableAccessor(),
        catalog: {profiles: [], issues: []},
        skills: [],
        settings: LEADER_DEFAULT_SETTINGS,
    });
    return {
        systemPrompt: prepared.systemPrompt ?? "",
        appendingText: (prepared.appendingMessages ?? []).map((message) => JSON.stringify(message)).join("\n"),
    };
}

/** 一份合法草稿；各用例只改自己关心的字段。 */
function draft(overrides: Record<string, unknown> = {}) {
    return {
        title: "青霜剑",
        category: "item",
        aliases: ["家传古剑", "断岳剑"],
        summary: "主角的家传兵器，剑身如秋水初泓。",
        body: "## 概要\n\n青霜剑是主角从父亲手里接过的传家之物。",
        sourceExcerpt: "作者：那把剑要不就叫青霜？——顾问：可以，正好跟断岳剑的旧名接上。",
        ...overrides,
    };
}

describe("leader.default 的 submit_lorebook_draft 注册", () => {
    it("工具名与 M6 契约同源：SDK 常量必须与 shared/lorebook-draft.ts 一致", async () => {
        // profile-sdk 只导出字面量（不能 re-export 契约模块——它 import zod，会污染所有 profile artifact）。
        // 两边保持一致由这条断言钉住。
        const shared = await import("nbook/shared/lorebook-draft");

        expect(SUBMIT_LOREBOOK_DRAFT_TOOL).toBe(shared.SUBMIT_LOREBOOK_DRAFT_TOOL);
        expect(SUBMIT_LOREBOOK_DRAFT_TOOL).toBe("submit_lorebook_draft");
        expect(submitLorebookDraftTool.key).toBe(shared.SUBMIT_LOREBOOK_DRAFT_TOOL);
    });

    it("工具进了 leader 的 root tools，且是 profile 级自定义实现、携带真实执行入口", () => {
        expect(leaderDefaultProfile.rootToolKeys).toContain("submit_lorebook_draft");
        expect(typeof submitLorebookDraftTool.executeWithContext).toBe("function");
        // 进 root tools 时用的是同一份实现，不是宿主 registry 的同名工具。
        expect(leaderDefaultProfile.tools.submit_lorebook_draft).toBe(submitLorebookDraftTool);
    });

    it("不是宿主内置工具：进不了全局 registry 的白名单，只能由 profile 自带", async () => {
        // 这次 import 会把整个宿主工具注册表拉进来，冷启动实测 5s 上下，正好压 vitest 默认
        // 的 5s 上限（同机不同负载下时红时绿）。给足超时，别让它变成随机失败的测试。
        const {createBuiltinTools} = await import("nbook/server/agent/tools/index");
        const builtinKeys = createBuiltinTools().map((tool) => tool.key);

        expect(builtinKeys).not.toContain("submit_lorebook_draft");
    }, 60_000);

    it("工具实现零写盘能力：源码里没有 writeFile / mkdir / rename 之类调用", async () => {
        const source = await readFile(PROFILE_SOURCE_PATH, "utf8");
        const toolBlock = source.slice(
            source.indexOf("export const submitLorebookDraftTool"),
            source.indexOf("export default defineAgentProfile"),
        );

        expect(toolBlock.length).toBeGreaterThan(0);
        for (const forbidden of ["writeFile", "mkdir", "rm(", "rename(", "copyFile", "appendFile", "node:fs"]) {
            expect(toolBlock, forbidden).not.toContain(forbidden);
        }
        // 工具只会返回悬挂标记（字面量在文件顶部声明，值由契约测试钉住）。
        expect(toolBlock).toContain("DRAFT_PENDING_MARKER");
        expect(source).toContain("LOREBOOK_DRAFT_PENDING_AUTHOR_REVIEW");
    });
});

describe("submit_lorebook_draft 草稿登记", () => {
    it("合法草稿被登记：返回待确认标记与结构化回显，且不写任何文件", async () => {
        const shared = await import("nbook/shared/lorebook-draft");
        const result = await submitLorebookDraftTool.executeWithContext!(
            null as never,
            "call-draft-1",
            draft({suggestedSlug: "qingshuang-sword"}),
        );

        const block = result.content[0];
        expect(block?.type).toBe("text");
        const text = block && block.type === "text" ? block.text : "";
        expect(text).toContain("LOREBOOK_DRAFT_PENDING_AUTHOR_REVIEW");
        expect(text).toContain("已登记 1 张设定卡草稿");
        expect(text).toContain("未写任何文件");
        // 对模型说的是人话口径：类目给中文说法，别名与摘录原样带上。
        expect(text).toContain("物品（item）");
        expect(text).toContain("家传古剑、断岳剑");
        expect(text).toContain("qingshuang-sword");
        expect(text).toContain(draft().sourceExcerpt);
        // 提交之后的话术必须是「等作者确认」，不能变成自己落盘。
        expect(text).toContain("等作者在设定卡上确认或取消");
        expect(text).toContain("作者确认之前不要用文件写工具落盘");

        const details = result.details as {
            marker: string;
            draft: {title: string; category: string; aliases: string[]; suggestedSlug?: string};
        };
        // 悬挂标记必须与 shared 契约同值，否则前端认得、后端写不出来的标记会长期漂移。
        expect(details.marker).toBe(shared.LOREBOOK_DRAFT_PENDING_MARKER);
        expect(details.marker).toBe("LOREBOOK_DRAFT_PENDING_AUTHOR_REVIEW");
        expect(details.draft.title).toBe("青霜剑");
        expect(details.draft.category).toBe("item");
        expect(details.draft.aliases).toEqual(["家传古剑", "断岳剑"]);
        expect(details.draft.suggestedSlug).toBe("qingshuang-sword");
    });

    it("没有别名也能提交（非角色类条目允许空别名），但要在回显里如实体现", async () => {
        const result = await submitLorebookDraftTool.executeWithContext!(null as never, "call-draft-2", draft({aliases: []}));

        const text = (result.content[0] as {type: "text"; text: string}).text;

        expect(text).toContain("已登记 1 张设定卡草稿");
        expect(text).not.toContain("- 别名：");
    });

    it("类目、长度、目录名、别名任一不合规都当场报错，讲清是哪里不对", async () => {
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "d1", draft({category: "typo"})))
            .rejects.toThrow(/类目不对/);
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "d2", draft({title: "  "})))
            .rejects.toThrow(/缺少标题/);
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "d3", draft({summary: "字".repeat(201)})))
            .rejects.toThrow(/摘要太长/);
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "d4", draft({sourceExcerpt: ""})))
            .rejects.toThrow(/缺少原文摘录/);
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "d5", draft({aliases: [" 青霜", "  "]})))
            .rejects.toThrow(/第 2 个别名/);
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "d6", draft({suggestedSlug: "青霜剑"})))
            .rejects.toThrow(/建议目录名不合法/);
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "d7", ["not-an-object"]))
            .rejects.toThrow(/不是一个对象/);
    });

    it("九个类目与 shared 契约逐一对齐：契约认的都能提交，契约不认的都拒", async () => {
        const shared = await import("nbook/shared/lorebook-draft");

        for (const category of shared.LOREBOOK_DRAFT_CATEGORIES) {
            const result = await submitLorebookDraftTool.executeWithContext!(null as never, `cat-${category}`, draft({category}));
            expect((result.content[0] as {type: "text"; text: string}).text).toContain(shared.LOREBOOK_DRAFT_CATEGORY_LABELS[category]);
        }
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "cat-bad", draft({category: "species"})))
            .rejects.toThrow(/类目不对/);
    });

    it("各字段长度上限与 shared 契约逐一对齐：压线合法、超一个字即拒", async () => {
        // profile 侧手写校验与 shared 的 zod schema 是两份实现（profile 编译不放行 zod），
        // 这条断言把两份实现的边界钉成同一个数：任何一边改了上限，这里立刻红。
        const shared = await import("nbook/shared/lorebook-draft");
        const boundaries = [
            ["title", shared.MAX_LOREBOOK_DRAFT_TITLE_LENGTH],
            ["summary", shared.MAX_LOREBOOK_DRAFT_SUMMARY_LENGTH],
            ["body", shared.MAX_LOREBOOK_DRAFT_BODY_LENGTH],
            ["sourceExcerpt", shared.MAX_LOREBOOK_DRAFT_SOURCE_EXCERPT_LENGTH],
        ] as const;

        for (const [field, limit] of boundaries) {
            await expect(submitLorebookDraftTool.executeWithContext!(null as never, `lim-${field}-ok`, draft({[field]: "字".repeat(limit)})))
                .resolves.toBeTruthy();
            await expect(submitLorebookDraftTool.executeWithContext!(null as never, `lim-${field}-over`, draft({[field]: "字".repeat(limit + 1)})))
                .rejects.toThrow(/太长/);
        }

        const aliasAtLimit = "字".repeat(shared.MAX_LOREBOOK_DRAFT_ALIAS_LENGTH);
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "alias-ok", draft({aliases: [aliasAtLimit]})))
            .resolves.toBeTruthy();
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "alias-over", draft({aliases: ["字".repeat(shared.MAX_LOREBOOK_DRAFT_ALIAS_LENGTH + 1)]})))
            .rejects.toThrow(/太长/);

        const manyAliases = Array.from({length: shared.MAX_LOREBOOK_DRAFT_ALIASES}, (_item, index) => `别称${index}`);
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "aliases-ok", draft({aliases: manyAliases})))
            .resolves.toBeTruthy();
        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "aliases-over", draft({aliases: [...manyAliases, "多一个"]})))
            .rejects.toThrow(/别名超过单次上限/);

        await expect(submitLorebookDraftTool.executeWithContext!(null as never, "slug-over", draft({suggestedSlug: "a".repeat(shared.MAX_LOREBOOK_DRAFT_SLUG_LENGTH + 1)})))
            .rejects.toThrow(/太长/);
    });

    it("校验失败不会留下任何写入痕迹：工具本身不持文件句柄", async () => {
        const source = await readFile(PROFILE_SOURCE_PATH, "utf8");
        const toolBlock = source.slice(
            source.indexOf("export const submitLorebookDraftTool"),
            source.indexOf("export default defineAgentProfile"),
        );

        // 工具块里只有校验与文本拼装，没有任何文件系统调用。
        expect(toolBlock).not.toContain("fs/promises");
        expect(toolBlock).not.toContain("process.cwd");
    });

    it("契约上限下最大的草稿仍能完整穿过公开投影（否则卡片会静默变空壳）", async () => {
        // M3 的教训：自定义工具的参数走 generic 有界预览（256 节点 / 24 KiB），
        // 超预算的字段会被投影成 unsupported，前端解析不出草稿、卡片静默不渲染。
        // 这里按契约的每个上限取满，钉住「按契约提交的草稿一定投影得出来」。
        const shared = await import("nbook/shared/lorebook-draft");
        const {createPublicProjectionBudget, projectPublicToolArgs} = await import("nbook/server/agent/events/public-tool-projection");
        const {PUBLIC_TOOL_ARGS_TEXT_BYTES} = await import("nbook/server/agent/events/public-event-policy");

        const worst = {
            title: "字".repeat(shared.MAX_LOREBOOK_DRAFT_TITLE_LENGTH),
            category: "character",
            aliases: Array.from({length: shared.MAX_LOREBOOK_DRAFT_ALIASES}, () => "字".repeat(shared.MAX_LOREBOOK_DRAFT_ALIAS_LENGTH)),
            summary: "字".repeat(shared.MAX_LOREBOOK_DRAFT_SUMMARY_LENGTH),
            body: "字".repeat(shared.MAX_LOREBOOK_DRAFT_BODY_LENGTH),
            sourceExcerpt: "字".repeat(shared.MAX_LOREBOOK_DRAFT_SOURCE_EXCERPT_LENGTH),
            suggestedSlug: "a".repeat(shared.MAX_LOREBOOK_DRAFT_SLUG_LENGTH),
        };
        expect(shared.LorebookDraftInputSchema.safeParse(worst).success).toBe(true);

        const projected = projectPublicToolArgs(
            "submit_lorebook_draft",
            worst,
            createPublicProjectionBudget(PUBLIC_TOOL_ARGS_TEXT_BYTES),
        ) as {kind: string; value?: {kind: string; entries: Array<{key: string; value: {kind: string; omitted?: boolean}}>}};

        expect(projected.kind).toBe("generic");
        const entries = projected.value?.entries ?? [];
        expect(entries.map((entry) => entry.key)).toEqual([
            "title",
            "category",
            "aliases",
            "summary",
            "body",
            "sourceExcerpt",
            "suggestedSlug",
        ]);
        for (const entry of entries) {
            expect(entry.value.kind, entry.key).not.toBe("unsupported");
            if (entry.value.kind === "string") {
                expect(entry.value.omitted, entry.key).toBe(false);
            }
        }
    });
});

describe("leader.default 的设定卡沉淀纪律", () => {
    it("System 区写清使用时机、先交卡后落盘、确认后 source 填 manual", async () => {
        const {systemPrompt} = await prepareLeaderPrompt();

        expect(systemPrompt).toContain("submit_lorebook_draft");
        expect(systemPrompt).toContain("提取为设定");
        // 使用时机：只有作者点按钮或明确要求时才沉淀。
        expect(systemPrompt).toContain("才走这条链路；其余场合不要主动沉淀");
        // 先交卡后落盘：这是 M6 的红线。
        expect(systemPrompt).toContain("草稿先交卡，未经作者确认不得落盘");
        expect(systemPrompt).toContain("不许用 write / edit / apply_patch 提前写进 lorebook/");
        // 取消零副作用。
        expect(systemPrompt).toContain("作者取消则零副作用");
        // 来源口径不新造值。
        expect(systemPrompt).toContain("governance.source 一律填 manual");
        expect(systemPrompt).toContain("不新造来源值");
    }, 60_000);

    it("沉淀纪律只在 System 区，不进 AppendingSet", async () => {
        const {appendingText} = await prepareLeaderPrompt();

        expect(appendingText).not.toContain("草稿先交卡，未经作者确认不得落盘");
        expect(appendingText).not.toContain("submit_lorebook_draft");
    }, 60_000);

    it("纪律原句直接内联在 profile 源码里，可静态核对", async () => {
        const source = await readFile(PROFILE_SOURCE_PATH, "utf8");

        expect(source).toContain("submit_lorebook_draft");
        expect(source).toContain("草稿先交卡，未经作者确认不得落盘");
        expect(source).toContain("governance.source 一律填 manual");
    });
});
