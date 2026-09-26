import {beforeEach, describe, expect, it, vi} from "vitest";
import type {TimelineEntry} from "@notnotype/nb-history";

/**
 * 条目「演进」两条路由的接线契约（M5）。
 *
 * .vue 与 Nuxt 进不了 vitest，所以这里盯的是「路由把哪块数据接到了哪个出口」：
 * 授权守卫按 projectRoot 生效、时间线倒序透传、agent 归因解析（含会话已删除降级）、
 * 按条目取 diff 时 entryId 必须属于该路径，以及安全分支不携带正文。
 * 纯逻辑（归因人话化、行投影）由 knowledge-evolution.test.ts 直测。
 */
describe("workspace history timeline routes", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
        vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    });

    it("时间线按 projectRoot 走授权守卫，并倒序返回（最近一次在最前）", async () => {
        mockGetQuery({projectRoot: "book", path: "lorebook/character/hero/index.md"});
        const timeline = vi.fn(async () => [timelineEntry(1), timelineEntry(7), timelineEntry(9)]);
        const dependencies = mockHistory({timeline});

        const handler = (await import("nbook/server/api/workspace-history/timeline.get")).default;
        const result = await handler({} as never) as {path: string; entries: Array<{id: number}>};

        expect(dependencies.requireProjectHandles).toHaveBeenCalledWith("book");
        expect(dependencies.waitForWarmup).toHaveBeenCalledTimes(1);
        expect(dependencies.waitForWarmup.mock.invocationCallOrder[0])
            .toBeLessThan(timeline.mock.invocationCallOrder[0]!);
        expect(result.path).toBe("lorebook/character/hero/index.md");
        expect(result.entries.map((entry) => entry.id)).toEqual([9, 7, 1]);
        // followRenames：条目目录被改名后历史仍跟着「当前叫这个路径的文件」。
        expect(timeline).toHaveBeenCalledWith("lorebook/character/hero/index.md", {followRenames: true, limit: 50});
    });

    it("agent 归因解析成会话标题与档案键，同一会话只查一次", async () => {
        mockGetQuery({projectRoot: "book", path: "lorebook/character/hero/index.md"});
        const timeline = vi.fn(async () => [timelineEntry(1, {kind: "agent", sessionId: "7"}), timelineEntry(2, {kind: "agent", sessionId: "7"})]);
        const repo = mockSessionRepo({7: {title: "新书设定", profileKey: "interview.new-book"}});
        mockHistory({timeline});

        const handler = (await import("nbook/server/api/workspace-history/timeline.get")).default;
        const result = await handler({} as never) as {entries: Array<{agent: {title: string | null; profileKey: string | null; sessionId: number | null} | null}>};

        expect(repo.readSession).toHaveBeenCalledTimes(1);
        expect(result.entries[0]!.agent).toEqual({sessionId: 7, title: "新书设定", profileKey: "interview.new-book", sessionExists: true});
        expect(result.entries[1]!.agent).toEqual({sessionId: 7, title: "新书设定", profileKey: "interview.new-book", sessionExists: true});
    });

    it("会话已删除时归因降级为 null，时间线照常返回", async () => {
        mockGetQuery({projectRoot: "book", path: "lorebook/character/hero/index.md"});
        const timeline = vi.fn(async () => [timelineEntry(3, {kind: "agent", sessionId: "42"})]);
        mockSessionRepo({});
        mockHistory({timeline});

        const handler = (await import("nbook/server/api/workspace-history/timeline.get")).default;
        const result = await handler({} as never) as {entries: Array<{agent: {title: string | null; profileKey: string | null} | null}>};

        expect(result.entries[0]!.agent).toMatchObject({title: null, profileKey: null});
    });

    it("非 agent 归因不带会话信息，bodyAvailable 如实透传", async () => {
        mockGetQuery({projectRoot: "book", path: "lorebook/character/hero/index.md"});
        const timeline = vi.fn(async () => [
            {...timelineEntry(5, {kind: "user", userId: "local"}), bodyAvailable: {before: true, after: false}},
        ]);
        mockSessionRepo({});
        mockHistory({timeline});

        const handler = (await import("nbook/server/api/workspace-history/timeline.get")).default;
        const result = await handler({} as never) as {entries: Array<{actorKind: string; agent: unknown; bodyAvailable: {before: boolean; after: boolean}; diffAvailable: boolean}>};

        expect(result.entries[0]).toMatchObject({
            actorKind: "user",
            actorDetail: "local",
            agent: null,
            bodyAvailable: {before: true, after: false},
        });
        // 该侧内容存在过、快照却不可取 → 这次修改没法看前后差异。
        expect(result.entries[0]!.diffAvailable).toBe(false);
    });

    it("新建与删除照样可看差异，只有快照丢失才不可展开", async () => {
        mockGetQuery({projectRoot: "book", path: "lorebook/character/hero/index.md"});
        const created: TimelineEntry = {
            entry: {
                id: 11,
                occurredAt: new Date(11_000).toISOString(),
                actor: {kind: "user", userId: "local"},
                operation: {type: "file.create", path: "lorebook/character/hero/index.md", afterHash: "after-11"},
            },
            pathAtThatTime: "lorebook/character/hero/index.md",
            // 新建前文件不存在：没有「修改前」这一侧，但差异仍然看得见（空 → 有内容）。
            bodyAvailable: {before: false, after: true},
        };
        const pruned: TimelineEntry = {
            ...timelineEntry(12),
            // 内容存在过，但快照已被保留策略清理：这一侧读不回来。
            bodyAvailable: {before: false, after: true},
        };
        mockSessionRepo({7: {title: "新书设定", profileKey: "interview.new-book"}});
        mockHistory({timeline: vi.fn(async () => [created, pruned])});

        const handler = (await import("nbook/server/api/workspace-history/timeline.get")).default;
        const result = await handler({} as never) as {entries: Array<{id: number; diffAvailable: boolean}>};

        expect(result.entries.find((entry) => entry.id === 11)?.diffAvailable).toBe(true);
        expect(result.entries.find((entry) => entry.id === 12)?.diffAvailable).toBe(false);
    });

    it("会话还在时标记 sessionExists，已删除时标记 false", async () => {
        mockGetQuery({projectRoot: "book", path: "lorebook/character/hero/index.md"});
        const timeline = vi.fn(async () => [
            timelineEntry(1, {kind: "agent", sessionId: "7"}),
            timelineEntry(2, {kind: "agent", sessionId: "404"}),
        ]);
        mockSessionRepo({7: {title: "新书设定", profileKey: "interview.new-book"}});
        mockHistory({timeline});

        const handler = (await import("nbook/server/api/workspace-history/timeline.get")).default;
        const result = await handler({} as never) as {entries: Array<{id: number; agent: {sessionExists: boolean} | null}>};

        expect(result.entries.find((entry) => entry.id === 1)?.agent?.sessionExists).toBe(true);
        expect(result.entries.find((entry) => entry.id === 2)?.agent?.sessionExists).toBe(false);
    });

    it("history 未启用时返回空时间线而不是报错", async () => {
        mockGetQuery({projectRoot: "book", path: "lorebook/character/hero/index.md"});
        mockHistory(null);

        const handler = (await import("nbook/server/api/workspace-history/timeline.get")).default;
        await expect(handler({} as never)).resolves.toEqual({path: "lorebook/character/hero/index.md", entries: []});
    });

    it("按条目取 diff 时不接受不属于该路径的条目", async () => {
        mockGetQuery({projectRoot: "book", path: "lorebook/character/hero/index.md", entryId: "99", mode: "inline"});
        const textDiff = vi.fn();
        mockHistory({timeline: vi.fn(async () => [timelineEntry(7)]), textDiff});

        const handler = (await import("nbook/server/api/workspace-history/entry-diff.get")).default;
        await expect(handler({} as never)).rejects.toMatchObject({statusCode: 404});
        // 未授权的条目不能触发任何正文读取。
        expect(textDiff).not.toHaveBeenCalled();
    });

    it("按条目取 diff 用该次修改的两侧 hash，敏感路径不返回正文", async () => {
        mockGetQuery({projectRoot: "book", path: ".env", entryId: "7", mode: "inline"});
        const textDiff = vi.fn();
        mockHistory({timeline: vi.fn(async () => [timelineEntry(7)]), textDiff});

        const handler = (await import("nbook/server/api/workspace-history/entry-diff.get")).default;
        await expect(handler({} as never)).resolves.toEqual({status: "blocked", reason: "sensitive_path"});
        expect(textDiff).not.toHaveBeenCalled();
    });

    it("按条目取 diff 命中条目时读取该次修改前后内容", async () => {
        mockGetQuery({projectRoot: "book", path: "lorebook/character/hero/index.md", entryId: "7", mode: "inline"});
        const textDiff = vi.fn(async () => ({
            available: true as const,
            changes: [{value: "旧\n", removed: true, count: 1}, {value: "新\n", added: true, count: 1}],
            beforeText: "旧\n",
            afterText: "新\n",
        }));
        mockHistory({timeline: vi.fn(async () => [timelineEntry(7)]), textDiff});

        const handler = (await import("nbook/server/api/workspace-history/entry-diff.get")).default;
        await expect(handler({} as never)).resolves.toMatchObject({status: "available", original: "旧\n", modified: "新\n"});
        expect(textDiff).toHaveBeenCalledWith("before-7", "after-7");
    });

    it("正文快照不可取时返回 unavailable 且不携带正文", async () => {
        mockGetQuery({projectRoot: "book", path: "lorebook/character/hero/index.md", entryId: "7", mode: "inline"});
        mockHistory({
            timeline: vi.fn(async () => [timelineEntry(7)]),
            textDiff: vi.fn(async () => ({available: false as const, reason: "before-missing" as const})),
        });

        const handler = (await import("nbook/server/api/workspace-history/entry-diff.get")).default;
        const result = await handler({} as never);

        expect(result).toEqual({status: "unavailable", reason: "before-missing"});
        expect(JSON.stringify(result)).not.toContain("original");
    });
});

/** 为 GET route 提供 h3 query，同时保留真实 createError 行为。 */
function mockGetQuery(query: Record<string, string>): void {
    vi.doMock("h3", async () => {
        const actual = await vi.importActual<typeof import("h3")>("h3");
        return {...actual, getQuery: () => query};
    });
}

/**
 * 注入 Project Workspace 已打开且 history 可用的最小依赖。
 * history 传 null = 该项目的文件历史功能关闭。
 */
function mockHistory(history: object | null): {readonly requireProjectHandles: ReturnType<typeof vi.fn>; readonly waitForWarmup: ReturnType<typeof vi.fn>} {
    const waitForWarmup = vi.fn(async () => undefined);
    const requireProjectHandles = vi.fn(() => ({
        history: {history: Promise.resolve(history), waitForWarmup},
    }));
    const withProjectHandlesOperation = vi.fn((projectPath: string, handler: (handles: unknown) => unknown) => (
        handler(requireProjectHandles(projectPath))
    ));
    vi.doMock("nbook/server/workspace-files/project-open-guard", () => ({
        requireProjectHandles,
        withProjectHandlesOperation,
    }));
    return {requireProjectHandles, waitForWarmup};
}

/** 注入会话仓库桩：titles 缺失即代表该会话已删除（readSession 按真实仓库的语义抛错）。 */
function mockSessionRepo(titles: Record<number, {title?: string; profileKey?: string}>): {readonly readSession: ReturnType<typeof vi.fn>} {
    const readSession = vi.fn(async (sessionId: number) => {
        if (!(sessionId in titles)) {
            const {AgentSessionNotFoundError} = await import("nbook/server/agent/session/session-not-found-error");
            throw new AgentSessionNotFoundError(sessionId);
        }
        return {metadata: {sessionId}, entries: [], leafId: null};
    });
    const summary = vi.fn((snapshot: {metadata: {sessionId: number}}) => ({
        sessionId: snapshot.metadata.sessionId,
        title: titles[snapshot.metadata.sessionId]?.title,
        profileKey: titles[snapshot.metadata.sessionId]?.profileKey ?? "leader.default",
    }));
    vi.doMock("nbook/server/agent/session/session-repo", () => ({
        JsonlSessionRepository: class {
            readSession = readSession;
            summary = summary;
        },
    }));
    vi.doMock("nbook/server/runtime/paths/runtime-paths", () => ({
        runtimePathsFromEnv: () => ({workspaceRoot: "E:/tmp/never-read"}),
    }));
    return {readSession};
}

/** 构造一条最小时间线条目。 */
function timelineEntry(
    id: number,
    actor: TimelineEntry["entry"]["actor"] = {kind: "agent", sessionId: "7"},
): TimelineEntry {
    return {
        entry: {
            id,
            occurredAt: new Date(id * 1000).toISOString(),
            actor,
            operation: {
                type: "file.edit",
                path: "lorebook/character/hero/index.md",
                beforeHash: `before-${String(id)}`,
                afterHash: `after-${String(id)}`,
            },
        },
        pathAtThatTime: "lorebook/character/hero/index.md",
        bodyAvailable: {before: true, after: true},
    };
}
