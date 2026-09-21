<script setup lang="ts">
import {
    RatingItem,
    RatingRoot,
} from "reka-ui";

export type RatingSize = "sm" | "md" | "lg";

const props = withDefaults(defineProps<{
    modelValue?: number;
    defaultValue?: number;
    max?: number;
    disabled?: boolean;
    readonly?: boolean;
    allowHalf?: boolean;
    size?: RatingSize;
}>(), {
    modelValue: undefined,
    defaultValue: 0,
    max: 5,
    disabled: false,
    readonly: false,
    allowHalf: false,
    size: "md",
});

const emit = defineEmits<{
    (e: "update:modelValue", value: number): void;
}>();
</script>

<template>
    <RatingRoot
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :max="props.max"
        :disabled="props.disabled"
        :readonly="props.readonly"
        :allow-half="props.allowHalf"
        class="inline-flex items-center gap-1 select-none"
        @update:model-value="(val) => emit('update:modelValue', val)"
    >
        <RatingItem
            v-for="item in props.max"
            :key="item"
            :item="item"
            class="group relative flex items-center justify-center transition-transform [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:scale-115 active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:hover:scale-100"
            :class="[
                props.size === 'sm' ? 'h-4 w-4 text-xs' : '',
                props.size === 'md' ? 'h-5 w-5 text-sm' : '',
                props.size === 'lg' ? 'h-6 w-6 text-base' : '',
            ]"
        >
            <span
                class="i-lucide-star transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] text-[color-mix(in_srgb,var(--text-main)_20%,transparent)] group-data-[state=active]:text-[var(--status-warning)] group-data-[state=active]:fill-[var(--status-warning)] group-data-[state=highlighted]:text-[var(--status-warning)]"
                :class="[
                    props.size === 'sm' ? 'h-3.5 w-3.5' : '',
                    props.size === 'md' ? 'h-4.5 w-4.5' : '',
                    props.size === 'lg' ? 'h-5.5 w-5.5' : '',
                ]"
                aria-hidden="true"
            />
        </RatingItem>
    </RatingRoot>
</template>
