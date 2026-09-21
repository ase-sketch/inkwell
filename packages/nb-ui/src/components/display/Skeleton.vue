<script setup lang="ts">
import {computed} from "vue";

// 骨架占位：数据加载前的形状占位。shape 决定默认尺寸与圆角，width/height 可覆写。
export type SkeletonShape = "text" | "block" | "circle";

const props = withDefaults(defineProps<{
    shape?: SkeletonShape;
    /** CSS 宽度，如 "120px" / "60%"；空串使用 shape 默认 */
    width?: string;
    /** CSS 高度；空串使用 shape 默认 */
    height?: string;
}>(), {
    shape: "text",
    width: "",
    height: "",
});

const shapeClass = computed(() => {
    if (props.shape === "circle") {
        return "h-10 w-10 rounded-full";
    }
    if (props.shape === "block") {
        return "h-20 w-full rounded-[var(--radius-panel)]";
    }
    return "h-3.5 w-full rounded-[var(--radius-control)]";
});
</script>

<template>
    <span
        aria-hidden="true"
        class="block animate-pulse nb-shimmer bg-[var(--bg-hover)]"
        :class="shapeClass"
        :style="{width: props.width || undefined, height: props.height || undefined}"
    ></span>
</template>
