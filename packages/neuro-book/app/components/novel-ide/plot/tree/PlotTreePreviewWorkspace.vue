<script setup lang="ts">
import {computed, ref} from "vue";
import PlotTreeView from "nbook/app/components/novel-ide/plot/PlotTreeView.vue";
import {clonePlotTreeGraph} from "nbook/app/components/novel-ide/plot/tree/plot-tree.graph";
import {plotTreePreviewGraph} from "nbook/app/components/novel-ide/plot/tree/plot-tree.preview-data";
import type {
    PlotTreeGraph,
    PlotTreeScene,
    PlotTreeThread,
} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";

const renderRevision = ref(0);
const graph = ref<PlotTreeGraph>(clonePlotTreeGraph(plotTreePreviewGraph));
const selectedThreadId = ref<string | null>("thread-main");
const selectedSceneId = ref<string | null>("scene-cage");

const threadMap = computed(() => {
    return new Map(graph.value.threads.map((thread) => [thread.id, thread]));
});

const sceneMap = computed(() => {
    return new Map(graph.value.scenes.map((scene) => [scene.id, scene]));
});

/**
 * 当前选中线程。
 */
const selectedThread = computed<PlotTreeThread | null>(() => {
    return selectedThreadId.value ? threadMap.value.get(selectedThreadId.value) ?? null : null;
});

/**
 * 当前选中场景。
 */
const selectedScene = computed<PlotTreeScene | null>(() => {
    return selectedSceneId.value ? sceneMap.value.get(selectedSceneId.value) ?? null : null;
});

/**
 * 选中线程。
 */
function selectThread(threadId: string | null): void {
    selectedThreadId.value = threadId;

    if (threadId === null) {
        return;
    }

    const firstScene = graph.value.scenes.find((scene) => scene.threadId === threadId) ?? null;
    selectedSceneId.value = firstScene?.id ?? null;
}

/**
 * 选中场景，并同步线程。
 */
function selectScene(sceneId: string | null): void {
    selectedSceneId.value = sceneId;

    if (sceneId === null) {
        return;
    }

    const scene = sceneMap.value.get(sceneId);

    if (!scene) {
        return;
    }

    selectedThreadId.value = scene.threadId;
}

/**
 * 接收树图编辑结果。
 */
function updateGraph(nextGraph: PlotTreeGraph): void {
    graph.value = clonePlotTreeGraph(nextGraph);
}

/**
 * 重置独立测试页状态。
 */
function resetWorkspace(): void {
    graph.value = clonePlotTreeGraph(plotTreePreviewGraph);
    selectedThreadId.value = "thread-main";
    selectedSceneId.value = "scene-cage";
    renderRevision.value += 1;
}
</script>

<template>
    <!-- PlotTree 独立测试工作区 -->
    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <!-- 左侧树图区域 -->
        <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-3">
                <div>
                    <div class="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Tree Preview Controls</div>
                    <div class="mt-1 text-sm text-[var(--text-secondary)]">当前测试数据覆盖主线推进、跨线程入口 fork、游离 Scene，以及 toolbar 手动布局。</div>
                </div>

                <button
                    type="button"
                    class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                    @click="resetWorkspace"
                >
                    重置树图状态
                </button>
            </div>

            <PlotTreeView
                :key="renderRevision"
                :graph="graph"
                :selected-thread-id="selectedThreadId"
                :selected-scene-id="selectedSceneId"
                @select-thread="selectThread"
                @select-scene="selectScene"
                @update:graph="updateGraph"
            />
        </div>

        <!-- 右侧检查器 -->
        <aside class="space-y-4">
            <section class="rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-4 shadow-[0_18px_50px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
                <div class="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Inspector</div>
                <div class="mt-3 text-lg font-semibold text-[var(--text-main)]">
                    {{ selectedScene?.title ?? selectedThread?.title ?? "未选中节点" }}
                </div>

                <template v-if="selectedScene">
                    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1 text-[var(--text-muted)]">
                            所属线程：{{ selectedThread?.title ?? "游离 Scene" }}
                        </span>
                        <span class="rounded-full border px-3 py-1" :class="selectedScene.isMainBranch ? 'border-[var(--border-accent)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)]'">
                            {{ selectedScene.isMainBranch ? "主线分支" : "支线分支" }}
                        </span>
                    </div>

                    <div class="mt-4 text-sm leading-7 text-[var(--text-secondary)]">{{ selectedScene.summary }}</div>

                    <div class="mt-4 grid gap-3">
                        <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-3">
                            <div class="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">来源</div>
                            <div class="mt-1 text-sm text-[var(--text-main)]">
                                {{ selectedScene.sourceId === null ? "无连线" : (selectedScene.sourceId === "plot-root-start" ? "主线开始节点" : selectedScene.sourceId) }}
                            </div>
                        </div>
                        <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-3">
                            <div class="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">挂章</div>
                            <div class="mt-1 text-sm text-[var(--text-main)]">{{ selectedScene.chapterLabel ?? "未挂章" }}</div>
                        </div>
                    </div>
                </template>

                <template v-else-if="selectedThread">
                    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span class="rounded-full border px-3 py-1" :class="selectedThread.isMainThread ? 'border-[var(--border-accent)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)]'">
                            {{ selectedThread.isMainThread ? "主线 Thread" : "支线 Thread" }}
                        </span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1 text-[var(--text-muted)]">
                            {{ selectedThread.status }}
                        </span>
                    </div>

                    <div class="mt-4 text-sm leading-7 text-[var(--text-secondary)]">{{ selectedThread.summary }}</div>
                </template>
            </section>
        </aside>
    </div>
</template>
