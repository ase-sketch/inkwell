<script setup lang="ts">
import {
    StepperDescription,
    StepperIndicator,
    StepperItem,
    StepperRoot,
    StepperSeparator,
    StepperTitle,
    StepperTrigger,
} from "reka-ui";

export interface StepperStepData {
    step: number;
    title: string;
    description?: string;
    iconClass?: string;
    disabled?: boolean;
}

const props = withDefaults(defineProps<{
    modelValue?: number;
    defaultValue?: number;
    steps?: StepperStepData[];
    orientation?: "horizontal" | "vertical";
    linear?: boolean;
    disabled?: boolean;
}>(), {
    modelValue: undefined,
    defaultValue: 1,
    steps: () => [],
    orientation: "horizontal",
    linear: false,
    disabled: false,
});

const emit = defineEmits<{
    (e: "update:modelValue", value: number): void;
}>();
</script>

<template>
    <StepperRoot
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :orientation="props.orientation"
        :linear="props.linear"
        :disabled="props.disabled"
        class="flex gap-2 select-none"
        :class="props.orientation === 'vertical' ? 'flex-col' : 'flex-row items-center w-full justify-between'"
        @update:model-value="(val) => emit('update:modelValue', (val as number) || 1)"
    >
        <StepperItem
            v-for="(item, index) in props.steps"
            :key="item.step"
            :step="item.step"
            :disabled="item.disabled || props.disabled"
            class="group relative flex items-center gap-3"
            :class="props.orientation === 'horizontal' ? 'flex-1 last:flex-initial' : ''"
        >
            <StepperTrigger class="nb-ui-focus-ring flex items-center gap-3 rounded-[var(--radius-control)] p-1.5 text-left transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] not-disabled:active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:active:transform-none">
                <!-- 指示圈 / 编号 / 图标 -->
                <StepperIndicator class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--text-main)_20%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] text-xs font-semibold text-[var(--text-secondary)] transition-[border-color,background-color,color,box-shadow,transform] [transition-duration:var(--motion-base)] [transition-timing-function:var(--ease-standard)] group-data-[state=active]:border-[var(--accent-main)] group-data-[state=active]:bg-[var(--accent-main)] group-data-[state=active]:text-[var(--text-inverse)] group-data-[state=active]:shadow-[0_0_12px_color-mix(in_srgb,var(--accent-main)_40%,transparent)] group-data-[state=completed]:border-[var(--status-success)] group-data-[state=completed]:bg-[var(--status-success)] group-data-[state=completed]:text-[var(--text-inverse)]">
                    <span v-if="item.iconClass" :class="[item.iconClass, 'h-4 w-4 transition-transform']" aria-hidden="true" />
                    <span v-else-if="index < ((props.modelValue ?? props.defaultValue) - 1)" class="i-lucide-check h-4 w-4 transition-transform [transition-duration:var(--motion-fast)]" aria-hidden="true" />
                    <span v-else>{{ item.step }}</span>
                </StepperIndicator>

                <!-- 标题与副标题 -->
                <div class="flex flex-col">
                    <StepperTitle class="text-xs font-semibold text-[var(--text-main)] group-data-[state=active]:text-[var(--accent-main)] transition-colors">
                        {{ item.title }}
                    </StepperTitle>
                    <StepperDescription v-if="item.description" class="text-[11px] text-[var(--text-muted)]">
                        {{ item.description }}
                    </StepperDescription>
                </div>
            </StepperTrigger>

            <!-- 步骤间的连接线 -->
            <StepperSeparator
                v-if="index < props.steps.length - 1"
                class="bg-[color-mix(in_srgb,var(--text-main)_12%,transparent)] transition-colors [transition-duration:var(--motion-base)] [transition-timing-function:var(--ease-standard)] group-data-[state=completed]:bg-[var(--status-success)]"
                :class="props.orientation === 'vertical' ? 'ml-5 h-6 w-0.5' : 'h-0.5 flex-1 mx-2'"
            />
        </StepperItem>
    </StepperRoot>
</template>
