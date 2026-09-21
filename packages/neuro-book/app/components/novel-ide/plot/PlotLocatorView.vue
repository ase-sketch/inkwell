<script setup lang="ts">
import {computed} from "vue";
import {PLOT_TONE_STYLES} from "nbook/app/components/novel-ide/plot/plot-preview.types";
import type {
    PlotPreviewPhase,
    PlotPreviewScene,
    PlotPreviewStory,
    PlotPreviewThread,
} from "nbook/app/components/novel-ide/plot/plot-preview.types";

const props = defineProps<{
    story: PlotPreviewStory;
    phases: PlotPreviewPhase[];
    threads: PlotPreviewThread[];
    scenes: PlotPreviewScene[];
    selectedPhaseId: string | null;
    selectedThreadId: string | null;
    searchQuery: string;
}>();

const emit = defineEmits<{
    (e: "update:searchQuery", value: string): void;
    (e: "selectPhase", phaseId: string | null): void;
    (e: "selectThread", threadId: string): void;
}>();

/**
 * 当前 phase 下可见线程。
 */
const visibleThreads = computed(() => {
    const normalizedQuery = props.searchQuery.trim().toLowerCase();

    return props.threads.filter((thread) => {
        const matchesPhase = props.selectedPhaseId === null
            ? thread.phaseId === null
            : thread.phaseId === props.selectedPhaseId;
        if (!matchesPhase) {
            return false;
        }

        if (!normalizedQuery) {
            return true;
        }

        return [
            thread.title,
            thread.summary,
            thread.tags.join(" "),
            thread.status,
        ].join(" ").toLowerCase().includes(normalizedQuery);
    });
});

/**
 * 按线程聚合场景数量。
 */
const sceneCountMap = computed(() => {
    return props.scenes.reduce<Record<string, number>>((map, scene) => {
        map[scene.threadId] = (map[scene.threadId] ?? 0) + 1;
        return map;
    }, {});
});

/**
 * 按线程聚合已挂章场景数量。
 */
const chapterLinkedCountMap = computed(() => {
    return props.scenes.reduce<Record<string, number>>((map, scene) => {
        if (scene.chapterPath !== null) {
            map[scene.threadId] = (map[scene.threadId] ?? 0) + 1;
        }
        return map;
    }, {});
});
</script>

<template>
    <!-- Story / Phase / Thread 定位视图 -->
    <div class="grid min-h-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <section class="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[0_18px_50px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
            <div class="border-b border-[var(--border-color)] px-4 py-3">
                <div class="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Story / Phase</div>
                <div class="mt-1 text-sm font-semibold text-[var(--text-main)]">{{ story.title }}</div>
                <div class="mt-2 text-xs leading-6 text-[var(--text-secondary)]">{{ story.summary }}</div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <button
                    type="button"
                    class="mb-3 flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-colors"
                    :class="props.selectedPhaseId === null
                        ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                        : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'"
                    @click="emit('selectPhase', null)"
                >
                    <span>
                        <span class="block text-sm font-semibold">未分组线程</span>
                        <span class="mt-1 block text-xs opacity-80">用于世界设定线、候补线和未归档线</span>
                    </span>
                    <span class="rounded-full bg-black/5 px-2 py-0.5 text-[11px]">
                        {{ props.threads.filter((thread) => thread.phaseId === null).length }}
                    </span>
                </button>

                <div class="space-y-2">
                    <button
                        v-for="phase in phases"
                        :key="phase.id"
                        type="button"
                        class="w-full rounded-2xl border px-3 py-3 text-left transition-colors"
                        :class="props.selectedPhaseId === phase.id
                            ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'"
                        @click="emit('selectPhase', phase.id)"
                    >
                        <div class="text-sm font-semibold">{{ phase.title }}</div>
                        <div class="mt-1 text-xs leading-6 opacity-85">{{ phase.summary }}</div>
                    </button>
                </div>
            </div>
        </section>

        <section class="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[0_18px_50px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
            <div class="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
                <div>
                    <div class="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Threads</div>
                    <div class="mt-1 text-sm font-semibold text-[var(--text-main)]">快速定位剧情线</div>
                </div>

                <div class="relative w-[260px] max-w-full">
                    <span class="i-lucide-search absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"></span>
                    <input
                        :value="props.searchQuery"
                        type="text"
                        placeholder="搜索标题、摘要、标签..."
                        class="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] py-2 pl-8 pr-3 text-sm text-[var(--text-main)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-main)]"
                        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
                    >
                </div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div class="grid gap-3 xl:grid-cols-2">
                    <button
                        v-for="thread in visibleThreads"
                        :key="thread.id"
                        type="button"
                        class="rounded-[20px] border bg-[var(--bg-input)] px-4 py-4 text-left transition-all"
                        :class="[
                            PLOT_TONE_STYLES[thread.tone].borderClass,
                            props.selectedThreadId === thread.id
                                ? 'bg-[var(--accent-bg)]/60 text-[var(--text-main)]'
                                : 'text-[var(--text-secondary)] hover:-translate-y-0.5 hover:bg-[var(--bg-hover)]',
                        ]"
                        @click="emit('selectThread', thread.id)"
                    >
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="rounded-full px-2.5 py-1 text-[11px] font-semibold" :class="PLOT_TONE_STYLES[thread.tone].chipClass">
                                {{ thread.isMainThread ? "主线" : "支线" }}
                            </span>
                            <span class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px]">{{ thread.status }}</span>
                        </div>
                        <div class="mt-3 text-base font-semibold text-[var(--text-main)]">{{ thread.title }}</div>
                        <div class="mt-2 text-sm leading-7">{{ thread.summary }}</div>

                        <div class="mt-4 flex flex-wrap gap-2">
                            <span
                                v-for="tag in thread.tags"
                                :key="tag"
                                class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px]"
                            >
                                {{ tag }}
                            </span>
                        </div>

                        <div class="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                            <div class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-2">
                                <div class="text-[var(--text-muted)]">Scene</div>
                                <div class="mt-1 font-semibold text-[var(--text-main)]">{{ sceneCountMap[thread.id] ?? 0 }}</div>
                            </div>
                            <div class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-2">
                                <div class="text-[var(--text-muted)]">挂章</div>
                                <div class="mt-1 font-semibold text-[var(--text-main)]">{{ chapterLinkedCountMap[thread.id] ?? 0 }}</div>
                            </div>
                            <div class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-2">
                                <div class="text-[var(--text-muted)]">Refs</div>
                                <div class="mt-1 font-semibold text-[var(--text-main)]">{{ thread.refs.length }}</div>
                            </div>
                        </div>
                    </button>
                </div>

                <div v-if="visibleThreads.length === 0" class="flex min-h-[240px] items-center justify-center rounded-[20px] border border-dashed border-[var(--border-color)] bg-[var(--bg-input)]/30 px-6 text-center">
                    <div>
                        <div class="text-sm font-semibold text-[var(--text-main)]">当前筛选下没有 Thread</div>
                        <div class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">可以切换 `Phase` 或清空搜索，重新定位要规划的剧情线。</div>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>
