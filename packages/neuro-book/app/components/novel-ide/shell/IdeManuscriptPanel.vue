<script setup lang="ts">
import {storeToRefs} from "pinia";
import ContextMenu, {type ContextMenuItem} from "nbook/app/components/common/ContextMenu.vue";
import WorkspaceFileTree from "nbook/app/components/novel-ide/workspace/WorkspaceFileTree.vue";
import type {WorkspaceFileMovePayload} from "nbook/app/components/novel-ide/workspace/workspace-file-tree";
import {useNovelIdeStore, type WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {useDialog} from "nbook/app/composables/useDialog";
import {useNotification} from "nbook/app/composables/useNotification";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import {
    calculateManuscriptWordStats,
    groupBeatDocuments,
    isAuthorVisibleWritingPath,
    isRawWritingDirectoryName,
    isVolumeDirectoryPath,
    nextVolumePath,
    projectBeatTree,
    projectOutlineTree,
    projectWritingTree,
    resolveChapterMoveTarget,
    resolveChapterRenameTarget,
    resolveParentDirectory,
    resolveWritingAssetLabel,
    resolveWritingNodeDisplayLabel,
} from "nbook/app/utils/writing-assets";

/**
 * 写作资产面板：正文 / 大纲 / 细纲三个分区，各区自带新建按钮。
 * 只列作者关心的文稿，基座内部文件不在这里出现。
 */
const emit = defineEmits<{
    (event: "create-chapter"): void;
    (event: "create-outline"): void;
    (event: "create-beat"): void;
    (event: "create-volume", path: string): void;
}>();

const {t} = useI18n();
const store = useNovelIdeStore();
const {loadingWorkspaceTree, selectedFilePath, workspaceTree} = storeToRefs(store);
const {prompt} = useDialog();
const notification = useNotification();

const expandedPaths = ref<string[]>([]);
const outlineExpandedPaths = ref<string[]>([]);
const beatExpandedPaths = ref<string[]>([]);
const collapsedSections = ref<string[]>([]);

const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuItems = ref<ContextMenuItem[]>([]);

function humanizeWritingNode(node: WorkspaceFileNode): WorkspaceFileNode {
    const displayTitle = resolveWritingNodeDisplayLabel(node);
    if (displayTitle !== node.title) {
        return {...node, title: displayTitle};
    }
    return node;
}

/** 全书字数汇总：全书总字数 + 各卷字数 */
const manuscriptWordStats = computed(() => calculateManuscriptWordStats(workspaceTree.value));

/** 作者视角的正文树：只保留 manuscript/，内部文件不进这里。 */
const writingNodes = computed(() => projectWritingTree(workspaceTree.value).map(humanizeWritingNode));
/** 大纲（总纲）：outline/ 根层文档。 */
const outlineNodes = computed(() => projectOutlineTree(workspaceTree.value).map(humanizeWritingNode));
/** 细纲：outline/<NNN>-volume/<NNN>-chapter，与正文卷章同构。 */
const beatNodes = computed(() => projectBeatTree(workspaceTree.value).map(humanizeWritingNode));
const beatGroups = computed(() => groupBeatDocuments(beatNodes.value).map((group) => ({
    ...group,
    entries: group.entries.map(humanizeWritingNode),
})));

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

/** 节点标签：目录节点没有标题或为机器名时翻译成作者话。 */
function nodeLabel(node: WorkspaceFileNode): string {
    return resolveWritingNodeDisplayLabel(node);
}

/** 新建卷：生成 manuscript/00X-vol 纯目录，不含 index.md */
async function createVolume(): Promise<void> {
    const nextPath = nextVolumePath(workspaceTree.value);
    try {
        await store.createWorkspaceDirectory(nextPath, null);
        expandedPaths.value = [...new Set([...expandedPaths.value, nextPath])];
        emit("create-volume", nextPath);
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, "创建卷失败"));
    }
}

/** 处理拖拽归卷/移出卷移动 */
async function handleMove(payload: WorkspaceFileMovePayload): Promise<void> {
    const sourceNode = workspaceTree.value.find((node) => node.path === payload.sourcePath)
        || writingNodes.value.find((node) => node.path === payload.sourcePath);
    if (!sourceNode) {
        return;
    }

    let moveSourcePath = sourceNode.path;
    if (!sourceNode.isDirectory && moveSourcePath.toLowerCase().endsWith("/index.md")) {
        const parentDir = resolveParentDirectory(moveSourcePath);
        if (parentDir && parentDir !== "manuscript") {
            moveSourcePath = parentDir;
        }
    }

    let targetDir = "manuscript";
    if (payload.position === "root" || !payload.targetPath) {
        targetDir = "manuscript";
    } else {
        const targetNode = workspaceTree.value.find((node) => node.path === payload.targetPath);
        if (payload.position === "inside" && targetNode?.isDirectory) {
            targetDir = targetNode.path;
        } else if (payload.position === "before" || payload.position === "after") {
            const parent = resolveParentDirectory(payload.targetPath);
            targetDir = parent === "manuscript" || !parent ? "manuscript" : parent;
        } else {
            targetDir = resolveParentDirectory(payload.targetPath) || "manuscript";
        }
    }

    const nextPath = resolveChapterMoveTarget(moveSourcePath, targetDir, workspaceTree.value);
    if (nextPath === moveSourcePath) {
        return;
    }

    try {
        await store.renameWorkspacePath(moveSourcePath, nextPath);
        expandedPaths.value = [...new Set([...expandedPaths.value, targetDir])].filter(Boolean);
        await store.selectWorkspacePath(nextPath);
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, "移动失败"));
    }
}

/** 章节/卷右键菜单交互 */
function handleNodeContextMenu(node: WorkspaceFileNode, event: MouseEvent): void {
    let targetNode = node;
    const cleanPath = node.path.replace(/\/$/, "");
    if (!node.isDirectory && cleanPath.toLowerCase().endsWith("/index.md")) {
        const parentDir = resolveParentDirectory(cleanPath);
        const parentNode = workspaceTree.value.find((n) => n.path.replace(/\/$/, "") === parentDir);
        if (parentNode) {
            targetNode = parentNode;
        }
    }

    const normPath = targetNode.path.replace(/\/$/, "");
    const isManuscriptRoot = normPath === "manuscript" || normPath === "workspace/manuscript";
    const isVolume = isVolumeDirectoryPath(normPath);
    const isChapter = !isVolume && !isManuscriptRoot;

    const items: ContextMenuItem[] = [
        {
            label: t("ide.workspace.common.open"),
            iconClass: "i-lucide-file-text",
            action: () => void openNode(node),
        },
        {
            label: "重命名",
            iconClass: "i-lucide-pencil",
            action: () => void renameChapterNode(targetNode),
        },
    ];

    if (isChapter) {
        const volumeSubmenu: ContextMenuItem[] = manuscriptWordStats.value.volumeStats.map((vol) => ({
            label: vol.label,
            iconClass: "i-lucide-folder",
            action: () => void moveNodeToVolume(targetNode, vol.path),
        }));
        if (volumeSubmenu.length > 0) {
            volumeSubmenu.push({separator: true});
        }
        volumeSubmenu.push({
            label: "移出卷 (正文根目录)",
            iconClass: "i-lucide-folder-minus",
            action: () => void moveNodeToVolume(targetNode, "manuscript"),
        });

        items.push({
            label: "移动到卷",
            iconClass: "i-lucide-folder-input",
            children: volumeSubmenu,
        });
    }

    contextMenuX.value = event.clientX;
    contextMenuY.value = event.clientY;
    contextMenuItems.value = items;
    contextMenuVisible.value = true;
}

/** 重命名章节并保持 001- 序号 */
async function renameChapterNode(node: WorkspaceFileNode): Promise<void> {
    const sourceBase = node.path.split("/").pop() ?? "";
    const currentTitle = node.title && !isRawWritingDirectoryName(node.title) ? node.title : sourceBase;
    const input = await prompt("请输入新名称（将自动维护序号）：", currentTitle, "重命名");
    const nextName = typeof input === "string" ? input.trim() : "";
    if (!nextName) {
        return;
    }

    const nextPath = resolveChapterRenameTarget(node.path, nextName, workspaceTree.value);
    if (nextPath === node.path) {
        return;
    }

    try {
        await store.renameWorkspacePath(node.path, nextPath);
        await store.selectWorkspacePath(nextPath);
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, "重命名失败"));
    }
}

/** 快捷归卷或移出卷 */
async function moveNodeToVolume(node: WorkspaceFileNode, targetDir: string): Promise<void> {
    const nextPath = resolveChapterMoveTarget(node.path, targetDir, workspaceTree.value);
    if (nextPath === node.path) {
        return;
    }

    try {
        await store.renameWorkspacePath(node.path, nextPath);
        expandedPaths.value = [...new Set([...expandedPaths.value, targetDir])].filter(Boolean);
        await store.selectWorkspacePath(nextPath);
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, "移动到卷失败"));
    }
}
</script>

<template>
    <section class="flex h-full min-h-0 flex-col bg-[var(--bg-sidebar)]" data-role="ide-manuscript-panel">
        <header class="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-color)] px-3 py-2.5">
            <h2 class="min-w-0 truncate text-[12px] font-semibold text-[var(--text-main)]">{{ t("ide.manuscript.title") }}</h2>
        </header>

        <!-- 字数汇总：全书总字数 + 各卷字数 -->
        <div class="border-b border-[var(--border-color)] bg-[var(--bg-subtle)] px-3 py-2 text-[11px]" data-role="ide-manuscript-word-stats">
            <div class="flex items-center justify-between font-medium">
                <span class="text-[var(--text-secondary)]">全书总字数</span>
                <span class="font-mono font-semibold text-[var(--text-main)]" data-role="manuscript-total-words">
                    {{ manuscriptWordStats.totalWords.toLocaleString() }} 字
                </span>
            </div>
            <div
                v-if="manuscriptWordStats.volumeStats.length > 0"
                class="mt-1.5 flex flex-wrap gap-1.5"
                data-role="manuscript-volume-stats-list"
            >
                <span
                    v-for="vol in manuscriptWordStats.volumeStats"
                    :key="vol.path"
                    class="inline-flex items-center gap-1 rounded border border-[var(--border-color)] bg-[var(--bg-canvas)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
                    :data-volume-path="vol.path"
                >
                    <span class="max-w-[80px] truncate text-[var(--text-secondary)]">{{ vol.label }}</span>
                    <span class="font-mono text-[var(--text-muted)]">{{ vol.words.toLocaleString() }}字</span>
                </span>
            </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
            <!-- 正文 -->
            <section class="mb-3" data-manuscript-section="manuscript">
                <div class="flex items-center justify-between gap-2 px-2 pb-1">
                    <h3 class="font-ui-sans min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{{ t("ide.manuscript.sectionManuscript") }}</h3>
                    <div class="flex items-center gap-1">
                        <button
                            type="button"
                            class="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                            data-role="ide-manuscript-new-volume"
                            title="新建卷"
                            @click="createVolume"
                        >
                            <span class="i-lucide-folder-plus h-3 w-3"></span>
                            <span>新建卷</span>
                        </button>
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
                    @move="handleMove"
                    @node-contextmenu="handleNodeContextMenu"
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

        <ContextMenu
            :visible="contextMenuVisible"
            :x="contextMenuX"
            :y="contextMenuY"
            :items="contextMenuItems"
            @close="contextMenuVisible = false"
        />
    </section>
</template>
