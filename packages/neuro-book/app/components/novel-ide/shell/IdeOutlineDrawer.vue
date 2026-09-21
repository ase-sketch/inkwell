<script setup lang="ts">
import {storeToRefs} from "pinia";
import AgentMarkdownContent from "nbook/app/components/novel-ide/agent/AgentMarkdownContent.vue";
import Tooltip from "nbook/app/components/common/Tooltip.vue";
import {useResizablePanel} from "nbook/app/composables/useResizablePanel";
import {useNovelIdeStore, type WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {
    groupBeatDocuments,
    projectBeatTree,
    projectOutlineTree,
    resolveWritingAssetLabel,
    type OutlineVolumeGroup,
} from "nbook/app/utils/writing-assets";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";

/**
 * 大纲抽屉：聊天态下对照大纲与细纲，只读浏览。
 * 编辑回码字态的文稿面板做——与设定抽屉「只读浏览」定位一致。
 */
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
const collapsedSections = ref<string[]>([]);
const resizeHandleRef = ref<HTMLElement | null>(null);

const {isResizing, panelStyle} = useResizablePanel(resizeHandleRef, {
    size: ref(MIN_DRAWER_WIDTH + 40),
    minSize: MIN_DRAWER_WIDTH,
    maxSize: MAX_DRAWER_WIDTH,
    edge: "left",
    enabled: computed(() => props.open),
});

const drawerStyle = computed(() => props.open ? panelStyle.value : {width: "0px"});

/** 大纲（总纲）文档：outline/ 根层，每份一个目录。 */
const outlineDocuments = computed(() => projectOutlineTree(workspaceTree.value));
/** 细纲文档：outline/<NNN>-volume/<NNN>-chapter/index.md，与正文卷章同构。 */
const beatDocuments = computed(() => projectBeatTree(workspaceTree.value));

const searching = computed(() => searchQuery.value.trim() !== "");

/** 按关键词过滤：搜标题、摘要与路径兜底标签。 */
function matchesKeyword(node: WorkspaceFileNode): boolean {
    const keyword = searchQuery.value.trim().toLowerCase();
    if (!keyword) {
        return true;
    }
    return node.title.toLowerCase().includes(keyword)
        || node.summary.toLowerCase().includes(keyword)
        || nodeLabel(node).toLowerCase().includes(keyword);
}

const filteredOutlineDocuments = computed(() => outlineDocuments.value.filter(matchesKeyword));
const filteredBeatDocuments = computed(() => beatDocuments.value.filter(matchesKeyword));

/** 细纲按卷分组：搜索态只留命中卷，避免空组占位。 */
const beatGroups = computed<OutlineVolumeGroup[]>(() => {
    const groups = groupBeatDocuments(filteredBeatDocuments.value);
    return searching.value ? groups.filter((group) => group.entries.length > 0) : groups;
});

const totalCount = computed(() => outlineDocuments.value.length + beatDocuments.value.length);
const matchedCount = computed(() => filteredOutlineDocuments.value.length + filteredBeatDocuments.value.length);

const activeEntry = computed(() => {
    const candidates = [...outlineDocuments.value, ...beatDocuments.value];
    return candidates.find((entry) => readablePath(entry) === selectedPath.value) ?? null;
});
const previewBody = computed(() => splitBody(previewContent.value));

/** 行标签：有标题用标题，没有就把路径翻译成作者话，不裸露 001-volume 这种机器名。 */
function nodeLabel(node: WorkspaceFileNode): string {
    const title = node.title.trim();
    if (title && !/^index\.md$/i.test(title)) {
        return title;
    }
    return resolveWritingAssetLabel(node.path);
}

/** 草稿徽章：已生效的内容不打扰作者。 */
function draftBadge(node: WorkspaceFileNode): string {
    return node.status === "draft" ? t("ide.outline.draftBadge") : "";
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

/** 读取文档正文；只读浏览不写入任何文件。 */
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
        previewError.value = resolveApiErrorMessage(error, t("ide.outline.previewFailed"));
    } finally {
        previewLoading.value = false;
    }
}

/** 节点代表的可读路径：目录节点由它的 index.md 承载。 */
function readablePath(node: WorkspaceFileNode): string {
    if (node.isDirectory) {
        return `${node.path.replace(/\/$/, "")}/index.md`;
    }
    return node.path;
}

function selectEntry(node: WorkspaceFileNode): void {
    const next = readablePath(node);
    if (selectedPath.value === next) {
        return;
    }
    selectedPath.value = next;
}

function toggleSection(id: string): void {
    collapsedSections.value = collapsedSections.value.includes(id)
        ? collapsedSections.value.filter((item) => item !== id)
        : [...collapsedSections.value, id];
}

watch(selectedPath, (filePath) => void loadPreview(filePath));

/** 打开抽屉时自动选中文档：先大纲后细纲，让作者一眼看到总纲。 */
watch(open, (isOpen) => {
    if (!isOpen || selectedPath.value) {
        return;
    }
    const first = filteredOutlineDocuments.value[0] ?? filteredBeatDocuments.value[0];
    if (first) {
        selectEntry(first);
    }
});

watch(() => filteredOutlineDocuments.value.length + filteredBeatDocuments.value.length, () => {
    // 选中的文档还在（并在过滤结果里）就别动它，避免搜索时预览区自己跳走。
    if (selectedPath.value && activeEntry.value) {
        return;
    }
    const first = filteredOutlineDocuments.value[0] ?? filteredBeatDocuments.value[0];
    selectedPath.value = first ? readablePath(first) : "";
});

watch(() => [currentProjectRoot.value, store.workspaceKind] as const, () => {
    selectedPath.value = "";
    previewContent.value = "";
    previewError.value = "";
    collapsedSections.value = [];
});
</script>

<template>
    <!-- 大纲抽屉：总纲 + 细纲两棵树，只读浏览，编辑回码字态做 -->
    <aside
        class="relative z-20 flex h-full shrink-0 flex-col overflow-hidden bg-[var(--bg-sidebar)] transition-[width,opacity,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        :class="[props.open ? 'border-l border-[var(--border-color)] opacity-100' : 'pointer-events-none border-l-0 opacity-0', isResizing ? 'select-none transition-none' : '']"
        :style="drawerStyle"
        data-role="ide-outline-drawer"
    >
        <div v-if="props.open" ref="resizeHandleRef" class="group absolute -left-1 top-0 z-30 h-full w-2 cursor-col-resize">
            <div class="ml-1 h-full w-[2px] bg-[var(--accent-main)] opacity-0 transition-all duration-150 group-hover:opacity-100" :class="isResizing ? 'opacity-100 shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-main)_28%,transparent)]' : ''"></div>
        </div>

        <header class="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-color)] px-3 py-3">
            <div class="min-w-0">
                <div class="text-sm font-semibold text-[var(--text-main)]">{{ t("ide.outline.drawerTitle") }}</div>
                <div class="text-[11px] text-[var(--text-muted)]">{{ t("ide.outline.drawerSubtitle") }}</div>
            </div>
            <Tooltip :text="t('ide.outline.drawerClose')" placement="right">
                <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]" data-role="ide-outline-drawer-close" @click="emit('close')">
                    <span class="i-lucide-x h-4 w-4"></span>
                </button>
            </Tooltip>
        </header>

        <div class="shrink-0 border-b border-[var(--border-color)] p-3">
            <div class="flex h-9 items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5">
                <span class="i-lucide-search h-4 w-4 shrink-0 text-[var(--text-muted)]"></span>
                <input v-model="searchQuery" type="text" :placeholder="t('ide.outline.searchPlaceholder')" class="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]">
            </div>
        </div>

        <!-- 两棵树：大纲（总纲）在上，细纲按卷分组在下 -->
        <div class="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar" :class="activeEntry ? 'max-h-[45%] shrink-0 border-b border-[var(--border-color)]' : ''">
            <section
                v-for="section in [
                    {id: 'outline', icon: 'i-lucide-list-tree', label: t('ide.outline.outlineSection'), entries: filteredOutlineDocuments},
                    {id: 'beat', icon: 'i-lucide-book-open-text', label: t('ide.outline.beatSection'), entries: filteredBeatDocuments},
                ]"
                :key="section.id"
                class="mb-2"
                :data-outline-section="section.id"
            >
                <button
                    type="button"
                    class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                    :data-outline-section-header="section.id"
                    @click="toggleSection(section.id)"
                >
                    <span :class="section.icon" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"></span>
                    <span class="min-w-0 flex-1">
                        <span class="flex items-baseline gap-1.5">
                            <span class="font-ui-sans truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-main)]">{{ section.label }}</span>
                            <span class="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{{ section.entries.length }}</span>
                        </span>
                        <span class="mt-0.5 block text-[10px] leading-4 text-[var(--text-muted)]">
                            {{ section.id === "outline" ? t("ide.outline.outlineSectionHint") : t("ide.outline.beatSectionHint") }}
                        </span>
                    </span>
                    <span :class="collapsedSections.includes(section.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"></span>
                </button>

                <div v-if="!collapsedSections.includes(section.id)" class="mt-0.5 space-y-0.5 pl-2">
                    <!-- 细纲按卷分组：卷是分组标题，不是可打开文档 -->
                    <template v-if="section.id === 'beat'">
                        <div v-for="group in beatGroups" :key="group.path" :data-outline-volume="group.path">
                            <div class="flex items-center gap-1.5 px-2.5 pb-0.5 pt-1.5">
                                <span class="i-lucide-folder h-3 w-3 shrink-0 text-[var(--text-muted)]"></span>
                                <span class="font-ui-sans min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text-muted)]">{{ resolveWritingAssetLabel(group.path) }}</span>
                            </div>
                            <button
                                v-for="entry in group.entries.filter((item) => item.path !== group.path)"
                                :key="entry.path"
                                type="button"
                                class="flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left transition-colors"
                                :class="readablePath(entry) === selectedPath ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                                :data-outline-beat-path="readablePath(entry)"
                                @click="selectEntry(entry)"
                            >
                                <span class="flex w-full min-w-0 items-center gap-1.5">
                                    <span class="min-w-0 flex-1 truncate text-[12px]">{{ nodeLabel(entry) }}</span>
                                    <span v-if="draftBadge(entry)" class="font-ui-sans shrink-0 rounded border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-1 py-px text-[9px] text-[var(--status-warning)]">{{ draftBadge(entry) }}</span>
                                </span>
                                <span v-if="entry.summary.trim()" class="line-clamp-2 w-full text-[10px] leading-4 text-[var(--text-muted)]">{{ entry.summary.trim() }}</span>
                            </button>
                            <p v-if="group.entries.filter((item) => item.path !== group.path).length === 0" class="px-2.5 py-1 text-[10px] leading-4 text-[var(--text-muted)]">
                                {{ t("ide.outline.beatVolumeEmpty") }}
                            </p>
                        </div>
                    </template>

                    <!-- 大纲文档：outline/ 根层，每份一个目录 -->
                    <template v-else>
                        <button
                            v-for="entry in section.entries"
                            :key="entry.path"
                            type="button"
                            class="flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left transition-colors"
                            :class="readablePath(entry) === selectedPath ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                            :data-outline-entry-path="readablePath(entry)"
                            @click="selectEntry(entry)"
                        >
                            <span class="flex w-full min-w-0 items-center gap-1.5">
                                <span class="min-w-0 flex-1 truncate text-[12px]">{{ nodeLabel(entry) }}</span>
                                <span v-if="draftBadge(entry)" class="font-ui-sans shrink-0 rounded border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-1 py-px text-[9px] text-[var(--status-warning)]">{{ draftBadge(entry) }}</span>
                            </span>
                            <span v-if="entry.summary.trim()" class="line-clamp-2 w-full text-[10px] leading-4 text-[var(--text-muted)]">{{ entry.summary.trim() }}</span>
                        </button>
                    </template>
                </div>
            </section>

            <p v-if="totalCount === 0" class="mt-6 rounded-md border border-dashed border-[var(--border-color)] px-3 py-6 text-center text-[12px] text-[var(--text-muted)]" data-role="ide-outline-empty">
                {{ t("ide.outline.empty") }}
            </p>
            <p v-else-if="matchedCount === 0" class="mt-6 rounded-md border border-dashed border-[var(--border-color)] px-3 py-6 text-center text-[12px] text-[var(--text-muted)]" data-role="ide-outline-empty">
                {{ t("ide.outline.noMatch") }}
            </p>
        </div>

        <!-- 文档正文：只读 -->
        <section v-if="activeEntry" class="flex min-h-0 flex-1 flex-col bg-[var(--bg-panel)]">
            <div class="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
                <span class="truncate text-[12px] font-medium text-[var(--text-main)]" :title="activeEntry.path">{{ nodeLabel(activeEntry) }}</span>
                <span class="shrink-0 text-[10px] text-[var(--text-muted)]">{{ t("ide.outline.readOnly") }}</span>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 custom-scrollbar">
                <p v-if="previewLoading" class="text-[12px] text-[var(--text-muted)]">{{ t("ide.outline.loading") }}</p>
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
