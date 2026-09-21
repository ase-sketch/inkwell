<script setup lang="ts">
import {
    Separator,
} from "reka-ui";

const props = withDefaults(defineProps<{
    orientation?: "horizontal" | "vertical";
    decorative?: boolean;
}>(), {
    orientation: "horizontal",
    decorative: true,
});
</script>

<template>
    <Separator
        :orientation="props.orientation"
        :decorative="props.decorative"
        class="shrink-0 bg-[var(--divider)]"
        :class="props.orientation === 'vertical' ? 'h-full w-[1px]' : 'h-[1px] w-full'"
    />
</template>
