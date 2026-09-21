<script setup lang="ts">
import {computed} from "vue";
import PlotTimelineLane from "nbook/app/components/novel-ide/plot/timeline/PlotTimelineLane.vue";
import type {PlotTimelinePhaseView} from "nbook/app/components/novel-ide/plot/timeline/plot-timeline.types";

const props = defineProps<{
    timeline: PlotTimelinePhaseView;
    selectedThreadId: string | null;
    selectedSceneId: string | null;
    selectedChapterId: string | null;
}>();

const emit = defineEmits<{
    (e: "selectThread", threadId: string): void;
    (e: "selectScene", sceneId: string): void;
    (e: "selectChapter", chapterId: string): void;
}>();

/**
 * 顶部时间轴头部的网格列定义。
 */
const headerGridStyle = computed(() => {
    return {
        gridTemplateColumns: `repeat(${props.timeline.totalSlots}, minmax(216px, 216px))`,
    };
});
</script>

<template>
    <!-- 时间轴主体画布 -->
    <div class="overflow-auto rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[0_24px_80px_color-mix(in_srgb,var(--shadow-color)_12%,transparent)]">
        <div class="min-w-max px-4 py-4">
            <!-- 顶部章节分段 -->
            <div class="sticky top-0 z-20 mb-4 grid grid-cols-[220px_minmax(0,1fr)] gap-3 bg-[var(--bg-panel)]/96 pb-3 backdrop-blur">
                <div class="flex items-end rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-4">
                    <div>
                        <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">StoryPhase</div>
                        <div class="mt-2 text-base font-semibold text-[var(--text-main)]">{{ props.timeline.phase.title }}</div>
                        <div class="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{{ props.timeline.phase.summary }}</div>
                    </div>
                </div>

                <div class="grid gap-4" :style="headerGridStyle">
                    <button
                        v-for="segment in props.timeline.segments"
                        :key="segment.id"
                        type="button"
                        class="rounded-2xl border px-4 py-3 text-left transition-colors"
                        :class="segment.kind === 'draft'
                            ? 'border-dashed border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]'
                            : (props.selectedChapterId === segment.chapterId
                                ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                                : 'border-[var(--border-color)] bg-[var(--bg-input)]')"
                        :style="{gridColumn: `${segment.start + 1} / span ${segment.span}`}"
                        @click="segment.chapterId && emit('selectChapter', segment.chapterId)"
                    >
                        <div class="text-[10px] uppercase tracking-[0.18em]" :class="segment.kind === 'draft' ? 'text-[var(--text-muted)]' : 'opacity-80'">
                            {{ segment.kind === "draft" ? "Draft Tail" : segment.title }}
                        </div>
                        <div class="mt-1 text-sm font-semibold">{{ segment.subtitle }}</div>
                        <div class="mt-2 text-[11px] opacity-80">{{ segment.span }} 个 Scene 槽位</div>
                    </button>
                </div>
            </div>

            <!-- 泳道列表 -->
            <div v-if="props.timeline.lanes.length" class="space-y-4">
                <PlotTimelineLane
                    v-for="lane in props.timeline.lanes"
                    :key="lane.thread.id"
                    :lane="lane"
                    :slots="props.timeline.slots"
                    :selected-scene-id="props.selectedSceneId"
                    @select-thread="emit('selectThread', $event)"
                    @select-scene="emit('selectScene', $event)"
                />
            </div>

            <!-- 空状态 -->
            <div v-else class="flex min-h-[340px] items-center justify-center rounded-[24px] border border-dashed border-[var(--border-color)] bg-[var(--bg-input)]/70 px-6 py-10 text-center">
                <div class="max-w-[320px]">
                    <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-muted)]">
                        <span class="i-lucide-waypoints h-6 w-6"></span>
                    </div>
                    <div class="mt-4 text-sm font-semibold text-[var(--text-main)]">当前 StoryPhase 还没有可展示的 Thread</div>
                    <div class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">时间轴按单 StoryPhase 工作。请切换到其他 Phase，或先为这个阶段补充 Thread 与 Scene。</div>
                </div>
            </div>
        </div>
    </div>
</template>
