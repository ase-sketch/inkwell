<script setup lang="ts">
import {computed} from "vue";
import {PLOT_TONE_STYLES} from "nbook/app/components/novel-ide/plot/plot-preview.types";
import type {PlotTimelineCard} from "nbook/app/components/novel-ide/plot/timeline/plot-timeline.types";

const props = defineProps<{
    card: PlotTimelineCard;
    tone: keyof typeof PLOT_TONE_STYLES;
    isMainThread: boolean;
    isSelected: boolean;
}>();

/**
 * 当前卡片的边框和高亮样式。
 */
const cardClass = computed(() => {
    if (props.isSelected) {
        return "border-[var(--accent-main)] bg-[var(--accent-bg)]/70 shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-main)_24%,transparent)]";
    }

    if (props.isMainThread) {
        return "border-[var(--border-accent)] bg-[var(--accent-bg)]";
    }

    return `${PLOT_TONE_STYLES[props.tone].borderClass} bg-[var(--bg-panel)]`;
});
</script>

<template>
    <!-- 时间轴 Scene 卡片 -->
    <button
        type="button"
        class="flex h-[156px] w-[216px] flex-col rounded-2xl border px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:bg-[var(--bg-hover)]"
        :class="cardClass"
    >
        <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-[var(--text-main)]">{{ props.card.scene.title }}</div>
                <div class="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {{ props.card.chapter?.numberLabel ?? "未挂章" }}
                </div>
            </div>
            <span
                class="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
                :class="props.isMainThread ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]' : PLOT_TONE_STYLES[props.tone].chipClass"
            >
                {{ props.card.scene.status }}
            </span>
        </div>

        <div class="mt-3 line-clamp-3 text-xs leading-6 text-[var(--text-secondary)]">{{ props.card.scene.summary }}</div>

        <div class="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-[11px] text-[var(--text-muted)]">
            <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-0.5">{{ props.card.slotLabel }}</span>
            <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-0.5">{{ props.card.scene.refs.length }} Refs</span>
        </div>
    </button>
</template>
