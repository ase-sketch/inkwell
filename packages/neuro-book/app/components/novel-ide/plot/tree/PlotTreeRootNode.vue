<script setup lang="ts">
import {Handle, Position} from "@vue-flow/core";
import type {NodeProps} from "@vue-flow/core";
import type {PlotTreeRootNodeData} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";

const props = defineProps<NodeProps<PlotTreeRootNodeData>>();
</script>

<template>
    <!-- 主线开始节点 -->
    <div class="plot-tree-root-node relative w-[180px] rounded-[22px] border border-[var(--border-accent)] px-4 py-4 text-left text-[var(--text-main)] shadow-[0_16px_40px_color-mix(in_srgb,var(--accent-main)_18%,transparent)]">
        <Handle type="source" :position="Position.Right" class="!h-3 !w-3 !border-[var(--accent-main)] !bg-[var(--accent-main)]" />

        <div class="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--accent-text)]">Mainline Root</div>
        <div class="mt-2 text-base font-semibold leading-6">{{ props.data.title }}</div>
        <div class="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{{ props.data.subtitle }}</div>

        <div class="mt-4 grid grid-cols-2 gap-2">
            <div class="rounded-2xl bg-[var(--bg-panel)]/65 px-3 py-2">
                <div class="text-[10px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Thread</div>
                <div class="mt-1 text-sm font-semibold">{{ props.data.threadCount }}</div>
            </div>
            <div class="rounded-2xl bg-[var(--bg-panel)]/65 px-3 py-2">
                <div class="text-[10px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Scene</div>
                <div class="mt-1 text-sm font-semibold">{{ props.data.sceneCount }}</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.plot-tree-root-node {
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent-main) 18%, var(--bg-panel)),
        color-mix(in srgb, var(--accent-bg) 68%, var(--bg-panel))
    );
}
</style>
