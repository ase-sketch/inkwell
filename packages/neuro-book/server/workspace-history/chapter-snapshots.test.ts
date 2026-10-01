import {beforeEach, describe, expect, it, vi} from "vitest";
import type {TimelineEntry} from "@notnotype/nb-history";

/**
 * 章节快照仓储与指针解析的纯逻辑测试（M7）。
 *
 * 盯的是「一枚快照指针被换成什么」：落库形状、按路径取列表的降序、
 * 内容可取性的降级诚实（不可取就说不可取，不让作者点进空白）、
 * 以及 diff/还原的授权边界（指针必须仍属于该章节时间线，裸 hash 买不到正文）。
 * 路由接线另见 snapshot-routes.test.ts。
 */
describe("chapter snapshots", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it("打快照只存指针：路径 + 条目 + 可空备注，库表本身不存正文", async () => {
        const created = {id: 1, path: "manuscript/ch1.md", entryId: 42, note: "决战前夜", createdAt: new Date("2026-09-29T10:00:00.000Z")};
        const create = vi.fn(async () => created);
        mockPrisma({create});
        const {createChapterSnapshot} = await import("nbook/server/workspace-history/chapter-snapshots");

        const row = await createChapterSnapshot({path: "manuscript/ch1.md", entryId: 42, note: "决战前夜"});

        expect(create).toHaveBeenCalledWith({data: {path: "manuscript/ch1.md", entryId: 42, note: "决战前夜"}});
        expect(row).toEqual(created);
        // 快照行只有指针字段，没有任何正文字段。
        expect(Object.keys(row).sort()).toEqual(["createdAt", "entryId", "id", "note", "path"]);
    });

    it("备注留空或纯空白一律存 null（不留下看起来像名字的空备注）", async () => {
        const create = vi.fn(async () => snapshotRow({note: null}));
        mockPrisma({create});
        const {createChapterSnapshot} = await import("nbook/server/workspace-history/chapter-snapshots");

        await createChapterSnapshot({path: "manuscript/ch1.md", entryId: 1});
        await createChapterSnapshot({path: "manuscript/ch1.md", entryId: 2, note: ""});
        await createChapterSnapshot({path: "manuscript/ch1.md", entryId: 3, note: "   \n "});

        expect(create.mock.calls.map(([arg]) => arg.data.note)).toEqual([null, null, null]);
    });

    it("按路径列快照降序：最近打的在最前，同秒连打靠 id 兜底不乱跳", async () => {
        const findMany = vi.fn(async () => []);
        mockPrisma({findMany});
        const {listChapterSnapshotRows} = await import("nbook/server/workspace-history/chapter-snapshots");

        await listChapterSnapshotRows("manuscript/ch1.md");

        expect(findMany).toHaveBeenCalledWith({
            where: {path: "manuscript/ch1.md"},
            orderBy: [{createdAt: "desc"}, {id: "desc"}],
        });
    });

    it("列表逐条如实标出内容是否仍可取（可取 / 快照被清理 / 条目已不在时间线）", async () => {
        const findMany = vi.fn(async () => [
            snapshotRow({id: 1, entryId: 10, note: "还在", createdAt: new Date("2026-09-29T10:00:00.000Z")}),
            snapshotRow({id: 2, entryId: 20, note: null, createdAt: new Date("2026-09-29T09:00:00.000Z")}),
            snapshotRow({id: 3, entryId: 30, createdAt: new Date("2026-09-29T08:00:00.000Z")}),
            snapshotRow({id: 4, entryId: 99, createdAt: new Date("2026-09-29T07:00:00.000Z")}),
        ]);
        mockPrisma({findMany});
        const history = {
            // 条目 20 的 after 侧快照已被保留策略清理：内容存在过但读不回来。
            timeline: vi.fn(async () => [editEntry(10, {after: true}), editEntry(20, {after: false}), editEntry(30, {after: true})]),
            snapshotBody: vi.fn(),
        };
        const {readChapterSnapshotList} = await import("nbook/server/workspace-history/chapter-snapshots");

        const list = await readChapterSnapshotList({history, path: "manuscript/ch1.md"});

        expect(list.path).toBe("manuscript/ch1.md");
        // 行序沿用仓储返回的降序，不在这里各排各的。
        expect(list.snapshots.map((item) => item.id)).toEqual([1, 2, 3, 4]);
        expect(list.snapshots.map((item) => item.restorable)).toEqual([true, false, true, false]);
        // 作者没起名的行给 null（界面按拍摄时间兜底标题），不塞一个空串冒充名字。
        expect(list.snapshots[1]!.note).toBeNull();
        expect(list.snapshots[0]!.createdAt).toBe("2026-09-29T10:00:00.000Z");
        // 判定可取性只读时间线，不去捞正文。
        expect(history.snapshotBody).not.toHaveBeenCalled();
    });

    it("文件历史未启用时所有快照一律不可取，不假装还能还原", async () => {
        const findMany = vi.fn(async () => [snapshotRow({id: 1, entryId: 10})]);
        mockPrisma({findMany});
        const {readChapterSnapshotList} = await import("nbook/server/workspace-history/chapter-snapshots");

        const list = await readChapterSnapshotList({history: null, path: "manuscript/ch1.md"});

        expect(list.snapshots[0]!.restorable).toBe(false);
    });

    it("打快照只认当前正文的末态版本：没有保存记录或已删除时如实报错", async () => {
        const {readCurrentTextEntry} = await import("nbook/server/workspace-history/chapter-snapshots");

        await expect(readCurrentTextEntry({history: {timeline: vi.fn(async () => [])}, path: "manuscript/ch1.md"}))
            .rejects.toMatchObject({statusCode: 404});
        await expect(readCurrentTextEntry({
            history: {timeline: vi.fn(async () => [deleteEntry(9)])},
            path: "manuscript/ch1.md",
        })).rejects.toMatchObject({statusCode: 409});
    });

    it("打快照定位到正文当前末态的那次保存，且跟随改名", async () => {
        const timeline = vi.fn(async () => [editEntry(10), editEntry(11)]);
        const {readCurrentTextEntry} = await import("nbook/server/workspace-history/chapter-snapshots");

        const current = await readCurrentTextEntry({history: {timeline}, path: "manuscript/ch1.md"});

        expect(current.entry.id).toBe(11);
        expect(timeline).toHaveBeenCalledWith("manuscript/ch1.md", {followRenames: true});
    });

    it("diff 授权：指针不在该章节时间线里就拒，且不触发任何正文读取", async () => {
        const textDiff = vi.fn();
        const snapshotBody = vi.fn();
        const {resolveSnapshotEntry} = await import("nbook/server/workspace-history/chapter-snapshots");

        await expect(resolveSnapshotEntry({
            history: {timeline: vi.fn(async () => [editEntry(10)]), snapshotBody, textDiff},
            path: "manuscript/ch1.md",
            entryId: 99,
        })).rejects.toMatchObject({statusCode: 404});
        expect(textDiff).not.toHaveBeenCalled();
        expect(snapshotBody).not.toHaveBeenCalled();
    });

    it("快照与当前正文比：基准取快照那次的 after 态，对比侧取当前末态", async () => {
        const textDiff = vi.fn(async () => ({
            available: true as const,
            changes: [],
            beforeText: "旧",
            afterText: "新",
        }));
        const {readChapterSnapshotAgainstCurrentDiff} = await import("nbook/server/workspace-history/chapter-snapshots");

        await readChapterSnapshotAgainstCurrentDiff({
            history: {timeline: vi.fn(async () => [editEntry(10), editEntry(11)]), snapshotBody: vi.fn(), textDiff},
            path: "manuscript/ch1.md",
            baseEntryId: 10,
            mode: "inline",
        });

        expect(textDiff).toHaveBeenCalledWith("after-10", "after-11");
    });

    it("两份快照互比：两侧各取自己那次的 after 态", async () => {
        const textDiff = vi.fn(async () => ({
            available: true as const,
            changes: [],
            beforeText: "一",
            afterText: "二",
        }));
        const {readChapterSnapshotAgainstSnapshotDiff} = await import("nbook/server/workspace-history/chapter-snapshots");

        await readChapterSnapshotAgainstSnapshotDiff({
            history: {timeline: vi.fn(async () => [editEntry(10), editEntry(11)]), snapshotBody: vi.fn(), textDiff},
            path: "manuscript/ch1.md",
            baseEntryId: 10,
            againstEntryId: 11,
            mode: "inline",
        });

        expect(textDiff).toHaveBeenCalledWith("after-10", "after-11");
    });

    it("还原取该条目的 after 态正文；内容已不可取时如实报错而不是给空章节", async () => {
        const {readChapterSnapshotBody} = await import("nbook/server/workspace-history/chapter-snapshots");

        const restored = await readChapterSnapshotBody({
            history: {snapshotBody: vi.fn(async () => new TextEncoder().encode("决战前夜\n"))},
            entry: editEntry(10),
            path: "manuscript/ch1.md",
        });
        expect(restored).toBe("决战前夜\n");

        await expect(readChapterSnapshotBody({
            history: {snapshotBody: vi.fn(async () => null)},
            entry: editEntry(10),
            path: "manuscript/ch1.md",
        })).rejects.toMatchObject({statusCode: 409});
    });
});

/** 注入 App SQLite 快照表的最小 Prisma 桩。 */
function mockPrisma(overrides: {
    create?: ReturnType<typeof vi.fn>;
    findMany?: ReturnType<typeof vi.fn>;
    findUnique?: ReturnType<typeof vi.fn>;
}): {readonly create: ReturnType<typeof vi.fn>; readonly findMany: ReturnType<typeof vi.fn>} {
    const chapterSnapshot = {
        create: overrides.create ?? vi.fn(),
        findMany: overrides.findMany ?? vi.fn(async () => []),
        findUnique: overrides.findUnique ?? vi.fn(async () => null),
    };
    vi.doMock("nbook/server/database/prisma", () => ({prisma: {chapterSnapshot}}));
    return chapterSnapshot as never;
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
function editEntry(id: number, bodyAvailable: {before?: boolean; after?: boolean} = {}): TimelineEntry {
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

/** 构造一条 file.delete 时间线条目：内容在 before 侧，after 侧为「此后不存在」。 */
function deleteEntry(id: number): TimelineEntry {
    return {
        entry: {
            id,
            occurredAt: new Date(id * 1000).toISOString(),
            actor: {kind: "user", userId: "local"},
            operation: {type: "file.delete", path: "manuscript/ch1.md", beforeHash: `before-${String(id)}`},
        },
        pathAtThatTime: "manuscript/ch1.md",
        bodyAvailable: {before: true, after: false},
    };
}
