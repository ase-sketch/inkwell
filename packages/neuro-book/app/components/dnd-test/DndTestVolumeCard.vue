<script setup lang="ts">
import { CollisionPriority } from "@dnd-kit/abstract";
import { useSortable } from "@dnd-kit/vue/sortable";
import DndTestChapterRow from "nbook/app/components/dnd-test/DndTestChapterRow.vue";
import type { ChapterSelectionInput, TestVolume } from "nbook/app/components/dnd-test/dnd-test.types";

const props = defineProps<{
    volume: TestVolume;
    index: number;
    selectedChapterIds: string[];
    dragDisabled: boolean;
}>();

const emit = defineEmits<{
    (e: "toggle", volumeId: string): void;
    (e: "selectChapter", value: ChapterSelectionInput): void;
    (e: "prepareChapterDrag", chapterId: string): void;
}>();

const volumeRef = ref<HTMLElement | null>(null);
const volumeHandleRef = ref<HTMLElement | null>(null);

/**
 * 注册篇排序能力，同时允许章节落入篇容器。
 */
const { isDragging, isDragSource, isDropTarget } = useSortable({
    id: computed(() => props.volume.id),
    index: computed(() => props.index),
    type: "volume",
    accept: ["volume", "chapter"],
    collisionPriority: CollisionPriority.Low,
    data: computed(() => ({
        kind: "volume" as const,
        volumeId: props.volume.id,
    })),
    element: volumeRef,
    handle: volumeHandleRef,
    feedback: "default",
    disabled: computed(() => props.dragDisabled),
});

/**
 * 判断章节是否被选中。
 */
const isChapterSelected = (chapterId: string): boolean => props.selectedChapterIds.includes(chapterId);

/**
 * 计算篇内已选章节数量。
 */
const selectedCount = computed(() => props.volume.chapters.filter((chapter) => isChapterSelected(chapter.id)).length);
</script>

<template>
    <!-- 篇卡片 -->
    <section
        ref="volumeRef"
        :data-volume-id="volume.id"
        :data-dragging="isDragging || undefined"
        :data-drag-source="isDragSource || undefined"
        :data-drop-target="isDropTarget && !isDragSource ? true : undefined"
        class="volume-card rounded-[28px] border border-white/70 bg-white/70 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur"
    >
        <!-- 篇头 -->
        <div
            class="volume-card__header flex items-center gap-3 rounded-[22px] px-2 py-2 transition-colors"
            :style="{ background: `linear-gradient(135deg, ${volume.color}22, transparent 72%)` }"
        >
            <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-900" :title="volume.isExpanded ? '收起篇内章节' : '展开篇内章节'" @click="emit('toggle', volume.id)">
                <span :class="volume.isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="h-4 w-4"></span>
            </button>

            <button
                ref="volumeHandleRef"
                type="button"
                class="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-900 disabled:cursor-not-allowed"
                :disabled="dragDisabled"
                title="拖拽排序篇"
            >
                <span class="i-lucide-grip h-4.5 w-4.5"></span>
            </button>

            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                    <span class="truncate text-base font-bold text-slate-950">{{ volume.title }}</span>
                    <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-white" :style="{ backgroundColor: volume.color }">篇</span>
                    <span v-if="selectedCount > 0" class="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">{{ selectedCount }} 个已选</span>
                </div>
                <p class="mt-1 line-clamp-1 text-xs leading-5 text-slate-500">{{ volume.summary }}</p>
            </div>

            <div class="shrink-0 text-right">
                <div class="text-[11px] font-semibold text-slate-800">{{ volume.chapters.length }} 章</div>
                <div class="mt-1 text-[10px] text-slate-400">{{ volume.chapters.reduce((sum, chapter) => sum + chapter.words, 0) }} 字</div>
            </div>
        </div>

        <!-- 篇内章节 -->
        <div
            v-if="volume.isExpanded"
            class="mt-3 rounded-[22px] border border-dashed border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.82))] p-2 transition-colors"
            :class="isDropTarget && !isDragSource ? 'border-sky-300 bg-sky-50/70' : ''"
        >
            <div v-if="volume.chapters.length > 0" class="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                <DndTestChapterRow
                    v-for="(chapter, chapterIndex) in volume.chapters"
                    :key="chapter.id"
                    :chapter="chapter"
                    :volume-id="volume.id"
                    :index="chapterIndex"
                    :selected="isChapterSelected(chapter.id)"
                    :drag-disabled="dragDisabled"
                    @select="emit('selectChapter', $event)"
                    @prepare-drag="emit('prepareChapterDrag', $event)"
                />
            </div>

            <div v-else class="rounded-[18px] border border-dashed border-slate-300 bg-white/85 px-4 py-8 text-center text-xs leading-6 text-slate-500">
                空篇容器。把一个或多个章节拖到这里，验证跨篇批量插入。
            </div>
        </div>
    </section>
</template>

<style scoped>
.volume-card[data-drag-source="true"] {
    opacity: 0.96;
}

.volume-card[data-drop-target="true"] .volume-card__header {
    box-shadow: inset 0 0 0 1px rgba(14, 165, 233, 0.28);
}
</style>
