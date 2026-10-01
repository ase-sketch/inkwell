<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import Tooltip from "nbook/app/components/common/Tooltip.vue";
import ChapterReadingDialog from "nbook/app/components/novel-ide/reading/ChapterReadingDialog.vue";
import {useChapterSnapshots} from "nbook/app/composables/useChapterSnapshots";
import {useDialog} from "nbook/app/composables/useDialog";
import {useNotification} from "nbook/app/composables/useNotification";
import {useNovelIdeStore, type WorkspaceEditorTab} from "nbook/app/stores/novel-ide";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import {exportChaptersToTxt, normalizePath, type ChapterExportScope} from "nbook/app/utils/chapter-export";
import {parseManuscriptChapterPath} from "nbook/app/utils/review-entry";

const props = defineProps<{
    tabs: readonly WorkspaceEditorTab[];
    activePath: string;
}>();

const emit = defineEmits<{
    (event: "select-tab", path: string): void;
    (event: "close-tab", path: string): void;
    (event: "review-chapter", path: string): void;
    /** 打开当前章节的存档点面板，附带作者看到的章节名。 */
    (event: "open-snapshots", chapterTitle: string): void;
}>();

const {t, te} = useI18n();
const store = useNovelIdeStore();
const notification = useNotification();
const {confirm, prompt} = useDialog();

const readingDialogOpen = ref(false);
const exportMenuOpen = ref(false);
const exporting = ref(false);
const exportMenuRef = ref<HTMLDivElement | null>(null);

const tt = (key: string, fallback: string): string => (te(key) ? t(key) : fallback);

/** 只展出正文标签：作者不需要在标签条上分辨编辑器类型。 */
const visibleTabs = computed(() => props.tabs);
const hasActiveDocument = computed(() => Boolean(props.activePath));
/** 当前打开的必须是章节正文（manuscript/{卷}/{章}/index.md）才谈得上「审这一章」。 */
const activeChapter = computed(() => parseManuscriptChapterPath(props.activePath));
const canReviewChapter = computed(() => activeChapter.value !== null);

/** 快照只对章节正文有意义，跟「审这一章」同一口径：别的文件置灰。 */
const snapshotPath = computed(() => activeChapter.value?.manuscriptPath ?? null);
const canSnapshot = computed(() => snapshotPath.value !== null);
/** 正文有未保存修改时，快照指向的是已落盘的那一版——先让作者保存，免得留了个自己不想要的存档。 */
const activeTabDirty = computed(() => props.tabs.find((tab) => tab.path === props.activePath)?.dirty === true);
const {creating, create} = useChapterSnapshots(() => store.currentProjectRoot || null, snapshotPath);

/**
 * 给当前章节留一个存档点。
 *
 * 备注可留空：留空就按拍摄时间兜底命名（拍板口径）。作者取消输入即放弃，不产生快照。
 */
async function takeSnapshot(): Promise<void> {
    if (!canSnapshot.value || creating.value) {
        return;
    }
    if (activeTabDirty.value) {
        const goAhead = await confirmSaveFirst();
        if (!goAhead) {
            return;
        }
    }
    const note = await prompt(
        tt("ide.chapterSnapshot.createPrompt", "想给它起个名字吗？留空也行，就按现在的时间叫它。"),
        "",
        tt("ide.chapterSnapshot.createTitle", "给这一版留个存档点"),
    );
    if (note === null) {
        return;
    }
    const trimmed = note.trim();
    const ok = await create(trimmed || null, tt("ide.chapterSnapshot.createFailed", "留存档点失败"));
    if (!ok) {
        notification.error(resolveApiErrorMessage(null, tt("ide.chapterSnapshot.createFailed", "留存档点失败")));
        return;
    }
    notification.success(trimmed
        ? t("ide.chapterSnapshot.createSuccessNamed", {note: trimmed})
        : tt("ide.chapterSnapshot.createSuccess", "已留存档点"));
}

/** 正文还脏着时先问一句：是先去保存，还是就用现在这样。 */
async function confirmSaveFirst(): Promise<boolean> {
    const title = tt("ide.chapterSnapshot.dirtyTitle", "这一章还有没保存的修改");
    const message = tt("ide.chapterSnapshot.dirtyMessage", "存档点记的是已经保存到盘上的那一版——想留最新的一版，先去保存。")
        .replace("\n\n", " ");
    return await confirm(message, title);
}

/** 当前打开的章节名（作者看到的那句），没有就退回「这一章」。 */
const activeChapterLabel = computed(() => {
    const tab = props.tabs.find((item) => item.path === props.activePath);
    return tab?.title?.trim() || tt("ide.chapterSnapshot.unknownChapter", "这一章");
});

/** 请顾问审当前这一章：只把章节正文路径交给宿主，路径口径由宿主再核一遍。 */
function requestChapterReview(): void {
    const chapter = activeChapter.value;
    if (!chapter) {
        return;
    }
    emit("review-chapter", chapter.manuscriptPath);
}

function handleOutsideClick(event: MouseEvent): void {
    if (exportMenuRef.value && !exportMenuRef.value.contains(event.target as Node)) {
        exportMenuOpen.value = false;
    }
}

onMounted(() => {
    if (import.meta.client) {
        document.addEventListener("click", handleOutsideClick);
    }
});

onBeforeUnmount(() => {
    if (import.meta.client) {
        document.removeEventListener("click", handleOutsideClick);
    }
});

async function triggerExport(scope: ChapterExportScope): Promise<void> {
    if (!props.activePath || exporting.value) {
        return;
    }
    exportMenuOpen.value = false;
    exporting.value = true;

    try {
        const result = await exportChaptersToTxt({
            scope,
            activePath: props.activePath,
            allNodes: store.workspaceTree,
            readContent: async (path: string) => {
                const normalized = normalizePath(path);
                if (store.selectedFilePath && normalizePath(store.selectedFilePath) === normalized) {
                    return store.selectedFileContent;
                }
                const buffer = store.workspaceBuffers[path] ?? store.workspaceBuffers[normalized];
                if (buffer) {
                    return buffer.content;
                }
                return await store.readWorkspaceFileContent(path);
            },
            novelTitle: store.currentNovel?.title || undefined,
        });
        notification.success(tt("ide.export.success", `已导出 ${result.chapterCount} 个章节（${result.filename}）`));
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, tt("ide.export.failed", "导出文稿失败")));
    } finally {
        exporting.value = false;
    }
}
</script>

<template>
    <!-- 轻量正文标签条：文件名、未保存圆点、关闭，以及排版阅读预览与导出 -->
    <header
        class="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-2"
        data-role="ide-document-tabs"
    >
        <!-- 标签页横向滚动区 -->
        <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto custom-scrollbar">
            <Tooltip
                v-for="tab in visibleTabs"
                :key="tab.path"
                :text="tab.path"
                placement="bottom"
            >
                <div
                    class="group flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors"
                    :class="tab.path === props.activePath
                        ? 'bg-[var(--bg-hover)] font-medium text-[var(--text-main)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                    :data-document-tab="tab.path"
                    role="button"
                    tabindex="0"
                    @click="emit('select-tab', tab.path)"
                    @keydown.enter.prevent="emit('select-tab', tab.path)"
                    @keydown.space.prevent="emit('select-tab', tab.path)"
                >
                    <span class="min-w-0 flex-1 truncate">{{ tab.title }}</span>
                    <span v-if="tab.dirty" class="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-warning)]" :title="t('ide.documentTabs.unsaved')"></span>
                    <button
                        type="button"
                        class="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-[var(--bg-input)] group-hover:opacity-100"
                        :title="t('ide.documentTabs.close')"
                        :data-document-tab-close="tab.path"
                        @click.stop="emit('close-tab', tab.path)"
                    >
                        <span class="i-lucide-x h-3 w-3"></span>
                    </button>
                </div>
            </Tooltip>
        </div>

        <!-- 右侧辅助工具：审稿、阅读预览与导出菜单 -->
        <div class="flex shrink-0 items-center gap-1 pl-2 border-l border-[var(--border-color)]">
            <!-- 审这一章：只对章节正文可用，其他文件置灰 -->
            <Tooltip :text="canReviewChapter ? t('ide.critique.entry.chapterTooltip') : t('ide.critique.entry.chapterDisabledTooltip')" placement="bottom">
                <button
                    type="button"
                    class="flex h-7 items-center gap-1 rounded px-2 text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="!canReviewChapter"
                    data-role="ide-review-chapter-button"
                    @click="requestChapterReview"
                >
                    <span class="i-lucide-search-check h-3.5 w-3.5"></span>
                    <span class="hidden sm:inline">{{ t("ide.critique.entry.chapterLabel") }}</span>
                </button>
            </Tooltip>

            <!-- 打快照：给当前章节留一个命名存档点（只对章节正文可用） -->
            <Tooltip :text="canSnapshot ? tt('ide.chapterSnapshot.entryTooltip', '给这一章现在这一版留个存档点') : tt('ide.chapterSnapshot.entryDisabledTooltip', '打开一章正文才能打快照')" placement="bottom">
                <button
                    type="button"
                    class="flex h-7 items-center gap-1 rounded px-2 text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="!canSnapshot || creating"
                    data-role="ide-snapshot-button"
                    @click="void takeSnapshot()"
                >
                    <span v-if="creating" class="i-lucide-loader-2 h-3.5 w-3.5 animate-spin"></span>
                    <span v-else class="i-lucide-camera h-3.5 w-3.5"></span>
                    <span class="hidden sm:inline">{{ tt("ide.chapterSnapshot.entry", "打快照") }}</span>
                </button>
            </Tooltip>

            <!-- 打开这一章的存档点列表 -->
            <Tooltip :text="canSnapshot ? tt('ide.chapterSnapshot.openPanel', '打开快照') : tt('ide.chapterSnapshot.entryDisabledTooltip', '打开一章正文才能打快照')" placement="bottom">
                <button
                    type="button"
                    class="flex h-7 items-center gap-1 rounded px-2 text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="!canSnapshot"
                    data-role="ide-snapshot-panel-button"
                    @click="emit('open-snapshots', activeChapterLabel)"
                >
                    <span class="i-lucide-history h-3.5 w-3.5"></span>
                    <span class="hidden sm:inline">{{ tt("ide.chapterSnapshot.open", "快照") }}</span>
                </button>
            </Tooltip>

            <!-- 排版阅读预览按钮 -->
            <Tooltip :text="tt('ide.reading.buttonTooltip', '排版阅读预览')" placement="bottom">
                <button
                    type="button"
                    class="flex h-7 items-center gap-1 rounded px-2 text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="!hasActiveDocument"
                    data-role="ide-reading-button"
                    @click="readingDialogOpen = true"
                >
                    <span class="i-lucide-book-open h-3.5 w-3.5"></span>
                    <span class="hidden sm:inline">{{ tt("ide.reading.buttonLabel", "阅读") }}</span>
                </button>
            </Tooltip>

            <!-- TXT 导出菜单 -->
            <div ref="exportMenuRef" class="relative">
                <Tooltip :text="tt('ide.export.buttonTooltip', '导出 TXT 文稿')" placement="bottom">
                    <button
                        type="button"
                        class="flex h-7 items-center gap-1 rounded px-2 text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="!hasActiveDocument || exporting"
                        data-role="ide-export-button"
                        @click="exportMenuOpen = !exportMenuOpen"
                    >
                        <span v-if="exporting" class="i-lucide-loader-2 h-3.5 w-3.5 animate-spin"></span>
                        <span v-else class="i-lucide-download h-3.5 w-3.5"></span>
                        <span class="hidden sm:inline">{{ tt("ide.export.buttonLabel", "导出") }}</span>
                        <span class="i-lucide-chevron-down h-3 w-3"></span>
                    </button>
                </Tooltip>

                <!-- 导出范围下拉框 -->
                <div
                    v-if="exportMenuOpen"
                    class="absolute right-0 top-full z-50 mt-1 min-w-[148px] rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] py-1 shadow-lg text-[12px]"
                    data-role="ide-export-menu"
                >
                    <button
                        type="button"
                        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-main)] transition-colors hover:bg-[var(--bg-hover)]"
                        data-role="export-chapter-action"
                        @click="triggerExport('chapter')"
                    >
                        <span class="i-lucide-file-text h-3.5 w-3.5 text-[var(--accent-main)]"></span>
                        <span>{{ tt("ide.export.currentChapter", "导出当前章 (.txt)") }}</span>
                    </button>
                    <button
                        type="button"
                        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-main)] transition-colors hover:bg-[var(--bg-hover)]"
                        data-role="export-volume-action"
                        @click="triggerExport('volume')"
                    >
                        <span class="i-lucide-folder h-3.5 w-3.5 text-[var(--accent-main)]"></span>
                        <span>{{ tt("ide.export.currentVolume", "导出当前卷 (.txt)") }}</span>
                    </button>
                    <button
                        type="button"
                        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-main)] transition-colors hover:bg-[var(--bg-hover)]"
                        data-role="export-book-action"
                        @click="triggerExport('book')"
                    >
                        <span class="i-lucide-book h-3.5 w-3.5 text-[var(--accent-main)]"></span>
                        <span>{{ tt("ide.export.fullBook", "导出全书 (.txt)") }}</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- 自闭环挂载的阅读预览弹窗 -->
        <ChapterReadingDialog
            v-model="readingDialogOpen"
            :current-path="props.activePath"
        />
    </header>
</template>
