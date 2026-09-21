<script setup lang="ts">
import {
    CheckboxGroupRoot,
} from "reka-ui";
import FormCheckbox from "./FormCheckbox.vue";

export interface CheckboxOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
}

const props = withDefaults(defineProps<{
    modelValue?: string[];
    defaultValue?: string[];
    options?: CheckboxOption[];
    orientation?: "horizontal" | "vertical";
    disabled?: boolean;
}>(), {
    modelValue: undefined,
    defaultValue: () => [],
    options: () => [],
    orientation: "vertical",
    disabled: false,
});

const emit = defineEmits<{
    (e: "update:modelValue", value: string[]): void;
}>();

function isChecked(val: string): boolean {
    const list = props.modelValue ?? props.defaultValue;
    return list.includes(val);
}

function handleToggle(val: string, checked: boolean): void {
    const current = [...(props.modelValue ?? props.defaultValue)];
    const idx = current.indexOf(val);
    if (checked && idx === -1) {
        current.push(val);
    } else if (!checked && idx !== -1) {
        current.splice(idx, 1);
    }
    emit("update:modelValue", current);
}
</script>

<template>
    <CheckboxGroupRoot
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :disabled="props.disabled"
        :orientation="props.orientation"
        class="flex gap-3 select-none"
        :class="props.orientation === 'horizontal' ? 'flex-row flex-wrap items-center' : 'flex-col'"
        @update:model-value="(val) => emit('update:modelValue', val as string[])"
    >
        <div
            v-for="opt in props.options"
            :key="opt.value"
            class="flex items-start gap-2"
        >
            <FormCheckbox
                :model-value="isChecked(opt.value)"
                :label="opt.label"
                :description="opt.description"
                :disabled="props.disabled || opt.disabled"
                @update:model-value="handleToggle(opt.value, $event)"
            />
        </div>
    </CheckboxGroupRoot>
</template>
