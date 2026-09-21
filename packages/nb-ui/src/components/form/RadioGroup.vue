<script setup lang="ts">
import {
    RadioGroupIndicator,
    RadioGroupItem,
    RadioGroupRoot,
} from "reka-ui";

export interface RadioOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
}

export type RadioGroupSize = "sm" | "md";

const props = withDefaults(defineProps<{
    modelValue?: string;
    defaultValue?: string;
    name?: string;
    disabled?: boolean;
    required?: boolean;
    orientation?: "horizontal" | "vertical";
    size?: RadioGroupSize;
    options?: RadioOption[];
}>(), {
    modelValue: undefined,
    defaultValue: undefined,
    name: undefined,
    disabled: false,
    required: false,
    orientation: "vertical",
    size: "md",
    options: () => [],
});

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
}>();
</script>

<template>
    <RadioGroupRoot
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :name="props.name"
        :disabled="props.disabled"
        :required="props.required"
        :orientation="props.orientation"
        class="flex"
        :class="props.orientation === 'horizontal' ? 'flex-row flex-wrap gap-4' : 'flex-col gap-2.5'"
        @update:model-value="(val) => emit('update:modelValue', (val ?? '') as string)"
    >
        <template v-if="props.options.length > 0">
            <label
                v-for="option in props.options"
                :key="option.value"
                class="group flex items-start gap-2.5 cursor-pointer select-none"
                :class="[
                    (props.disabled || option.disabled) ? 'cursor-not-allowed opacity-45' : '',
                ]"
            >
                <RadioGroupItem
                    :value="option.value"
                    :disabled="option.disabled"
                    class="nb-ui-focus-ring relative flex shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--text-main)_20%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_8%,transparent)] transition-[background-color,border-color,transform,box-shadow] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:border-[var(--accent-main)] group-not-disabled:active:scale-[0.92] disabled:cursor-not-allowed disabled:active:transform-none data-[state=checked]:border-[var(--accent-main)] data-[state=checked]:bg-[var(--accent-main)]"
                    :class="[
                        props.size === 'sm' ? 'h-4 w-4 mt-0.5' : 'h-5 w-5 mt-0.5',
                    ]"
                >
                    <RadioGroupIndicator
                        class="flex items-center justify-center transition-transform [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                    >
                        <span
                            class="block rounded-full bg-[var(--text-inverse)] shadow-sm"
                            :class="props.size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'"
                        />
                    </RadioGroupIndicator>
                </RadioGroupItem>

                <div class="min-w-0 flex-1">
                    <span
                        class="block font-medium text-[var(--text-main)] leading-snug transition-colors"
                        :class="props.size === 'sm' ? 'text-[var(--text-xs)]' : 'text-[var(--text-sm)]'"
                    >{{ option.label }}</span>
                    <span
                        v-if="option.description"
                        class="block text-[var(--text-muted)] leading-tight mt-0.5"
                        :class="props.size === 'sm' ? 'text-[var(--text-2xs)]' : 'text-[var(--text-xs)]'"
                    >{{ option.description }}</span>
                </div>
            </label>
        </template>
        <template v-else>
            <slot />
        </template>
    </RadioGroupRoot>
</template>
