<script setup lang="ts">
import type {LowCodeFieldDto, LowCodeJsonValue} from "nbook/shared/dto/low-code-form.dto";

const props = withDefaults(defineProps<{
    field: LowCodeFieldDto;
    modelValue?: LowCodeJsonValue;
    disabled?: boolean;
}>(), {
    modelValue: false,
    disabled: false,
});
const emit = defineEmits<{
    (e: "update:modelValue", value: LowCodeJsonValue): void;
}>();

const checked = computed(() => props.modelValue === true);
</script>

<template>
    <button
        type="button"
        class="relative h-6 w-11 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        :class="checked ? 'border-[var(--accent-main)] bg-[var(--accent-main)]' : 'border-[var(--border-color)] bg-[var(--bg-input)]'"
        :disabled="props.disabled"
        :aria-label="props.field.label"
        @click="emit('update:modelValue', !checked)"
    >
        <span class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform" :class="checked ? 'translate-x-5' : 'translate-x-0.5'"></span>
    </button>
</template>
