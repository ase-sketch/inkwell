<script setup lang="ts">
const props = withDefaults(defineProps<{
    editable?: boolean;
}>(), {
    editable: true,
});

const emit = defineEmits<{
    (e: "addThread"): void;
    (e: "addOrphanScene"): void;
    (e: "autoLayout"): void;
    (e: "fitView"): void;
}>();

/**
 * 统一的 toolbar 按钮样式。
 */
const buttonClass = "rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]";
</script>

<template>
    <!-- PlotTree 工具条 -->
    <div class="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)]/95 px-3 py-2 shadow-[0_10px_30px_color-mix(in_srgb,var(--shadow-color)_12%,transparent)] backdrop-blur">
        <button
            v-if="props.editable"
            type="button"
            :class="buttonClass"
            @click="emit('addThread')"
        >
            新建 Thread
        </button>
        <button
            v-if="props.editable"
            type="button"
            :class="buttonClass"
            @click="emit('addOrphanScene')"
        >
            新建游离 Scene
        </button>
        <button
            v-if="props.editable"
            type="button"
            :class="buttonClass"
            @click="emit('autoLayout')"
        >
            自动布局
        </button>
        <button
            type="button"
            :class="buttonClass"
            @click="emit('fitView')"
        >
            Fit View
        </button>
    </div>
</template>
