<script setup lang="ts">
import type {LowCodeFieldDto, LowCodeJsonValue} from "nbook/shared/dto/low-code-form.dto";

const props = withDefaults(defineProps<{
    field: LowCodeFieldDto;
    modelValue?: LowCodeJsonValue;
    disabled?: boolean;
}>(), {
    modelValue: () => [],
    disabled: false,
});
const emit = defineEmits<{
    (e: "update:modelValue", value: LowCodeJsonValue): void;
}>();

const selectedValues = computed(() => Array.isArray(props.modelValue) ? props.modelValue : []);

/**
 * 切换多选项；checkbox 语义只保存 string/number option value。
 */
function toggleValue(value: LowCodeJsonValue): void {
    if (typeof value !== "string" && typeof value !== "number") {
        return;
    }
    const exists = selectedValues.value.some((item) => item === value);
    emit("update:modelValue", exists
        ? selectedValues.value.filter((item) => item !== value)
        : [...selectedValues.value, value]);
}
</script>

<template>
    <div class="grid gap-2 sm:grid-cols-2">
        <label
            v-for="option in props.field.options"
            :key="`${typeof option.value}:${String(option.value)}`"
            class="flex min-h-8 items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 text-xs text-[var(--text-secondary)]"
            :class="props.disabled || option.disabled ? 'opacity-60' : 'cursor-pointer hover:bg-[var(--bg-hover)]'"
        >
            <input
                type="checkbox"
                class="h-3.5 w-3.5 accent-[var(--accent-main)]"
                :checked="selectedValues.some((item) => item === option.value)"
                :disabled="props.disabled || option.disabled"
                @change="toggleValue(option.value)"
            >
            <span class="min-w-0">
                <span class="block truncate">{{ option.label }}</span>
                <span v-if="option.description" class="mt-0.5 block truncate text-[10px] text-[var(--text-muted)]">{{ option.description }}</span>
            </span>
        </label>
    </div>
</template>
