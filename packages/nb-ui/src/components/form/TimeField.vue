<script setup lang="ts">
import {
    TimeFieldInput,
    TimeFieldRoot,
    type TimeValue,
} from "reka-ui";

const props = withDefaults(defineProps<{
    modelValue?: TimeValue;
    defaultValue?: TimeValue;
    disabled?: boolean;
    readonly?: boolean;
    locale?: string;
    size?: "sm" | "md" | "lg";
}>(), {
    modelValue: undefined,
    defaultValue: undefined,
    disabled: false,
    readonly: false,
    locale: "zh-CN",
    size: "md",
});

const emit = defineEmits<{
    (e: "update:modelValue", value: TimeValue | undefined): void;
}>();
</script>

<template>
    <TimeFieldRoot
        v-slot="{ segments }"
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :disabled="props.disabled"
        :readonly="props.readonly"
        :locale="props.locale"
        class="nb-ui-control nb-ui-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] border bg-[var(--bg-panel)] px-2.5 font-mono select-none disabled:cursor-not-allowed disabled:opacity-40"
        :class="[
            props.size === 'sm' ? 'nb-ui-control-h-sm text-xs' : '',
            props.size === 'md' ? 'nb-ui-control-h-md text-sm' : '',
            props.size === 'lg' ? 'nb-ui-control-h-lg text-base' : '',
        ]"
        @update:model-value="(val) => emit('update:modelValue', val as any)"
    >
        <span class="i-lucide-clock text-[var(--text-muted)] mr-1 shrink-0" :class="props.size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'" aria-hidden="true" />
        <template v-for="item in segments" :key="item.part">
            <TimeFieldInput
                v-if="item.part !== 'literal'"
                :part="item.part"
                class="rounded-[calc(var(--radius-control)*0.5)] px-0.5 text-center text-[var(--text-main)] outline-none focus:bg-[var(--accent-main)] focus:text-[var(--text-inverse)]"
            >
                {{ item.value }}
            </TimeFieldInput>
            <span v-else class="text-[var(--text-muted)]">{{ item.value }}</span>
        </template>
    </TimeFieldRoot>
</template>
