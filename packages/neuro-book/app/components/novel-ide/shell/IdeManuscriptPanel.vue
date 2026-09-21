<script setup lang="ts">
import {storeToRefs} from "pinia";
import WorkspaceFileTree from "nbook/app/components/novel-ide/workspace/WorkspaceFileTree.vue";
import {useNovelIdeStore, type WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {groupBeatDocuments, projectBeatTree, projectOutlineTree, resolveWritingAssetLabel} from "nbook/app/utils/writing-assets";

/**
 * 写作资产面板：正文 / 大纲 / 细纲三个分区，各区自带新建按钮。
 * 只列作者关心的文稿，基座内部文件不在这里出现。
 */
const emit = defineEmits<{
    (event: "create-chapter"): void;
    (event: "create-outline"): void;
    (event: "create-beat"): void;
}>();

const {t} = useI18n();
const store = useNovelIdeStore();
const {loadingWorkspaceTree, selectedFilePath, workspaceTree} = storeToRefs(store);

const expandedPaths = ref<string[]>([]);
const outlineExpandedPaths = ref<string[]>([]);
const beatExpandedPaths = ref<string[]>([]);
const collapsedSections = ref<string[]>([]);

/** 作者视角的正文树：只保留 manuscript/，内部文件不进这里。 */
const writingNodes = computed(() => projectWritingTree(workspaceTree.value));
/** 大纲（总纲）：outline/ 根层文档。 */
const outlineNodes = computed(() => projectOutlineTree(workspaceTree.value));
/** 细纲：outline/<NNN>-volume/<NNN>-chapter，与正文卷章同构。 */
const beatNodes = computed(() => projectBeatTree(workspaceTree.value));
const beatGroups = computed(() => groupBeatDocuments(beatNodes.value));

/** 目录默认展开，让作者一眼看到自己有哪几章。 */
function defaultExpandedPaths(nodes: WorkspaceFileNode[]): string[] {
    return nodes.filter((node) => node.isDirectory).map((node) => node.path);
}

const effectiveExpandedPaths = computed(() => (
    [...new Set([...defaultExpandedPaths(writingNodes.value), ...expandedPaths.value])]
));
const effectiveOutlineExpandedPaths = computed(() => (
    [...new Set([...defaultExpandedPaths(outlineNodes.value), ...outlineExpandedPaths.value])]
));
const effectiveBeatExpandedPaths = computed(() => (
    [...new Set([...defaultExpandedPaths(beatNodes.value), ...beatExpandedPaths.value])]
));

/** 选中节点：交给 store 决定是预览还是常驻打开。 */
function selectNode(node: WorkspaceFileNode): void {
    void store.selectWorkspacePath(node.path);
}

/** 双击/回车打开并固定标签。 */
function openNode(node: WorkspaceFileNode): void {
    void store.openWorkspaceNode(node, "permanent");
}

function toggleSection(id: string): void {
    collapsedSections.value = collapsedSections.value.includes(id)
        ? collapsedSections.value.filter((item) => item !== id)
        : [...collapsedSections.value, id];
}

/** 细纲行标签：目录节点没有标题时翻译成作者话。 */
function nodeLabel(node: WorkspaceFileNode): string {
    const title = node.title.trim();
    if (title && !/^index\.md$/i.test(title)) {
        return title;
    }
    return resolveWritingAssetLabel(node.path);
}
</script>

<template>
    <section class="flex h-full min-h-0 flex-col bg-[var(--bg-sidebar)]" data-role="ide-manuscript-panel">
        <header class="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-color)] px-3 py-2.5">
            <h2 class="min-w-0 truncate text-[12px] font-semibold text-[var(--text-main)]">{{ t("ide.manuscript.title") }}</h2>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
            <!-- 正文 -->
            <section class="mb-3" data-manuscript-section="manuscript">
                <div class="flex items-center justify-between gap-2 px-2 pb-1">
                    <h3 class="font-ui-sans min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{{ t("ide.manuscript.sectionManuscript") }}</h3>
                    <button
                        type="button"
                        class="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                        data-role="ide-manuscript-new-chapter"
                        @click="emit('create-chapter')"
                    >
                        <span class="i-lucide-plus h-3 w-3"></span>
                        <span>{{ t("ide.manuscript.newChapter") }}</span>
                    </button>
                </div>

                <div v-if="loadingWorkspaceTree && writingNodes.length === 0" class="px-2 py-4 text-center text-[12px] text-[var(--text-muted)]">
                    {{ t("ide.manuscript.loading") }}
                </div>
                <WorkspaceFileTree
                    v-else-if="writingNodes.length > 0"
                    v-model:expanded-paths="expandedPaths"
                    :nodes="writingNodes"
                    :selected-path="selectedFilePath"
                    :forced-expanded-paths="effectiveExpandedPaths"
                    @select="selectNode"
                    @open="openNode"
                />
                <p v-else class="px-2 py-2 text-center text-[12px] text-[var(--text-muted)]">
                    {{ t("ide.manuscript.empty") }}
                </p>
            </section>

            <!-- 大纲：outline/ 根层，每份一个目录 -->
            <section class="mb-3 border-t border-[var(--border-color)] pt-2" data-manuscript-section="outline">
                <div class="flex items-center justify-between gap-2 px-2 pb-1">
                    <h3 class="font-ui-sans min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{{ t("ide.outline.outlineSection") }}</h3>
                    <button
                        type="button"
                        class="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                        data-role="ide-manuscript-new-outline"
                        @click="emit('create-outline')"
                    >
                        <span class="i-lucide-plus h-3 w-3"></span>
                        <span>{{ t("ide.outline.newOutline") }}</span>
                    </button>
                </div>

                <WorkspaceFileTree
                    v-if="outlineNodes.length > 0"
                    v-model:expanded-paths="outlineExpandedPaths"
                    :nodes="outlineNodes"
                    :selected-path="selectedFilePath"
                    :forced-expanded-paths="effectiveOutlineExpandedPaths"
                    @select="selectNode"
                    @open="openNode"
                />
                <p v-else class="px-2 py-2 text-center text-[12px] text-[var(--text-muted)]" data-outline-empty="outline">
                    {{ t("ide.outline.emptyOutline") }}
                </p>
            </section>

            <!-- 细纲：按卷分组，与正文卷章同构 -->
            <section class="border-t border-[var(--border-color)] pt-2" data-manuscript-section="beat">
                <div class="flex items-center justify-between gap-2 px-2 pb-1">
                    <h3 class="font-ui-sans min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{{ t("ide.outline.beatSection") }}</h3>
                    <button
                        type="button"
                        class="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                        data-role="ide-manuscript-new-beat"
                        @click="emit('create-beat')"
                    >
                        <span class="i-lucide-plus h-3 w-3"></span>
                        <span>{{ t("ide.outline.newBeat") }}</span>
                    </button>
                </div>

                <div v-if="beatGroups.length > 0" class="space-y-0.5">
                    <div v-for="group in beatGroups" :key="group.path" :data-beat-volume="group.path">
                        <div class="flex items-center gap-1.5 px-2 pb-0.5 pt-1">
                            <span class="i-lucide-folder h-3 w-3 shrink-0 text-[var(--text-muted)]"></span>
                            <span class="font-ui-sans min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text-muted)]">{{ resolveWritingAssetLabel(group.path) }}</span>
                        </div>
                        <WorkspaceFileTree
                            v-model:expanded-paths="beatExpandedPaths"
                            :nodes="group.entries.filter((entry) => entry.path !== group.path)"
                            :selected-path="selectedFilePath"
                            :forced-expanded-paths="effectiveBeatExpandedPaths"
                            @select="selectNode"
                            @open="openNode"
                        />
                    </div>
                </div>
                <p v-else class="px-2 py-2 text-center text-[12px] text-[var(--text-muted)]" data-outline-empty="beat">
                    {{ t("ide.outline.emptyBeat") }}
                </p>
            </section>
        </div>
    </section>
</template>
