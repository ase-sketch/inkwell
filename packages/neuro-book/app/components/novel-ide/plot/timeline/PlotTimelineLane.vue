<script setup lang="ts">
import {computed} from "vue";
import {PLOT_TONE_STYLES} from "nbook/app/components/novel-ide/plot/plot-preview.types";
import PlotTimelineSceneCard from "nbook/app/components/novel-ide/plot/timeline/PlotTimelineSceneCard.vue";
import type {
    PlotTimelineLane as TimelineLane,
    PlotTimelineSlot,
} from "nbook/app/components/novel-ide/plot/timeline/plot-timeline.types";

const props = defineProps<{
    lane: TimelineLane;
    slots: PlotTimelineSlot[];
    selectedSceneId: string | null;
}>();

const emit = defineEmits<{
    (e: "selectThread", threadId: string): void;
    (e: "selectScene", sceneId: string): void;
}>();

/**
 * 当前泳道的网格列定义。
 */
const laneGridStyle = computed(() => {
    return {
        gridTemplateColumns: `repeat(${props.slots.length}, minmax(216px, 216px))`,
    };
});

/**
 * 解析单个槽位的背景样式。
 */
function resolveSlotClass(slot: PlotTimelineSlot): string {
    if (slot.kind === "draft") {
        return "border-dashed border-[var(--border-color)] bg-[var(--bg-input)]/45";
    }

    return props.lane.thread.isMainThread
        ? "border-[var(--border-accent)] bg-[var(--accent-bg)]"
        : "border-[var(--border-color)] bg-[var(--bg-input)]/45";
}
</script>

<template>
    <!-- 单条 Thread 泳道 -->
    <div class="grid grid-cols-[220px_minmax(0,1fr)] gap-3">
        <!-- 左侧泳道标题 -->
        <div class="sticky left-0 z-10 flex min-h-[188px] flex-col justify-between rounded-2xl border bg-[var(--bg-panel)] px-4 py-4 shadow-[0_12px_36px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]"
            :class="props.lane.thread.isMainThread ? 'border-[var(--border-accent)]' : PLOT_TONE_STYLES[props.lane.thread.tone].borderClass">
            <button
                type="button"
                class="text-left"
                @click="emit('selectThread', props.lane.thread.id)"
            >
                <div class="flex items-center gap-2">
                    <span
                        class="rounded-full px-2 py-0.5 text-[10px]"
                        :class="props.lane.thread.isMainThread ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]' : PLOT_TONE_STYLES[props.lane.thread.tone].chipClass"
                    >
                        {{ props.lane.thread.isMainThread ? "主线" : "支线" }}
                    </span>
                    <span class="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{{ props.lane.thread.status }}</span>
                </div>
                <div class="mt-3 text-base font-semibold text-[var(--text-main)]">{{ props.lane.thread.title }}</div>
                <div class="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">{{ props.lane.thread.summary }}</div>
            </button>

            <div class="mt-4 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-0.5">{{ props.lane.totalSceneCount }} Scene</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-0.5">{{ props.lane.chapterSceneCount }} 已挂章</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-0.5">{{ props.lane.draftSceneCount }} 草稿</span>
            </div>
        </div>

        <!-- 右侧槽位区 -->
        <div class="overflow-x-hidden">
            <div class="grid gap-4" :style="laneGridStyle">
                <div
                    v-for="(slot, slotIndex) in props.slots"
                    :key="`${props.lane.thread.id}-${slot.index}`"
                    class="min-h-[188px] rounded-2xl border p-2"
                    :class="resolveSlotClass(slot)"
                >
                    <div class="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{{ slot.label }}</div>

                    <div v-if="props.lane.slotCards[slotIndex]?.length" class="space-y-2">
                        <PlotTimelineSceneCard
                            v-for="card in props.lane.slotCards[slotIndex]"
                            :key="card.scene.id"
                            :card="card"
                            :tone="props.lane.thread.tone"
                            :is-main-thread="props.lane.thread.isMainThread"
                            :is-selected="props.selectedSceneId === card.scene.id"
                            @click="emit('selectScene', card.scene.id)"
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
