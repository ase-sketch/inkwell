<script setup lang="ts">
import {onMounted} from "vue";
import {storeToRefs} from "pinia";
import IdeKnowledgeDetail from "nbook/app/components/novel-ide/knowledge/IdeKnowledgeDetail.vue";
import IdeKnowledgeEditor from "nbook/app/components/novel-ide/knowledge/IdeKnowledgeEditor.vue";
import {
    detailBadges,
    detailCategoryIcon,
    type DetailBadgeKind,
    type DetailTranslate,
} from "nbook/app/components/novel-ide/knowledge/knowledge-detail-display";
import {
    collectFactionTitles,
    groupEntriesByFaction,
    projectKnowledgeEntries,
    type ChapterOrderLookup,
    type FactionGroup,
    type KnowledgeEntry,
} from "nbook/app/components/novel-ide/knowledge/knowledge-projection";
import {
    buildChapterOrderIndex,
    buildKnowledgeTabs,
    collectWorkspaceNodes,
    filterKnowledgeEntries,
    knowledgeEntryExcerpt,
    knowledgeTabId,
    orderKnowledgeEntry,
    pickActiveEntry,
    resolveActiveTabId,
    resolveEntryIndexNode,
    resolveManuscriptChapterNode,
    type PlotOrderSource,
} from "nbook/app/components/novel-ide/knowledge/knowledge-view-state";
import {useNotification} from "nbook/app/composables/useNotification";
import {useNovelIdeStore, type WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {apiFetch} from "nbook/app/utils/api-fetch";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import type {PlotTreeDto} from "nbook/shared/dto/plot.dto";

/**
 * 知识库主视图：左阵营、中条目卡片、右详情或编辑器。
 *
 * 组件只做渲染与事件转发：分组、tab 序、过滤、选中、条目文件节点解析、
 * 章序检索表与章节正文反查全部在 knowledge-view-state.ts 里（可直测）。
 *
 * 两处宿主契约：
 * - 主区情境（知识库 ↔ 码字）由页面层的入口决定，容器不自己改；点章名跳到正文时
 *   打开文件之外还会 emit("open-chapter")，宿主接住即可把主区让给码字面。
 * - 条目编辑保存后刷新工作区树，让卡片立刻反映新标题与摘要（与文稿保存同一通道）。
 */

const emit = defineEmits<{
    /** 已经打开某章正文，请求宿主把主区切到码字面。 */
    (event: "open-chapter", path: string): void;
}>();

const {t} = useI18n();
const store = useNovelIdeStore();
const notification = useNotification();
const {currentProjectRoot, loadingWorkspaceTree, workspaceTree} = storeToRefs(store);

/** 把 vue-i18n 的 t 适配成投影模块要求的形状。 */
const translate: DetailTranslate = (key, params) => params ? t(key, params) : t(key);

/** 卡片徽标色调：与详情页同一套，保证同一条目在两处长得一样。 */
const BADGE_CLASS: Record<DetailBadgeKind, string> = {
    source: "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info)]",
    subtype: "border-[var(--border-accent)] bg-[var(--accent-bg)] text-[var(--accent-text)]",
    firstAppearance: "border-[var(--border-color)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
};

/** 大纲树里的章序来源；拉不到就是 null，履历按原顺序显示。 */
const plotTree = ref<PlotOrderSource | null>(null);
/** 大纲读取失败过；此时提示作者履历顺序可能不是正文顺序。 */
const plotTreeFailed = ref(false);
let plotRequestVersion = 0;

const chapterIndex = computed(() => buildChapterOrderIndex(plotTree.value));
/** 章节顺序解析函数：同时认 Plot 章节名与 manuscript 目录名，认不出返回 null。 */
const chapterOrder = computed<ChapterOrderLookup>(() => chapterIndex.value.lookup);

const entries = computed<KnowledgeEntry[]>(() => projectKnowledgeEntries(workspaceTree.value));
const factionTitles = computed(() => collectFactionTitles(entries.value));
const groups = computed<FactionGroup[]>(() => groupEntriesByFaction(entries.value, factionTitles.value));
const tabs = computed(() => buildKnowledgeTabs(groups.value));

/** 当前阵营 tab，以及卡片列表里的搜索词、当前选中条目——三项选中态都由容器持有。 */
const selectedTabId = ref("");
const query = ref("");
const selectedPath = ref("");

const activeTabId = computed(() => resolveActiveTabId(tabs.value, selectedTabId.value));
const activeGroup = computed(() => groups.value.find((group) => knowledgeTabId(group) === activeTabId.value) ?? null);
const visibleEntries = computed(() => filterKnowledgeEntries(activeGroup.value?.entries ?? [], query.value));
/** 选中条目始终落在当前 tab + 当前搜索词的结果里；换了 tab 或改了词就落到第一条。 */
const activeEntryPath = computed(() => pickActiveEntry(visibleEntries.value, selectedPath.value)?.path ?? "");

/** 卡片列表：履历与首次登场先按章节顺序重算一遍，卡片与详情共用同一份结果。 */
const cards = computed(() => visibleEntries.value.map((raw) => {
    const entry = orderKnowledgeEntry(raw, chapterOrder.value);
    return {
        entry,
        icon: detailCategoryIcon(entry.category),
        badges: detailBadges(entry, translate),
        excerpt: knowledgeEntryExcerpt(entry),
    };
}));

const activeEntry = computed<KnowledgeEntry | null>(() => (
    cards.value.find((card) => card.entry.path === activeEntryPath.value)?.entry ?? null
));

/** 编辑器状态：正在编辑哪条，以及它对应的 index.md 文件节点。 */
const editing = ref(false);
const editorNode = ref<WorkspaceFileNode | null>(null);
const allNodes = computed<WorkspaceFileNode[]>(() => collectWorkspaceNodes(workspaceTree.value));

/** 读不到大纲时的提示只在确实拉失败过、并且这条条目已经有履历时出现，不无端占版面。 */
const showHistoryOrderHint = computed(() => (
    plotTreeFailed.value && (activeEntry.value?.anchors.length ?? 0) > 0
));

function selectTab(id: string): void {
    if (id === activeTabId.value) {
        return;
    }
    selectedTabId.value = id;
    // 换阵营时选中回到新阵营的第一条，不让上一条的选中态跨 tab 残留。
    selectedPath.value = "";
}

function selectEntry(path: string): void {
    selectedPath.value = path;
}

/** 拉大纲树构建章序；失败不报错阻塞，只记下来让履历提示可见。 */
async function loadPlotTree(): Promise<void> {
    const projectRoot = currentProjectRoot.value;
    if (!projectRoot) {
        plotTree.value = null;
        plotTreeFailed.value = false;
        return;
    }
    const version = ++plotRequestVersion;
    try {
        const tree = await apiFetch<PlotTreeDto>("/api/projects/plot/tree", {query: {projectRoot}});
        if (version !== plotRequestVersion) {
            return;
        }
        plotTree.value = tree;
        plotTreeFailed.value = false;
    } catch {
        if (version !== plotRequestVersion) {
            return;
        }
        plotTree.value = null;
        plotTreeFailed.value = true;
    }
}

/**
 * 点履历里的章名：找到那一章的正文并打开。
 *
 * 反查口径与基座一致（frontmatter 反指优先，manuscript 目录名兜底）；找不到就给一句
 * 作者能看懂的提示，不跳到猜出来的文件、也不让界面崩掉。
 */
async function jumpToChapter(chapter: string): Promise<void> {
    const node = resolveManuscriptChapterNode(allNodes.value, chapter);
    if (!node) {
        notification.warning(t("ide.knowledge.view.chapterNotFound"), {title: chapter});
        return;
    }
    try {
        await store.selectWorkspacePath(node.path, "permanent");
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, t("ide.knowledge.view.chapterNotFound")));
        return;
    }
    emit("open-chapter", node.path);
}

/** 点「编辑条目」：换成编辑器，node 取当前条目自己的 index.md 文件节点。 */
function startEditing(): void {
    const entry = activeEntry.value;
    if (!entry) {
        return;
    }
    const node = resolveEntryIndexNode(allNodes.value, entry.path);
    if (!node) {
        notification.warning(t("ide.knowledge.view.entryFileMissing"), {title: entry.title});
        return;
    }
    editorNode.value = node;
    editing.value = true;
}

function stopEditing(): void {
    editing.value = false;
    editorNode.value = null;
}

/** 保存成功：刷新工作区树让卡片与详情立刻反映新内容，然后回到详情态。 */
async function onEditorSaved(): Promise<void> {
    stopEditing();
    try {
        await store.loadWorkspaceTree();
    } catch {
        // 刷新失败不影响这次保存的结果：文件已经落盘，作者重进视图即可看到新内容。
    }
}

// 编辑中当前条目没了（被删、被移走）就退回详情态，不让编辑器停在一条不存在的条目上。
// 换 tab 与改搜索词在编辑态下是禁用的（见模板），所以这里只会被「条目消失」触发。
watch(activeEntryPath, () => {
    if (editing.value && !activeEntry.value) {
        stopEditing();
    }
});

watch(currentProjectRoot, () => {
    selectedTabId.value = "";
    selectedPath.value = "";
    stopEditing();
    void loadPlotTree();
});

onMounted(() => {
    // 工作区树平时由项目打开时加载；这里兜住「进视图时还没有树」，避免空态误导作者。
    if (workspaceTree.value.length === 0) {
        void store.loadWorkspaceTree();
    }
    void loadPlotTree();
});
</script>

<template>
    <!-- 知识库：主区第三态。左阵营、中卡片、右详情或编辑器；对话留在伴随栏（由页面层负责）。 -->
    <section
        class="ide-knowledge-surface relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-main)]"
        data-role="ide-shell-knowledge"
        :aria-label="t('ide.knowledge.title')"
    >
        <!-- 空态：一条设定条目都没有时整页引导，不留三个空栏。 -->
        <div
            v-if="tabs.length === 0"
            class="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10"
            data-role="ide-knowledge-empty"
        >
            <div class="flex max-w-[460px] flex-col items-center gap-5 text-center">
                <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-accent)] bg-[var(--accent-bg)]">
                    <span class="i-lucide-library-big h-7 w-7 text-[var(--accent-text)]"></span>
                </div>

                <h1 class="text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-main)]">{{ t("ide.knowledge.view.emptyTitle") }}</h1>

                <p v-if="loadingWorkspaceTree && workspaceTree.length === 0" class="text-[13px] leading-relaxed text-[var(--text-secondary)]">{{ t("ide.knowledge.view.loading") }}</p>
                <template v-else>
                    <p class="text-[13px] leading-relaxed text-[var(--text-secondary)]">{{ t("ide.knowledge.view.emptyLead") }}</p>
                    <p class="text-[12px] leading-relaxed text-[var(--text-muted)]">{{ t("ide.knowledge.view.emptyHint") }}</p>
                </template>
            </div>
        </div>

        <div v-else class="flex min-h-0 flex-1">
            <!-- 左：分组列表。每个阵营一个 tab，带条数；「参考资料」按投影层的口径排在阵营之后、
                 「未分组」之前，带自己的图标与作者说得通的组名。分组口径全在投影层，
                 这里不判断谁是参考资料，只按 tab 上带的 reference 标志换图标。
                 编辑中把左中两栏置灰禁用：改完或取消才离开编辑器，避免未保存的改动被切换动作吞掉。 -->
            <aside
                class="flex w-[188px] shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-sidebar)]"
                :class="editing ? 'pointer-events-none opacity-50' : ''"
                data-role="ide-knowledge-factions"
            >
                <header class="shrink-0 px-3 pb-1 pt-3">
                    <h2 class="font-ui-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{{ t("ide.knowledge.view.factionListTitle") }}</h2>
                </header>

                <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar" :aria-label="t('ide.knowledge.view.factionListTitle')">
                    <button
                        v-for="tab in tabs"
                        :key="tab.id"
                        type="button"
                        class="mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
                        :class="tab.id === activeTabId
                            ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                        data-role="ide-knowledge-faction-tab"
                        :data-faction-id="tab.id"
                        :data-active="tab.id === activeTabId ? 'true' : 'false'"
                        @click="selectTab(tab.id)"
                    >
                        <span :class="tab.reference ? 'i-lucide-newspaper' : 'i-lucide-flag'" class="h-3.5 w-3.5 shrink-0 opacity-70"></span>
                        <span class="min-w-0 flex-1 truncate text-[12px]">{{ tab.title }}</span>
                        <span class="font-ui-sans shrink-0 text-[10px] tabular-nums opacity-70">{{ t("ide.knowledge.view.entryCount", {count: tab.count}) }}</span>
                    </button>
                </nav>
            </aside>

            <!-- 中：当前阵营的条目卡片 + 阵营内搜索。 -->
            <section
                class="flex w-[300px] shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]"
                :class="editing ? 'pointer-events-none opacity-50' : ''"
                data-role="ide-knowledge-cards"
            >
                <div class="shrink-0 border-b border-[var(--border-color)] px-3 py-2.5">
                    <label class="flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2 focus-within:border-[var(--accent-main)]">
                        <span class="i-lucide-search h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"></span>
                        <input
                            v-model="query"
                            type="text"
                            class="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                            :placeholder="t('ide.knowledge.view.searchPlaceholder')"
                            :aria-label="t('ide.knowledge.view.searchPlaceholder')"
                            data-role="ide-knowledge-search"
                        >
                        <button
                            v-if="query"
                            type="button"
                            class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
                            :title="t('ide.knowledge.view.searchClear')"
                            :aria-label="t('ide.knowledge.view.searchClear')"
                            data-role="ide-knowledge-search-clear"
                            @click="query = ''"
                        >
                            <span class="i-lucide-x h-3 w-3"></span>
                        </button>
                    </label>
                </div>

                <div class="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
                    <button
                        v-for="card in cards"
                        :key="card.entry.path"
                        type="button"
                        class="mb-1.5 flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-colors"
                        :class="card.entry.path === activeEntryPath
                            ? 'border-[var(--border-accent)] bg-[var(--accent-bg)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'"
                        data-role="ide-knowledge-card"
                        :data-entry-path="card.entry.path"
                        :data-active="card.entry.path === activeEntryPath ? 'true' : 'false'"
                        @click="selectEntry(card.entry.path)"
                    >
                        <div class="flex items-center gap-1.5">
                            <span :class="card.icon" class="h-3.5 w-3.5 shrink-0 text-[var(--accent-text)]"></span>
                            <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-main)]">{{ card.entry.title }}</span>
                        </div>

                        <div v-if="card.badges.length > 0" class="flex flex-wrap items-center gap-1">
                            <span
                                v-for="badge in card.badges"
                                :key="badge.kind"
                                class="font-ui-sans rounded border px-1.5 py-px text-[10px]"
                                :class="BADGE_CLASS[badge.kind]"
                                :data-card-badge="badge.kind"
                            >{{ badge.label }}</span>
                        </div>

                        <p v-if="card.excerpt" class="text-[11px] leading-5 text-[var(--text-secondary)]">{{ card.excerpt }}</p>
                    </button>

                    <!-- 阵营内过滤无结果：轻提示，不是整页空态。 -->
                    <div v-if="cards.length === 0" class="px-2 py-6 text-center" data-role="ide-knowledge-no-match">
                        <p class="text-[12px] text-[var(--text-secondary)]">{{ activeGroup?.entries.length ? t("ide.knowledge.view.noMatchTitle") : t("ide.knowledge.view.emptyTab") }}</p>
                        <p v-if="activeGroup?.entries.length" class="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">{{ t("ide.knowledge.view.noMatchHint") }}</p>
                    </div>
                </div>
            </section>

            <!-- 右：详情或编辑器。 -->
            <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <IdeKnowledgeEditor
                    v-if="editing && editorNode"
                    :key="editorNode.path"
                    :node="editorNode"
                    class="flex-1"
                    @saved="void onEditorSaved()"
                    @cancel="stopEditing()"
                />

                <IdeKnowledgeDetail
                    v-else-if="activeEntry"
                    :entry="activeEntry"
                    :faction-titles="factionTitles"
                    :chapter-order="chapterOrder"
                    class="flex-1"
                    @jump-chapter="void jumpToChapter($event)"
                    @edit="startEditing()"
                />

                <div v-else class="flex min-h-0 flex-1 items-center justify-center px-6 py-10" data-role="ide-knowledge-detail-empty">
                    <p class="text-[12px] text-[var(--text-muted)]">{{ t("ide.knowledge.view.emptyTab") }}</p>
                </div>

                <!-- 大纲读不到时履历只能按原顺序：明说一句，不让作者以为顺序是对的。 -->
                <p
                    v-if="showHistoryOrderHint && !editing"
                    class="font-ui-sans shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-subtle)] px-4 py-1.5 text-[10px] leading-4 text-[var(--text-muted)]"
                    data-role="ide-knowledge-order-hint"
                >{{ t("ide.knowledge.view.historyLoadFailed") }}</p>
            </div>
        </div>
    </section>
</template>
