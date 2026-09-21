<script setup lang="ts">
import {computed, ref, watch} from "vue";
import PlotTreeCanvas from "nbook/app/components/novel-ide/plot/tree/PlotTreeCanvas.vue";
import {clonePlotTreeGraph} from "nbook/app/components/novel-ide/plot/tree/plot-tree.graph";
import type {PlotTreeGraph} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";

const props = withDefaults(defineProps<{
    graph: PlotTreeGraph;
    selectedThreadId: string | null;
    selectedSceneId: string | null;
    editable?: boolean;
}>(), {
    editable: true,
});

const emit = defineEmits<{
    (e: "selectThread", threadId: string | null): void;
    (e: "selectScene", sceneId: string | null): void;
    (e: "update:graph", graph: PlotTreeGraph): void;
}>();

const localGraph = ref<PlotTreeGraph>(clonePlotTreeGraph(props.graph));

/**
 * 仅在外部 story 切换时重置本地 graph。
 * 拖拽和编辑期间不跟着父层来回同步，避免重新走整图构建。
 */
watch(() => props.graph.story.id, () => {
    localGraph.value = clonePlotTreeGraph(props.graph);
});

/**
 * 主线线程数量。
 */
const mainThreadCount = computed(() => {
    return localGraph.value.threads.filter((thread) => thread.isMainThread).length;
});

/**
 * 主线分支场景数量。
 */
const mainSceneCount = computed(() => {
    return localGraph.value.scenes.filter((scene) => scene.isMainBranch).length;
});

/**
 * 接收树图内部编辑结果。
 */
function handleGraphUpdate(graph: PlotTreeGraph): void {
    localGraph.value = clonePlotTreeGraph(graph);
    emit("update:graph", clonePlotTreeGraph(graph));
}
</script>

<template>
    <!-- PlotTreeView 外层壳 -->
    <div class="space-y-4">
        <!-- 顶部摘要 -->
        <section class="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] px-5 py-5 shadow-[0_18px_60px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div class="max-w-[880px]">
                    <div class="text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">Plot Tree</div>
                    <div class="mt-2 text-2xl font-semibold text-[var(--text-main)]">{{ localGraph.story.title }}</div>
                    <div class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        {{ localGraph.story.summary }}
                    </div>
                </div>

                <div class="grid gap-3 sm:grid-cols-3">
                    <div class="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3">
                        <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Thread</div>
                        <div class="mt-1 text-lg font-semibold text-[var(--text-main)]">{{ localGraph.threads.length }}</div>
                    </div>
                    <div class="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3">
                        <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Main Thread</div>
                        <div class="mt-1 text-lg font-semibold text-[var(--text-main)]">{{ mainThreadCount }}</div>
                    </div>
                    <div class="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3">
                        <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Main Scene</div>
                        <div class="mt-1 text-lg font-semibold text-[var(--text-main)]">{{ mainSceneCount }}</div>
                    </div>
                </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span class="rounded-full border border-[var(--border-accent)] bg-[var(--accent-bg)] px-3 py-1 text-[var(--accent-text)]">主线节点 / 主线连线</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1 text-[var(--text-muted)]">支线节点 / 支线连线</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1">默认从左向右延伸</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1">Thread 为 Group</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1">Thread 内 Scene 单链</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1">游离 Scene 可无连线</span>
            </div>
        </section>

        <!-- 树图画布 -->
        <PlotTreeCanvas
            :graph="localGraph"
            :selected-thread-id="props.selectedThreadId"
            :selected-scene-id="props.selectedSceneId"
            :editable="props.editable"
            @select-thread="emit('selectThread', $event)"
            @select-scene="emit('selectScene', $event)"
            @update:graph="handleGraphUpdate"
        />
    </div>
</template>
