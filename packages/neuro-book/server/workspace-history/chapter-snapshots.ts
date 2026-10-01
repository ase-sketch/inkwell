import {createError} from "h3";
import {
    afterStateHash,
    type TimelineEntry,
    type WorkspaceHistory,
} from "@notnotype/nb-history";
import {prisma} from "nbook/server/database/prisma";
import {
    readWorkspaceHistoryDiff,
    type WorkspaceHistoryDiffMode,
} from "nbook/server/workspace-history/history-diff";
import type {
    ChapterSnapshotDiffDto,
    ChapterSnapshotDto,
    ChapterSnapshotListDto,
} from "nbook/shared/dto/chapter-snapshot.dto";

/**
 * 章节快照的读取面与指针解析（M7）。
 *
 * 快照 = 作者主动标记的命名存档点，只存「章节路径 + 指向 nb-history 条目的 entryId +
 * 可选备注 + 拍摄时间」，**不存正文**——正文与版本内容永远由 nb-history 快照提供
 * （唯一事实源）。因此这里的一切都只是「拿一枚指针，去历史时间线上把那一版找出来」。
 *
 * 三条纪律：
 * - 版本事实一律来自 nb-history 既有 API（timeline / afterStateHash / textDiff / snapshotBody），
 *   宿主不另起一套版本推断。授权由调用方的 Project handles 守卫负责。
 * - 授权口径与 M5 条目 diff 一致：entryId 必须出现在该 path 的时间线里（服务端反查），
 *   裸 hash 买不到正文。diff 的安全分支（敏感路径 / 超限 / 正文不可取）仍由
 *   readWorkspaceHistoryDiff 一处承担，安全分支绝不携带正文。
 * - 章节改名后按 followRenames 反查条目归属；快照表按拍摄当时的路径记录，
 *   改名前的快照不会自动跟随（本期如实降级，见决策笔记「已知限制」④）。
 */

/** 时间线读取所需的 history 最小面。 */
type SnapshotTimelineHistory = Pick<WorkspaceHistory, "timeline">;

/** 快照落库与「内容是否仍可取」判定所需的最小面（含安全 diff 组装要用的 textDiff）。 */
type SnapshotBodyHistory = Pick<WorkspaceHistory, "timeline" | "snapshotBody" | "textDiff">;

/** 一次章节快照的原始行（不含可取性判定）。 */
type ChapterSnapshotRow = {
    id: number;
    path: string;
    entryId: number;
    note: string | null;
    createdAt: Date;
};

/** 作者备注长度上限：与 DTO 入参校验保持一致，超长在边界就被拒。 */
export const CHAPTER_SNAPSHOT_NOTE_MAX_LENGTH = 200;

/**
 * 定位某条路径当前正文末态对应的历史条目。
 *
 * 打快照只能标记「此刻磁盘上这份正文的当前版本」，所以取该路径时间线最后一条的 after 态。
 * after 态为 null（末条是删除）说明文件当前不存在——此时没有可标记的版本，如实报错，
 * 绝不凭空造一枚指向空内容的快照。
 *
 * followRenames：条目目录被改名后，历史仍跟着「当前叫这个路径的文件」走。
 */
export async function readCurrentTextEntry(input: {
    history: SnapshotTimelineHistory;
    path: string;
}): Promise<TimelineEntry> {
    const timeline = await input.history.timeline(input.path, {followRenames: true});
    const current = timeline.at(-1);
    if (!current) {
        throw createError({statusCode: 404, message: "这一章还没有保存记录，无法打快照"});
    }
    if (afterStateHash(current.entry.operation) === null) {
        throw createError({statusCode: 409, message: "这一章当前不存在内容，无法打快照"});
    }
    return current;
}

/**
 * 为某条路径的当前正文落一枚快照。
 *
 * note 留空一律存 null（作者没起名时由界面按拍摄时间兜底标题），
 * 空串与纯空白与「没填」同义，不在库里留下一个看起来像名字的空备注。
 */
export async function createChapterSnapshot(input: {
    path: string;
    entryId: number;
    note?: string | null;
}): Promise<ChapterSnapshotRow> {
    return prisma.chapterSnapshot.create({
        data: {
            path: input.path,
            entryId: input.entryId,
            note: normalizeNote(input.note),
        },
    });
}

/** 按路径列该章节的快照（**降序：最近打的在最前**）。 */
export async function listChapterSnapshotRows(path: string): Promise<ChapterSnapshotRow[]> {
    return prisma.chapterSnapshot.findMany({
        where: {path},
        // id 是全局单调自增，与拍摄时间同序；同秒连打多枚时靠 id 兜底排序，
        // 避免「时间相同 → 顺序随机」让作者看到列表无故跳动。
        orderBy: [{createdAt: "desc"}, {id: "desc"}],
    });
}

/** 按快照 id 取单条；不存在返回 null（调用方决定报 404 还是降级）。 */
export async function findChapterSnapshotRow(id: number): Promise<ChapterSnapshotRow | null> {
    return prisma.chapterSnapshot.findUnique({where: {id}});
}

/**
 * 读取某章节的快照列表，并逐条判定内容当前是否仍可取。
 *
 * 降级诚实：快照指向的版本可能已被保留策略清理或超限未存 body，界面据此把
 * 「看差异 / 还原」置灰并如实说明，而不是让作者点进去看一个空白。
 */
export async function readChapterSnapshotList(input: {
    history: SnapshotBodyHistory | null;
    path: string;
}): Promise<ChapterSnapshotListDto> {
    const rows = await listChapterSnapshotRows(input.path);
    return {path: input.path, snapshots: await toSnapshotDtos(input.history, rows)};
}

/** 把原始行投影成跨端 DTO；history 未启用时一律标不可取（没有任何版本内容可读）。 */
async function toSnapshotDtos(
    history: SnapshotBodyHistory | null,
    rows: readonly ChapterSnapshotRow[],
): Promise<ChapterSnapshotDto[]> {
    if (rows.length === 0) {
        return [];
    }
    // 一次性把该路径时间线读出来，逐条判定共用同一份时间线，不为每枚快照各查一次。
    const resolvable = history === null
        ? null
        : new Map<number, TimelineEntry>(
            (await history.timeline(rows[0]!.path, {followRenames: true}))
                .map((item) => [item.entry.id, item]),
        );
    return Promise.all(rows.map((row) => toSnapshotDto(history, resolvable, row)));
}

/**
 * 单条快照的可取性判定。
 *
 * 判据：它指向的 entryId 仍在该路径时间线里，且该次修改的 after 侧快照 body 仍能取到。
 * timeline 里的 bodyAvailable 由 nb-history 给出（它已处理「那一侧文件本就不存在」的情形），
 * 宿主不自己推断 hash 是否存在。history 未启用时无任何版本内容可读，一律 false。
 */
async function toSnapshotDto(
    history: SnapshotBodyHistory | null,
    resolvable: Map<number, TimelineEntry> | null,
    row: ChapterSnapshotRow,
): Promise<ChapterSnapshotDto> {
    return {
        id: row.id,
        path: row.path,
        entryId: row.entryId,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        restorable: history !== null && resolvable !== null && isRestorable(resolvable.get(row.entryId)),
    };
}

/**
 * 该快照指向的版本当前是否仍可取。
 *
 * null = 该 entryId 已不在这条路径的时间线里（历史被清理或路径被换掉），
 * 界面据此如实说明「内容已不可用」，而不是给一个点进去空白的入口。
 */
function isRestorable(entry: TimelineEntry | undefined): boolean {
    if (!entry) {
        return false;
    }
    const operation = entry.entry.operation;
    if (operation.type === "file.delete") {
        // 删除条目的内容在 before 侧，仍可找回、也可还原。
        return entry.bodyAvailable.before;
    }
    return afterStateHash(operation) === null ? false : entry.bodyAvailable.after;
}

/**
 * 反查某枚快照指针：确保它指向的 entryId 属于该章节路径，且那一侧快照仍可取。
 *
 * 授权边界：snapsholId 必须落在该 path 的时间线里——不接受任何裸 hash，
 * 外部无法拿一枚指针 id 或一个 hash 换取任何章节的正文。
 */
export async function resolveSnapshotEntry(input: {
    history: SnapshotBodyHistory;
    path: string;
    entryId: number;
}): Promise<TimelineEntry> {
    const timeline = await input.history.timeline(input.path, {followRenames: true});
    const target = timeline.find((item) => item.entry.id === input.entryId);
    if (!target) {
        throw createError({statusCode: 404, message: "这份快照不再属于当前章节"});
    }
    return target;
}

/**
 * 读取两枚快照之间的安全 diff（快照 ↔ 快照）。
 *
 * baseHash = 基准快照那一次的 after 态，endHash = 对比侧那一次的 after 态。
 * 两枚快照必须同属一个章节路径（跨章节比较不是作者在码字时的动线，如实拒绝）。
 */
export async function readChapterSnapshotAgainstSnapshotDiff(input: {
    history: SnapshotBodyHistory;
    path: string;
    baseEntryId: number;
    againstEntryId: number;
    mode: WorkspaceHistoryDiffMode;
}): Promise<ChapterSnapshotDiffDto> {
    const [base, against] = await Promise.all([
        resolveSnapshotEntry({history: input.history, path: input.path, entryId: input.baseEntryId}),
        resolveSnapshotEntry({history: input.history, path: input.path, entryId: input.againstEntryId}),
    ]);
    return readWorkspaceHistoryDiff({
        history: input.history,
        group: {
            path: input.path,
            baseHash: afterStateHash(base.entry.operation),
            endHash: afterStateHash(against.entry.operation),
        },
        mode: input.mode,
    });
}

/**
 * 读取「某枚快照 ↔ 当前正文」的安全 diff。
 *
 * endHash 取该路径当前正文末态的 after 态——作者眼里的「现在」就是最新一次保存的那版，
 * 不另起一套「当前内容」的推断。
 */
export async function readChapterSnapshotAgainstCurrentDiff(input: {
    history: SnapshotBodyHistory;
    path: string;
    baseEntryId: number;
    mode: WorkspaceHistoryDiffMode;
}): Promise<ChapterSnapshotDiffDto> {
    const base = await resolveSnapshotEntry({history: input.history, path: input.path, entryId: input.baseEntryId});
    const current = await readCurrentTextEntry({history: input.history, path: input.path});
    return readWorkspaceHistoryDiff({
        history: input.history,
        group: {
            path: input.path,
            baseHash: afterStateHash(base.entry.operation),
            endHash: afterStateHash(current.entry.operation),
        },
        mode: input.mode,
    });
}

/**
 * 读取某枚快照指向版本的正文内容（还原用）。
 *
 * 复用 nb-history 的 restore 语义：内容源 = 该条目的 after 态（delete 条目取 before 态）。
 * body 不可取时抛错而不是给空串——还原失败必须如实报给作者，不让作者得到一个空章节。
 */
export async function readChapterSnapshotBody(input: {
    history: Pick<WorkspaceHistory, "snapshotBody">;
    entry: TimelineEntry;
    path: string;
}): Promise<string> {
    const operation = input.entry.entry.operation;
    const contentHash = operation.type === "file.delete"
        ? operation.beforeHash
        : afterStateHash(operation);
    if (contentHash === null) {
        throw createError({statusCode: 409, message: "这份快照没有可还原的内容"});
    }
    const body = await input.history.snapshotBody(contentHash);
    if (body === null) {
        throw createError({statusCode: 409, message: "这份快照的内容已不可用，无法还原"});
    }
    return new TextDecoder().decode(body);
}

/** 备注归一：空串与纯空白一律当没填（存 null），超长按上限截断前先拒（边界已校验，这里兜底）。 */
function normalizeNote(note: string | null | undefined): string | null {
    if (typeof note !== "string") {
        return null;
    }
    const trimmed = note.trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.slice(0, CHAPTER_SNAPSHOT_NOTE_MAX_LENGTH);
}

export type {ChapterSnapshotRow};
