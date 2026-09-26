import {ref} from "vue";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import type {
    WorkspaceHistoryDiffDto,
    WorkspaceHistoryTimelineDto,
} from "nbook/shared/dto/workspace-history.dto";

/**
 * 条目「演进」区块的数据通道：时间线一次取回，差异按需逐条取、逐条缓存。
 *
 * 只做搬运与请求版本管理，不碰文案与投影——说人话的口径在 knowledge-evolution.ts。
 * 请求版本用于丢弃「切了条目之后才回来的旧响应」，避免上一条设定的历史落到当前条目上。
 */
/** 没取过（或已清空）时的空状态：调用方不必自己判 null。 */
const EMPTY_DIFF_STATE = Object.freeze({loading: false, error: null, result: null}) as {
    loading: boolean;
    error: string | null;
    result: WorkspaceHistoryDiffDto | null;
};

export function useWorkspaceHistoryTimeline(projectRoot: () => string | null, path: () => string | null) {
    const entries = ref<WorkspaceHistoryTimelineDto["entries"]>([]);
    const loading = ref(false);
    const loaded = ref(false);
    const error = ref<string | null>(null);

    /** 每条变更的差异状态，键是条目编号。 */
    const diffs = ref<Record<number, {loading: boolean; error: string | null; result: WorkspaceHistoryDiffDto | null}>>({});
    let requestVersion = 0;

    /** 拉取当前条目的改动记录；切条目时旧响应一律丢弃。 */
    async function load(fallback: string): Promise<void> {
        const root = projectRoot();
        const target = path();
        const version = ++requestVersion;
        diffs.value = {};
        error.value = null;
        if (!root || !target) {
            entries.value = [];
            loading.value = false;
            loaded.value = true;
            return;
        }
        loading.value = true;
        try {
            const dto = await $fetch<WorkspaceHistoryTimelineDto>("/api/workspace-history/timeline", {
                query: {projectRoot: root, path: target},
            });
            if (version !== requestVersion) {
                return;
            }
            entries.value = dto.entries;
        } catch (cause) {
            if (version !== requestVersion) {
                return;
            }
            entries.value = [];
            error.value = resolveApiErrorMessage(cause, fallback);
        } finally {
            if (version === requestVersion) {
                loading.value = false;
                loaded.value = true;
            }
        }
    }

    /** 读取某一条变更的前后对比；结果按条目编号缓存，同一条不重复请求。 */
    async function loadDiff(entryId: number, fallback: string): Promise<void> {
        const root = projectRoot();
        const target = path();
        if (!root || !target) {
            return;
        }
        const cached = diffs.value[entryId];
        if (cached?.result || cached?.loading) {
            return;
        }
        diffs.value = {...diffs.value, [entryId]: {loading: true, error: null, result: null}};
        const version = requestVersion;
        try {
            const result = await $fetch<WorkspaceHistoryDiffDto>("/api/workspace-history/entry-diff", {
                query: {projectRoot: root, path: target, entryId, mode: "full"},
            });
            if (version !== requestVersion) {
                return;
            }
            diffs.value = {...diffs.value, [entryId]: {loading: false, error: null, result}};
        } catch (cause) {
            if (version !== requestVersion) {
                return;
            }
            diffs.value = {
                ...diffs.value,
                [entryId]: {loading: false, error: resolveApiErrorMessage(cause, fallback), result: null},
            };
        }
    }

    /**
     * 读取指定变更的展示状态；没取过时是空状态。
     *
     * 直接读 diffs 这个 ref（返回普通对象，不新建 computed）——渲染期新建 computed
     * 会随每次重渲染堆积且没人回收。
     */
    function diffState(entryId: number) {
        return diffs.value[entryId] ?? EMPTY_DIFF_STATE;
    }

    return {entries, loading, loaded, error, load, loadDiff, diffState};
}
