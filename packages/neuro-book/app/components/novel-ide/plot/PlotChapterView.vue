<script setup lang="ts">
import {computed} from "vue";
import {PLOT_TONE_STYLES} from "nbook/app/components/novel-ide/plot/plot-preview.types";
import type {
    PlotPreviewChapter,
    PlotPreviewScene,
    PlotPreviewThread,
} from "nbook/app/components/novel-ide/plot/plot-preview.types";

const props = defineProps<{
    chapters: PlotPreviewChapter[];
    threads: PlotPreviewThread[];
    scenes: PlotPreviewScene[];
    selectedChapterId: string | null;
    selectedSceneId: string | null;
}>();

const emit = defineEmits<{
    (e: "selectChapter", chapterId: string): void;
    (e: "selectScene", sceneId: string): void;
}>();

/**
 * 当前章节下的场景。
 */
const visibleScenes = computed(() => {
    if (!props.selectedChapterId) {
        return [];
    }

    return props.scenes
        .filter((scene) => scene.chapterPath === props.selectedChapterId)
        .sort((left, right) => (left.chapterSortOrder ?? 0) - (right.chapterSortOrder ?? 0));
});

/**
 * 线程索引。
 */
const threadMap = computed(() => {
    return new Map(props.threads.map((thread) => [thread.id, thread]));
});

</script>

<template>
    <!-- Chapter / Scene 规划视图 -->
    <div class="grid min-h-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <section class="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[0_18px_50px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
            <div class="border-b border-[var(--border-color)] px-4 py-3">
                <div class="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Chapters</div>
                <div class="mt-1 text-sm font-semibold text-[var(--text-main)]">规划一章的承载内容</div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <div class="space-y-2">
                    <button
                        v-for="chapter in chapters"
                        :key="chapter.id"
                        type="button"
                        class="w-full rounded-2xl border px-3 py-3 text-left transition-colors"
                        :class="props.selectedChapterId === chapter.id
                            ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'"
                        @click="emit('selectChapter', chapter.id)"
                    >
                        <div class="text-[11px] uppercase tracking-[0.16em] opacity-80">{{ chapter.volumeTitle }}</div>
                        <div class="mt-1 text-sm font-semibold">{{ chapter.numberLabel }} {{ chapter.title }}</div>
                        <div class="mt-1 text-xs leading-6 opacity-85">{{ chapter.summary }}</div>
                    </button>
                </div>
            </div>
        </section>

        <section class="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[0_18px_50px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
            <div class="border-b border-[var(--border-color)] px-5 py-4">
                <div class="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Chapter Rhythm</div>
                <div class="mt-1 text-sm font-semibold text-[var(--text-main)]">
                    {{ props.chapters.find((chapter) => chapter.id === props.selectedChapterId)?.numberLabel }}
                    {{ props.chapters.find((chapter) => chapter.id === props.selectedChapterId)?.title }}
                </div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div v-if="visibleScenes.length > 0" class="space-y-4">
                    <section
                        v-for="scene in visibleScenes"
                        :key="scene.id"
                        class="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-4"
                    >
                        <button
                            type="button"
                            class="w-full text-left"
                            @click="emit('selectScene', scene.id)"
                        >
                            <div class="flex flex-wrap items-center justify-between gap-3">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                                        Scene {{ (scene.chapterSortOrder ?? 0) + 1 }}
                                    </span>
                                    <span
                                        class="rounded-full px-2 py-0.5 text-[11px]"
                                        :class="PLOT_TONE_STYLES[threadMap.get(scene.threadId)?.tone ?? 'amber'].chipClass"
                                    >
                                        {{ threadMap.get(scene.threadId)?.title }}
                                    </span>
                                </div>
                                <span class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">{{ scene.status }}</span>
                            </div>
                            <div class="mt-3 text-base font-semibold text-[var(--text-main)]" :class="props.selectedSceneId === scene.id ? 'text-[var(--accent-text)]' : ''">
                                {{ scene.title }}
                            </div>
                            <div class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{{ scene.summary }}</div>
                        </button>

                        <div class="mt-4 grid gap-2 text-xs leading-6 text-[var(--text-secondary)]">
                            <div v-if="scene.purpose" class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                                目的：{{ scene.purpose }}
                            </div>
                            <div v-if="scene.writingTip" class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                                写作提示：{{ scene.writingTip }}
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-0.5">Refs {{ scene.refs.length }}</span>
                                <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-0.5">Thread 位次 {{ scene.threadSortOrder + 1 }}</span>
                            </div>
                        </div>
                    </section>
                </div>

                <div v-else class="flex min-h-[260px] items-center justify-center rounded-[22px] border border-dashed border-[var(--border-color)] bg-[var(--bg-input)]/30 px-6 text-center">
                    <div>
                        <div class="text-sm font-semibold text-[var(--text-main)]">当前章节还没有挂接 Scene</div>
                        <div class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">这个视图会以 `Chapter -> Scene` 的方式展示一章内部承载。目前适合用来观察章级 Scene 是否过空或过满。</div>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>
