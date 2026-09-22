import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {absoluteFsPath} from "nbook/server/runtime/paths/file-path";
import {createStoredUserMessage} from "nbook/server/agent/messages/message-utils";
import type {ProfileTurnContextPlan} from "./profile-turn-context";
import {
    createProjectWorkspaceKey,
    projectWorkspaceRef,
    resolvedProjectWorkspace,
} from "nbook/server/workspace-files/project-identity";
import type {ReadyProjectSessionRef} from "nbook/server/workspace-files/project-session-types";
import type {StoryPromiseDto} from "nbook/shared/dto/plot.dto";
import {materializeProfileTurnContexts} from "./profile-turn-context";
import {parseFrontmatterDocument} from "nbook/server/utils/frontmatter-document";
import {WorkspaceContentFrontmatterSchema} from "nbook/server/workspace-files/content-node-schema";

/**
 * M2a 里程碑验收场景（docs/milestones.md M2a 节）：
 * ≥30 条设定条目、≥5 条未决伏笔的文稿上聊某角色，抽 3 轮注入内容——
 * 恰好包含该角色条目与相关伏笔、不含无关条目；锚点规范机器抽查门禁。
 */

const mocks = vi.hoisted(() => ({
    requireReadyModuleHandle: vi.fn(),
    activateReadyProjectModule: vi.fn(),
    readUnseenForAgent: vi.fn(async () => [] as unknown[]),
    advanceAgentCursor: vi.fn(async () => undefined),
    warn: vi.fn(async () => undefined),
}));

vi.mock("nbook/server/workspace-files/project-session", () => ({
    requireReadyModuleHandle: mocks.requireReadyModuleHandle,
    activateReadyProjectModule: mocks.activateReadyProjectModule,
}));

vi.mock("nbook/server/workspace-history/project-history", () => ({
    PROJECT_HISTORY_MODULE_TOKEN: {name: "history", kind: "required"},
    readUnseenForAgent: mocks.readUnseenForAgent,
    advanceAgentCursor: mocks.advanceAgentCursor,
}));

vi.mock("nbook/server/app-logs/logger", () => ({
    appLogger: {warn: mocks.warn, info: vi.fn(async () => undefined), error: vi.fn(async () => undefined)},
}));

function stubModules(input: {plot?: unknown} = {}): void {
    mocks.requireReadyModuleHandle.mockImplementation((_ready: unknown, token: {name: string}) => {
        if (token.name === "history") return {generation: 1};
        if (token.name === "file-index") return {generation: 1};
        if (token.name === "plot-world" && input.plot) return input.plot;
        throw new Error(`module unavailable: ${token.name}`);
    });
    mocks.activateReadyProjectModule.mockImplementation(async (_ready: unknown, token: {name: string}) => {
        if (token.name === "plot-world" && input.plot) return input.plot;
        throw new Error(`lazy module unavailable: ${token.name}`);
    });
}

function promiseDto(overrides: Partial<StoryPromiseDto> & {id: string; name: string}): StoryPromiseDto {
    return {
        storyId: "1",
        title: overrides.name,
        status: "open",
        derivedStage: "planted",
        importance: "medium",
        summary: "",
        payoffExpectation: null,
        cadenceChapters: null,
        deadlineChapterId: null,
        deadlineChapter: null,
        tags: [],
        beatStats: {plant: 1, advance: 0, setback: 0, payoff: 0, planned: 0, factual: 1, archived: 0},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    } as StoryPromiseDto;
}

const CHAPTER_PATH = "manuscript/001-vol/001-ch/index.md";

type FixtureEntry = {
    directory: string;
    title: string;
    aliases?: string[];
    body: string;
    source: "interview" | "generated" | "manual";
    anchors?: Array<{chapter: string; quote: string; note?: string}>;
};

function entryDocument(entry: FixtureEntry): string {
    const lines = [
        "---",
        `title: "${entry.title}"`,
        `type: "${entry.directory.split("/")[1]}"`,
        `status: "active"`,
        ...((entry.aliases ?? []).length > 0
            ? ["aliases:", ...(entry.aliases ?? []).map((alias) => `  - "${alias}"`)]
            : ["aliases: []"]),
        "subtype: null",
        "icon: null",
        "tags: []",
        `summary: "${entry.body.slice(0, 20)}"`,
        "refs: []",
        "retrieval:",
        "  enabled: false",
        "  trigger: null",
        "governance:",
        `  source: "${entry.source}"`,
        `  review: "proposed"`,
        ...((entry.anchors ?? []).length > 0
            ? ["anchors:", ...(entry.anchors ?? []).flatMap((anchor) => [
                `  - chapter: "${anchor.chapter}"`,
                `    quote: "${anchor.quote}"`,
                ...(anchor.note ? [`    note: "${anchor.note}"`] : []),
            ])]
            : ["anchors: []"]),
        "ext: {}",
        "---",
        "",
        entry.body,
        "",
    ];
    return lines.join("\n");
}

/** 规范口径检查：正文后 AI 沉淀（generated）必须有 chapter+quote 锚点。 */
function anchorGateViolation(doc: string): string | null {
    const parsed = parseFrontmatterDocument(doc, WorkspaceContentFrontmatterSchema);
    const frontmatter = parsed.metadata;
    if (frontmatter.governance.source !== "generated") return null;
    const anchors = frontmatter.anchors ?? [];
    if (anchors.length === 0) return "generated 条目缺 anchors";
    for (const anchor of anchors) {
        if (!anchor.chapter.trim() || !anchor.quote.trim()) return "锚点缺 chapter/quote";
    }
    return null;
}

describe("M2a 里程碑验收场景：30+ 条目 / 5+ 未决伏笔 / 3 轮注入抽查", () => {
    let projectRoot: string;
    let project: ReadyProjectSessionRef;

    /** 与验收无关的条目（不得出现在注入里）。 */
    const unrelatedTitles = ["铁掌门", "白露城", "玄铁令", "赤焰谷", "无名老僧", "听雨楼"];

    beforeEach(async () => {
        vi.clearAllMocks();
        projectRoot = await mkdtemp(testHostPath("nbook-m2a-acceptance-"));
        const ref = projectWorkspaceRef("novel-m2a-acceptance");
        project = {
            workspace: resolvedProjectWorkspace(
                ref,
                absoluteFsPath(projectRoot),
                createProjectWorkspaceKey(absoluteFsPath(path.dirname(projectRoot)), ref),
            ),
            generation: 7,
        };

        // 32 条 lorebook 条目：目标角色苏云 + 章节提到的黑鸦堡 + 30 条干扰项
        const entries: FixtureEntry[] = [
            {directory: "lorebook/character/su-yun", title: "苏云", aliases: ["云哥", "楼主"], body: "天机阁主，性情沉稳。少年时家道中落，靠一柄断剑重新站起。", source: "generated", anchors: [{chapter: "001-ch", quote: "少年反手抽出青霜剑。", note: "初次登场"}]},
            {directory: "lorebook/location/hei-ya-bao", title: "黑鸦堡", aliases: ["鸦堡"], body: "北境要塞，常年落雪。", source: "generated", anchors: [{chapter: "001-ch", quote: "黑鸦堡的钟声在夜里响起。"}]},
            {directory: "lorebook/faction/tie-zhang", title: "铁掌门", aliases: ["铁掌"], body: "西川门派。", source: "manual"},
            {directory: "lorebook/location/bai-lu", title: "白露城", body: "南方水城。", source: "manual"},
            {directory: "lorebook/item/xuan-tie-ling", title: "玄铁令", body: "号令群雄的信物。", source: "generated", anchors: [{chapter: "001-ch", quote: "玄铁令一出，莫敢不从。"}]},
            {directory: "lorebook/location/chi-yan-gu", title: "赤焰谷", body: "火山腹地。", source: "manual"},
            {directory: "lorebook/character/wu-ming", title: "无名老僧", aliases: ["老僧"], body: "少林寺扫地僧。", source: "interview"},
            {directory: "lorebook/faction/ting-yu-lou", title: "听雨楼", body: "杀手组织。", source: "manual"},
        ];
        // 24 条批量干扰项（不同类目，aliases 与目标角色无关）
        for (let index = 0; index < 24; index += 1) {
            const categories = ["character", "location", "item", "event"] as const;
            entries.push({
                directory: `lorebook/${categories[index % 4]}/extra-${String(index + 1).padStart(2, "0")}`,
                title: `条目${String(index + 1).padStart(2, "0")}`,
                aliases: [`别称${String(index + 1).padStart(2, "0")}`],
                body: `第 ${index + 1} 条与本轮对话无关的设定。`,
                source: index % 3 === 0 ? "generated" : "manual",
                anchors: index % 3 === 0 ? [{chapter: "001-ch", quote: "原文第 ${index + 1} 句。"}] : [],
            });
        }
        for (const entry of entries) {
            const directory = path.join(projectRoot, entry.directory);
            await mkdir(directory, {recursive: true});
            await writeFile(path.join(directory, "index.md"), entryDocument(entry), "utf-8");
        }

        // 当前章节正文：提到黑鸦堡，没提苏云
        const chapterAbsolute = path.join(projectRoot, CHAPTER_PATH);
        await mkdir(path.dirname(chapterAbsolute), {recursive: true});
        await writeFile(chapterAbsolute, ["---", "chapter: 第一章 启程", "---", "", "黑鸦堡的钟声在夜里响起。", ""].join("\n"), "utf-8");

        // 7 条伏笔：5 open + 1 fulfilled + 1 abandoned
        stubModules({
            plot: {
                plot: {
                    listStoryPromises: vi.fn(async () => [
                        promiseDto({id: "1", name: "断剑之誓", importance: "high", summary: "主角立誓重铸断剑。"}),
                        promiseDto({id: "2", name: "井底之声", summary: "井底传来低语，来处未明。"}),
                        promiseDto({id: "3", name: "失踪的商队", summary: "北境商队一夜消失。"}),
                        promiseDto({id: "4", name: "天机阁内鬼", importance: "high", summary: "阁中似有内鬼。"}),
                        promiseDto({id: "5", name: "苏云的旧伤", summary: "苏云左肩旧伤未愈。"}),
                        promiseDto({id: "6", name: "旧日来信", status: "fulfilled", summary: "已兑现。"}),
                        promiseDto({id: "7", name: "废弃的暗线", status: "abandoned", summary: "已放弃。"}),
                    ]),
                    getPlotTree: vi.fn(async () => ({
                        acts: [{chapters: [{name: "第一章 启程", sortOrder: 0}]}],
                        ungroupedChapters: [],
                    })),
                },
            },
        });
    });

    afterEach(async () => {
        await rm(projectRoot, {recursive: true, force: true});
    });

    async function materializeTurn(userInput: string) {
        const plans: ProfileTurnContextPlan[] = [
            {kind: "promise-ledger", appendingIndex: 0},
            {kind: "mentioned-entities", appendingIndex: 1},
        ];
        return materializeProfileTurnContexts({
            plans,
            project,
            sessionId: 7,
            diffMaxChars: 512,
            pendingUserMessage: createStoredUserMessage(userInput),
            selectedFilePath: CHAPTER_PATH,
        });
    }

    function injectedText(message: {content: unknown[]}): string {
        const block = message.content[0] as {type: string; text: string};
        return block.text;
    }

    // 里程碑验收第 1 条：抽 3 轮聊到该角色的对话，注入恰好含该角色条目与相关伏笔、不含无关条目
    it.each([
        ["云哥接下来打算怎么查内鬼？", "别名「云哥」命中"],
        ["楼主的旧伤会不会影响决战？", "别名「楼主」命中"],
        ["苏云和黑鸦堡之间有什么关联？", "title 直接命中"],
    ])("第 %# 轮（%s）：注入精确命中", async (userInput) => {
        const result = await materializeTurn(userInput);
        expect(result.insertions).toHaveLength(2);

        const ledger = injectedText(result.insertions[0]!.message);
        expect(ledger).toContain("断剑之誓");
        expect(ledger).toContain("井底之声");
        expect(ledger).toContain("失踪的商队");
        expect(ledger).toContain("天机阁内鬼");
        expect(ledger).toContain("苏云的旧伤");
        expect(ledger).not.toContain("旧日来信");
        expect(ledger).not.toContain("废弃的暗线");

        const entities = injectedText(result.insertions[1]!.message);
        expect(entities).toContain("苏云");
        expect(entities).toContain("lorebook/character/su-yun");
        for (const title of unrelatedTitles) {
            expect(entities).not.toContain(title);
        }
        // 干扰项抽样也不在注入里
        expect(entities).not.toContain("条目01");
        expect(entities).not.toContain("条目24");
    });

    // 里程碑验收第 2 条：随机抽 5 条正文后 AI 沉淀条目，均有来源标注与章节/引用锚点
    it("锚点机器抽检：generated 条目全合规，违规条目能被门禁标出", async () => {
        const {readFile} = await import("node:fs/promises");
        const generatedDirs = ["lorebook/character/su-yun", "lorebook/location/hei-ya-bao", "lorebook/item/xuan-tie-ling", "lorebook/character/extra-01", "lorebook/event/extra-04"];
        for (const directory of generatedDirs) {
            const doc = await readFile(path.join(projectRoot, directory, "index.md"), "utf-8");
            expect(anchorGateViolation(doc), `${directory} 应过锚点门禁`).toBeNull();
            const parsed = parseFrontmatterDocument(doc, WorkspaceContentFrontmatterSchema);
            expect(parsed.metadata.governance.source).toBe("generated");
        }

        // 反例：generated 条目缺锚点必须被门禁标出
        const bad = entryDocument({directory: "lorebook/character/bad", title: "坏条目", body: "无锚点。", source: "generated", anchors: []});
        expect(anchorGateViolation(bad)).not.toBeNull();
    });
});
