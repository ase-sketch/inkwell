<script setup lang="ts">
import { useSortable } from "@dnd-kit/vue/sortable";
import type { ChapterSelectionInput, TestChapter } from "nbook/app/components/dnd-test/dnd-test.types";

const props = defineProps<{
    chapter: TestChapter;
    volumeId: string;
    index: number;
    selected: boolean;
    dragDisabled: boolean;
}>();

const emit = defineEmits<{
    (e: "select", value: ChapterSelectionInput): void;
    (e: "prepareDrag", chapterId: string): void;
}>();

const elementRef = ref<HTMLElement | null>(null);
const handleRef = ref<HTMLElement | null>(null);

/**
 * 注册章节排序能力。
 */
const { isDragging, isDropTarget, isDragSource } = useSortable({
    id: computed(() => props.chapter.id),
    index: computed(() => props.index),
    group: computed(() => props.volumeId),
    type: "chapter",
    accept: "chapter",
    data: computed(() => ({
        kind: "chapter" as const,
        chapterId: props.chapter.id,
        volumeId: props.volumeId,
    })),
    element: elementRef,
    handle: handleRef,
    feedback: "default",
    disabled: computed(() => props.dragDisabled),
});

/**
 * 处理行点击选择。
 */
const handleSelect = (event: MouseEvent): void => {
    emit("select", {
        chapterId: props.chapter.id,
        shiftKey: event.shiftKey,
        additiveKey: event.ctrlKey || event.metaKey,
    });
};

/**
 * 拖拽开始前修正选区。
 */
const handlePrepareDrag = (): void => {
    emit("prepareDrag", props.chapter.id);
};
</script>

<template>
    <!-- 章节排序行 -->
    <div
        ref="elementRef"
        :data-chapter-id="chapter.id"
        :data-dragging="isDragging || undefined"
        :data-drag-source="isDragSource || undefined"
        :data-drop-target="isDropTarget || undefined"
        class="chapter-row group flex items-start gap-3 rounded-3 px-3 py-2.5 transition-all"
        :class="selected ? 'chapter-row--selected' : 'chapter-row--idle'"
        @click="handleSelect"
    >
        <button
            ref="handleRef"
            type="button"
            class="chapter-row__handle mt-0.5 flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-full text-[var(--chapter-handle-color)] transition-colors hover:bg-white/80 hover:text-slate-900 disabled:cursor-not-allowed"
            :disabled="dragDisabled"
            title="拖拽排序章节"
            @pointerdown="handlePrepareDrag"
            @click.stop
        >
            <span class="i-lucide-grip-vertical h-4 w-4"></span>
        </button>

        <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
                <span class="rounded-full bg-black/6 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-slate-600">
                    {{ String(chapter.sortOrder + 1).padStart(2, "0") }}
                </span>
                <span class="truncate text-sm font-semibold text-slate-900">{{ chapter.title }}</span>
                <span v-if="selected" class="rounded-full bg-sky-500/12 px-2 py-0.5 text-[10px] font-semibold text-sky-700">已选中</span>
            </div>
            <div class="mt-1 line-clamp-1 text-xs leading-5 text-slate-500">
                {{ chapter.summary }}
            </div>
        </div>

        <div class="shrink-0 text-right">
            <div class="text-[11px] font-semibold text-slate-700">{{ chapter.words }} 字</div>
            <div class="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">{{ chapter.id }}</div>
        </div>
    </div>
</template>

<style scoped>
.chapter-row {
    border: 1px solid transparent;
}

.chapter-row--idle {
    background: rgba(255, 255, 255, 0.74);
    --chapter-handle-color: #64748b;
}

.chapter-row--idle:hover {
    background: rgba(255, 255, 255, 0.98);
    border-color: rgba(148, 163, 184, 0.22);
}

.chapter-row--selected {
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(59, 130, 246, 0.09));
    border-color: rgba(14, 165, 233, 0.32);
    --chapter-handle-color: #0369a1;
}

.chapter-row[data-dragging="true"] {
    opacity: 0.9;
    transform: rotate(0.35deg);
}

.chapter-row[data-drop-target="true"] {
    border-color: rgba(37, 99, 235, 0.32);
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
}
</style>
