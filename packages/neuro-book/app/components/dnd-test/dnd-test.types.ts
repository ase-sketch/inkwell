/**
 * 测试页中的章节模型。
 */
export type TestChapter = {
    id: string;
    title: string;
    summary: string;
    words: number;
    volumeId: string;
    sortOrder: number;
};

/**
 * 测试页中的篇模型。
 */
export type TestVolume = {
    id: string;
    title: string;
    summary: string;
    color: string;
    isExpanded: boolean;
    chapters: TestChapter[];
};

/**
 * 篇拖拽数据。
 */
export type VolumeDragData = {
    kind: "volume";
    volumeId: string;
};

/**
 * 章节拖拽数据。
 */
export type ChapterDragData = {
    kind: "chapter";
    chapterId: string;
    volumeId: string;
};

/**
 * 行点击时的选择输入。
 */
export type ChapterSelectionInput = {
    chapterId: string;
    shiftKey: boolean;
    additiveKey: boolean;
};
