<script setup lang="ts">
import {computed} from "vue";
import {
    AvatarFallback,
    AvatarImage,
    AvatarRoot,
} from "reka-ui";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarShape = "circle" | "squircle";

const props = withDefaults(defineProps<{
    src?: string;
    alt?: string;
    fallback?: string;
    size?: AvatarSize;
    shape?: AvatarShape;
    delayMs?: number;
}>(), {
    src: "",
    alt: "",
    fallback: "",
    size: "md",
    shape: "squircle",
    delayMs: 300,
});

const sizeClass = computed(() => {
    if (props.size === "xs") return "h-5 w-5 text-[10px]";
    if (props.size === "sm") return "h-6.5 w-6.5 text-[11px]";
    if (props.size === "lg") return "h-10 w-10 text-[15px]";
    if (props.size === "xl") return "h-14 w-14 text-[20px]";
    return "h-8 w-8 text-[13px]";
});

const shapeClass = computed(() => {
    if (props.shape === "circle") return "rounded-full";
    if (props.size === "lg" || props.size === "xl") return "rounded-[var(--radius-panel)]";
    return "rounded-[var(--radius-control)]";
});
</script>

<template>
    <AvatarRoot
        class="relative inline-flex shrink-0 items-center justify-center overflow-hidden select-none border border-[color-mix(in_srgb,var(--text-main)_10%,transparent)] bg-[color-mix(in_srgb,var(--accent-main)_14%,transparent)] text-[var(--accent-main)] font-semibold transition-[transform,box-shadow,border-color] [transition-duration:var(--motion-base)] [transition-timing-function:var(--ease-standard)] hover:scale-105"
        :class="[sizeClass, shapeClass]"
    >
        <AvatarImage
            v-if="props.src"
            :src="props.src"
            :alt="props.alt || props.fallback"
            class="h-full w-full object-cover"
        />

        <AvatarFallback
            :delay-ms="props.src ? props.delayMs : undefined"
            class="flex h-full w-full items-center justify-center uppercase"
        >
            <slot name="fallback">
                {{ props.fallback || (props.alt ? props.alt.slice(0, 2) : "") }}
            </slot>
        </AvatarFallback>
    </AvatarRoot>
</template>
