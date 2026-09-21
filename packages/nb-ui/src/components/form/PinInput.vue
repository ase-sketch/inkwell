<script setup lang="ts">
import {
    PinInputInput,
    PinInputRoot,
} from "reka-ui";

const props = withDefaults(defineProps<{
    modelValue?: string[];
    defaultValue?: string[];
    length?: number;
    type?: "text" | "number";
    placeholder?: string;
    disabled?: boolean;
    mask?: boolean;
}>(), {
    modelValue: undefined,
    defaultValue: () => [],
    length: 6,
    type: "number",
    placeholder: "○",
    disabled: false,
    mask: false,
});

const emit = defineEmits<{
    (e: "update:modelValue", value: string[]): void;
    (e: "complete", value: string[]): void;
}>();
</script>

<template>
    <PinInputRoot
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :type="props.type"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        :mask="props.mask"
        class="flex items-center gap-2 select-none"
        @update:model-value="(val) => emit('update:modelValue', val)"
        @complete="(val) => emit('complete', val)"
    >
        <PinInputInput
            v-for="(id, index) in props.length"
            :key="id"
            :index="index"
            class="nb-ui-native-input nb-ui-focus-ring flex h-10 w-9 items-center justify-center rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--text-main)_18%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_4%,transparent)] text-center text-[var(--text-md)] font-mono font-medium text-[var(--text-main)] transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] focus:border-[var(--accent-main)] focus:bg-[var(--bg-panel)] focus:scale-[1.04] disabled:cursor-not-allowed disabled:opacity-40 disabled:focus:scale-100"
        />
    </PinInputRoot>
</template>
