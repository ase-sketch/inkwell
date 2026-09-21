<script setup lang="ts">
import {computed} from "vue";
import type {NodeProps} from "@vue-flow/core";
import {
    PLOT_TREE_TONE_STYLES,
    type PlotTreeThreadNodeData,
} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";

const props = defineProps<NodeProps<PlotTreeThreadNodeData>>();

/**
 * 线程组色带样式。
 */
const toneStyle = computed(() => {
    return PLOT_TREE_TONE_STYLES[props.data.thread.tone];
});

/**
 * 当前线程是否允许删除。
 */
const canDelete = computed(() => {
    return props.data.metrics.sceneCount === 0;
});
</script>

<template>
    <!-- Thread Group 节点 -->
    <div
        class="h-full w-full rounded-[28px] border border-dashed bg-[var(--bg-panel)]/82 p-4 shadow-[0_18px_50px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)] backdrop-blur-sm"
        :class="[
            toneStyle.border,
            props.data.thread.isMainThread ? 'ring-1 ring-[var(--border-accent)]' : '',
        ]"
    >
        <!-- Thread 头部 -->
        <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                    <span
                        class="rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em]"
                        :class="props.data.thread.isMainThread ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]' : toneStyle.chip"
                    >
                        {{ props.data.thread.isMainThread ? "主线 Thread" : "支线 Thread" }}
                    </span>
                    <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
                        {{ props.data.thread.status }}
                    </span>
                </div>

                <div class="mt-3 text-base font-semibold leading-6 text-[var(--text-main)]">{{ props.data.thread.title }}</div>
                <div class="mt-2 max-w-[520px] text-sm leading-6 text-[var(--text-secondary)]">
                    {{ props.data.thread.summary }}
                </div>
            </div>

            <div class="grid shrink-0 grid-cols-2 gap-2">
                <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-right">
                    <div class="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Scene</div>
                    <div class="mt-1 text-sm font-semibold text-[var(--text-main)]">{{ props.data.metrics.sceneCount }}</div>
                </div>
                <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-right">
                    <div class="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Main</div>
                    <div class="mt-1 text-sm font-semibold text-[var(--text-main)]">{{ props.data.metrics.mainBranchSceneCount }}</div>
                </div>
            </div>
        </div>

        <!-- Thread 工具条 -->
        <div
            v-if="props.data.editable"
            class="nodrag nopan mt-4 flex flex-wrap items-center gap-2"
        >
            <button
                type="button"
                class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                @click.stop="props.data.actions.addScene(props.data.thread.id)"
            >
                新增 Scene
            </button>
            <button
                type="button"
                class="rounded-xl border px-3 py-1.5 text-xs transition-colors"
                :class="canDelete
                    ? 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger)] hover:bg-[var(--bg-hover)]'
                    : 'cursor-not-allowed border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)] opacity-60'"
                :disabled="!canDelete"
                @click.stop="props.data.actions.deleteThread(props.data.thread.id)"
            >
                删除空 Thread
            </button>
        </div>

        <!-- Thread 内部说明 -->
        <div class="pointer-events-none mt-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
            <span class="h-px flex-1 bg-[var(--border-color)]"></span>
            <span>Scene Group</span>
            <span class="h-px flex-1 bg-[var(--border-color)]"></span>
        </div>
    </div>
</template>
