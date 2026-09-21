<script setup lang="ts">
import {computed, reactive, ref} from "vue";
import PlotChapterView from "nbook/app/components/novel-ide/plot/PlotChapterView.vue";
import PlotInspector from "nbook/app/components/novel-ide/plot/PlotInspector.vue";
import PlotLocatorView from "nbook/app/components/novel-ide/plot/PlotLocatorView.vue";
import PlotThreadView from "nbook/app/components/novel-ide/plot/PlotThreadView.vue";
import PlotTreeView from "nbook/app/components/novel-ide/plot/PlotTreeView.vue";
import PlotViewSwitcher from "nbook/app/components/novel-ide/plot/PlotViewSwitcher.vue";
import {plotPreviewDataset} from "nbook/app/components/novel-ide/plot/plot-preview.data";
import type {
    PlotTreeGraph,
} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";
import type {
    PlotPreviewFocus,
    PlotPreviewScene,
    PlotPreviewSelection,
    PlotPreviewThread,
    PlotPreviewView,
} from "nbook/app/components/novel-ide/plot/plot-preview.types";

const activeView = ref<PlotPreviewView>("locator");
const locatorQuery = ref("");

const selection = reactive<PlotPreviewSelection>({
    phaseId: "phase-arrival",
    threadId: "thread-main",
    sceneId: "scene-cage",
    chapterId: "chapter-01",
});

const story = plotPreviewDataset.story;
const phases = plotPreviewDataset.phases;
const threads = plotPreviewDataset.threads;
const scenes = plotPreviewDataset.scenes;
const chapters = plotPreviewDataset.chapters;

/**
 * 线程索引。
 */
const threadMap = computed(() => {
    return new Map(threads.map((thread) => [thread.id, thread]));
});

/**
 * 场景索引。
 */
const sceneMap = computed(() => {
    return new Map(scenes.map((scene) => [scene.id, scene]));
});

/**
 * 章节索引。
 */
const chapterMap = computed(() => {
    return new Map(chapters.map((chapter) => [chapter.id, chapter]));
});

/**
 * 旧预览数据适配为新的 PlotTree 图输入。
 * 这里不保留 StoryPhase，只保留 Thread / Scene。
 */
const treeGraph = computed<PlotTreeGraph>(() => {
    const sortedSceneIdsByThread = new Map<string, string[]>();

    for (const thread of threads) {
        sortedSceneIdsByThread.set(
            thread.id,
            scenes
                .filter((scene) => scene.threadId === thread.id)
                .sort((left, right) => left.threadSortOrder - right.threadSortOrder)
                .map((scene) => scene.id),
        );
    }

    return {
        story: {
            id: story.id,
            title: story.title,
            summary: story.summary,
            startLabel: "主线开始",
        },
        threads: threads.map((thread, index) => ({
            id: thread.id,
            title: thread.title,
            summary: thread.summary,
            status: thread.status,
            isMainThread: thread.isMainThread,
            tone: thread.tone,
            position: {
                x: 260,
                y: 80 + (index * 360),
            },
        })),
        scenes: scenes.map((scene) => {
            const sceneIds = sortedSceneIdsByThread.get(scene.threadId) ?? [];
            const sceneIndex = sceneIds.indexOf(scene.id);
            const chapter = scene.chapterPath ? chapterMap.value.get(scene.chapterPath) ?? null : null;
            const ownerThread = threadMap.value.get(scene.threadId) ?? null;

            return {
                id: scene.id,
                threadId: scene.threadId,
                title: scene.title,
                summary: scene.summary,
                status: scene.status,
                chapterLabel: chapter ? chapter.numberLabel : null,
                sourceId: sceneIndex > 0 ? (sceneIds[sceneIndex - 1] ?? null) : "plot-root-start",
                isMainBranch: ownerThread?.isMainThread ?? false,
                position: {
                    x: 28 + (Math.max(sceneIndex, 0) * 248),
                    y: 96,
                },
            };
        }),
    };
});

/**
 * 当前选中线程。
 */
const selectedThread = computed(() => {
    return selection.threadId ? threadMap.value.get(selection.threadId) ?? null : null;
});

/**
 * 当前选中场景。
 */
const selectedScene = computed(() => {
    return selection.sceneId ? sceneMap.value.get(selection.sceneId) ?? null : null;
});

/**
 * 当前选中章节。
 */
const selectedChapter = computed(() => {
    return selection.chapterId ? chapterMap.value.get(selection.chapterId) ?? null : null;
});

/**
 * 计算一个 Scene 的有效 refs。
 */
const resolveEffectiveRefs = (scene: PlotPreviewScene) => {
    const threadRefs = threadMap.value.get(scene.threadId)?.refs ?? [];
    return [...threadRefs, ...scene.refs];
};

/**
 * 选中线程，并同步 phase / scene / chapter。
 */
const selectThread = (threadId: string | null): void => {
    if (threadId === null) {
        selection.threadId = null;
        selection.sceneId = null;
        selection.chapterId = null;
        return;
    }

    const thread = threadMap.value.get(threadId);
    if (!thread) {
        return;
    }

    selection.threadId = thread.id;
    selection.phaseId = thread.phaseId;

    const nextScene = scenes
        .filter((scene) => scene.threadId === thread.id)
        .sort((left, right) => left.threadSortOrder - right.threadSortOrder)[0] ?? null;

    if (!nextScene) {
        selection.sceneId = null;
        selection.chapterId = null;
        return;
    }

    selectScene(nextScene.id);
};

/**
 * 选中 Scene，并同步 thread / chapter。
 */
const selectScene = (sceneId: string | null): void => {
    if (sceneId === null) {
        selection.sceneId = null;
        return;
    }

    const scene = sceneMap.value.get(sceneId);
    if (!scene) {
        return;
    }

    selection.sceneId = scene.id;
    selection.threadId = scene.threadId;
    selection.chapterId = scene.chapterPath;
    selection.phaseId = threadMap.value.get(scene.threadId)?.phaseId ?? null;
};

/**
 * 选中 Chapter，并优先同步到该章的第一个 Scene。
 */
const selectChapter = (chapterId: string): void => {
    selection.chapterId = chapterId;

    const nextScene = scenes
        .filter((scene) => scene.chapterPath === chapterId)
        .sort((left, right) => (left.chapterSortOrder ?? 0) - (right.chapterSortOrder ?? 0))[0] ?? null;

    if (!nextScene) {
        selection.sceneId = null;
        return;
    }

    selectScene(nextScene.id);
};

/**
 * 切换到章节视图并跳到对应章节。
 */
const jumpChapter = (chapterId: string): void => {
    activeView.value = "chapter";
    selectChapter(chapterId);
};

/**
 * 切换当前 phase，并自动选中该分组下第一条线程。
 */
const selectPhase = (phaseId: string | null): void => {
    selection.phaseId = phaseId;

    const nextThread = threads.find((thread) => thread.phaseId === phaseId);
    if (!nextThread) {
        selection.threadId = null;
        selection.sceneId = null;
        selection.chapterId = null;
        return;
    }

    selectThread(nextThread.id);
};

/**
 * 当前检查器聚焦对象。
 */
const currentFocus = computed<PlotPreviewFocus | null>(() => {
    const buildThreadFocus = (thread: PlotPreviewThread): PlotPreviewFocus => ({
        kind: "thread",
        title: thread.title,
        summary: thread.summary,
        meta: [
            thread.isMainThread ? "主线 Thread" : "支线 Thread",
            `状态：${thread.status}`,
            `Scene：${scenes.filter((scene) => scene.threadId === thread.id).length}`,
            `Refs：${thread.refs.length}`,
        ],
        refs: thread.refs,
        writingTip: thread.writingTip,
    });

    const buildSceneFocus = (scene: PlotPreviewScene): PlotPreviewFocus => ({
        kind: "scene",
        title: scene.title,
        summary: scene.summary,
        meta: [
            `所属 Thread：${threadMap.value.get(scene.threadId)?.title ?? "-"}`,
            `Thread 位次：${scene.threadSortOrder + 1}`,
            `Chapter 位次：${scene.chapterSortOrder === null ? "未挂章" : scene.chapterSortOrder + 1}`,
            `有效 Refs：${resolveEffectiveRefs(scene).length}`,
        ],
        refs: resolveEffectiveRefs(scene),
        writingTip: scene.writingTip,
    });

    const buildChapterFocus = (): PlotPreviewFocus | null => {
        if (!selectedChapter.value) {
            return null;
        }

        return {
            kind: "chapter",
            title: `${selectedChapter.value.numberLabel} ${selectedChapter.value.title}`,
            summary: selectedChapter.value.summary,
            meta: [
                selectedChapter.value.volumeTitle,
                `Scene：${scenes.filter((scene) => scene.chapterPath === selectedChapter.value?.id).length}`,
            ],
            refs: [],
            writingTip: null,
        };
    };

    if (activeView.value === "locator" && selectedThread.value) {
        return buildThreadFocus(selectedThread.value);
    }

    if (activeView.value === "thread") {
        if (selectedScene.value) {
            return buildSceneFocus(selectedScene.value);
        }
        if (selectedThread.value) {
            return buildThreadFocus(selectedThread.value);
        }
    }

    if (activeView.value === "chapter") {
        if (selectedScene.value) {
            return buildSceneFocus(selectedScene.value);
        }
        return buildChapterFocus();
    }

    if (activeView.value === "tree") {
        if (selectedScene.value) {
            return buildSceneFocus(selectedScene.value);
        }
        if (selectedThread.value) {
            return buildThreadFocus(selectedThread.value);
        }
    }

    return {
        kind: "story",
        title: story.title,
        summary: story.summary,
        meta: [
            `Phase：${phases.length}`,
            `Thread：${threads.length}`,
            `Scene：${scenes.length}`,
        ],
        refs: [],
        writingTip: null,
    };
});
</script>

<template>
    <!-- 剧情测试工作区 -->
    <div class="space-y-4">
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
                <div class="text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">Plot Workspace Preview</div>
                <div class="mt-1 text-2xl font-semibold text-[var(--text-main)]">剧情模块独立测试页</div>
                <div class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                    四个视图共享同一套选中态。这里先用内存 mock 数据调整信息架构、视觉密度和跳转规则，不接真实 API。
                </div>
            </div>

            <div class="grid gap-2 sm:grid-cols-3">
                <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-3 text-center">
                    <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Phase</div>
                    <div class="mt-1 text-lg font-semibold text-[var(--text-main)]">{{ phases.length }}</div>
                </div>
                <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-3 text-center">
                    <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Thread</div>
                    <div class="mt-1 text-lg font-semibold text-[var(--text-main)]">{{ threads.length }}</div>
                </div>
                <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-3 text-center">
                    <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Scene</div>
                    <div class="mt-1 text-lg font-semibold text-[var(--text-main)]">{{ scenes.length }}</div>
                </div>
            </div>
        </div>

        <PlotViewSwitcher v-model="activeView" />

        <div class="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div class="min-h-0">
                <PlotLocatorView
                    v-if="activeView === 'locator'"
                    :story="story"
                    :phases="phases"
                    :threads="threads"
                    :scenes="scenes"
                    :selected-phase-id="selection.phaseId"
                    :selected-thread-id="selection.threadId"
                    :search-query="locatorQuery"
                    @update:search-query="locatorQuery = $event"
                    @select-phase="selectPhase"
                    @select-thread="selectThread"
                />

                <PlotThreadView
                    v-else-if="activeView === 'thread'"
                    :threads="threads"
                    :chapters="chapters"
                    :scenes="scenes"
                    :selected-thread-id="selection.threadId"
                    :selected-scene-id="selection.sceneId"
                    @select-thread="selectThread"
                    @select-scene="selectScene"
                    @jump-chapter="jumpChapter"
                />

                <PlotChapterView
                    v-else-if="activeView === 'chapter'"
                    :chapters="chapters"
                    :threads="threads"
                    :scenes="scenes"
                    :selected-chapter-id="selection.chapterId"
                    :selected-scene-id="selection.sceneId"
                    @select-chapter="selectChapter"
                    @select-scene="selectScene"
                />

                <PlotTreeView
                    v-else
                    :graph="treeGraph"
                    :selected-thread-id="selection.threadId"
                    :selected-scene-id="selection.sceneId"
                    :editable="false"
                    @select-thread="selectThread"
                    @select-scene="selectScene"
                />
            </div>

            <PlotInspector :focus="currentFocus" />
        </div>
    </div>
</template>
