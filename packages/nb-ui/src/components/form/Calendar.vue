<script setup lang="ts">
import {
    CalendarCell,
    CalendarCellTrigger,
    CalendarGrid,
    CalendarGridBody,
    CalendarGridHead,
    CalendarGridRow,
    CalendarHeadCell,
    CalendarHeader,
    CalendarHeading,
    CalendarNext,
    CalendarPrev,
    CalendarRoot,
    type DateValue,
} from "reka-ui";

const props = withDefaults(defineProps<{
    modelValue?: DateValue;
    defaultValue?: DateValue;
    disabled?: boolean;
    readonly?: boolean;
    locale?: string;
    weekdayFormat?: "narrow" | "short" | "long";
}>(), {
    modelValue: undefined,
    defaultValue: undefined,
    disabled: false,
    readonly: false,
    locale: "zh-CN",
    weekdayFormat: "short",
});

const emit = defineEmits<{
    (e: "update:modelValue", value: DateValue | undefined): void;
}>();
</script>

<template>
    <CalendarRoot
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
        <CalendarHeader class="flex items-center justify-between pb-2.5">
            <CalendarPrev class="nb-ui-focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-[0.92] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:active:transform-none">
                <span class="i-lucide-chevron-left h-4 w-4" aria-hidden="true"></span>
            </CalendarPrev>

            <CalendarHeading class="text-[var(--text-sm)] font-semibold text-[var(--text-main)]" />

            <CalendarNext class="nb-ui-focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-secondary)] transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-[0.92] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:active:transform-none">
                <span class="i-lucide-chevron-right h-4 w-4" aria-hidden="true"></span>
            </CalendarNext>
        </CalendarHeader>

        <!-- 日历网格 -->
        <div class="flex flex-col gap-4 pt-1">
            <CalendarGrid
                v-for="month in grid"
                :key="month.value.toString()"
                class="w-full border-collapse space-y-1"
            >
                <CalendarGridHead>
                    <CalendarGridRow class="flex w-full">
                        <CalendarHeadCell
                            v-for="day in weekDays"
                            :key="day"
                            class="flex h-8 w-8 items-center justify-center text-[var(--text-xs)] font-medium text-[var(--text-muted)]"
                        >
                            {{ day }}
                        </CalendarHeadCell>
                    </CalendarGridRow>
                </CalendarGridHead>

                <CalendarGridBody class="space-y-1">
                    <CalendarGridRow
                        v-for="(weekDates, weekIndex) in month.rows"
                        :key="`week-${weekIndex}`"
                        class="flex w-full"
                    >
                        <CalendarCell
                            v-for="weekDate in weekDates"
                            :key="weekDate.toString()"
                            :date="weekDate"
                            class="relative flex h-8 w-8 items-center justify-center p-0 text-center"
                        >
                            <CalendarCellTrigger
                                :day="weekDate"
                                :month="month.value"
                                class="nb-ui-focus-ring flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-sm)] font-normal text-[var(--text-main)] transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] not-disabled:active:scale-[0.94] data-[selected]:bg-[var(--accent-main)] data-[selected]:text-[var(--text-inverse)] data-[selected]:font-medium data-[today]:font-bold data-[today]:text-[var(--accent-main)] data-[today][data-selected]:text-[var(--text-inverse)] data-[disabled]:opacity-30 data-[disabled]:cursor-not-allowed data-[disabled]:active:transform-none data-[outside-view]:text-[var(--text-muted)] data-[outside-view]:opacity-35 cursor-pointer"
                            />
                        </CalendarCell>
                    </CalendarGridRow>
                </CalendarGridBody>
            </CalendarGrid>
        </div>
    </CalendarRoot>
</template>
