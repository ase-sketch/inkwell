<script setup lang="ts">
import {computed, ref} from "vue";
import PlotInspector from "nbook/app/components/novel-ide/plot/PlotInspector.vue";
import {plotPreviewDataset} from "nbook/app/components/novel-ide/plot/plot-preview.data";
import type {PlotPreviewFocus} from "nbook/app/components/novel-ide/plot/plot-preview.types";
import PlotTimelineView from "nbook/app/components/novel-ide/plot/timeline/PlotTimelineView.vue";
import {buildPlotTimelinePhaseView} from "nbook/app/components/novel-ide/plot/timeline/plot-timeline.derive";

const phaseId = ref("phase-arrival");
const selectedThreadId = ref<string | null>("thread-main");
const selectedSceneId = ref<string | null>("scene-cage");
const selectedChapterId = ref<string | null>("chapter-01");
const renderRevision = ref(0);

const story = plotPreviewDataset.story;
const phases = plotPreviewDataset.phases;
const threads = plotPreviewDataset.threads;
const scenes = plotPreviewDataset.scenes;
const chapters = plotPreviewDataset.chapters;

const timeline = computed(() => {
    return buildPlotTimelinePhaseView(plotPreviewDataset, phaseId.value);
});

const threadMap = computed(() => {
    return new Map(threads.map((thread) => [thread.id, thread]));
});

const sceneMap = computed(() => {
    return new Map(scenes.map((scene) => [scene.id, scene]));
});

const chapterMap = computed(() => {
    return new Map(chapters.map((chapter) => [chapter.id, chapter]));
});

/**
 * 当前选中的 Thread。
 */
const selectedThread = computed(() => {
    return selectedThreadId.value ? (threadMap.value.get(selectedThreadId.value) ?? null) : null;
});

/**
 * 当前选中的 Scene。
 */
const selectedScene = computed(() => {
    return selectedSceneId.value ? (sceneMap.value.get(selectedSceneId.value) ?? null) : null;
});

/**
 * 当前选中的 Chapter。
 */
const selectedChapter = computed(() => {
    return selectedChapterId.value ? (chapterMap.value.get(selectedChapterId.value) ?? null) : null;
});

/**
 * 统一生成检查器对象。
 */
const focus = computed<PlotPreviewFocus | null>(() => {
    if (selectedScene.value) {
        const thread = threadMap.value.get(selectedScene.value.threadId) ?? null;
        const chapter = selectedScene.value.chapterPath ? (chapterMap.value.get(selectedScene.value.chapterPath) ?? null) : null;

        return {
            kind: "scene",
            title: selectedScene.value.title,
            summary: selectedScene.value.summary,
            meta: [
                `线程：${thread?.title ?? "未知 Thread"}`,
                `章节：${chapter?.numberLabel ?? "未挂章"}`,
                `状态：${selectedScene.value.status}`,
                `Refs：${selectedScene.value.refs.length}`,
            ],
            refs: [...(thread?.refs ?? []), ...selectedScene.value.refs],
            writingTip: selectedScene.value.writingTip,
        };
    }

    if (selectedThread.value) {
        return {
            kind: "thread",
            title: selectedThread.value.title,
            summary: selectedThread.value.summary,
            meta: [
                selectedThread.value.isMainThread ? "主线 Thread" : "支线 Thread",
                `状态：${selectedThread.value.status}`,
                `标签：${selectedThread.value.tags.join(" / ") || "无"}`,
            ],
            refs: selectedThread.value.refs,
            writingTip: selectedThread.value.writingTip,
        };
    }

    if (selectedChapter.value) {
        const chapterScenes = scenes.filter((scene) => scene.chapterPath === selectedChapter.value?.id);

        return {
            kind: "chapter",
            title: `${selectedChapter.value.numberLabel} ${selectedChapter.value.title}`,
            summary: selectedChapter.value.summary,
            meta: [
                `卷：${selectedChapter.value.volumeTitle}`,
                `Scene：${chapterScenes.length}`,
            ],
            refs: [],
            writingTip: null,
        };
    }

    return {
        kind: "story",
        title: story.title,
        summary: story.summary,
        meta: [`Phase：${phases.length}`, `Thread：${threads.length}`, `Scene：${scenes.length}`],
        refs: [],
        writingTip: null,
    };
});

/**
 * 切换当前 StoryPhase，并自动把选择态落到该阶段的第一条线。
 */
function selectPhase(nextPhaseId: string): void {
    phaseId.value = nextPhaseId;

    const nextTimeline = buildPlotTimelinePhaseView(plotPreviewDataset, nextPhaseId);
    const firstLane = nextTimeline?.lanes[0] ?? null;
    const firstCard = firstLane?.slotCards.flat()[0] ?? null;

    selectedThreadId.value = firstLane?.thread.id ?? null;
    selectedSceneId.value = firstCard?.scene.id ?? null;
    selectedChapterId.value = firstCard?.scene.chapterPath ?? null;
}

/**
 * 选中一个 Thread，并尽量同步该泳道下的第一张 Scene。
 */
function selectThread(threadId: string): void {
    selectedThreadId.value = threadId;

    const lane = timeline.value?.lanes.find((item) => item.thread.id === threadId) ?? null;
    const firstCard = lane?.slotCards.flat()[0] ?? null;

    if (!firstCard) {
        return;
    }

    selectedSceneId.value = firstCard.scene.id;
    selectedChapterId.value = firstCard.scene.chapterPath;
}

/**
 * 选中一个 Scene，并同步 Thread / Chapter。
 */
function selectScene(sceneId: string): void {
    const scene = sceneMap.value.get(sceneId) ?? null;

    if (!scene) {
        return;
    }

    selectedSceneId.value = scene.id;
    selectedThreadId.value = scene.threadId;
    selectedChapterId.value = scene.chapterPath;
}

/**
 * 选中一个 Chapter，但不打掉当前 Scene / Thread。
 */
function selectChapter(chapterId: string): void {
    selectedChapterId.value = chapterId;
}

/**
 * 重置独立预览工作区状态。
 */
function resetWorkspace(): void {
    phaseId.value = "phase-arrival";
    selectedThreadId.value = "thread-main";
    selectedSceneId.value = "scene-cage";
    selectedChapterId.value = "chapter-01";
    renderRevision.value += 1;
}
</script>

<template>
    <!-- PlotTimeline 独立测试工作区 -->
    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <!-- 左侧时间轴区域 -->
        <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-3">
                <div>
                    <div class="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Timeline Preview Controls</div>
                    <div class="mt-1 text-sm text-[var(--text-secondary)]">单 StoryPhase 视角，横向按正文顺序排列，用章节背景分段承载多 Thread 的 Scene 并行关系。</div>
                </div>

                <button
                    type="button"
                    class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                    @click="resetWorkspace"
                >
                    重置时间轴状态
                </button>
            </div>

            <div class="rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-4">
                <div class="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">StoryPhase</div>
                <div class="mt-3 flex flex-wrap gap-2">
                    <button
                        v-for="phase in phases"
                        :key="phase.id"
                        type="button"
                        class="rounded-full border px-3 py-1.5 text-xs transition-colors"
                        :class="phaseId === phase.id
                            ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                        @click="selectPhase(phase.id)"
                    >
                        {{ phase.title }}
                    </button>
                </div>
            </div>

            <PlotTimelineView
                v-if="timeline"
                :key="renderRevision"
                :timeline="timeline"
                :selected-thread-id="selectedThreadId"
                :selected-scene-id="selectedSceneId"
                :selected-chapter-id="selectedChapterId"
                @select-thread="selectThread"
                @select-scene="selectScene"
                @select-chapter="selectChapter"
            />
        </div>

        <!-- 右侧检查器 -->
        <PlotInspector :focus="focus" />
    </div>
</template>
