<script setup lang="ts">
import SegmentedControl from "nbook/app/components/common/form/SegmentedControl.vue";
import type {SegmentedControlValue} from "nbook/app/components/common/form/SegmentedControl.vue";
import type {LowCodeFieldDto, LowCodeJsonValue} from "nbook/shared/dto/low-code-form.dto";

const props = withDefaults(defineProps<{
    field: LowCodeFieldDto;
    modelValue?: LowCodeJsonValue;
    disabled?: boolean;
}>(), {
    modelValue: null,
    disabled: false,
});
const emit = defineEmits<{
    (e: "update:modelValue", value: LowCodeJsonValue): void;
}>();

const hasOptionDescription = computed(() => props.field.options.some((option) => option.description));

function updateValue(value: SegmentedControlValue): void {
    emit("update:modelValue", value);
}

function optionKey(value: LowCodeJsonValue): string {
    return `${typeof value}:${String(value)}`;
}
</script>

<template>
    <SegmentedControl
        v-if="!hasOptionDescription"
        :model-value="props.modelValue as SegmentedControlValue"
        :options="props.field.options.map((option) => ({...option, disabled: props.disabled || option.disabled}))"
        @update:model-value="updateValue"
    />
    <div v-else class="grid gap-2">
        <button
            v-for="option in props.field.options"
            :key="optionKey(option.value)"
            type="button"
            class="flex min-h-[44px] w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            :class="option.value === props.modelValue ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
            :disabled="props.disabled || option.disabled"
            @click="emit('update:modelValue', option.value)"
        >
            <span class="mt-1 h-2 w-2 shrink-0 rounded-full" :class="option.value === props.modelValue ? 'bg-[var(--accent-main)]' : 'bg-[var(--text-muted)]/45'"></span>
            <span class="min-w-0">
                <span class="block text-xs font-medium">{{ option.label }}</span>
                <span v-if="option.description" class="mt-1 block text-[11px] leading-4 text-[var(--text-muted)]">{{ option.description }}</span>
            </span>
        </button>
    </div>
</template>
