<script setup lang="ts">
import {
    ToolbarRoot,
    ToolbarSeparator,
} from "reka-ui";

const props = withDefaults(defineProps<{
    orientation?: "horizontal" | "vertical";
    ariaLabel?: string;
}>(), {
    orientation: "horizontal",
    ariaLabel: "工具栏",
});
</script>

<template>
    <ToolbarRoot
        :orientation="props.orientation"
        :aria-label="props.ariaLabel"
        class="flex items-center gap-1 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--text-main)_10%,transparent)] bg-[var(--bg-panel)] p-1 shadow-sm select-none"
        :class="props.orientation === 'vertical' ? 'flex-col w-max' : 'flex-row w-max max-w-full overflow-x-auto'"
    >
        <slot />
    </ToolbarRoot>
</template>
