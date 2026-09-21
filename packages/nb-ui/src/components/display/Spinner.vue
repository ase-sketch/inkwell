<script setup lang="ts">
import {computed} from "vue";

// 行内加载指示器：按钮外的局部加载态（面板、表格、页面区块）。
export type SpinnerSize = "sm" | "md" | "lg";

const props = withDefaults(defineProps<{
    size?: SpinnerSize;
    /** 无障碍名称；showLabel 为 true 时同时作为可见文字 */
    label?: string;
    showLabel?: boolean;
}>(), {
    size: "md",
    label: "加载中",
    showLabel: false,
});

const iconSizeClass = computed(() => {
    if (props.size === "sm") {
        return "h-[calc(var(--control-h-sm)*0.5)] w-[calc(var(--control-h-sm)*0.5)]";
    }
    if (props.size === "lg") {
        return "h-[var(--control-h-sm)] w-[var(--control-h-sm)]";
    }
    return "h-[calc(var(--control-h-sm)*0.64)] w-[calc(var(--control-h-sm)*0.64)]";
});
</script>

<template>
    <span role="status" :aria-label="props.label" class="inline-flex items-center gap-[var(--space-2)] text-[var(--text-muted)]">
        <span class="i-lucide-loader-2 shrink-0 animate-spin" :class="iconSizeClass"></span>
        <span v-if="props.showLabel" class="text-[var(--text-sm)]">{{ props.label }}</span>
    </span>
</template>
