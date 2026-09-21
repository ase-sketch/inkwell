<script setup lang="ts">
import {
    ToggleGroupItem,
    ToggleGroupRoot,
} from "reka-ui";

export interface ToggleGroupOption {
    value: string;
    label?: string;
    iconClass?: string;
    title?: string;
    disabled?: boolean;
}

export type ToggleGroupSize = "sm" | "md" | "lg";

const props = withDefaults(defineProps<{
    modelValue?: string | string[];
    defaultValue?: string | string[];
    type?: "single" | "multiple";
    disabled?: boolean;
    size?: ToggleGroupSize;
    orientation?: "horizontal" | "vertical";
    options?: ToggleGroupOption[];
}>(), {
    modelValue: undefined,
    defaultValue: undefined,
    type: "single",
    disabled: false,
    size: "md",
    orientation: "horizontal",
    options: () => [],
});

const emit = defineEmits<{
    (e: "update:modelValue", value: string | string[]): void;
}>();

function sizeClass(): string {
    if (props.size === "sm") return "h-6 px-2 text-[12px] min-w-[24px] gap-1";
    if (props.size === "lg") return "h-8 px-3 text-[14px] min-w-[32px] gap-2";
    return "h-7 px-2.5 text-[13px] min-w-[28px] gap-1.5";
}
</script>

<template>
    <ToggleGroupRoot
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :type="props.type as any"
        :disabled="props.disabled"
        :orientation="props.orientation"
        class="inline-flex items-center gap-0.5 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--text-main)_10%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_4%,transparent)] p-0.5 select-none"
        :class="props.orientation === 'vertical' ? 'flex-col' : 'flex-row'"
        @update:model-value="(val) => emit('update:modelValue', val as any)"
    >
        <template v-if="props.options.length > 0">
            <ToggleGroupItem
                v-for="opt in props.options"
                :key="opt.value"
                :value="opt.value"
                :disabled="opt.disabled"
                :title="opt.title || opt.label"
                class="nb-ui-focus-ring inline-flex items-center justify-center rounded-[calc(var(--radius-control)-2px)] font-medium text-[var(--text-secondary)] transition-[background-color,color,transform,box-shadow] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] not-disabled:active:scale-[0.96] hover:bg-[color-mix(in_srgb,var(--text-main)_8%,transparent)] hover:text-[var(--text-main)] data-[state=on]:bg-[var(--bg-panel)] data-[state=on]:text-[var(--accent-main)] data-[state=on]:shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:active:transform-none"
                :class="sizeClass()"
            >
                <span v-if="opt.iconClass" :class="opt.iconClass" class="h-3.5 w-3.5 shrink-0 transition-transform" aria-hidden="true"></span>
                <span v-if="opt.label">{{ opt.label }}</span>
            </ToggleGroupItem>
        </template>
        <template v-else>
            <slot />
        </template>
    </ToggleGroupRoot>
</template>
