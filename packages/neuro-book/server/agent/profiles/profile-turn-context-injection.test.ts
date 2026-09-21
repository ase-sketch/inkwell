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
    appLogger: {
        warn: mocks.warn,
        info: vi.fn(async () => undefined),
        error: vi.fn(async () => undefined),
    },
}));

/** 装配本轮可用 Project Module；plot 为空表示 Plot 模块不可用。 */
function stubModules(input: {plot?: unknown} = {}): void {
    mocks.requireReadyModuleHandle.mockImplementation((_ready: unknown, token: {name: string}) => {
        if (token.name === "history") return {generation: 1};
        if (token.name === "file-index") return {generation: 1};
        if (token.name === "plot-world" && input.plot) return input.plot;
        throw new Error(`module unavailable: ${token.name}`);
    });
    mocks.activateReadyProjectModule.mockImplementation(async (_ready: unknown, token: {name: string}) => {
        if (token.name === "plot-world" && input.plot) {
            return input.plot;
        }
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

function lorebookDocument(input: {title: string; aliases?: string[]; body?: string}): string {
    return [
        "---",
        `title: ${input.title}`,
        ...(input.aliases ? ["aliases:", ...input.aliases.map((alias) => `  - ${alias}`)] : []),
        "---",
        "",
        input.body ?? "",
        "",
    ].join("\n");
}

const charLength = (value: string): number => Array.from(value).length;

describe("promise-ledger 物化", () => {
    let projectRoot: string;
    let project: ReadyProjectSessionRef;

    beforeEach(async () => {
        vi.clearAllMocks();
        stubModules();
        projectRoot = await mkdtemp(testHostPath("nbook-turn-context-promise-"));
        const ref = projectWorkspaceRef("novel-promise");
        project = {
            workspace: resolvedProjectWorkspace(
                ref,
                absoluteFsPath(projectRoot),
                createProjectWorkspaceKey(absoluteFsPath(path.dirname(projectRoot)), ref),
            ),
            generation: 7,
        };
    });

    afterEach(async () => {
        await rm(projectRoot, {recursive: true, force: true});
    });

    async function materialize(plans: ProfileTurnContextPlan[]) {
        return materializeProfileTurnContexts({
            plans,
            project,
            sessionId: 7,
            diffMaxChars: 512,
            pendingUserMessage: null,
            selectedFilePath: null,
        });
    }

    it("只注入 open 伏笔，并标注 id、重要度与期限章", async () => {
        stubModules({
            plot: {
                plot: {
                    listStoryPromises: vi.fn(async () => [
                        promiseDto({id: "11", name: "断剑之誓", importance: "high", summary: "主角立誓重铸断剑。", deadlineChapterId: "3", deadlineChapter: {id: "3", name: "003-forge", title: "第三章 铸剑"}}),
                        promiseDto({id: "12", name: "旧日来信", status: "fulfilled", importance: "high", summary: "已兑现。"}),
                        promiseDto({id: "13", name: "井底之声", importance: "low", summary: "井底传来低语。"}),
                        promiseDto({id: "14", name: "失踪的商队", status: "abandoned", summary: "已放弃。"}),
                    ]),
                },
            },
        });

        const result = await materialize([{kind: "promise-ledger", appendingIndex: 0}]);
        expect(result.insertions).toHaveLength(1);
        const text = injectedText(result.insertions[0]!.message);

        expect(text).toContain("<promise-ledger>");
        expect(text).toContain("断剑之誓");
        expect(text).toContain("井底之声");
        expect(text).not.toContain("旧日来信");
        expect(text).not.toContain("失踪的商队");
        expect(text).toContain("id=11");
        expect(text).toContain("high");
        expect(text).toContain("003-forge");
        expect(text).toContain("背景资料，供你讨论时参考");
        expect(text).toContain("不要逐字复述给用户");
    });

    it("没有 open 伏笔时跳过注入", async () => {
        stubModules({
            plot: {plot: {listStoryPromises: vi.fn(async () => [
                promiseDto({id: "21", name: "已兑现", status: "fulfilled"}),
                promiseDto({id: "22", name: "已放弃", status: "abandoned"}),
            ])}},
        });

        const result = await materialize([{kind: "promise-ledger", appendingIndex: 0}]);
        expect(result.insertions).toEqual([]);
    });

    it("超过条数上限时只注入前 10 条并标注剩余条数", async () => {
        const promises = Array.from({length: 13}, (_value, index) => promiseDto({
            id: String(100 + index),
            name: `伏笔${String(index + 1).padStart(2, "0")}`,
            summary: "短摘要。",
        }));
        stubModules({plot: {plot: {listStoryPromises: vi.fn(async () => promises)}}});

        const result = await materialize([{kind: "promise-ledger", appendingIndex: 0}]);
        const text = injectedText(result.insertions[0]!.message);

        expect(text).toContain("伏笔01");
        expect(text).toContain("伏笔10");
        expect(text).not.toContain("伏笔11");
        expect(text).toContain("还有 3 条未注入");
    });

    it("总字符预算超限时截断到预算内并标注剩余条数", async () => {
        const longSummary = "长".repeat(300);
        const promises = Array.from({length: 10}, (_value, index) => promiseDto({
            id: String(200 + index),
            name: `超长伏笔${String(index + 1)}`,
            summary: longSummary,
        }));
        stubModules({plot: {plot: {listStoryPromises: vi.fn(async () => promises)}}});

        const result = await materialize([{kind: "promise-ledger", appendingIndex: 0}]);
        const text = injectedText(result.insertions[0]!.message);

        expect(charLength(text)).toBeLessThanOrEqual(1500);
        expect(text).toMatch(/还有 \d+ 条未注入/u);
        expect(text).toContain("超长伏笔1");
    });

    it("Plot 模块不可用时跳过该 kind 并记 warn，不影响同轮其他 kind", async () => {
        await writeLorebook(projectRoot, [
            {directory: "lorebook/character/hero", title: "顾长清", aliases: ["顾先生"], body: "青云门执剑长老。"},
        ]);

        const result = await materializeProfileTurnContexts({
            plans: [
                {kind: "promise-ledger", appendingIndex: 0},
                {kind: "mentioned-entities", appendingIndex: 1},
            ],
            project,
            sessionId: 7,
            diffMaxChars: 512,
            pendingUserMessage: createStoredUserMessage("顾先生最近在想什么？"),
            selectedFilePath: null,
        });

        expect(result.insertions).toHaveLength(1);
        expect(result.insertions[0]!.appendingIndex).toBe(1);
        expect(mocks.warn).toHaveBeenCalled();
    });

    it("取数抛错时不让整轮失败，只跳过该 kind", async () => {
        stubModules({
            plot: {plot: {listStoryPromises: vi.fn(async () => {
                throw new Error("database is locked");
            })}},
        });

        const result = await materialize([{kind: "promise-ledger", appendingIndex: 0}]);
        expect(result.insertions).toEqual([]);
        expect(mocks.warn).toHaveBeenCalled();
    });
});

describe("mentioned-entities 物化", () => {
    let projectRoot: string;
    let project: ReadyProjectSessionRef;

    beforeEach(async () => {
        vi.clearAllMocks();
        stubModules();
        projectRoot = await mkdtemp(testHostPath("nbook-turn-context-entities-"));
        const ref = projectWorkspaceRef("novel-entities");
        project = {
            workspace: resolvedProjectWorkspace(
                ref,
                absoluteFsPath(projectRoot),
                createProjectWorkspaceKey(absoluteFsPath(path.dirname(projectRoot)), ref),
            ),
            generation: 7,
        };
    });

    afterEach(async () => {
        await rm(projectRoot, {recursive: true, force: true});
    });

    async function materialize(input: {
        pendingUserMessage?: string | null;
        selectedFilePath?: string | null;
    }) {
        return materializeProfileTurnContexts({
            plans: [{kind: "mentioned-entities", appendingIndex: 0}],
            project,
            sessionId: 7,
            diffMaxChars: 512,
            pendingUserMessage: input.pendingUserMessage ? createStoredUserMessage(input.pendingUserMessage) : null,
            selectedFilePath: input.selectedFilePath ?? null,
        });
    }

    it("用户输入命中别名时注入该条目正文并标注来源路径", async () => {
        await writeLorebook(projectRoot, [
            {directory: "lorebook/character/hero", title: "苏云", aliases: ["云哥", "楼主"], body: "天机阁主，性情沉稳。"},
            {directory: "lorebook/location/castle", title: "黑鸦堡", aliases: ["鸦堡"], body: "北境要塞。"},
        ]);

        const result = await materialize({pendingUserMessage: "云哥这次会怎么做？"});

        expect(result.insertions).toHaveLength(1);
        expect(result.insertions[0]!.appendingIndex).toBe(0);
        const text = injectedText(result.insertions[0]!.message);
        expect(text).toContain("<mentioned-entities>");
        expect(text).toContain("lorebook/character/hero");
        expect(text).toContain("苏云");
        expect(text).toContain("天机阁主，性情沉稳。");
        expect(text).not.toContain("黑鸦堡");
        expect(text).toContain("背景资料，供你讨论时参考");
        expect(text).toContain("不要逐字复述给用户");
    });

    it("title 直接命中同样注入", async () => {
        await writeLorebook(projectRoot, [
            {directory: "lorebook/character/hero", title: "苏云", aliases: ["云哥"], body: "天机阁主。"},
        ]);

        const result = await materialize({pendingUserMessage: "苏云的动机是什么？"});

        expect(injectedText(result.insertions[0]!.message)).toContain("苏云");
    });

    it("目录 slug 命中同样注入", async () => {
        await writeLorebook(projectRoot, [
            {directory: "lorebook/organization/tianji-pavilion", title: "天机阁", body: "情报组织。"},
        ]);

        const result = await materialize({pendingUserMessage: "tianji-pavilion 里谁说了算？"});

        expect(injectedText(result.insertions[0]!.message)).toContain("天机阁");
    });

    it("零命中时跳过注入", async () => {
        await writeLorebook(projectRoot, [
            {directory: "lorebook/character/hero", title: "苏云", aliases: ["云哥"], body: "天机阁主。"},
        ]);

        const result = await materialize({pendingUserMessage: "今天午饭吃什么？"});

        expect(result.insertions).toEqual([]);
    });

    it("无当前章节时只用用户输入触发，章节正文不参与命中", async () => {
        await writeLorebook(projectRoot, [
            {directory: "lorebook/location/castle", title: "黑鸦堡", body: "北境要塞。"},
        ]);
        await writeChapter(projectRoot, "黑鸦堡的钟声在夜里响起。");

        // 未选中任何文件：正文里的「黑鸦堡」不得触发注入。
        const withoutChapter = await materialize({
            pendingUserMessage: "我们继续聊聊主角。",
            selectedFilePath: null,
        });
        expect(withoutChapter.insertions).toEqual([]);

        // 选中了 manuscript 文件但 Plot 里没有同名章节：按「拿不到当前章节」降级。
        const unresolvedChapter = await materialize({
            pendingUserMessage: "我们继续聊聊主角。",
            selectedFilePath: CHAPTER_PATH,
        });
        expect(unresolvedChapter.insertions).toEqual([]);
    });

    it("解析出当前章节时，章节正文参与命中且注入文本标注触发来源", async () => {
        await writeLorebook(projectRoot, [
            {directory: "lorebook/location/castle", title: "黑鸦堡", body: "北境要塞。"},
        ]);
        await writeChapter(projectRoot, "黑鸦堡的钟声在夜里响起。");
        stubModules({plot: {plot: {getPlotTree: vi.fn(async () => ({
            acts: [{chapters: [{name: "第一章 启程", sortOrder: 0}]}],
            ungroupedChapters: [],
        }))}}});

        const result = await materialize({
            pendingUserMessage: "我们继续聊聊主角。",
            selectedFilePath: CHAPTER_PATH,
        });

        const text = injectedText(result.insertions[0]!.message);
        expect(text).toContain("黑鸦堡");
        expect(text).toContain("用户本轮输入与当前章节正文");
    });

    it("用户输入与当前章节正文共同参与触发", async () => {
        await writeLorebook(projectRoot, [
            {directory: "lorebook/character/hero", title: "苏云", aliases: ["云哥"], body: "天机阁主。"},
            {directory: "lorebook/location/castle", title: "黑鸦堡", body: "北境要塞。"},
            {directory: "lorebook/item/blade", title: "青霜剑", body: "家传古剑。"},
        ]);
        await writeChapter(projectRoot, "黑鸦堡的钟声在夜里响起。");

        stubModules({plot: {plot: {getPlotTree: vi.fn(async () => ({
            acts: [{chapters: [{name: "第一章 启程", sortOrder: 0}]}],
            ungroupedChapters: [],
        }))}}});

        const result = await materialize({
            pendingUserMessage: "云哥接下来会怎么做？",
            selectedFilePath: CHAPTER_PATH,
        });

        const text = injectedText(result.insertions[0]!.message);
        expect(text).toContain("苏云");
        expect(text).toContain("黑鸦堡");
        expect(text).not.toContain("青霜剑");
    });

    it("单条正文超长时截断", async () => {
        await writeLorebook(projectRoot, [
            {directory: "lorebook/character/hero", title: "苏云", aliases: ["云哥"], body: "长".repeat(2000)},
        ]);

        const result = await materialize({pendingUserMessage: "云哥的过去。"});

        const text = injectedText(result.insertions[0]!.message);
        const longestRun = Math.max(0, ...text.split(/[^长]/u).map((part) => part.length));
        expect(longestRun).toBeGreaterThan(300);
        expect(longestRun).toBeLessThanOrEqual(800);
    });

    it("命中超过 5 条时只注入前 5 条", async () => {
        await writeLorebook(projectRoot, Array.from({length: 7}, (_value, index) => ({
            directory: `lorebook/character/hero-${String(index + 1)}`,
            title: `角色${String(index + 1)}`,
            aliases: ["云哥"],
            body: `第 ${String(index + 1)} 位角色的档案。`,
        })));

        const result = await materialize({pendingUserMessage: "云哥和他们的关系？"});

        const text = injectedText(result.insertions[0]!.message);
        expect(text.match(/lorebook\/character\/hero-/gu)).toHaveLength(5);
    });

    it("lorebook 内容节点为空时跳过注入", async () => {
        const result = await materialize({pendingUserMessage: "云哥的过去。"});
        expect(result.insertions).toEqual([]);
    });
});

/** 从存储消息中取出注入正文。 */
function injectedText(message: {content: unknown[]}): string {
    const block = message.content[0] as {type: string; text: string};
    return block.text;
}

/** 写入真实 lorebook 内容节点夹具（目录 + index.md），走真实文件扫描入口。 */
async function writeLorebook(
    projectRoot: string,
    entries: Array<{directory: string; title: string; aliases?: string[]; body?: string}>,
): Promise<void> {
    for (const entry of entries) {
        const directory = path.join(projectRoot, entry.directory);
        await mkdir(directory, {recursive: true});
        await writeFile(path.join(directory, "index.md"), lorebookDocument(entry), "utf-8");
    }
}

/** 写入真实章节正文夹具。 */
async function writeChapter(projectRoot: string, body: string): Promise<void> {
    const absolutePath = path.join(projectRoot, CHAPTER_PATH);
    await mkdir(path.dirname(absolutePath), {recursive: true});
    await writeFile(absolutePath, ["---", "chapter: 第一章 启程", "---", "", body, ""].join("\n"), "utf-8");
}
