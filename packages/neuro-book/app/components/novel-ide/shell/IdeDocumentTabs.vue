<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import Tooltip from "nbook/app/components/common/Tooltip.vue";
import ChapterReadingDialog from "nbook/app/components/novel-ide/reading/ChapterReadingDialog.vue";
import {useNotification} from "nbook/app/composables/useNotification";
import {useNovelIdeStore, type WorkspaceEditorTab} from "nbook/app/stores/novel-ide";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import {exportChaptersToTxt, normalizePath, type ChapterExportScope} from "nbook/app/utils/chapter-export";

const props = defineProps<{
    tabs: readonly WorkspaceEditorTab[];
    activePath: string;
}>();

const emit = defineEmits<{
    (event: "select-tab", path: string): void;
    (event: "close-tab", path: string): void;
}>();

const {t, te} = useI18n();
const store = useNovelIdeStore();
const notification = useNotification();

const readingDialogOpen = ref(false);
const exportMenuOpen = ref(false);
const exporting = ref(false);
const exportMenuRef = ref<HTMLDivElement | null>(null);

const tt = (key: string, fallback: string): string => (te(key) ? t(key) : fallback);

/** 只展出正文标签：作者不需要在标签条上分辨编辑器类型。 */
const visibleTabs = computed(() => props.tabs);
const hasActiveDocument = computed(() => Boolean(props.activePath));

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

        <!-- 右侧辅助工具：阅读预览与导出菜单 -->
        <div class="flex shrink-0 items-center gap-1 pl-2 border-l border-[var(--border-color)]">
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
