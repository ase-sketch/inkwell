<script setup lang="ts">
import type {PlotPreviewView} from "nbook/app/components/novel-ide/plot/plot-preview.types";

type ViewItem = {
    value: PlotPreviewView;
    label: string;
    hint: string;
    iconClass: string;
};

const props = defineProps<{
    modelValue: PlotPreviewView;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: PlotPreviewView): void;
}>();

const viewItems: ViewItem[] = [
    {value: "locator", label: "线索", hint: "找 Thread", iconClass: "i-lucide-compass"},
    {value: "thread", label: "线程", hint: "排 Scene", iconClass: "i-lucide-waypoints"},
    {value: "chapter", label: "章节", hint: "排节奏", iconClass: "i-lucide-book-copy"},
    {value: "tree", label: "树图", hint: "看全局", iconClass: "i-lucide-git-branch-plus"},
];
</script>

<template>
    <!-- 剧情模块视图切换器 -->
    <div class="rounded-[20px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-2 shadow-[0_12px_36px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
        <div class="grid gap-2 md:grid-cols-4">
            <button
                v-for="item in viewItems"
                :key="item.value"
                type="button"
                class="flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all"
                :class="props.modelValue === item.value
                    ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                @click="emit('update:modelValue', item.value)"
            >
                <span :class="item.iconClass" class="h-5 w-5 shrink-0"></span>
                <span class="min-w-0">
                    <span class="block text-sm font-semibold">{{ item.label }}</span>
                    <span class="mt-0.5 block text-[11px] uppercase tracking-[0.16em] opacity-80">{{ item.hint }}</span>
                </span>
            </button>
        </div>
    </div>
</template>
