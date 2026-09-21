<script setup lang="ts">
import {computed, ref} from "vue";
import {plotPreviewDataset} from "nbook/app/components/novel-ide/plot/plot-preview.data";
import type {
    PlotPreviewRef,
    PlotPreviewScene,
    PlotPreviewThread,
} from "nbook/app/components/novel-ide/plot/plot-preview.types";
import PlotThreadPanelShell from "nbook/app/components/novel-ide/plot/thread-panel/PlotThreadPanelShell.vue";
import type {
    PlotThreadPanelDetail,
    PlotThreadPanelRef,
    PlotThreadPanelScene,
    PlotThreadPanelThread,
} from "nbook/app/components/novel-ide/plot/thread-panel/plot-thread-panel.types";
import PlotWorkbenchDialog from "nbook/app/components/novel-ide/plot/workbench/PlotWorkbenchDialog.vue";

const workbenchVisible = ref(true);
const emptyWorldAnchor = {
    startTime: null,
    endTime: null,
    startInstant: null,
    endInstant: null,
    subjectIds: [],
    locationSubjectId: null,
    subjects: [],
    locationSubject: null,
    unresolvedSubjectIds: [],
} satisfies PlotThreadPanelScene["worldAnchor"];
const selectedThreadId = ref<string | null>("thread-main");
const selectedSceneId = ref<string | null>("scene-auction");
const pinnedThreadIds = ref<string[]>(["thread-main"]);
const extraThreads: PlotThreadPanelThread[] = [
    {
        id: "thread-system",
        phaseId: "phase-arrival",
        title: "系统升级线",
        summary: "系统从濒死触发到逐步开放能力，服务逃亡与反击节奏。",
        status: "active",
        isMainThread: false,
        miceType: null,
        tags: ["系统", "成长"],
        writingTip: "系统信息只在主角做选择时出现，避免独立说明段。",
        tone: "sky",
        refs: [],
    },
    {
        id: "thread-ritual",
        phaseId: "phase-arrival",
        title: "秘法血脉线",
        summary: "祭坛、血脉与邪教仪式背后的规则线。",
        status: "paused",
        isMainThread: false,
        miceType: null,
        tags: ["血脉", "仪式"],
        writingTip: "每次揭示只给一个规则，不要一次解释完整体系。",
        tone: "rose",
        refs: [],
    },
    {
        id: "thread-doctrine",
        phaseId: "phase-unlock",
        title: "邪教仪式线",
        summary: "邪教追杀、祭司命令与献祭目标的压力来源。",
        status: "paused",
        isMainThread: false,
        miceType: null,
        tags: ["邪教", "追杀"],
        writingTip: "反派行动要有组织性，让追杀不是随机遭遇。",
        tone: "emerald",
        refs: [],
    },
    {
        id: "thread-hollow",
        phaseId: null,
        title: "虚空之路线",
        summary: "用于承接后续世界观扩展与异界通道。",
        status: "draft",
        isMainThread: false,
        miceType: null,
        tags: ["世界", "通道"],
        writingTip: null,
        tone: "sky",
        refs: [],
    },
];

const extraScenes: PlotThreadPanelScene[] = [
    {
        id: "scene-counterattack",
        threadId: "thread-main",
        chapterId: "chapter-02",
        title: "反杀落单敌人，激活系统",
        summary: "主角利用祭坛阴影诱导追兵分散，在绝境中反杀落单敌人，并第一次触发系统反馈。",
        purpose: "把逃亡线从被动闪避推进到主动求生，建立系统能力的第一次可信使用。",
        status: "draft",
        outcomeType: null,
        pacingRole: null,
        threadSortOrder: 3,
        chapterSortOrder: 2,
        writingTip: "反杀要显得勉强，重点放在代价和判断，不要写成突然开挂。",
        worldAnchor: emptyWorldAnchor,
        refs: [],
    },
    {
        id: "scene-message",
        threadId: "thread-main",
        chapterId: "chapter-02",
        title: "传送阵逃脱",
        summary: "主角抢在追兵合围前启动残破传送阵，带着未解的身份线索逃离祭坛区域。",
        purpose: "完成第一阶段逃亡，同时把下一阶段目的地和追杀后果抛给读者。",
        status: "draft",
        outcomeType: null,
        pacingRole: null,
        threadSortOrder: 4,
        chapterSortOrder: 3,
        writingTip: "传送不是胜利，而是从局部危机进入更大的未知。",
        worldAnchor: emptyWorldAnchor,
        refs: [],
    },
];

const threads = ref<PlotThreadPanelThread[]>(cloneThreads(plotPreviewDataset.threads));
const scenes = ref<PlotThreadPanelScene[]>(cloneScenes(plotPreviewDataset.scenes));
const chapters = plotPreviewDataset.chapters;

const threadMap = computed(() => new Map(threads.value.map((thread) => [thread.id, thread])));
const sceneMap = computed(() => new Map(scenes.value.map((scene) => [scene.id, scene])));
const chapterMap = computed(() => new Map(chapters.map((chapter) => [chapter.id, chapter])));

const selectedThread = computed(() => selectedThreadId.value ? (threadMap.value.get(selectedThreadId.value) ?? null) : null);
const selectedScene = computed(() => selectedSceneId.value ? (sceneMap.value.get(selectedSceneId.value) ?? null) : null);
const detail = computed<PlotThreadPanelDetail | null>(() => {
    const thread = selectedThread.value;
    const scene = selectedScene.value;

    if (!thread || !scene || scene.threadId !== thread.id) {
        return null;
    }

    return {
        thread,
        scene,
        chapter: scene.chapterId ? (chapterMap.value.get(scene.chapterId) ?? null) : null,
        effectiveRefs: [
            ...thread.refs.map((refItem) => ({...refItem, source: "thread" as const})),
            ...scene.refs.map((refItem) => ({...refItem, source: "scene" as const})),
        ],
        // 预览 mock 无规划层数据,promise beats 恒为空。
        promiseBeats: [],
    };
});

/**
 * 选中 Thread，并同步到该 Thread 的第一个 Scene。
 */
function selectThread(threadId: string): void {
    selectedThreadId.value = threadId;

    const nextScene = scenes.value
        .filter((scene) => scene.threadId === threadId)
        .sort((left, right) => left.threadSortOrder - right.threadSortOrder)[0] ?? null;
    selectedSceneId.value = nextScene?.id ?? null;
}

/**
 * 选中 Scene，并同步所属 Thread。
 */
function selectScene(sceneId: string): void {
    const scene = sceneMap.value.get(sceneId) ?? null;
    if (!scene) {
        return;
    }

    selectedSceneId.value = scene.id;
    selectedThreadId.value = scene.threadId;
}

/**
 * 收起剧情大纲底部详情。
 */
function closeDetail(): void {
    selectedSceneId.value = null;
}

/**
 * 按拖拽结果重排当前 Thread 的 Scene。
 */
function reorderScenes(sceneIds: string[]): void {
    const orderMap = new Map(sceneIds.map((sceneId, index) => [sceneId, index]));
    scenes.value = scenes.value.map((scene) => {
        const nextOrder = orderMap.get(scene.id);
        return nextOrder === undefined ? scene : {...scene, threadSortOrder: nextOrder};
    });
}

/**
 * 在当前 Thread 下新增一个 Scene 草稿。
 */
function createScene(threadId: string): void {
    const threadScenes = scenes.value.filter((scene) => scene.threadId === threadId);
    const nextOrder = threadScenes.length;
    const nextScene: PlotThreadPanelScene = {
        id: `scene-preview-${Date.now()}`,
        threadId,
        chapterId: null,
        title: `新建 Scene ${nextOrder + 1}`,
        summary: "这里记录新 Scene 的主要事件、场面变化和读者需要获得的信息。",
        purpose: "明确这个 Scene 推进哪一段冲突或揭示哪一条线索。",
        status: "draft",
        outcomeType: null,
        pacingRole: null,
        threadSortOrder: nextOrder,
        chapterSortOrder: null,
        writingTip: "先写目标，再补动作，不要让场景只承担说明功能。",
        worldAnchor: emptyWorldAnchor,
        refs: [],
    };

    scenes.value = [...scenes.value, nextScene];
    selectedThreadId.value = threadId;
    selectedSceneId.value = nextScene.id;
}

/**
 * 新建一个 preview Thread。
 */
function createThread(): void {
    const nextIndex = threads.value.length + 1;
    const nextThread: PlotThreadPanelThread = {
        id: `thread-preview-${Date.now()}`,
        phaseId: null,
        title: `新建剧情线 ${nextIndex}`,
        summary: "用于临时验证剧本工作台里的 Thread 创建、筛选与右键操作。",
        status: "draft",
        isMainThread: false,
        miceType: null,
        tags: ["mock"],
        writingTip: "先写清楚这条线承担的冲突，再拆成 Scene。",
        tone: "sky",
        refs: [],
    };
    threads.value = [nextThread, ...threads.value];
    selectedThreadId.value = nextThread.id;
    selectedSceneId.value = null;
}

/**
 * Pin 或取消 Pin Thread。
 */
function toggleThreadPin(threadId: string): void {
    pinnedThreadIds.value = pinnedThreadIds.value.includes(threadId)
        ? pinnedThreadIds.value.filter((id) => id !== threadId)
        : [threadId, ...pinnedThreadIds.value];
}

/**
 * 标记或取消主线。
 */
function toggleThreadMain(threadId: string): void {
    threads.value = threads.value.map((thread) => thread.id === threadId
        ? {
            ...thread,
            isMainThread: !thread.isMainThread,
        }
        : thread);
}

/**
 * 删除 preview Thread，并清理其下 Scene。
 */
function deleteThread(threadId: string): void {
    threads.value = threads.value.filter((thread) => thread.id !== threadId);
    scenes.value = scenes.value.filter((scene) => scene.threadId !== threadId);
    pinnedThreadIds.value = pinnedThreadIds.value.filter((id) => id !== threadId);

    if (selectedThreadId.value !== threadId) {
        return;
    }
    const nextThread = threads.value[0] ?? null;
    selectedThreadId.value = nextThread?.id ?? null;
    const nextScene = nextThread
        ? scenes.value.filter((scene) => scene.threadId === nextThread.id).sort((left, right) => left.threadSortOrder - right.threadSortOrder)[0] ?? null
        : null;
    selectedSceneId.value = nextScene?.id ?? null;
}

/**
 * 更新 Thread mock 数据。
 */
function updateThread(threadId: string, patch: Partial<PlotThreadPanelThread>): void {
    threads.value = threads.value.map((thread) => thread.id === threadId
        ? {
            ...thread,
            ...patch,
        }
        : thread);
}

/**
 * 更新 Scene mock 数据。
 */
function updateScene(sceneId: string, patch: Partial<PlotThreadPanelScene>): void {
    scenes.value = scenes.value.map((scene) => scene.id === sceneId
        ? {
            ...scene,
            ...patch,
        }
        : scene);
}

/**
 * 把预览引用转换为侧边栏引用模型。
 */
function cloneRefs(source: PlotPreviewRef[]): PlotThreadPanelRef[] {
    return source.map((refItem) => ({...refItem}));
}

/**
 * 克隆 Thread mock 数据。
 */
function cloneThreads(source: PlotPreviewThread[]): PlotThreadPanelThread[] {
    return [...source.map((thread) => ({
        ...thread,
        ...(thread.id === "thread-main"
            ? {
                title: "荒野祭坛逃亡线",
                summary: "主角在荒野祭坛醒来，卷入邪教仪式并被追杀。为生存，他激活系统，获得能力，逃出祭坛区域，开启与邪教的对抗之旅。",
                writingTip: "突出 [荒野祭坛](lorebook/location/initial-stage/) 的环境压迫感与逃离节奏；克制描写主角状态，更多通过行动与选择展现性格；初期隐藏最终祭品概念，逐步揭示系统与身份背景。",
                tags: ["逃亡", "仪式", "系统"],
            }
            : {}),
        status: thread.status as PlotThreadPanelThread["status"],
        miceType: null,
        tags: thread.id === "thread-main" ? ["逃亡", "仪式", "系统"] : [...thread.tags],
        refs: cloneRefs(thread.refs),
    })), ...extraThreads];
}

/**
 * 克隆 Scene mock 数据。
 */
function cloneScenes(source: PlotPreviewScene[]): PlotThreadPanelScene[] {
    return [...source.map((scene) => {
        const {chapterPath, ...rest} = scene;
        return {
        ...rest,
        // 预览 mock 仍以路径占位;桥接到面板模型时映射为 chapterId 占位值。
        chapterId: chapterPath,
        outcomeType: null,
        pacingRole: null,
        worldAnchor: emptyWorldAnchor,
        ...(scene.id === "scene-auction"
            ? {
                title: "祭坛苏醒",
                summary: "主角在 [荒野祭坛](lorebook/location/initial-stage/) 醒来，意识混乱，发现自己被困在诡异的仪式现场。四周烛火摇曳，空气中弥漫着血与香料的混合气味，远处传来低沉的吟诵声。身体的疼痛让他判断自己被卷入一场以献祭为名的仪式，必须尽快挣脱束缚并理解眼前的规则，才能找到逃生的机会。",
                purpose: "建立环境压迫感，引出主角身份危机与系统触发，为后续逃脱对抗埋下伏笔。",
                writingTip: "通过感官描写与碎片记忆渲染混乱；节奏压抑，避免过早释出关键信息。",
            }
            : {}),
        ...(scene.id === "scene-cage"
            ? {
                title: "邪物气息逼近",
                summary: "仪式外侧传来拖拽与喘息声，主角意识到真正的危险正在靠近，必须在守卫发现前完成脱身。",
                purpose: "把静态压迫转成即时追逐，迫使主角做出第一次选择。",
                writingTip: "声音先于实体出现，用距离变化制造倒计时感。",
            }
            : {}),
        ...(scene.id === "scene-ledger"
            ? {
                title: "逃入黑暗走廊",
                summary: "主角挣脱束缚后冲入祭坛后的石廊，借助微弱提示避开第一轮搜捕。",
                purpose: "完成第一段逃脱，同时展示系统不是万能解法，只能提供有限线索。",
                writingTip: "动作要短促，避免解释系统设定，把信息藏在逃亡判断里。",
            }
            : {}),
        refs: cloneRefs(scene.refs),
    };
    }), ...extraScenes];
}

</script>

<template>
    <!-- 剧情大纲侧边栏 + 工作台 Dialog 预览 -->
    <div class="flex min-h-[760px] w-full gap-5">
        <div class="flex min-h-[760px] shrink-0 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[0_24px_70px_color-mix(in_srgb,var(--shadow-color)_10%,transparent)]">
            <PlotThreadPanelShell
                :threads="threads"
                :scenes="scenes"
                :chapters="chapters"
                :selected-thread-id="selectedThreadId"
                :selected-scene-id="selectedSceneId"
                :detail="detail"
                diagnostics=""
                @select-thread="selectThread"
                @select-scene="selectScene"
                @close-detail="closeDetail"
                @create-scene="workbenchVisible = true"
                @edit-thread="workbenchVisible = true"
                @edit-scene="workbenchVisible = true"
                @quick-update-scene="() => undefined"
                @open-thread-menu="workbenchVisible = true"
                @open-scene-menu="workbenchVisible = true"
                @open-root-menu="workbenchVisible = true"
                @reorder-scenes="reorderScenes"
            />
        </div>

        <section class="flex min-w-0 flex-1 flex-col justify-center rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-panel)]/70 px-8 py-10 text-center">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]">
                <span class="i-lucide-panels-top-left h-6 w-6"></span>
            </div>
            <h2 class="mt-4 text-xl font-semibold text-[var(--text-main)]">剧本工作台 Dialog 预览</h2>
            <p class="mx-auto mt-3 max-w-[560px] text-sm leading-7 text-[var(--text-secondary)]">
                左侧剧情大纲侧边栏保持现状。点击按钮打开新的剧本工作台 mock，用于验证截图方向的信息密度、布局和主题表现。
            </p>
            <button
                type="button"
                class="mx-auto mt-5 inline-flex h-10 items-center gap-2 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 text-sm font-semibold text-[var(--status-warning)] transition-colors hover:bg-[var(--bg-hover)]"
                @click="workbenchVisible = true"
            >
                <span class="i-lucide-panels-top-left h-4 w-4"></span>
                打开剧本工作台
            </button>
        </section>

        <PlotWorkbenchDialog
            v-model="workbenchVisible"
            project-root="workspace/preview"
            :story="plotPreviewDataset.story"
            :phases="plotPreviewDataset.phases"
            :threads="threads"
            :scenes="scenes"
            :chapters="chapters"
            :selected-thread-id="selectedThreadId"
            :selected-scene-id="selectedSceneId"
            :pinned-thread-ids="pinnedThreadIds"
            @select-thread="selectThread"
            @select-scene="selectScene"
            @create-thread="createThread"
            @toggle-thread-pin="toggleThreadPin"
            @toggle-thread-main="toggleThreadMain"
            @delete-thread="deleteThread"
            @create-scene="createScene"
            @auto-sort-scenes="reorderScenes"
            @reorder-scenes="reorderScenes"
            @update-thread="updateThread"
            @update-scene="updateScene"
        />
    </div>
</template>
