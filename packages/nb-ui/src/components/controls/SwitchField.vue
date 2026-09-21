<script setup lang="ts">
const props = withDefaults(defineProps<{
    modelValue: boolean;
    label: string;
    description?: string;
    disabled?: boolean;
}>(), {
    description: "",
    disabled: false,
});

const emit = defineEmits<{
    (e: "update:modelValue", value: boolean): void;
}>();
</script>

<template>
    <!-- 紧凑开关字段；轨道/滑球尺寸从 --control-h-sm 推导（对照页 sc-switch 配方） -->
    <button
        type="button"
        role="switch"
        class="nb-ui-focus-ring group flex w-full items-center justify-between gap-[var(--space-4)] rounded-[var(--radius-control)] border-[length:var(--border-w)] border-[color:var(--control-outline)] bg-[var(--control-surface)] px-[var(--control-px)] py-[var(--space-2)] text-left transition-[background-color,border-color,box-shadow] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        :disabled="props.disabled"
        :aria-checked="props.modelValue"
        @click="emit('update:modelValue', !props.modelValue)"
    >
        <span class="min-w-0">
            <span class="block text-[var(--text-sm)] [font-weight:var(--weight-medium)] text-[var(--text-main)] transition-colors">{{ props.label }}</span>
            <span v-if="props.description" class="mt-0.5 block text-[var(--text-xs)] text-[var(--text-muted)]">{{ props.description }}</span>
        </span>
        <span
            class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-[var(--radius-pill)] border-[length:var(--border-w)] p-0.5 transition-[background-color,border-color,box-shadow] [transition-duration:var(--motion-base)] [transition-timing-function:var(--ease-standard)]"
            :class="props.modelValue ? 'border-[color:var(--accent-main)] bg-[var(--accent-main)] shadow-[0_0_8px_color-mix(in_srgb,var(--accent-main)_35%,transparent)]' : 'border-[color:var(--control-outline)] bg-[color-mix(in_srgb,var(--text-main)_16%,transparent)]'"
        >
            <span
                class="pointer-events-none block h-4 w-4 rounded-[var(--radius-pill)] bg-[var(--text-inverse)] shadow-[0_1px_2px_color-mix(in_srgb,var(--shadow-color)_25%,transparent)] transition-transform [transition-duration:var(--motion-base)] [transition-timing-function:var(--ease-standard)] will-change-transform translate-x-0 group-not-disabled:group-active:scale-x-110"
                :class="props.modelValue ? 'translate-x-4' : 'translate-x-0'"
            />
        </span>
    </button>
</template>
