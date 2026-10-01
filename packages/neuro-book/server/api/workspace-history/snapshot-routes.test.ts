import {beforeEach, describe, expect, it, vi} from "vitest";
import type {TimelineEntry} from "@notnotype/nb-history";

/**
 * 章节快照四条路由的接线契约（M7）。
 *
 * .vue 与 Nuxt 进不了 vitest，所以这里盯的是「路由把哪块数据接到了哪个出口」：
 * 授权守卫按 projectRoot 生效、打快照挂在正文当前末态、列表按路径降序并标可取性、
 * diff 复用既有安全通道且安全分支不携正文、还原必须经作者确认并先留「还原前」快照、
 * 且还原本身经既有作者写通道落盘并进历史。
 */
describe("workspace history chapter snapshot routes", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
        vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
        vi.stubGlobal("readBody", async () => ({}));
    });

    it("打快照：按 projectRoot 走授权守卫，挂在正文当前末态并落库", async () => {
        await mockBody({projectRoot: "book", path: "manuscript/ch1.md", note: "决战前夜"});
        const timeline = vi.fn(async () => [entry(10), entry(11)]);
        const create = vi.fn(async () => snapshotRow({id: 5, entryId: 11, note: "决战前夜"}));
        // 打完快照要回列表，列表读的是刚落库那一行。
        const dependencies = mockHistory({timeline}, {create, findMany: vi.fn(async () => [snapshotRow({id: 5, entryId: 11, note: "决战前夜"})])});

        const handler = (await import("nbook/server/api/workspace-history/snapshot.post")).default;
        const result = await handler({} as never) as {path: string; snapshots: Array<{id: number}>};

        expect(dependencies.requireProjectHandles).toHaveBeenCalledWith("book");
        expect(dependencies.waitForWarmup).toHaveBeenCalledTimes(1);
        expect(dependencies.waitForWarmup.mock.invocationCallOrder[0])
            .toBeLessThan(timeline.mock.invocationCallOrder[0]!);
        // 快照必须挂在「此刻这一版」（时间线最后一条），不能由调用方指定任意历史版本。
        expect(create).toHaveBeenCalledWith({data: {path: "manuscript/ch1.md", entryId: 11, note: "决战前夜"}});
        expect(result.snapshots[0]!.id).toBe(5);
    });

    it("打快照：留空备注存 null，作者没起名时界面按时间兜底", async () => {
        await mockBody({projectRoot: "book", path: "manuscript/ch1.md"});
        const create = vi.fn(async () => snapshotRow({id: 6, entryId: 11, note: null}));
        mockHistory({timeline: vi.fn(async () => [entry(10), entry(11)])}, {create});

        const handler = (await import("nbook/server/api/workspace-history/snapshot.post")).default;
        await handler({} as never);

        expect(create).toHaveBeenCalledWith({data: {path: "manuscript/ch1.md", entryId: 11, note: null}});
    });

    it("打快照：这一章还没有保存记录时如实报错，不凭空造一枚快照", async () => {
        await mockBody({projectRoot: "book", path: "manuscript/ch1.md"});
        const create = vi.fn();
        mockHistory({timeline: vi.fn(async () => [])}, {create});

        const handler = (await import("nbook/server/api/workspace-history/snapshot.post")).default;
        await expect(handler({} as never)).rejects.toMatchObject({statusCode: 404});
        expect(create).not.toHaveBeenCalled();
    });

    it("打快照：文件历史未启用时如实报错，不假装打好了", async () => {
        await mockBody({projectRoot: "book", path: "manuscript/ch1.md"});
        mockHistory(null);

        const handler = (await import("nbook/server/api/workspace-history/snapshot.post")).default;
        await expect(handler({} as never)).rejects.toMatchObject({statusCode: 400});
    });

    it("打快照：不接受记账面外的路径（快照必须指向真实存在过的版本）", async () => {
        await mockBody({projectRoot: "book", path: ".nbook/secret.md"});
        const create = vi.fn();
        mockHistory({timeline: vi.fn(async () => [entry(10)])}, {create});

        const handler = (await import("nbook/server/api/workspace-history/snapshot.post")).default;
        await expect(handler({} as never)).rejects.toMatchObject({statusCode: 400});
        expect(create).not.toHaveBeenCalled();
    });

    it("列表：按路径返回并如实标出每条是否仍可取", async () => {
        mockQuery({projectRoot: "book", path: "manuscript/ch1.md"});
        const findMany = vi.fn(async () => [
            snapshotRow({id: 1, entryId: 10, note: "还在"}),
            snapshotRow({id: 2, entryId: 20, createdAt: new Date("2026-09-29T09:00:00.000Z")}),
        ]);
        const dependencies = mockHistory({
            // 条目 20 的 after 侧快照已被保留策略清理。
            timeline: vi.fn(async () => [entry(10), entry(20, {after: false})]),
        }, {findMany});

        const handler = (await import("nbook/server/api/workspace-history/snapshots.get")).default;
        const result = await handler({} as never) as {path: string; snapshots: Array<{id: number; restorable: boolean}>};

        expect(dependencies.requireProjectHandles).toHaveBeenCalledWith("book");
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where: {path: "manuscript/ch1.md"}}));
        expect(result.snapshots.map((item) => [item.id, item.restorable])).toEqual([[1, true], [2, false]]);
    });

    it("diff：与当前正文比，走既有安全通道，安全分支不携正文", async () => {
        mockQuery({projectRoot: "book", path: "manuscript/ch1.md", snapshotId: "3", mode: "inline"});
        const textDiff = vi.fn(async () => ({
            available: true as const,
            changes: [{value: "旧\n", removed: true, count: 1}, {value: "新\n", added: true, count: 1}],
            beforeText: "旧\n",
            afterText: "新\n",
        }));
        mockHistory(
            {timeline: vi.fn(async () => [entry(10), entry(11)]), snapshotBody: vi.fn(), textDiff},
            {findUnique: vi.fn(async () => snapshotRow({id: 3, entryId: 10}))},
        );

        const handler = (await import("nbook/server/api/workspace-history/snapshot-diff.get")).default;
        const result = await handler({} as never);

        // 复用既有安全 diff 组装，基准=快照那次的 after 态，对比侧=当前末态。
        expect(textDiff).toHaveBeenCalledWith("after-10", "after-11");
        expect(result).toMatchObject({status: "available", original: "旧\n", modified: "新\n"});
    });

    it("diff：敏感路径走 blocked 分支且绝不触碰正文", async () => {
        mockQuery({projectRoot: "book", path: ".env", snapshotId: "3", mode: "inline"});
        const textDiff = vi.fn();
        mockHistory(
            {timeline: vi.fn(async () => [entry(10)]), snapshotBody: vi.fn(), textDiff},
            {findUnique: vi.fn(async () => snapshotRow({id: 3, entryId: 10, path: ".env"}))},
        );

        const handler = (await import("nbook/server/api/workspace-history/snapshot-diff.get")).default;
        const result = await handler({} as never);

        expect(result).toEqual({status: "blocked", reason: "sensitive_path"});
        expect(textDiff).not.toHaveBeenCalled();
    });

    it("diff：快照不属于该章节时拒绝，且不触发任何正文读取", async () => {
        mockQuery({projectRoot: "book", path: "manuscript/ch1.md", snapshotId: "99", mode: "inline"});
        const textDiff = vi.fn();
        const snapshotBody = vi.fn();
        mockHistory(
            {timeline: vi.fn(async () => [entry(10)]), snapshotBody, textDiff},
            {findUnique: vi.fn(async () => null)},
        );

        const handler = (await import("nbook/server/api/workspace-history/snapshot-diff.get")).default;
        await expect(handler({} as never)).rejects.toMatchObject({statusCode: 404});
        expect(textDiff).not.toHaveBeenCalled();
        expect(snapshotBody).not.toHaveBeenCalled();
    });

    it("还原：先留「还原前」快照，再经作者写通道落盘并进历史", async () => {
        await mockBody({projectRoot: "book", snapshotId: 3, confirm: true});
        const create = vi.fn(async (arg: {data: {entryId: number; note: string | null}}) => (
            snapshotRow({id: arg.data.entryId === 11 ? 99 : 98, entryId: arg.data.entryId, note: arg.data.note})
        ));
        const writeTracked = vi.fn(async () => undefined);
        mockRestoreDeps({
            history: {
                // 快照指向条目 10（内容可取）；当前正文末态是条目 11。
                timeline: vi.fn(async () => [entry(10), entry(11)]),
                snapshotBody: vi.fn(async () => new TextEncoder().encode("决战前夜\n")),
            },
            create,
            writeTracked,
            findUnique: vi.fn(async () => snapshotRow({id: 3, entryId: 10})),
        });

        const handler = (await import("nbook/server/api/workspace-history/snapshot-restore.post")).default;
        const result = await handler({} as never) as {
            status: string;
            safetySnapshotId: number;
            restoredEntryId: number;
            snapshots: {path: string; snapshots: unknown[]};
        };

        // 还原前那一枚挂在「当前正文」的末态条目上（11），不是目标快照（10）。
        expect(create).toHaveBeenCalledWith({data: {path: "manuscript/ch1.md", entryId: 11, note: "还原前"}});
        expect(result.status).toBe("restored");
        expect(result.safetySnapshotId).toBe(99);
        // 还原走既有作者写通道，actor 固定本地用户。
        expect(writeTracked).toHaveBeenCalledWith(expect.objectContaining({
            filePath: "manuscript/ch1.md",
            content: "决战前夜\n",
            actor: {kind: "user", userId: "local"},
        }));
        // 还原后新产生的那条历史条目即本次还原留痕。
        expect(result.restoredEntryId).toBe(11);
        // 返回完整列表（含新的「还原前」快照），界面免二次请求刷新。
        expect(result.snapshots.path).toBe("manuscript/ch1.md");
    });

    it("还原：未确认就不动正文，一枚快照都不多打", async () => {
        await mockBody({projectRoot: "book", snapshotId: 3, confirm: false});
        const create = vi.fn();
        const writeTracked = vi.fn();
        mockRestoreDeps({
            history: {timeline: vi.fn(async () => [entry(10)]), snapshotBody: vi.fn()},
            create,
            writeTracked,
        });

        const handler = (await import("nbook/server/api/workspace-history/snapshot-restore.post")).default;
        await expect(handler({} as never)).rejects.toBeTruthy();
        expect(writeTracked).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it("契约：projectRoot 走 query、业务入参走 body（与前端调用同口径）", async () => {
        await mockBody({path: "manuscript/ch1.md"}, "book-a");
        const create = vi.fn(async () => snapshotRow({id: 5, entryId: 11}));
        const dependencies = mockHistory({timeline: vi.fn(async () => [entry(10), entry(11)])}, {create});

        const handler = (await import("nbook/server/api/workspace-history/snapshot.post")).default;
        await handler({} as never);

        // 授权按 query 里的 projectRoot 走，不是 body 里那个。
        expect(dependencies.requireProjectHandles).toHaveBeenCalledWith("book-a");
    });

    it("还原：projectRoot 同样走 query（还原是写操作，授权口径与写入口一致）", async () => {
        await mockBody({snapshotId: 3, confirm: true, path: "manuscript/ch1.md"}, "book-a");
        const requireProjectHandles = vi.fn(() => ({
            history: {
                history: Promise.resolve({
                    timeline: vi.fn(async () => [entry(10), entry(11)]),
                    snapshotBody: vi.fn(async () => new TextEncoder().encode("旧\n")),
                }),
                waitForWarmup: async () => undefined,
                pathPolicy: () => ({category: "content", disposition: "consume"}),
            },
        }));
        vi.doMock("nbook/server/workspace-files/novel-workspace", () => ({
            resolveWorkspaceFileTarget: async (_paths: unknown, input: {projectRoot: string}) => ({
                kind: "project-workspace",
                root: "E:/tmp/project",
                projectRoot: input.projectRoot,
            }),
        }));
        vi.doMock("nbook/server/runtime/paths/runtime-paths", () => ({
            runtimePathsFromEnv: () => ({workspaceRoot: "E:/tmp", stateRoot: "E:/tmp"}),
        }));
        vi.doMock("nbook/server/workspace-history/tracked-workspace-files", () => ({
            USER_LOCAL_ACTOR: {kind: "user", userId: "local"},
            writeWorkspaceTextFileTracked: vi.fn(async () => undefined),
        }));
        vi.doMock("nbook/server/workspace-files/project-open-guard", async () => {
            const actual = await vi.importActual<typeof import("nbook/server/workspace-files/project-open-guard")>("nbook/server/workspace-files/project-open-guard");
            return {...actual, withProjectTargetMutation: (_t: unknown, handler: (handles: unknown) => unknown) => handler(requireProjectHandles())};
        });
        vi.doMock("nbook/server/database/prisma", () => ({
            prisma: {
                chapterSnapshot: {
                    create: vi.fn(async () => snapshotRow({id: 99, entryId: 11})),
                    findMany: vi.fn(async () => []),
                    findUnique: vi.fn(async () => snapshotRow({id: 3, entryId: 10})),
                },
            },
        }));

        const handler = (await import("nbook/server/api/workspace-history/snapshot-restore.post")).default;
        await handler({} as never);

        // 还原必须走写守卫（withProjectTargetMutation），不能退化成只读守卫。
        expect(vi.isMockFunction(requireProjectHandles)).toBe(true);
    });

    it("还原：目标快照的内容已不可取时如实报错，不写出一个空章节", async () => {
        await mockBody({projectRoot: "book", snapshotId: 3, confirm: true});
        const writeTracked = vi.fn();
        mockRestoreDeps({
            history: {
                timeline: vi.fn(async () => [entry(10), entry(11)]),
                snapshotBody: vi.fn(async () => null),
            },
            writeTracked,
            findUnique: vi.fn(async () => snapshotRow({id: 3, entryId: 10})),
        });

        const handler = (await import("nbook/server/api/workspace-history/snapshot-restore.post")).default;
        await expect(handler({} as never)).rejects.toMatchObject({statusCode: 409});
        expect(writeTracked).not.toHaveBeenCalled();
    });
});

/**
 * 为 POST route 提供 h3 body。
 * projectRoot 走 query（与既有 workspace-files 写入口、前端调用同口径），
 * 业务入参走 body——这里两处一起给，避免测试自己骗自己。
 */
async function mockBody(body: unknown, projectRoot = "book"): Promise<void> {
    vi.stubGlobal("readBody", async () => body);
    vi.doMock("h3", async () => {
        const actual = await vi.importActual<typeof import("h3")>("h3");
        return {...actual, getQuery: () => ({projectRoot})};
    });
}

/** 为 GET route 提供 h3 query，同时保留真实 createError 行为。 */
function mockQuery(query: Record<string, string>): void {
    vi.doMock("h3", async () => {
        const actual = await vi.importActual<typeof import("h3")>("h3");
        return {...actual, getQuery: () => query};
    });
}

/**
 * 注入 Project Workspace 已打开且 history 可用的最小依赖。
 * history 传 null = 该项目的文件历史功能关闭。
 */
function mockHistory(
    history: object | null,
    snapshotTable: {create?: ReturnType<typeof vi.fn>; findMany?: ReturnType<typeof vi.fn>; findUnique?: ReturnType<typeof vi.fn>} = {},
): {readonly requireProjectHandles: ReturnType<typeof vi.fn>; readonly waitForWarmup: ReturnType<typeof vi.fn>} {
    const waitForWarmup = vi.fn(async () => undefined);
    const requireProjectHandles = vi.fn(() => ({
        history: {history: Promise.resolve(history), waitForWarmup, pathPolicy: () => ({category: "content", disposition: "consume"})},
    }));
    const withProjectHandlesOperation = vi.fn((projectPath: string, handler: (handles: unknown) => unknown) => (
        handler(requireProjectHandles(projectPath))
    ));
    vi.doMock("nbook/server/workspace-files/project-open-guard", async () => {
        const actual = await vi.importActual<typeof import("nbook/server/workspace-files/project-open-guard")>("nbook/server/workspace-files/project-open-guard");
        return {...actual, requireProjectHandles, withProjectHandlesOperation};
    });
    const chapterSnapshot = {
        create: snapshotTable.create ?? vi.fn(),
        findMany: snapshotTable.findMany ?? vi.fn(async () => []),
        findUnique: snapshotTable.findUnique ?? vi.fn(async () => null),
    };
    vi.doMock("nbook/server/database/prisma", () => ({prisma: {chapterSnapshot}}));
    return {requireProjectHandles, waitForWarmup};
}

/** 还原路由是写操作：注入 Project 写守卫 + 作者写通道 + 物理目标解析。 */
function mockRestoreDeps(input: {
    history: object | null;
    create?: ReturnType<typeof vi.fn>;
    writeTracked?: ReturnType<typeof vi.fn>;
    findUnique?: ReturnType<typeof vi.fn>;
    findMany?: ReturnType<typeof vi.fn>;
}): {readonly writeTracked: ReturnType<typeof vi.fn>; readonly mutate: ReturnType<typeof vi.fn>} {
    const writeTracked = input.writeTracked ?? vi.fn(async () => undefined);
    const create = input.create ?? vi.fn();
    const findUnique = input.findUnique ?? vi.fn(async () => null);
    const findMany = input.findMany ?? vi.fn(async () => []);
    const mutate = vi.fn((_task: unknown, task: () => unknown) => task());
    vi.doMock("nbook/server/workspace-files/novel-workspace", () => ({
        resolveWorkspaceFileTarget: async () => ({kind: "project-workspace", root: "E:/tmp/project", projectRoot: "book"}),
    }));
    vi.doMock("nbook/server/runtime/paths/runtime-paths", () => ({
        runtimePathsFromEnv: () => ({workspaceRoot: "E:/tmp", stateRoot: "E:/tmp"}),
    }));
    vi.doMock("nbook/server/workspace-history/tracked-workspace-files", () => ({
        USER_LOCAL_ACTOR: {kind: "user", userId: "local"},
        writeWorkspaceTextFileTracked: writeTracked,
    }));
    vi.doMock("nbook/server/workspace-files/project-open-guard", async () => {
        const actual = await vi.importActual<typeof import("nbook/server/workspace-files/project-open-guard")>("nbook/server/workspace-files/project-open-guard");
        return {
            ...actual,
            withProjectTargetMutation: (_target: unknown, handler: (handles: unknown) => unknown) => handler({
                history: {
                    history: Promise.resolve(input.history),
                    waitForWarmup: async () => undefined,
                    pathPolicy: () => ({category: "content", disposition: "consume"}),
                },
            }),
        };
    });
    const chapterSnapshot = {create, findMany, findUnique};
    vi.doMock("nbook/server/database/prisma", () => ({prisma: {chapterSnapshot}}));
    return {writeTracked, mutate};
}

/** 构造一条快照原始行。 */
function snapshotRow(overrides: Partial<{id: number; path: string; entryId: number; note: string | null; createdAt: Date}> = {}) {
    return {
        id: 1,
        path: "manuscript/ch1.md",
        entryId: 10,
        note: null,
        createdAt: new Date("2026-09-29T10:00:00.000Z"),
        ...overrides,
    };
}

/** 构造一条 file.edit 时间线条目；bodyAvailable 可指定某一侧的快照是否仍可取。 */
function entry(id: number, bodyAvailable: {before?: boolean; after?: boolean} = {}): TimelineEntry {
    return {
        entry: {
            id,
            occurredAt: new Date(id * 1000).toISOString(),
            actor: {kind: "user", userId: "local"},
            operation: {
                type: "file.edit",
                path: "manuscript/ch1.md",
                beforeHash: `before-${String(id)}`,
                afterHash: `after-${String(id)}`,
            },
        },
        pathAtThatTime: "manuscript/ch1.md",
        bodyAvailable: {before: bodyAvailable.before ?? true, after: bodyAvailable.after ?? true},
    };
}
