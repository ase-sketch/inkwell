<script setup lang="ts">
import {storeToRefs} from "pinia";
import AgentMarkdownContent from "nbook/app/components/novel-ide/agent/AgentMarkdownContent.vue";
import Tooltip from "nbook/app/components/common/Tooltip.vue";
import {readWorkspaceLorebookStatus} from "nbook/app/components/novel-ide/workspace/workspace-entry-meta";
import {useResizablePanel} from "nbook/app/composables/useResizablePanel";
import {useNovelIdeStore, type WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {
    groupLorebookEntries,
    lorebookCategoryOf,
    projectLorebookNodes,
    type LorebookCategoryId,
} from "nbook/app/utils/ide-shell-layout";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";

const props = defineProps<{
    open: boolean;
}>();

const emit = defineEmits<{
    (event: "close"): void;
}>();

const MIN_DRAWER_WIDTH = 280;
const MAX_DRAWER_WIDTH = 420;

const store = useNovelIdeStore();
const {t} = useI18n();
const {workspaceTree, currentProjectRoot} = storeToRefs(store);

const searchQuery = ref("");
const selectedPath = ref("");
const previewContent = ref("");
const previewLoading = ref(false);
const previewError = ref("");
const collapsedCategories = ref<string[]>([]);
const resizeHandleRef = ref<HTMLElement | null>(null);

const {isResizing, panelStyle} = useResizablePanel(resizeHandleRef, {
    size: ref(MIN_DRAWER_WIDTH + 40),
    minSize: MIN_DRAWER_WIDTH,
    maxSize: MAX_DRAWER_WIDTH,
    edge: "left",
    enabled: computed(() => props.open),
});

const drawerStyle = computed(() => props.open ? panelStyle.value : {width: "0px"});

/** 设定条目：lorebook/<类目>/<条目>/index.md，类目说明页不算。 */
const entries = computed(() => projectLorebookNodes(workspaceTree.value));

/** 按关键词过滤；搜标题与摘要，空关键词返回全部。 */
const filteredEntries = computed(() => {
    const keyword = searchQuery.value.trim().toLowerCase();
    if (!keyword) {
        return entries.value;
    }
    return entries.value.filter((entry) => {
        return entry.title.toLowerCase().includes(keyword)
            || entry.summary.toLowerCase().includes(keyword)
            || (lorebookCategoryLabel(entry) ?? "").toLowerCase().includes(keyword);
    });
});

const searching = computed(() => searchQuery.value.trim() !== "");

/**
 * 平时 9 个类目全部露面（空类目也在，作者一眼看到分类体系）；
 * 搜索态只显示有命中的类目，避免一堆空组干扰结果。
 */
const groups = computed(() => groupLorebookEntries(filteredEntries.value, {includeEmpty: !searching.value}));
const totalCount = computed(() => entries.value.length);

const activeEntry = computed(() => entries.value.find((entry) => entry.path === selectedPath.value) ?? null);
const previewBody = computed(() => splitBody(previewContent.value));

/** 类目名；未知类目退回「其他」。 */
function lorebookCategoryLabel(entry: WorkspaceFileNode): string | null {
    const id = lorebookCategoryOf(entry.path);
    if (!id) {
        return null;
    }
    return lorebookCategoryLabelById(id as LorebookCategoryId);
}

/** 按类目 id 取名，空类目没有条目可用，走这里。 */
function lorebookCategoryLabelById(id: LorebookCategoryId): string {
    const key = "ide.shell.lorebookCategory_" + id;
    const label = t(key);
    return label === key ? t("ide.shell.lorebookCategory_note") : label;
}

/** 组头一句话定义，帮作者判断该往哪找。 */
function lorebookCategoryHint(id: LorebookCategoryId): string {
    return t(`ide.shell.lorebookCategoryHint_${id}`);
}

/**
 * 条目摘要：只有作者自己写过的 summary 才展示。
 * 基座模板留下的英文占位（目录说明页）已经在投影阶段被排除，这里再兜一层空值。
 */
function entrySummary(entry: WorkspaceFileNode): string {
    return entry.summary?.trim() ?? "";
}

/** 作者的草稿提示；已生效/已归档不打扰作者。 */
function draftBadge(entry: WorkspaceFileNode): string {
    return readWorkspaceLorebookStatus(entry.status) === "draft" ? t("ide.shell.lorebookDraftBadge") : "";
}

/**
 * 只取 frontmatter 之后的正文；抽屉是只读浏览，不展示 YAML。
 */
function splitBody(content: string): string {
    const normalized = content.replace(/\r\n/g, "\n");
    if (!normalized.startsWith("---\n")) {
        return normalized;
    }
    const closingDelimiterStart = normalized.indexOf("\n---", 4);
    if (closingDelimiterStart < 0) {
        return normalized;
    }
    const bodyStart = normalized.indexOf("\n", closingDelimiterStart + 1);
    return bodyStart < 0 ? "" : normalized.slice(bodyStart + 1);
}

/** 读取条目正文；只读浏览不写入任何文件。 */
async function loadPreview(filePath: string): Promise<void> {
    if (!filePath) {
        previewContent.value = "";
        previewError.value = "";
        return;
    }
    previewLoading.value = true;
    previewError.value = "";
    try {
        const content = await store.readWorkspaceFileContent(filePath);
        if (selectedPath.value !== filePath) {
            return;
        }
        previewContent.value = content ?? "";
    } catch (error) {
        if (selectedPath.value !== filePath) {
            return;
        }
        previewContent.value = "";
        previewError.value = resolveApiErrorMessage(error, t("ide.shell.lorebookPreviewFailed"));
    } finally {
        previewLoading.value = false;
    }
}

function selectEntry(entry: WorkspaceFileNode): void {
    if (selectedPath.value === entry.path) {
        return;
    }
    selectedPath.value = entry.path;
}

function toggleCategory(id: string): void {
    collapsedCategories.value = collapsedCategories.value.includes(id)
        ? collapsedCategories.value.filter((item) => item !== id)
        : [...collapsedCategories.value, id];
}

watch(selectedPath, (filePath) => void loadPreview(filePath));

watch(() => props.open, (isOpen) => {
    if (!isOpen || selectedPath.value) {
        return;
    }
    const first = filteredEntries.value[0];
    if (first) {
        selectEntry(first);
    }
});

watch(() => filteredEntries.value.length, () => {
    if (selectedPath.value && entries.value.some((entry) => entry.path === selectedPath.value)) {
        return;
    }
    const first = filteredEntries.value[0];
    selectedPath.value = first ? first.path : "";
});

watch(() => [currentProjectRoot.value, store.workspaceKind] as const, () => {
    selectedPath.value = "";
    previewContent.value = "";
    previewError.value = "";
});
</script>

<template>
    <!-- 设定抽屉：按作者类目分组只读浏览，编辑能力留给后续里程碑 -->
    <aside
        class="relative z-20 flex h-full shrink-0 flex-col overflow-hidden bg-[var(--bg-sidebar)] transition-[width,opacity,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        :class="[props.open ? 'border-l border-[var(--border-color)] opacity-100' : 'pointer-events-none border-l-0 opacity-0', isResizing ? 'select-none transition-none' : '']"
        :style="drawerStyle"
        data-role="ide-lorebook-drawer"
    >
        <div v-if="props.open" ref="resizeHandleRef" class="group absolute -left-1 top-0 z-30 h-full w-2 cursor-col-resize">
            <div class="ml-1 h-full w-[2px] bg-[var(--accent-main)] opacity-0 transition-all duration-150 group-hover:opacity-100" :class="isResizing ? 'opacity-100 shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-main)_28%,transparent)]' : ''"></div>
        </div>

        <header class="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-color)] px-3 py-3">
            <div class="min-w-0">
                <div class="text-sm font-semibold text-[var(--text-main)]">{{ t("ide.shell.lorebookDrawerTitle") }}</div>
                <div class="text-[11px] text-[var(--text-muted)]">{{ t("ide.shell.lorebookDrawerSubtitle") }}</div>
            </div>
            <Tooltip :text="t('ide.shell.lorebookDrawerClose')" placement="right">
                <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]" data-role="ide-lorebook-drawer-close" @click="emit('close')">
                    <span class="i-lucide-x h-4 w-4"></span>
                </button>
            </Tooltip>
        </header>

        <div class="shrink-0 border-b border-[var(--border-color)] p-3">
            <div class="flex h-9 items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5">
                <span class="i-lucide-search h-4 w-4 shrink-0 text-[var(--text-muted)]"></span>
                <input v-model="searchQuery" type="text" :placeholder="t('ide.shell.lorebookSearchPlaceholder')" class="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]">
            </div>
        </div>

        <!-- 条目浏览：平时 9 个类目全列出（空类目标注暂无条目），搜索态只列命中类目 -->
        <div class="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar" :class="activeEntry ? 'max-h-[45%] shrink-0 border-b border-[var(--border-color)]' : ''">
            <section v-for="group in groups" :key="group.id" class="mb-2">
                <button
                    v-if="group.entries.length > 0"
                    type="button"
                    class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                    :data-lorebook-group="group.id"
                    @click="toggleCategory(group.id)"
                >
                    <span :class="group.icon" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"></span>
                    <span class="min-w-0 flex-1">
                        <span class="flex items-baseline gap-1.5">
                            <span class="truncate text-[12px] font-semibold text-[var(--text-main)]">{{ lorebookCategoryLabelById(group.id) }}</span>
                            <span class="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{{ group.entries.length }}</span>
                        </span>
                        <span class="mt-0.5 block text-[10px] leading-4 text-[var(--text-muted)]">{{ lorebookCategoryHint(group.id) }}</span>
                    </span>
                    <span :class="collapsedCategories.includes(group.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"></span>
                </button>

                <!-- 空类目：不可折叠的静默占位，让作者看到分类体系全貌 -->
                <div v-else class="flex w-full items-start gap-2 px-2 py-1.5" :data-lorebook-group="group.id">
                    <span :class="group.icon" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-50"></span>
                    <span class="min-w-0 flex-1">
                        <span class="flex items-baseline gap-1.5">
                            <span class="truncate text-[12px] font-semibold text-[var(--text-muted)]">{{ lorebookCategoryLabelById(group.id) }}</span>
                            <span class="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">0</span>
                        </span>
                        <span class="mt-0.5 block text-[10px] leading-4 text-[var(--text-muted)]">{{ lorebookCategoryHint(group.id) }} · {{ t("ide.shell.lorebookCategoryEmpty") }}</span>
                    </span>
                </div>

                <div v-if="!collapsedCategories.includes(group.id)" class="mt-0.5 space-y-0.5 pl-2">
                    <button
                        v-for="entry in group.entries"
                        :key="entry.path"
                        type="button"
                        class="flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left transition-colors"
                        :class="entry.path === selectedPath ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                        :data-lorebook-entry-path="entry.path"
                        @click="selectEntry(entry)"
                    >
                        <span class="flex w-full min-w-0 items-center gap-1.5">
                            <span class="min-w-0 flex-1 truncate text-[12px]">{{ entry.title }}</span>
                            <span v-if="draftBadge(entry)" class="font-ui-sans shrink-0 rounded border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-1 py-px text-[9px] text-[var(--status-warning)]">{{ draftBadge(entry) }}</span>
                        </span>
                        <span v-if="entrySummary(entry)" class="line-clamp-2 w-full text-[10px] leading-4 text-[var(--text-muted)]">{{ entrySummary(entry) }}</span>
                    </button>
                </div>
            </section>

            <p v-if="groups.length === 0" class="mt-6 rounded-md border border-dashed border-[var(--border-color)] px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">
                {{ totalCount === 0 ? t("ide.shell.lorebookEmpty") : t("ide.shell.lorebookNoMatch") }}
            </p>
        </div>

        <!-- 条目正文：只读 -->
        <section v-if="activeEntry" class="flex min-h-0 flex-1 flex-col bg-[var(--bg-panel)]">
            <div class="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
                <span class="truncate text-[12px] font-medium text-[var(--text-main)]" :title="activeEntry.path">{{ activeEntry.title }}</span>
                <span class="shrink-0 text-[10px] text-[var(--text-muted)]">{{ t("ide.shell.lorebookReadOnly") }}</span>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 custom-scrollbar">
                <p v-if="previewLoading" class="text-[12px] text-[var(--text-muted)]">{{ t("ide.shell.lorebookLoading") }}</p>
                <p v-else-if="previewError" class="text-[12px] text-[var(--status-danger)]">{{ previewError }}</p>
                <AgentMarkdownContent v-else :content="previewBody" />
            </div>
        </section>
    </aside>
</template>

<style scoped>
.line-clamp-2 {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}
</style>
