<script setup lang="ts">
import {
    AspectRatio,
} from "reka-ui";

const props = withDefaults(defineProps<{
    ratio?: number;
}>(), {
    ratio: 16 / 9,
});
</script>

<template>
    <AspectRatio
        :ratio="props.ratio"
        class="overflow-hidden"
    >
        <slot />
    </AspectRatio>
</template>
