import type {MaybeRefOrGetter} from "vue";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import type {
    ChapterSnapshotCreateDto,
    ChapterSnapshotDiffDto,
    ChapterSnapshotDto,
    ChapterSnapshotListDto,
    ChapterSnapshotRestoreDto,
    ChapterSnapshotRestoreResultDto,
} from "nbook/shared/dto/chapter-snapshot.dto";

/**
 * 章节快照（时光机）的数据通道。
 *
 * 只做搬运与请求版本管理，不碰文案与投影——说人话的口径在 chapter-snapshot-presentation.ts。
 *
 * 请求版本用于丢弃「切了章节之后才回来的旧响应」，避免上一章的快照落到当前章节上；
 * 还原与打快照都会直接回填列表（服务端把最新列表一并返回），省掉一次二次请求。
 *
 * 四个动作：列出 / 打快照 / 看差异 / 一键还原（还原必须带作者确认语义）。
 */
type SnapshotDiffState = {
    loading: boolean;
    error: string | null;
    result: ChapterSnapshotDiffDto | null;
};

/** 没取过（或已清空）时的空状态：调用方不必自己判 null。 */
const EMPTY_DIFF_STATE: SnapshotDiffState = Object.freeze({
    loading: false,
    error: null,
    result: null,
});

export function useChapterSnapshots(
    projectRoot: MaybeRefOrGetter<string | null>,
    path: MaybeRefOrGetter<string | null>,
) {
    const snapshots = ref<ChapterSnapshotDto[]>([]);
    const loading = ref(false);
    const loaded = ref(false);
    const error = ref<string | null>(null);
    /** 打快照进行中（防连点）。 */
    const creating = ref(false);
    /** 正在还原的快照编号；行级操作锁。 */
    const restoringId = ref<number | null>(null);

    /** 键是「基准快照编号:对照侧」，同一次比较缓存一份；同版与不同对照侧互不顶替。 */
    const diffs = ref<Record<string, SnapshotDiffState>>({});
    let requestVersion = 0;

    /** 没有 Project 或没有打开章节时视为不可用，避免发出注定失败的请求。 */
    function unavailable(): boolean {
        return !toValue(projectRoot) || !toValue(path);
    }

    /** 拉取当前章节的快照列表；切章节后旧响应一律丢弃。 */
    async function load(fallback: string): Promise<void> {
        if (unavailable()) {
            snapshots.value = [];
            diffs.value = {};
            loading.value = false;
            loaded.value = true;
            return;
        }
        const version = ++requestVersion;
        loading.value = true;
        error.value = null;
        try {
            const dto = await $fetch<ChapterSnapshotListDto>("/api/workspace-history/snapshots", {
                query: {projectRoot: toValue(projectRoot) as string, path: toValue(path) as string},
            });
            if (version !== requestVersion) {
                return;
            }
            snapshots.value = dto.snapshots;
        } catch (cause) {
            if (version !== requestVersion) {
                return;
            }
            snapshots.value = [];
            error.value = resolveApiErrorMessage(cause, fallback);
        } finally {
            if (version === requestVersion) {
                loading.value = false;
                loaded.value = true;
            }
        }
    }

    /**
     * 给当前章节打一个存档点。note 留空即由界面按拍摄时间兜底命名。
     * 成功后直接回填列表，界面不必二次请求。
     */
    async function create(note: string | null, fallback: string): Promise<boolean> {
        if (unavailable() || creating.value) {
            return false;
        }
        const target = toValue(path) as string;
        creating.value = true;
        try {
            const body: ChapterSnapshotCreateDto = {
                path: target,
                note: note?.trim() ? note.trim() : undefined,
            };
            const dto = await $fetch<ChapterSnapshotListDto>("/api/workspace-history/snapshot", {
                method: "POST",
                query: {projectRoot: toValue(projectRoot) as string},
                body,
            });
            if (toValue(path) === target) {
                snapshots.value = dto.snapshots;
            }
            return true;
        } catch (cause) {
            error.value = resolveApiErrorMessage(cause, fallback);
            return false;
        } finally {
            creating.value = false;
        }
    }

    /**
     * 读取某一版与当前正文（或另一版）的差异。
     * againstSnapshotId 省略即与当前正文比；同一次比较不重复请求。
     */
    async function loadDiff(
        snapshotId: number,
        againstSnapshotId: number | null,
        fallback: string,
    ): Promise<void> {
        if (unavailable()) {
            return;
        }
        // 键带上对照侧：同一版与「现在」比、与另一版比，是两份不同的差异，不能互相顶替。
        const key = `${snapshotId}:${againstSnapshotId ?? "current"}`;
        const cached = diffs.value[key];
        if (cached?.result || cached?.loading) {
            return;
        }
        diffs.value = {...diffs.value, [key]: {loading: true, error: null, result: null}};
        const version = requestVersion;
        try {
            const result = await $fetch<ChapterSnapshotDiffDto>("/api/workspace-history/snapshot-diff", {
                query: {
                    projectRoot: toValue(projectRoot) as string,
                    path: toValue(path) as string,
                    snapshotId,
                    againstSnapshotId: againstSnapshotId ?? undefined,
                },
            });
            if (version !== requestVersion) {
                return;
            }
            diffs.value = {...diffs.value, [key]: {loading: false, error: null, result}};
        } catch (cause) {
            if (version !== requestVersion) {
                return;
            }
            diffs.value = {
                ...diffs.value,
                [key]: {loading: false, error: resolveApiErrorMessage(cause, fallback), result: null},
            };
        }
    }

    /**
     * 一键还原。调用方必须先拿到作者的显式确认才传 confirm = true——服务端也会再校验一次。
     * 成功后用返回的完整列表刷新界面，并清掉旧差异（正文变了，旧对比已经不对）。
     */
    async function restore(
        snapshotId: number,
        confirm: true,
        fallback: string,
    ): Promise<ChapterSnapshotRestoreResultDto | null> {
        if (unavailable() || restoringId.value !== null) {
            return null;
        }
        const target = toValue(path) as string;
        const body: ChapterSnapshotRestoreDto = {snapshotId, confirm};
        restoringId.value = snapshotId;
        error.value = null;
        try {
            const result = await $fetch<ChapterSnapshotRestoreResultDto>(
                "/api/workspace-history/snapshot-restore",
                {
                    method: "POST",
                    query: {projectRoot: toValue(projectRoot) as string},
                    body: {...body, path: target},
                },
            );
            if (toValue(path) === target) {
                snapshots.value = result.snapshots.snapshots;
                diffs.value = {};
            }
            return result;
        } catch (cause) {
            error.value = resolveApiErrorMessage(cause, fallback);
            return null;
        } finally {
            restoringId.value = null;
        }
    }

    /**
     * 读取某一次比较的展示状态；没取过时是空状态。
     *
     * 直接读 diffs 这个 ref（返回普通对象，不新建 computed）——渲染期新建 computed
     * 会随每次重渲染堆积且没人回收。
     */
    function diffState(snapshotId: number, againstSnapshotId: number | null = null): SnapshotDiffState {
        return diffs.value[`${snapshotId}:${againstSnapshotId ?? "current"}`] ?? EMPTY_DIFF_STATE;
    }

    /** 切章节时清空一切：快照、差异与行锁都不该跨章带过去。 */
    function reset(): void {
        requestVersion += 1;
        snapshots.value = [];
        diffs.value = {};
        error.value = null;
        loading.value = false;
        loaded.value = false;
        restoringId.value = null;
    }

    return {
        snapshots,
        loading,
        loaded,
        error,
        creating,
        restoringId,
        load,
        create,
        loadDiff,
        restore,
        diffState,
        reset,
    };
}
