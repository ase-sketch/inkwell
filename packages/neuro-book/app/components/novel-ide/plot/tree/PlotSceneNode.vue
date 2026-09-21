<script setup lang="ts">
import {Handle, Position} from "@vue-flow/core";
import {computed} from "vue";
import type {NodeProps} from "@vue-flow/core";
import {
    PLOT_TREE_ORPHAN_SCENE_STYLE,
    PLOT_TREE_TONE_STYLES,
    type PlotTreeSceneNodeData,
} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";

const props = defineProps<NodeProps<PlotTreeSceneNodeData>>();

/**
 * 当前 Scene 的线程色带样式。
 * 游离 Scene 使用中性样式。
 */
const toneStyle = computed(() => {
    return props.data.thread
        ? PLOT_TREE_TONE_STYLES[props.data.thread.tone]
        : PLOT_TREE_ORPHAN_SCENE_STYLE;
});

/**
 * 当前 Scene 的分支说明。
 */
const branchLabel = computed(() => {
    return props.data.branchRole === "main" ? "主线分支" : "支线分支";
});

/**
 * 当前 Scene 是否为游离节点。
 */
const isOrphan = computed(() => {
    return props.data.scene.threadId === null;
});
</script>

<template>
    <!-- Scene 节点 -->
    <div
        class="relative w-[224px] rounded-[22px] border bg-[var(--bg-panel)] px-4 py-3 shadow-[0_14px_30px_color-mix(in_srgb,var(--shadow-color)_10%,transparent)] transition-shadow"
        :class="[
            props.data.branchRole === 'main'
                ? 'border-[var(--border-accent)] shadow-[0_14px_34px_color-mix(in_srgb,var(--accent-main)_16%,transparent)]'
                : toneStyle.border,
        ]"
    >
        <Handle type="target" :position="Position.Left" class="!h-3 !w-3 !border-[var(--border-strong)] !bg-[var(--border-strong)]" />
        <Handle type="source" :position="Position.Right" class="!h-3 !w-3 !border-[var(--accent-main)] !bg-[var(--accent-main)]" />

        <!-- Scene 标签 -->
        <div class="flex items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
                <span
                    class="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                    :class="props.data.branchRole === 'main' ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]' : toneStyle.chip"
                >
                    {{ branchLabel }}
                </span>
                <span
                    v-if="isOrphan"
                    class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1 text-[10px] text-[var(--text-muted)]"
                >
                    游离 Scene
                </span>
            </div>
            <span class="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{{ props.data.scene.status }}</span>
        </div>

        <!-- Scene 内容 -->
        <div class="mt-3 text-sm font-semibold leading-6 text-[var(--text-main)]">{{ props.data.scene.title }}</div>
        <div class="mt-2 line-clamp-3 text-xs leading-6 text-[var(--text-secondary)]">{{ props.data.scene.summary }}</div>

        <!-- Scene 底部元信息 -->
        <div class="mt-4 flex flex-wrap items-center gap-2">
            <span
                v-if="props.data.scene.chapterLabel"
                class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1 text-[10px] text-[var(--text-muted)]"
            >
                {{ props.data.scene.chapterLabel }}
            </span>
            <span
                v-if="props.data.thread"
                class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1 text-[10px] text-[var(--text-muted)]"
            >
                {{ props.data.thread.title }}
            </span>
            <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1 text-[10px] text-[var(--text-muted)]">
                子节点 {{ props.data.childCount }}
            </span>
        </div>

        <!-- Scene 工具条 -->
        <div
            v-if="props.data.editable"
            class="nodrag nopan mt-4 grid grid-cols-2 gap-2"
        >
            <button
                type="button"
                class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                @click.stop="props.data.actions.addChildScene(props.data.scene.id)"
            >
                新增子 Scene
            </button>
            <button
                type="button"
                class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                @click.stop="props.data.actions.toggleSceneBranch(props.data.scene.id)"
            >
                {{ props.data.scene.isMainBranch ? "改为支线" : "改为主线" }}
            </button>
            <button
                type="button"
                class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                @click.stop="props.data.actions.detachScene(props.data.scene.id)"
            >
                {{ isOrphan ? "断开连线" : "脱离 Thread" }}
            </button>
            <button
                type="button"
                class="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-xs text-[var(--status-danger)] transition-colors hover:bg-[var(--bg-hover)]"
                @click.stop="props.data.actions.deleteScene(props.data.scene.id)"
            >
                删除 Scene
            </button>
        </div>
    </div>
</template>
