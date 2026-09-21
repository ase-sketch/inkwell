import type {
    PlotPreviewChapter,
    PlotPreviewDataset,
    PlotPreviewScene,
    PlotPreviewThread,
} from "nbook/app/components/novel-ide/plot/plot-preview.types";
import type {
    PlotTimelineCard,
    PlotTimelineLane,
    PlotTimelinePhaseView,
    PlotTimelineSegment,
    PlotTimelineSlot,
} from "nbook/app/components/novel-ide/plot/timeline/plot-timeline.types";

/**
 * 按当前 Phase 生成时间轴视图模型。
 * 该函数只做 preview 派生，不改原始数据。
 */
export function buildPlotTimelinePhaseView(
    dataset: PlotPreviewDataset,
    phaseId: string,
): PlotTimelinePhaseView | null {
    const phase = dataset.phases.find((item) => item.id === phaseId) ?? null;

    if (!phase) {
        return null;
    }

    const orderedThreads = dataset.threads
        .filter((thread) => thread.phaseId === phaseId)
        .sort(compareTimelineThreads(dataset.threads));
    const threadIds = new Set(orderedThreads.map((thread) => thread.id));
    const phaseScenes = dataset.scenes.filter((scene) => threadIds.has(scene.threadId));
    const coveredChapters = resolveCoveredChapters(dataset.chapters, phaseScenes);
    const chapterCounts = resolveChapterSlotCounts(coveredChapters, phaseScenes);
    const draftSlotCount = resolveDraftSlotCount(orderedThreads, phaseScenes);
    const segments = buildTimelineSegments(coveredChapters, chapterCounts, draftSlotCount);
    const slots = buildTimelineSlots(segments);
    const sceneSlots = resolveSceneSlotIndices(phaseScenes, segments);
    const chapterMap = new Map(coveredChapters.map((chapter) => [chapter.id, chapter]));
    const lanes = orderedThreads.map((thread) => {
        return buildTimelineLane(thread, phaseScenes, slots, sceneSlots, chapterMap);
    });
    const draftSegment = segments.find((segment) => segment.kind === "draft") ?? null;

    return {
        dataset,
        phase,
        threads: orderedThreads,
        chapters: coveredChapters,
        scenes: phaseScenes,
        segments,
        slots,
        lanes,
        totalSlots: slots.length,
        draftStartIndex: draftSegment?.start ?? slots.length,
        draftSlotCount,
    };
}

/**
 * 生成 Thread 的时间轴排序器。
 * 主线优先，其余保持数据集当前顺序。
 */
function compareTimelineThreads(allThreads: PlotPreviewThread[]): (left: PlotPreviewThread, right: PlotPreviewThread) => number {
    const threadIndexMap = new Map(allThreads.map((thread, index) => [thread.id, index]));

    /**
     * 比较两个 Thread 的时间轴顺序。
     */
    return (left, right) => {
        if (left.isMainThread !== right.isMainThread) {
            return left.isMainThread ? -1 : 1;
        }

        return (threadIndexMap.get(left.id) ?? 0) - (threadIndexMap.get(right.id) ?? 0);
    };
}

/**
 * 找出当前 Phase 实际覆盖到的章节，顺序沿用全局章节顺序。
 */
function resolveCoveredChapters(
    chapters: PlotPreviewChapter[],
    scenes: PlotPreviewScene[],
): PlotPreviewChapter[] {
    const coveredChapterIds = new Set(
        scenes
            .filter((scene) => scene.chapterPath !== null)
            .map((scene) => scene.chapterPath as string),
    );

    return chapters.filter((chapter) => coveredChapterIds.has(chapter.id));
}

/**
 * 计算每个章节需要占用多少个横向 Scene 槽位。
 */
function resolveChapterSlotCounts(
    chapters: PlotPreviewChapter[],
    scenes: PlotPreviewScene[],
): Map<string, number> {
    const slotCountMap = new Map<string, number>();

    for (const chapter of chapters) {
        const chapterScenes = scenes.filter((scene) => scene.chapterPath === chapter.id);
        const maxSortOrder = Math.max(...chapterScenes.map((scene) => scene.chapterSortOrder ?? 0));

        slotCountMap.set(chapter.id, maxSortOrder + 1);
    }

    return slotCountMap;
}

/**
 * 计算草稿尾区需要保留多少个槽位。
 * 规则是各泳道未挂章 Scene 数量的最大值。
 */
function resolveDraftSlotCount(
    threads: PlotPreviewThread[],
    scenes: PlotPreviewScene[],
): number {
    const maxDraftCount = Math.max(
        0,
        ...threads.map((thread) => {
            return scenes.filter((scene) => scene.threadId === thread.id && scene.chapterPath === null).length;
        }),
    );

    return maxDraftCount;
}

/**
 * 构建顶部章节段与草稿尾区段。
 */
function buildTimelineSegments(
    chapters: PlotPreviewChapter[],
    chapterCounts: Map<string, number>,
    draftSlotCount: number,
): PlotTimelineSegment[] {
    const segments: PlotTimelineSegment[] = [];
    let currentStart = 0;

    for (const chapter of chapters) {
        const span = chapterCounts.get(chapter.id) ?? 0;

        if (span <= 0) {
            continue;
        }

        segments.push({
            id: chapter.id,
            kind: "chapter",
            title: chapter.numberLabel,
            subtitle: chapter.title,
            start: currentStart,
            span,
            chapterId: chapter.id,
        });
        currentStart += span;
    }

    if (draftSlotCount > 0) {
        segments.push({
            id: "draft-tail",
            kind: "draft",
            title: "草稿尾区",
            subtitle: "未挂章 Scene",
            start: currentStart,
            span: draftSlotCount,
            chapterId: null,
        });
    }

    return segments;
}

/**
 * 把顶部段拍平成逐槽位元信息，供泳道背景渲染。
 */
function buildTimelineSlots(segments: PlotTimelineSegment[]): PlotTimelineSlot[] {
    const slots: PlotTimelineSlot[] = [];

    for (const segment of segments) {
        for (let offset = 0; offset < segment.span; offset += 1) {
            slots.push({
                index: segment.start + offset,
                kind: segment.kind,
                chapterId: segment.chapterId,
                label: segment.kind === "chapter" ? `${segment.title} · ${offset + 1}` : `草稿 ${offset + 1}`,
            });
        }
    }

    return slots;
}

/**
 * 计算每个 Scene 对应的全局槽位下标。
 */
function resolveSceneSlotIndices(
    scenes: PlotPreviewScene[],
    segments: PlotTimelineSegment[],
): Map<string, number> {
    const chapterStartMap = new Map(
        segments
            .filter((segment) => segment.kind === "chapter" && segment.chapterId !== null)
            .map((segment) => [segment.chapterId as string, segment.start]),
    );
    const draftSegment = segments.find((segment) => segment.kind === "draft") ?? null;
    const draftCounts = new Map<string, number>();
    const slotIndexMap = new Map<string, number>();
    const orderedScenes = [...scenes].sort(compareScenesForTimeline);

    for (const scene of orderedScenes) {
        if (scene.chapterPath !== null && scene.chapterSortOrder !== null) {
            const chapterStart = chapterStartMap.get(scene.chapterPath);

            if (chapterStart !== undefined) {
                slotIndexMap.set(scene.id, chapterStart + scene.chapterSortOrder);
                continue;
            }
        }

        if (!draftSegment) {
            continue;
        }

        const draftIndex = draftCounts.get(scene.threadId) ?? 0;
        slotIndexMap.set(scene.id, draftSegment.start + draftIndex);
        draftCounts.set(scene.threadId, draftIndex + 1);
    }

    return slotIndexMap;
}

/**
 * 生成单条泳道的全部槽位内容。
 */
function buildTimelineLane(
    thread: PlotPreviewThread,
    allScenes: PlotPreviewScene[],
    slots: PlotTimelineSlot[],
    sceneSlots: Map<string, number>,
    chapterMap: Map<string, PlotPreviewChapter>,
): PlotTimelineLane {
    const threadScenes = allScenes
        .filter((scene) => scene.threadId === thread.id)
        .sort(compareScenesForTimeline);
    const slotCards = Array.from({length: slots.length}, () => [] as PlotTimelineCard[]);

    for (const scene of threadScenes) {
        const slotIndex = sceneSlots.get(scene.id);

        if (slotIndex === undefined || !slotCards[slotIndex]) {
            continue;
        }

        slotCards[slotIndex].push({
            scene,
            slotIndex,
            slotLabel: slots[slotIndex]?.label ?? `槽位 ${slotIndex + 1}`,
            chapter: scene.chapterPath ? (chapterMap.get(scene.chapterPath) ?? null) : null,
        });
    }

    return {
        thread,
        slotCards,
        totalSceneCount: threadScenes.length,
        chapterSceneCount: threadScenes.filter((scene) => scene.chapterPath !== null).length,
        draftSceneCount: threadScenes.filter((scene) => scene.chapterPath === null).length,
    };
}

/**
 * 时间轴里 Scene 的稳定排序。
 * 优先按正文章节顺序，其次按 threadSortOrder。
 */
function compareScenesForTimeline(left: PlotPreviewScene, right: PlotPreviewScene): number {
    const leftChapterOrder = left.chapterSortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightChapterOrder = right.chapterSortOrder ?? Number.MAX_SAFE_INTEGER;

    if (left.chapterPath !== right.chapterPath) {
        return String(left.chapterPath ?? "zzzz").localeCompare(String(right.chapterPath ?? "zzzz"), "zh-Hans-CN");
    }

    if (leftChapterOrder !== rightChapterOrder) {
        return leftChapterOrder - rightChapterOrder;
    }

    return left.threadSortOrder - right.threadSortOrder;
}
