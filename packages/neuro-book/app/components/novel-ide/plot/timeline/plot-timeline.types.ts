import type {
    PlotPreviewChapter,
    PlotPreviewDataset,
    PlotPreviewPhase,
    PlotPreviewScene,
    PlotPreviewThread,
} from "nbook/app/components/novel-ide/plot/plot-preview.types";

/**
 * 时间轴里的分段类型。
 */
export type PlotTimelineSegmentKind = "chapter" | "draft";

/**
 * 单个横向槽位的元信息。
 */
export type PlotTimelineSlot = {
    index: number;
    kind: PlotTimelineSegmentKind;
    // 为空表示当前槽位位于草稿尾区。
    chapterId: string | null;
    label: string;
};

/**
 * 时间轴顶部的分段头。
 */
export type PlotTimelineSegment = {
    id: string;
    kind: PlotTimelineSegmentKind;
    title: string;
    subtitle: string;
    start: number;
    span: number;
    // 为空表示当前分段不是章节段。
    chapterId: string | null;
};

/**
 * 时间轴中的场景卡片。
 */
export type PlotTimelineCard = {
    scene: PlotPreviewScene;
    slotIndex: number;
    slotLabel: string;
    // 为空表示当前 Scene 尚未挂章。
    chapter: PlotPreviewChapter | null;
};

/**
 * 单条 Thread 泳道。
 */
export type PlotTimelineLane = {
    thread: PlotPreviewThread;
    slotCards: PlotTimelineCard[][];
    totalSceneCount: number;
    chapterSceneCount: number;
    draftSceneCount: number;
};

/**
 * 单个 Phase 的时间轴视图模型。
 */
export type PlotTimelinePhaseView = {
    dataset: PlotPreviewDataset;
    phase: PlotPreviewPhase;
    threads: PlotPreviewThread[];
    chapters: PlotPreviewChapter[];
    scenes: PlotPreviewScene[];
    segments: PlotTimelineSegment[];
    slots: PlotTimelineSlot[];
    lanes: PlotTimelineLane[];
    totalSlots: number;
    draftStartIndex: number;
    draftSlotCount: number;
};
