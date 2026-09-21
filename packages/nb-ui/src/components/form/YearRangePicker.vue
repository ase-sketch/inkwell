<script setup lang="ts">
import {
    YearRangePickerCell,
    YearRangePickerCellTrigger,
    YearRangePickerGrid,
    YearRangePickerGridBody,
    YearRangePickerGridRow,
    YearRangePickerHeader,
    YearRangePickerHeading,
    YearRangePickerNext,
    YearRangePickerPrev,
    YearRangePickerRoot,
    type DateRange,
} from "reka-ui";

const props = withDefaults(defineProps<{
    modelValue?: DateRange;
    defaultValue?: DateRange;
    disabled?: boolean;
    readonly?: boolean;
    locale?: string;
}>(), {
    modelValue: undefined,
    defaultValue: () => ({start: undefined, end: undefined}),
    disabled: false,
    readonly: false,
    locale: "zh-CN",
});

const emit = defineEmits<{
    (e: "update:modelValue", value: DateRange): void;
}>();
</script>

<template>
    <YearRangePickerRoot
        v-slot="{ grid }"
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :disabled="props.disabled"
        :readonly="props.readonly"
        :locale="props.locale"
        class="inline-block rounded-[var(--radius-panel)] border border-[color-mix(in_srgb,var(--text-main)_10%,transparent)] bg-[var(--bg-panel)] p-3 shadow-sm select-none"
        @update:model-value="(val) => emit('update:modelValue', val as any)"
    >
        <YearRangePickerHeader class="flex items-center justify-between pb-2.5">
            <YearRangePickerPrev class="nb-ui-focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] hover:text-[var(--text-main)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">
                <span class="i-lucide-chevron-left h-4 w-4" aria-hidden="true" />
            </YearRangePickerPrev>

            <YearRangePickerHeading class="text-[var(--text-sm)] font-semibold text-[var(--text-main)]" />

            <YearRangePickerNext class="nb-ui-focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] hover:text-[var(--text-main)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">
                <span class="i-lucide-chevron-right h-4 w-4" aria-hidden="true" />
            </YearRangePickerNext>
        </YearRangePickerHeader>

        <div class="flex flex-col gap-2 pt-1">
            <YearRangePickerGrid class="w-full border-collapse space-y-1">
                <YearRangePickerGridBody class="space-y-1">
                    <YearRangePickerGridRow
                        v-for="(rowYears, rowIndex) in (grid as any).rows"
                        :key="`row-${rowIndex}`"
                        class="grid grid-cols-3 gap-1.5"
                    >
                        <YearRangePickerCell
                            v-for="yearDate in rowYears"
                            :key="yearDate.toString()"
                            :date="yearDate"
                            class="relative flex items-center justify-center p-0 text-center"
                        >
                            <YearRangePickerCellTrigger
                                :year="yearDate"
                                class="nb-ui-focus-ring flex h-9 w-full items-center justify-center rounded-[var(--radius-control)] px-2 text-[var(--text-xs)] font-medium text-[var(--text-main)] transition-[background-color,color] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] data-[selected]:bg-[var(--accent-main)] data-[selected]:text-[var(--text-inverse)] data-[highlighted]:bg-[color-mix(in_srgb,var(--accent-main)_20%,transparent)] data-[highlighted]:text-[var(--accent-main)] data-[disabled]:opacity-30 data-[disabled]:cursor-not-allowed cursor-pointer"
                            />
                        </YearRangePickerCell>
                    </YearRangePickerGridRow>
                </YearRangePickerGridBody>
            </YearRangePickerGrid>
        </div>
    </YearRangePickerRoot>
</template>
