<script setup lang="ts">
import {
    RangeCalendarCell,
    RangeCalendarCellTrigger,
    RangeCalendarGrid,
    RangeCalendarGridBody,
    RangeCalendarGridHead,
    RangeCalendarGridRow,
    RangeCalendarHeadCell,
    RangeCalendarHeader,
    RangeCalendarHeading,
    RangeCalendarNext,
    RangeCalendarPrev,
    RangeCalendarRoot,
    type DateRange,
    type DateValue,
} from "reka-ui";

const props = withDefaults(defineProps<{
    modelValue?: DateRange;
    defaultValue?: DateRange;
    disabled?: boolean;
    readonly?: boolean;
    locale?: string;
    weekdayFormat?: "narrow" | "short" | "long";
}>(), {
    modelValue: undefined,
    defaultValue: () => ({start: undefined, end: undefined}),
    disabled: false,
    readonly: false,
    locale: "zh-CN",
    weekdayFormat: "short",
});

const emit = defineEmits<{
    (e: "update:modelValue", value: DateRange): void;
}>();
</script>

<template>
    <RangeCalendarRoot
        v-slot="{ grid, weekDays }"
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :disabled="props.disabled"
        :readonly="props.readonly"
        :locale="props.locale"
        :weekday-format="props.weekdayFormat"
        class="inline-block rounded-[var(--radius-panel)] border border-[color-mix(in_srgb,var(--text-main)_10%,transparent)] bg-[var(--bg-panel)] p-3 shadow-sm select-none"
        @update:model-value="(val) => emit('update:modelValue', val as any)"
    >
        <!-- 日历头部（年/月与前后翻页） -->
        <RangeCalendarHeader class="flex items-center justify-between pb-2.5">
            <RangeCalendarPrev class="nb-ui-focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-[0.92] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:active:transform-none">
                <span class="i-lucide-chevron-left h-4 w-4" aria-hidden="true" />
            </RangeCalendarPrev>

            <RangeCalendarHeading class="text-[var(--text-sm)] font-semibold text-[var(--text-main)]" />

            <RangeCalendarNext class="nb-ui-focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-[0.92] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:active:transform-none">
                <span class="i-lucide-chevron-right h-4 w-4" aria-hidden="true" />
            </RangeCalendarNext>
        </RangeCalendarHeader>

        <!-- 日历网格 -->
        <div class="flex flex-col gap-4 pt-1">
            <RangeCalendarGrid
                v-for="month in grid"
                :key="month.value.toString()"
                class="w-full border-collapse space-y-1"
            >
                <RangeCalendarGridHead>
                    <RangeCalendarGridRow class="flex w-full">
                        <RangeCalendarHeadCell
                            v-for="day in weekDays"
                            :key="day"
                            class="flex h-8 w-8 items-center justify-center text-[var(--text-xs)] font-medium text-[var(--text-muted)]"
                        >
                            {{ day }}
                        </RangeCalendarHeadCell>
                    </RangeCalendarGridRow>
                </RangeCalendarGridHead>

                <RangeCalendarGridBody class="space-y-1">
                    <RangeCalendarGridRow
                        v-for="(weekDates, weekIndex) in month.rows"
                        :key="`week-${weekIndex}`"
                        class="flex w-full"
                    >
                        <RangeCalendarCell
                            v-for="weekDate in weekDates"
                            :key="weekDate.toString()"
                            :date="weekDate"
                            class="relative flex h-8 w-8 items-center justify-center p-0 text-center"
                        >
                            <RangeCalendarCellTrigger
                                :day="weekDate"
                                :month="month.value"
                                class="nb-ui-focus-ring flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-sm)] font-normal text-[var(--text-main)] transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] not-disabled:active:scale-[0.94] data-[selected]:bg-[var(--accent-main)] data-[selected]:text-[var(--text-inverse)] data-[selected]:font-medium data-[highlighted]:bg-[color-mix(in_srgb,var(--accent-main)_20%,transparent)] data-[highlighted]:text-[var(--accent-main)] data-[selection-start]:rounded-l-[var(--radius-control)] data-[selection-end]:rounded-r-[var(--radius-control)] data-[today]:font-bold data-[today]:text-[var(--accent-main)] data-[today][data-selected]:text-[var(--text-inverse)] data-[disabled]:opacity-30 data-[disabled]:cursor-not-allowed data-[disabled]:active:transform-none data-[outside-view]:text-[var(--text-muted)] data-[outside-view]:opacity-35 cursor-pointer"
                            />
                        </RangeCalendarCell>
                    </RangeCalendarGridRow>
                </RangeCalendarGridBody>
            </RangeCalendarGrid>
        </div>
    </RangeCalendarRoot>
</template>
