<script setup lang="ts">
/**
 * 章节快照面板（时光机，M7）。
 *
 * 贴着码字动线放在编辑器里：左边只列作者亲手打的存档点，右边看它和现在的差别，
 * 底部一键还原。破坏性操作一律先弹确认，还原后正文由宿主从磁盘重读刷新。
 *
 * 所有「说人话」的口径都在 chapter-snapshot-presentation.ts，本组件只负责渲染与派发动作。
 */
import Dialog from "nbook/app/components/common/Dialog.vue";
import SharedDiffEditor from "nbook/app/components/common/diff/SharedDiffEditor.vue";
import Tooltip from "nbook/app/components/common/Tooltip.vue";
import {
    snapshotDiffView,
    snapshotRestoreConfirm,
    snapshotRestoreSuccess,
    snapshotRows,
    type ChapterSnapshotRow,
} from "nbook/app/components/novel-ide/history/chapter-snapshot-presentation";
import {useChapterSnapshots} from "nbook/app/composables/useChapterSnapshots";
import {useDialog} from "nbook/app/composables/useDialog";
import {useNotification} from "nbook/app/composables/useNotification";
import {useNovelIdeStore} from "nbook/app/stores/novel-ide";
import type {IdeTheme} from "nbook/app/utils/theme/theme-tokens";

const props = defineProps<{
    modelValue: boolean;
    /** 当前 Project Root（workspace/<slug>）。 */
    projectRoot: string | null;
    /** 当前打开的章节正文路径。 */
    path: string | null;
    /** 作者看到的章节名，用于还原确认框说人话。 */
    chapterTitle?: string;
    theme?: IdeTheme;
}>();

const emit = defineEmits<{
    (event: "update:modelValue", value: boolean): void;
    /** 还原成功：宿主需要从磁盘重读正文，否则作者会看到旧内容。 */
    (event: "restored", path: string): void;
}>();

const {t, te} = useI18n();
const notification = useNotification();
const {confirm} = useDialog();
const store = useNovelIdeStore();

/** 带兜底文案的翻译；缺 key 时用兜底（作者不会看到裸 key）。 */
const tt = (key: string, fallback: string): string => (te(key) ? t(key) : fallback);
/** 投影模块要的翻译形状：带参数时透传参数，缺 key 时退回空串（投影层自己都有兜底 key）。 */
const pt = (key: string, params?: {[key: string]: string | number}): string => (
    te(key) ? t(key, params ? {...params} : {}) : ""
);

const openRef = toRef(props, "modelValue");
const projectRootRef = toRef(props, "projectRoot");
const pathRef = toRef(props, "path");

const {
    snapshots,
    loading,
    error,
    restoringId,
    load,
    loadDiff,
    restore,
    diffState,
    reset,
} = useChapterSnapshots(projectRootRef, pathRef);

/** 正在看哪一版。 */
const selectedId = ref<number | null>(null);
/** 与谁比：null = 与现在的正文比；否则是另一版的编号。 */
const compareId = ref<number | null>(null);

const rows = computed(() => snapshotRows(snapshots.value, pt, new Date()));
const selectedRow = computed<ChapterSnapshotRow | null>(
    () => rows.value.find((row) => row.snapshotId === selectedId.value) ?? null,
);
/** 除了正在看的那一版，其余都可选作对照。 */
const comparableRows = computed(() => rows.value.filter((row) => row.snapshotId !== selectedId.value));
const selectedDiffState = computed(() => (
    selectedId.value === null ? {loading: false, error: null, result: null} : diffState(selectedId.value, compareId.value)
));
const diffView = computed(() => snapshotDiffView(selectedDiffState.value.result, pt));

/** 正文有未保存修改时，还原会丢弃它们——确认框必须先说清。 */
const hasUnsavedChanges = computed(() => {
    const file = store.activeWorkspaceFile;
    return Boolean(file && file.content !== file.lastSyncedContent);
});
const chapterLabel = computed(() => props.chapterTitle?.trim() || tt("ide.chapterSnapshot.unknownChapter", "这一章"));

/** 差异两侧的标签：左边永远是正在看的那一版，右边是正文或对照的那一版。 */
const originalLabel = computed(() => tt("ide.chapterSnapshot.diffLabelSnapshot", "存档的那一版"));
const modifiedLabel = computed(() => (compareId.value === null
    ? tt("ide.chapterSnapshot.diffLabelCurrent", "现在的正文")
    : tt("ide.chapterSnapshot.diffLabelOther", "对照的存档点")));

async function refresh(): Promise<void> {
    await load(tt("ide.chapterSnapshot.loadFailed", "暂时读不到这一章的存档点"));
    // 默认打开最近打的那一版，作者点开就能直接看。
    if (selectedId.value === null || !snapshots.value.some((item) => item.id === selectedId.value)) {
        selectedId.value = snapshots.value[0]?.id ?? null;
        compareId.value = null;
    }
}

/** 选中一版并按需取差异（与现在比，或与选中的对照版比）。 */
async function select(row: ChapterSnapshotRow): Promise<void> {
    selectedId.value = row.snapshotId;
    if (!row.viewable) {
        return;
    }
    await loadDiff(row.snapshotId, compareId.value, tt("ide.chapterSnapshot.diffFailed", "前后对比没能取回来，稍后再试。"));
}

/** 换对照侧（切到「与现在的正文比」）。 */
async function compareWith(row: ChapterSnapshotRow | null): Promise<void> {
    compareId.value = row?.snapshotId ?? null;
    if (selectedId.value === null) {
        return;
    }
    await loadDiff(selectedId.value, compareId.value, tt("ide.chapterSnapshot.diffFailed", "前后对比没能取回来，稍后再试。"));
}

/**
 * 一键还原：先弹确认（说清还原到哪一版、反悔怎么回去；正文脏时额外提醒会丢字），
 * 作者点了确定才执行。服务端执行前会自动留一版「还原前」，事后可反悔。
 */
async function restoreRow(row: ChapterSnapshotRow): Promise<void> {
    if (!row.restorableAction || restoringId.value !== null) {
        return;
    }
    const confirmed = await confirm(
        snapshotRestoreConfirm(chapterLabel.value, row, hasUnsavedChanges.value, pt),
        tt("ide.chapterSnapshot.restoreConfirmTitle", "还原到这一版"),
    );
    if (!confirmed) {
        return;
    }
    const result = await restore(row.snapshotId, true, tt("ide.chapterSnapshot.restoreFailed", "还原失败"));
    if (!result) {
        notification.error(error.value ?? tt("ide.chapterSnapshot.restoreFailed", "还原失败"));
        return;
    }
    // 还原是服务端直接改盘：必须让宿主重读磁盘，否则作者看到旧内容，一保存就冲掉还原成果。
    emit("restored", props.path ?? "");
    selectedId.value = result.snapshots.snapshots[0]?.id ?? null;
    compareId.value = null;
    notification.success(snapshotRestoreSuccess(chapterLabel.value, row, pt));
}

watch(openRef, (open) => {
    if (open) {
        void refresh();
    } else {
        selectedId.value = null;
        compareId.value = null;
        reset();
    }
});

watch(pathRef, () => {
    selectedId.value = null;
    compareId.value = null;
    reset();
});
</script>

<template>
    <Dialog
        :model-value="props.modelValue"
        :title="tt('ide.chapterSnapshot.panelTitle', '这一章的存档点')"
        size="xl"
        :show-footer="false"
        body-class="!p-0 !overflow-hidden"
        @update:model-value="emit('update:modelValue', $event)"
    >
        <template #header-extra>
            <button
                type="button"
                class="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                :title="tt('ide.chapterSnapshot.open', '打开存档点')"
                :disabled="loading"
                data-role="chapter-snapshot-refresh"
                @click="void refresh()"
            >
                <span class="i-lucide-refresh-cw h-4 w-4" :class="loading ? 'animate-spin' : ''"></span>
            </button>
        </template>

        <p class="px-4 pt-3 text-[12px] text-[var(--text-muted)]">
            {{ tt("ide.chapterSnapshot.subtitle", "这里只列你亲手留下的存档点，最近打的在最上面。") }}
        </p>

        <!-- 左列存档点 / 右侧差异预览；定高放在这层包裹容器上（与收件箱同一先例） -->
        <div class="flex h-[70vh] min-h-0">
            <aside class="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border-color)]">
                <p v-if="error" class="m-3 rounded border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-[12px] text-[var(--status-danger)]">
                    {{ error }}
                </p>
                <p v-else-if="loading && rows.length === 0" class="m-3 text-[13px] text-[var(--text-muted)]">
                    {{ tt("ide.chapterSnapshot.loading", "正在翻这一章的存档点…") }}
                </p>
                <div v-else-if="rows.length === 0" class="m-3 space-y-1.5">
                    <p class="text-[13px] text-[var(--text-muted)]">
                        {{ tt("ide.chapterSnapshot.empty", "还没有存档点。觉得这一版值得留下，就在标签栏点「打快照」。") }}
                    </p>
                    <p class="text-[12px] text-[var(--text-muted)]">
                        {{ tt("ide.chapterSnapshot.emptyHint", "存档点是给正文留的兜底：写砸了可以一键退回来。") }}
                    </p>
                </div>

                <div
                    v-for="row in rows"
                    :key="row.key"
                    class="flex flex-col gap-1 border-b border-[var(--border-color)] px-3 py-2.5"
                    :class="row.snapshotId === selectedId ? 'bg-[var(--bg-hover)]' : ''"
                >
                    <button
                        type="button"
                        class="flex min-w-0 items-center gap-2 text-left"
                        :disabled="!row.viewable"
                        :title="row.viewable ? row.title : (row.unavailableHint ?? row.title)"
                        data-role="chapter-snapshot-row"
                        @click="void select(row)"
                    >
                        <span
                            class="min-w-0 flex-1 truncate text-[13px]"
                            :class="row.viewable ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'"
                        >{{ row.title }}</span>
                        <span class="shrink-0 text-[11px] text-[var(--text-muted)]">{{ row.time }}</span>
                    </button>

                    <!-- 内容取不到时如实说明，而不是让作者点开看一片空白 -->
                    <p
                        v-if="row.unavailableHint"
                        class="text-[11px] leading-relaxed text-[var(--text-muted)]"
                    >{{ row.unavailableHint }}</p>

                    <div class="flex items-center gap-1.5">
                        <button
                            type="button"
                            class="rounded border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--status-danger)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                            :disabled="!row.restorableAction || restoringId !== null"
                            data-role="chapter-snapshot-restore"
                            @click.stop="void restoreRow(row)"
                        >
                            <span v-if="restoringId === row.snapshotId" class="i-lucide-loader-2 h-3 w-3 animate-spin"></span>
                            {{ tt("ide.chapterSnapshot.restore", "还原到这一版") }}
                        </button>
                    </div>
                </div>
            </aside>

            <section class="flex min-w-0 flex-1 flex-col">
                <p v-if="!selectedRow" class="m-4 text-[13px] text-[var(--text-muted)]">
                    {{ tt("ide.chapterSnapshot.noDiffSelected", "点左边任意一版，看它和现在的正文差在哪。") }}
                </p>
                <template v-else>
                    <!-- 换对照侧：默认与现在的正文比，也可挑另一版互比 -->
                    <div class="flex shrink-0 items-center gap-2 border-b border-[var(--border-color)] px-3 py-2">
                        <span class="text-[11px] text-[var(--text-muted)]">{{ tt("ide.chapterSnapshot.compareWith", "与它比较") }}</span>
                        <Tooltip :text="tt('ide.chapterSnapshot.compareWithCurrent', '与现在的正文比')" placement="bottom">
                            <button
                                type="button"
                                class="rounded border border-[var(--border-color)] px-2 py-0.5 text-[11px] transition-colors hover:bg-[var(--bg-hover)]"
                                :class="compareId === null ? 'border-[var(--border-accent)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)]'"
                                data-role="chapter-snapshot-compare-current"
                                @click="void compareWith(null)"
                            >{{ tt("ide.chapterSnapshot.diffLabelCurrent", "现在的正文") }}</button>
                        </Tooltip>
                        <button
                            v-for="other in comparableRows"
                            :key="other.key"
                            type="button"
                            class="max-w-[140px] truncate rounded border border-[var(--border-color)] px-2 py-0.5 text-[11px] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                            :class="compareId === other.snapshotId ? 'border-[var(--border-accent)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)]'"
                            :disabled="!other.viewable"
                            data-role="chapter-snapshot-compare-other"
                            @click="void compareWith(other)"
                        >{{ other.title }}</button>
                    </div>

                    <p v-if="selectedDiffState.loading" class="m-4 text-[13px] text-[var(--text-muted)]">
                        {{ tt("ide.chapterSnapshot.diffLoading", "正在取这一版的前后对比…") }}
                    </p>
                    <p v-else-if="selectedDiffState.error" class="m-4 rounded border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-[13px] text-[var(--status-danger)]">
                        {{ selectedDiffState.error }}
                    </p>
                    <p
                        v-else-if="diffView.message && diffView.tone === 'warning'"
                        class="m-4 rounded border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-[13px] text-[var(--status-warning)]"
                    >{{ diffView.message }}</p>
                    <p v-else-if="diffView.message" class="m-4 text-[13px] text-[var(--text-muted)]">
                        {{ diffView.message }}
                    </p>
                    <SharedDiffEditor
                        v-else-if="diffView.comparable"
                        class="min-h-0 flex-1"
                        :model-key="`chapter-snapshot:${selectedRow.snapshotId}:${compareId ?? 'current'}`"
                        :original-content="diffView.original"
                        :modified-content="diffView.modified"
                        :original-label="originalLabel"
                        :modified-label="modifiedLabel"
                        :theme="props.theme"
                    />
                </template>
            </section>
        </div>
    </Dialog>
</template>
