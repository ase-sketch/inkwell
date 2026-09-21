<script setup lang="ts">
import {computed} from "vue";
import {PLOT_TONE_STYLES} from "nbook/app/components/novel-ide/plot/plot-preview.types";
import type {
    PlotPreviewChapter,
    PlotPreviewScene,
    PlotPreviewThread,
} from "nbook/app/components/novel-ide/plot/plot-preview.types";

const props = defineProps<{
    threads: PlotPreviewThread[];
    chapters: PlotPreviewChapter[];
    scenes: PlotPreviewScene[];
    selectedThreadId: string | null;
    selectedSceneId: string | null;
}>();

const emit = defineEmits<{
    (e: "selectThread", threadId: string): void;
    (e: "selectScene", sceneId: string): void;
    (e: "jumpChapter", chapterId: string): void;
}>();

/**
 * 章节索引。
 */
const chapterMap = computed(() => {
    return new Map(props.chapters.map((chapter) => [chapter.id, chapter]));
});

/**
 * 当前选中线程。
 */
const selectedThread = computed(() => {
    return props.threads.find((thread) => thread.id === props.selectedThreadId) ?? null;
});

/**
 * 当前线程下的场景。
 */
const visibleScenes = computed(() => {
    if (!props.selectedThreadId) {
        return [];
    }

    return props.scenes
        .filter((scene) => scene.threadId === props.selectedThreadId)
        .sort((left, right) => left.threadSortOrder - right.threadSortOrder);
});
</script>

<template>
    <!-- Thread / Scene 规划视图 -->
    <div class="grid min-h-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <section class="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[0_18px_50px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
            <div class="border-b border-[var(--border-color)] px-4 py-3">
                <div class="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Threads</div>
                <div class="mt-1 text-sm font-semibold text-[var(--text-main)]">切换正在规划的剧情线</div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <div class="space-y-2">
                    <button
                        v-for="thread in threads"
                        :key="thread.id"
                        type="button"
                        class="w-full rounded-2xl border px-3 py-3 text-left transition-all"
                        :class="[
                            PLOT_TONE_STYLES[thread.tone].borderClass,
                            props.selectedThreadId === thread.id
                                ? 'bg-[var(--accent-bg)] text-[var(--text-main)]'
                                : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                        ]"
                        @click="emit('selectThread', thread.id)"
                    >
                        <div class="flex items-center justify-between gap-3">
                            <div class="text-sm font-semibold">{{ thread.title }}</div>
                            <span class="rounded-full px-2 py-0.5 text-[11px]" :class="PLOT_TONE_STYLES[thread.tone].chipClass">
                                {{ thread.isMainThread ? "主线" : "支线" }}
                            </span>
                        </div>
                        <div class="mt-2 line-clamp-2 text-xs leading-6">{{ thread.summary }}</div>
                    </button>
                </div>
            </div>
        </section>

        <section class="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[0_18px_50px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
            <div v-if="selectedThread" class="border-b border-[var(--border-color)] px-5 py-4">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="rounded-full px-2.5 py-1 text-[11px] font-semibold" :class="PLOT_TONE_STYLES[selectedThread.tone].chipClass">
                        {{ selectedThread.isMainThread ? "主线" : "支线" }}
                    </span>
                    <span class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">{{ selectedThread.status }}</span>
                    <span
                        v-for="tag in selectedThread.tags"
                        :key="tag"
                        class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                    >
                        {{ tag }}
                    </span>
                </div>
                <div class="mt-3 text-lg font-semibold text-[var(--text-main)]">{{ selectedThread.title }}</div>
                <div class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{{ selectedThread.summary }}</div>
            </div>

            <div v-if="selectedThread" class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div class="space-y-4">
                    <button
                        v-for="scene in visibleScenes"
                        :key="scene.id"
                        type="button"
                        class="group w-full rounded-[22px] border px-4 py-4 text-left transition-all"
                        :class="props.selectedSceneId === scene.id
                            ? 'border-[var(--accent-main)] bg-[var(--accent-bg)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:-translate-y-0.5 hover:bg-[var(--bg-hover)]'"
                        @click="emit('selectScene', scene.id)"
                    >
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                                    Scene {{ scene.threadSortOrder + 1 }}
                                </span>
                                <span class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">{{ scene.status }}</span>
                            </div>

                            <button
                                v-if="scene.chapterPath"
                                type="button"
                                class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
                                @click.stop="emit('jumpChapter', scene.chapterPath)"
                            >
                                {{ chapterMap.get(scene.chapterPath)?.numberLabel }} {{ chapterMap.get(scene.chapterPath)?.title }}
                            </button>
                            <span v-else class="rounded-full border border-dashed border-[var(--border-color)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
                                未挂章
                            </span>
                        </div>

                        <div class="mt-3 text-base font-semibold text-[var(--text-main)]">{{ scene.title }}</div>
                        <div class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{{ scene.summary }}</div>

                        <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                            <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-3">
                                <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Purpose</div>
                                <div class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{{ scene.purpose || "尚未填写 purpose" }}</div>
                            </div>
                            <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-3">
                                <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Scene Stats</div>
                                <div class="mt-2 space-y-2 text-sm text-[var(--text-secondary)]">
                                    <div>Refs：{{ scene.refs.length }}</div>
                                    <div>Chapter 位次：{{ scene.chapterSortOrder === null ? "未分配" : scene.chapterSortOrder + 1 }}</div>
                                </div>
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            <div v-else class="flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-center">
                <div>
                    <div class="text-sm font-semibold text-[var(--text-main)]">先选择一条 Thread</div>
                    <div class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">该视图会按 `threadSortOrder` 展示 Scene 序列，方便快速规划一条线的前后推进。</div>
                </div>
            </div>
        </section>
    </div>
</template>
