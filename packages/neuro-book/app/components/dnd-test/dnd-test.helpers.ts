import type { Data } from "@dnd-kit/abstract";
import { move } from "@dnd-kit/helpers";
import type { DragDropProviderEmits } from "@dnd-kit/vue";
import type {
    ChapterDragData,
    ChapterSelectionInput,
    TestChapter,
    TestVolume,
    VolumeDragData,
} from "nbook/app/components/dnd-test/dnd-test.types";

type DragOverPayload = DragDropProviderEmits["dragOver"][0];

/**
 * 判断是否为篇拖拽数据。
 */
export const isVolumeDragData = (data: Data | undefined): data is VolumeDragData => (
    data?.kind === "volume" && typeof data.volumeId === "string"
);

/**
 * 判断是否为章节拖拽数据。
 */
export const isChapterDragData = (data: Data | undefined): data is ChapterDragData => (
    data?.kind === "chapter"
    && typeof data.chapterId === "string"
    && typeof data.volumeId === "string"
);

/**
 * 深拷贝篇章树，避免拖拽过程污染快照。
 */
export const cloneVolumes = (volumes: TestVolume[]): TestVolume[] => volumes.map((volume) => ({
    ...volume,
    chapters: volume.chapters.map((chapter) => ({ ...chapter })),
}));

/**
 * 规范化章节归属与顺序。
 */
export const normalizeVolumes = (volumes: TestVolume[]): TestVolume[] => volumes.map((volume) => ({
    ...volume,
    chapters: volume.chapters.map((chapter, index) => ({
        ...chapter,
        volumeId: volume.id,
        sortOrder: index,
    })),
}));

/**
 * 构建全局章节顺序，供连选与批量拖拽使用。
 */
export const buildChapterOrder = (volumes: TestVolume[]): string[] => volumes.flatMap((volume) => volume.chapters.map((chapter) => chapter.id));

/**
 * 查找章节所在篇。
 */
export const findChapterVolumeId = (volumes: TestVolume[], chapterId: string): string => (
    volumes.find((volume) => volume.chapters.some((chapter) => chapter.id === chapterId))?.id ?? ""
);

/**
 * 按当前展示顺序收集待移动章节。
 */
export const resolveDraggingChapters = (
    volumes: TestVolume[],
    activeChapterId: string,
    selectedChapterIds: string[],
): TestChapter[] => {
    const selectionSet = new Set(selectedChapterIds);
    const shouldBatchMove = selectionSet.has(activeChapterId);
    const activeIds = buildChapterOrder(volumes).filter((chapterId) => shouldBatchMove ? selectionSet.has(chapterId) : chapterId === activeChapterId);
    const chapterMap = new Map(volumes.flatMap((volume) => volume.chapters.map((chapter) => [chapter.id, chapter] as const)));

    return activeIds.map((chapterId) => {
        const chapter = chapterMap.get(chapterId);
        if (!chapter) {
            throw new Error(`未找到测试章节：${chapterId}`);
        }
        return { ...chapter };
    });
};

/**
 * 生成连续区间选择。
 */
export const buildRangeSelection = (order: string[], anchorId: string, currentId: string): string[] => {
    const anchorIndex = order.indexOf(anchorId);
    const currentIndex = order.indexOf(currentId);

    if (anchorIndex < 0 || currentIndex < 0) {
        return [currentId];
    }

    const start = Math.min(anchorIndex, currentIndex);
    const end = Math.max(anchorIndex, currentIndex);
    return order.slice(start, end + 1);
};

/**
 * 应用章节多选与连选规则。
 */
export const resolveSelection = (
    order: string[],
    currentSelectedIds: string[],
    anchorId: string,
    input: ChapterSelectionInput,
): { selectedIds: string[]; anchorId: string } => {
    const currentSet = new Set(currentSelectedIds);

    if (input.shiftKey) {
        const baseAnchorId = anchorId || currentSelectedIds.at(-1) || input.chapterId;
        const rangeIds = buildRangeSelection(order, baseAnchorId, input.chapterId);

        if (input.additiveKey) {
            rangeIds.forEach((id) => currentSet.add(id));
            return {
                selectedIds: order.filter((id) => currentSet.has(id)),
                anchorId: baseAnchorId,
            };
        }

        return {
            selectedIds: rangeIds,
            anchorId: baseAnchorId,
        };
    }

    if (input.additiveKey) {
        if (currentSet.has(input.chapterId)) {
            currentSet.delete(input.chapterId);
        } else {
            currentSet.add(input.chapterId);
        }

        return {
            selectedIds: order.filter((id) => currentSet.has(id)),
            anchorId: input.chapterId,
        };
    }

    return {
        selectedIds: [input.chapterId],
        anchorId: input.chapterId,
    };
};

/**
 * 拖拽前确保激活项已被选中。
 */
export const ensureDragSelection = (order: string[], selectedIds: string[], chapterId: string): string[] => {
    if (selectedIds.includes(chapterId)) {
        return selectedIds;
    }

    return order.includes(chapterId) ? [chapterId] : [];
};

/**
 * 应用篇排序。
 */
export const applyVolumeMove = (volumes: TestVolume[], event: DragOverPayload): TestVolume[] => move(volumes, event) as TestVolume[];

/**
 * 应用批量章节拖拽。
 */
export const applyChapterMove = (
    volumes: TestVolume[],
    activeChapterId: string,
    selectedChapterIds: string[],
    targetData: ChapterDragData | VolumeDragData,
): TestVolume[] => {
    const movingChapters = resolveDraggingChapters(volumes, activeChapterId, selectedChapterIds);
    const movingIds = new Set(movingChapters.map((chapter) => chapter.id));

    if (isChapterDragData(targetData) && movingIds.has(targetData.chapterId)) {
        return cloneVolumes(volumes);
    }

    const nextVolumes = cloneVolumes(volumes).map((volume) => ({
        ...volume,
        chapters: volume.chapters.filter((chapter) => !movingIds.has(chapter.id)),
    }));

    const targetVolumeId = targetData.volumeId;
    const targetVolume = nextVolumes.find((volume) => volume.id === targetVolumeId);

    if (!targetVolume) {
        return cloneVolumes(volumes);
    }

    const insertIndex = isChapterDragData(targetData)
        ? Math.max(targetVolume.chapters.findIndex((chapter) => chapter.id === targetData.chapterId), 0)
        : targetVolume.chapters.length;

    targetVolume.chapters.splice(
        insertIndex,
        0,
        ...movingChapters.map((chapter) => ({
            ...chapter,
            volumeId: targetVolumeId,
        })),
    );

    return normalizeVolumes(nextVolumes);
};
