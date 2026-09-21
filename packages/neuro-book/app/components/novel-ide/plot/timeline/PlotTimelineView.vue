<script setup lang="ts">
import {computed} from "vue";
import PlotTimelineCanvas from "nbook/app/components/novel-ide/plot/timeline/PlotTimelineCanvas.vue";
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
 * 当前时间轴覆盖的正文章节数。
 */
const chapterCount = computed(() => props.timeline.chapters.length);

/**
 * 当前时间轴覆盖的 Scene 数量。
 */
const sceneCount = computed(() => props.timeline.scenes.length);
</script>

<template>
    <!-- 时间轴视图外层壳 -->
    <div class="space-y-4">
        <!-- 顶部摘要 -->
        <section class="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] px-5 py-5 shadow-[0_18px_60px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div class="max-w-[900px]">
                    <div class="text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">Plot Timeline</div>
                    <div class="mt-2 text-2xl font-semibold text-[var(--text-main)]">{{ props.timeline.phase.title }}</div>
                    <div class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        {{ props.timeline.phase.summary }}
                    </div>
                </div>

                <div class="grid gap-3 sm:grid-cols-4">
                    <div class="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3">
                        <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Thread</div>
                        <div class="mt-1 text-lg font-semibold text-[var(--text-main)]">{{ props.timeline.threads.length }}</div>
                    </div>
                    <div class="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3">
                        <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Scene</div>
                        <div class="mt-1 text-lg font-semibold text-[var(--text-main)]">{{ sceneCount }}</div>
                    </div>
                    <div class="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3">
                        <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Chapter</div>
                        <div class="mt-1 text-lg font-semibold text-[var(--text-main)]">{{ chapterCount }}</div>
                    </div>
                    <div class="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3">
                        <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Draft Tail</div>
                        <div class="mt-1 text-lg font-semibold text-[var(--text-main)]">{{ props.timeline.draftSlotCount }}</div>
                    </div>
                </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1">单 StoryPhase</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1">正文顺序时间轴</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1">Thread 泳道</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1">同槽位允许并行</span>
                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1">草稿尾区</span>
            </div>
        </section>

        <!-- 时间轴画布 -->
        <PlotTimelineCanvas
            :timeline="props.timeline"
            :selected-thread-id="props.selectedThreadId"
            :selected-scene-id="props.selectedSceneId"
            :selected-chapter-id="props.selectedChapterId"
            @select-thread="emit('selectThread', $event)"
            @select-scene="emit('selectScene', $event)"
            @select-chapter="emit('selectChapter', $event)"
        />
    </div>
</template>
