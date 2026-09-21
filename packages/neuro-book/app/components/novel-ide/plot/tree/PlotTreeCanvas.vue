<script setup lang="ts">
import {Background} from "@vue-flow/background";
import {Controls} from "@vue-flow/controls";
import {
    type Connection,
    type GraphNode,
    type NodeDragEvent,
    type NodeMouseEvent,
    Panel,
    useVueFlow,
    VueFlow,
} from "@vue-flow/core";
import {MiniMap} from "@vue-flow/minimap";
import {computed, nextTick, ref, watch} from "vue";
import PlotSceneNode from "nbook/app/components/novel-ide/plot/tree/PlotSceneNode.vue";
import PlotTreeToolbar from "nbook/app/components/novel-ide/plot/tree/PlotTreeToolbar.vue";
import PlotThreadGroupNode from "nbook/app/components/novel-ide/plot/tree/PlotThreadGroupNode.vue";
import PlotTreeRootNode from "nbook/app/components/novel-ide/plot/tree/PlotTreeRootNode.vue";
import {
    buildPlotTreeEdges,
    buildPlotTreeNodes,
    buildThreadMetricsMap,
    clonePlotTreeGraph,
    connectPlotTreeScene,
    createSceneDraft,
    createThreadDraft,
    disconnectSceneSource,
    hasSceneChildren,
    hasThreadScenes,
    moveSceneToThread,
    removeSceneDraft,
    removeThreadDraft,
    toggleSceneMainBranch,
    updateScenePosition,
} from "nbook/app/components/novel-ide/plot/tree/plot-tree.graph";
import {autoLayoutPlotTreeGraph} from "nbook/app/components/novel-ide/plot/tree/plot-tree.layout";
import {
    PLOT_TREE_ORPHAN_SCENE_STYLE,
    PLOT_TREE_ROOT_NODE_ID,
    PLOT_TREE_SCENE_CARD,
    PLOT_TREE_TONE_STYLES,
    type PlotTreeFlowNode,
    type PlotTreeGraph,
    type PlotTreeGraphNodeData,
    type PlotTreeNodeActions,
    type PlotTreePosition,
    type PlotTreeSelectionState,
} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";

const props = withDefaults(defineProps<{
    graph: PlotTreeGraph;
    selectedThreadId: string | null;
    selectedSceneId: string | null;
    editable?: boolean;
}>(), {
    editable: true,
});

const emit = defineEmits<{
    (e: "selectThread", threadId: string | null): void;
    (e: "selectScene", sceneId: string | null): void;
    (e: "update:graph", graph: PlotTreeGraph): void;
}>();

const flowId = `plot-tree-${props.graph.story.id}`;
const nodeTypes = {
    "plot-root": PlotTreeRootNode,
    "plot-thread": PlotThreadGroupNode,
    "plot-scene": PlotSceneNode,
};

const draftGraph = ref<PlotTreeGraph>(clonePlotTreeGraph(props.graph));
const nodes = ref<PlotTreeFlowNode[]>([]);
const edges = ref(buildPlotTreeEdges(draftGraph.value));
const shouldSkipNextPropSync = ref(false);
const selectionState = computed<PlotTreeSelectionState>(() => ({
    selectedThreadId: props.selectedThreadId,
    selectedSceneId: props.selectedSceneId,
}));

const {
    fitView,
    setNodes,
    setEdges,
    updateNode,
    updateNodeData,
    findNode,
    onInit,
} = useVueFlow({id: flowId});

/**
 * 节点级操作集合。
 * 节点上只保留高频快捷动作；结构规则仍由 graph helper 统一执行。
 */
const nodeActions: PlotTreeNodeActions = {
    addScene(threadId) {
        const nextGraph = clonePlotTreeGraph(draftGraph.value);
        const newScene = createSceneDraft(nextGraph, {threadId});

        nextGraph.scenes.push(newScene);
        rebuildGraph(nextGraph);
        focusScene(newScene.id, newScene.threadId);
    },
    deleteThread(threadId) {
        if (hasThreadScenes(draftGraph.value, threadId)) {
            notifyUser("当前 Thread 仍然包含 Scene，首版原型只允许删除空 Thread。");
            return;
        }

        const nextGraph = removeThreadDraft(draftGraph.value, threadId);

        rebuildGraph(nextGraph);
        emit("selectThread", nextGraph.threads[0]?.id ?? null);
        emit("selectScene", null);
    },
    addChildScene(sceneId) {
        const parentScene = draftGraph.value.scenes.find((scene) => scene.id === sceneId) ?? null;

        if (!parentScene) {
            return;
        }

        const nextGraph = clonePlotTreeGraph(draftGraph.value);
        const newScene = createSceneDraft(nextGraph, {
            threadId: parentScene.threadId,
            sourceId: parentScene.threadId ? null : parentScene.id,
            position: {
                x: parentScene.position.x + 248,
                y: parentScene.position.y,
            },
        });

        nextGraph.scenes.push(newScene);

        if (parentScene.threadId) {
            const result = connectPlotTreeScene(nextGraph, parentScene.id, newScene.id);

            if (!result.ok) {
                notifyUser(result.message);
                return;
            }

            rebuildGraph(result.graph);
        } else {
            rebuildGraph(nextGraph);
        }

        focusScene(newScene.id, newScene.threadId);
    },
    toggleSceneBranch(sceneId) {
        rebuildGraph(toggleSceneMainBranch(draftGraph.value, sceneId));
    },
    detachScene(sceneId) {
        const scene = draftGraph.value.scenes.find((item) => item.id === sceneId) ?? null;

        if (!scene) {
            return;
        }

        if (scene.threadId === null) {
            rebuildGraph(disconnectSceneSource(draftGraph.value, scene.id));
            focusScene(scene.id, null);
            return;
        }

        const sceneNode = findNode(sceneId);

        if (!sceneNode) {
            return;
        }

        const nextGraph = moveSceneToThread(
            draftGraph.value,
            scene.id,
            null,
            readNodeAbsolutePosition(sceneNode),
        );

        rebuildGraph(nextGraph);
        focusScene(scene.id, null);
    },
    deleteScene(sceneId) {
        if (hasSceneChildren(draftGraph.value, sceneId)) {
            notifyUser("当前 Scene 仍然挂有子节点。请先断开或重连子节点，再删除该 Scene。");
            return;
        }

        const scene = draftGraph.value.scenes.find((item) => item.id === sceneId) ?? null;
        const nextGraph = removeSceneDraft(draftGraph.value, sceneId);

        rebuildGraph(nextGraph);

        const fallbackScene = scene?.threadId
            ? (nextGraph.scenes.find((item) => item.threadId === scene.threadId) ?? null)
            : null;

        if (fallbackScene) {
            focusScene(fallbackScene.id, fallbackScene.threadId);
            return;
        }

        emit("selectScene", null);
        emit("selectThread", scene?.threadId ?? null);
    },
};

/**
 * 初始化画布节点。
 */
function initializeCanvas(): void {
    const initialNodes = buildPlotTreeNodes(draftGraph.value, selectionState.value, props.editable, nodeActions);
    const initialEdges = buildPlotTreeEdges(draftGraph.value);

    nodes.value = initialNodes;
    edges.value = initialEdges;
    setNodes(initialNodes);
    setEdges(initialEdges);
}

/**
 * 初始化后自动适配视口。
 */
onInit(async () => {
    initializeCanvas();
    await fitTreeToView();
});

/**
 * 适配整个树图到当前视口。
 */
async function fitTreeToView(): Promise<void> {
    await nextTick();
    await fitView({
        padding: 0.18,
        duration: 220,
    });
}

/**
 * 自动布局。
 * 当前只在 toolbar 点击时触发，不在结构编辑后自动重排。
 */
async function autoLayoutTree(): Promise<void> {
    rebuildGraph(autoLayoutPlotTreeGraph(draftGraph.value));
    await fitTreeToView();
}

/**
 * 结构性编辑统一走重建。
 * 这样可以保证单链规则、edges 和节点 data 同步一致。
 */
function rebuildGraph(nextGraph: PlotTreeGraph): void {
    draftGraph.value = clonePlotTreeGraph(nextGraph);
    shouldSkipNextPropSync.value = true;
    emit("update:graph", clonePlotTreeGraph(draftGraph.value));

    const nextNodes = buildPlotTreeNodes(draftGraph.value, selectionState.value, props.editable, nodeActions);
    const nextEdges = buildPlotTreeEdges(draftGraph.value);

    nodes.value = nextNodes;
    edges.value = nextEdges;
    setNodes(nextNodes);
    setEdges(nextEdges);
}

/**
 * 非结构性编辑只同步 graph，不整图重建。
 */
function persistGraph(nextGraph: PlotTreeGraph): void {
    draftGraph.value = clonePlotTreeGraph(nextGraph);
    shouldSkipNextPropSync.value = true;
    emit("update:graph", clonePlotTreeGraph(draftGraph.value));
}

/**
 * 聚焦到某个 Scene，并同步所属 Thread。
 */
function focusScene(sceneId: string, threadId: string | null): void {
    emit("selectScene", sceneId);
    emit("selectThread", threadId);
}

/**
 * 新建一个空 Thread。
 */
function addThread(): void {
    const nextGraph = clonePlotTreeGraph(draftGraph.value);
    const newThread = createThreadDraft(nextGraph);

    nextGraph.threads.push(newThread);
    rebuildGraph(nextGraph);
    emit("selectThread", newThread.id);
    emit("selectScene", null);
}

/**
 * 新建一个游离 Scene。
 */
function addOrphanScene(): void {
    const nextGraph = clonePlotTreeGraph(draftGraph.value);
    const newScene = createSceneDraft(nextGraph, {
        threadId: null,
        sourceId: null,
    });

    nextGraph.scenes.push(newScene);
    rebuildGraph(nextGraph);
    focusScene(newScene.id, null);
}

/**
 * 处理节点点击。
 */
function handleNodeClick(event: NodeMouseEvent): void {
    const data = event.node.data as PlotTreeGraphNodeData;

    if (data.kind === "thread") {
        emit("selectThread", data.thread.id);
        emit("selectScene", null);
        return;
    }

    if (data.kind === "scene") {
        focusScene(data.scene.id, data.scene.threadId);
    }
}

/**
 * 处理连线。
 * 结构合法性由 graph helper 统一返回。
 */
function handleConnect(connection: Connection): void {
    const sourceId = connection.source ?? null;
    const targetId = connection.target ?? null;

    if (!sourceId || !targetId) {
        return;
    }

    const result = connectPlotTreeScene(draftGraph.value, sourceId, targetId);

    if (!result.ok) {
        notifyUser(result.message);
        return;
    }

    rebuildGraph(result.graph);
    focusScene(targetId, result.graph.scenes.find((scene) => scene.id === targetId)?.threadId ?? null);
}

/**
 * 校验当前连线是否合法。
 */
function isValidSceneConnection(connection: Connection): boolean {
    const sourceId = connection.source ?? null;
    const targetId = connection.target ?? null;

    if (!sourceId || !targetId || targetId === PLOT_TREE_ROOT_NODE_ID) {
        return false;
    }

    return connectPlotTreeScene(draftGraph.value, sourceId, targetId).ok;
}

/**
 * 处理节点拖拽结束。
 * Thread 和 Scene 的拖拽语义不同。
 */
function handleNodeDragStop(event: NodeDragEvent): void {
    if (event.node.type === "plot-thread") {
        handleThreadDragStop(event.node);
        return;
    }

    if (event.node.type === "plot-scene") {
        handleSceneDragStop(event.node);
    }
}

/**
 * 处理 Thread 拖拽结束。
 */
function handleThreadDragStop(node: GraphNode): void {
    const nextGraph = clonePlotTreeGraph(draftGraph.value);
    const thread = nextGraph.threads.find((item) => item.id === node.id);

    if (!thread) {
        return;
    }

    thread.position = {
        x: node.position.x,
        y: node.position.y,
    };

    persistGraph(nextGraph);
}

/**
 * 处理 Scene 拖拽结束。
 * 同 Thread 内只改坐标，跨 Thread / 脱组才改结构。
 */
function handleSceneDragStop(node: GraphNode): void {
    const currentScene = draftGraph.value.scenes.find((scene) => scene.id === node.id) ?? null;

    if (!currentScene) {
        return;
    }

    const absolutePosition = readNodeAbsolutePosition(node);
    const dropThreadNode = resolveDropThreadNode(node);
    const dropThreadId = dropThreadNode?.id ?? null;

    if (currentScene.threadId === null && dropThreadId === null) {
        persistOrphanScenePosition(currentScene.id, absolutePosition);
        return;
    }

    if (currentScene.threadId && dropThreadId === currentScene.threadId) {
        const localPosition = {
            x: absolutePosition.x - (dropThreadNode?.computedPosition.x ?? 0),
            y: absolutePosition.y - (dropThreadNode?.computedPosition.y ?? 0),
        };

        persistThreadScenePosition(currentScene.id, localPosition);
        return;
    }

    const nextPosition = dropThreadNode
        ? {
            x: absolutePosition.x - dropThreadNode.computedPosition.x,
            y: absolutePosition.y - dropThreadNode.computedPosition.y,
        }
        : absolutePosition;
    const nextGraph = moveSceneToThread(draftGraph.value, currentScene.id, dropThreadId, nextPosition);

    rebuildGraph(nextGraph);
    focusScene(currentScene.id, dropThreadId);
}

/**
 * 同步选中态，只更新 class，不重建节点。
 */
watch(selectionState, () => {
    const nextNodes = nodes.value.map((node) => ({
        ...node,
        class: resolveSelectionClass(node.id, node.type),
    }));

    nodes.value = nextNodes;
    setNodes(nextNodes);
}, {deep: true});

/**
 * 当父层直接替换 graph 时，同步重建画布。
 * 本地编辑已经通过 `shouldSkipNextPropSync` 标记跳过，避免拖拽后又被外层回写触发整图重建。
 */
watch(() => props.graph, (nextGraph) => {
    if (shouldSkipNextPropSync.value) {
        shouldSkipNextPropSync.value = false;
        return;
    }

    draftGraph.value = clonePlotTreeGraph(nextGraph);
    initializeCanvas();
}, {deep: true});

/**
 * 计算 minimap 节点颜色。
 */
function resolveMiniMapColor(node: GraphNode): string {
    const data = node.data as PlotTreeGraphNodeData;

    if (data.kind === "root") {
        return "var(--accent-main)";
    }

    if (data.kind === "thread") {
        return data.thread.isMainThread
            ? "var(--accent-main)"
            : PLOT_TREE_TONE_STYLES[data.thread.tone].minimap;
    }

    if (!data.thread) {
        return PLOT_TREE_ORPHAN_SCENE_STYLE.minimap;
    }

    return data.branchRole === "main"
        ? "var(--accent-main)"
        : PLOT_TREE_TONE_STYLES[data.thread.tone].minimap;
}

/**
 * 解析节点选中 class。
 */
function resolveSelectionClass(nodeId: string, nodeType?: string): string | undefined {
    if (nodeType === "plot-thread" && selectionState.value.selectedThreadId === nodeId) {
        return "plot-tree-node--selected";
    }

    if (nodeType === "plot-scene" && selectionState.value.selectedSceneId === nodeId) {
        return "plot-tree-node--selected";
    }

    return undefined;
}

/**
 * 拖拽后判断 Scene 是否落入某个 Thread 容器。
 */
function resolveDropThreadNode(sceneNode: GraphNode): GraphNode | null {
    const absolutePosition = readNodeAbsolutePosition(sceneNode);
    const sceneWidth = sceneNode.dimensions.width || PLOT_TREE_SCENE_CARD.width;
    const sceneHeight = sceneNode.dimensions.height || PLOT_TREE_SCENE_CARD.height;
    const sceneCenter = {
        x: absolutePosition.x + (sceneWidth / 2),
        y: absolutePosition.y + (sceneHeight / 2),
    };
    const threadNodes: GraphNode[] = [];

    for (const node of nodes.value) {
        if (node.type === "plot-thread") {
            threadNodes.push(node as GraphNode);
        }
    }

    for (const threadNode of threadNodes) {
        const threadPosition = threadNode.computedPosition;
        const width = threadNode.dimensions.width;
        const height = threadNode.dimensions.height;

        if (
            sceneCenter.x >= threadPosition.x &&
            sceneCenter.x <= threadPosition.x + width &&
            sceneCenter.y >= threadPosition.y &&
            sceneCenter.y <= threadPosition.y + height
        ) {
            return threadNode;
        }
    }

    return null;
}

/**
 * 读取节点绝对坐标。
 */
function readNodeAbsolutePosition(node: GraphNode): PlotTreePosition {
    return {
        x: node.computedPosition.x,
        y: node.computedPosition.y,
    };
}

/**
 * 持久化一个 orphan Scene 的坐标，不改连线来源。
 */
function persistOrphanScenePosition(sceneId: string, position: PlotTreePosition): void {
    const nextGraph = updateScenePosition(draftGraph.value, sceneId, position);

    persistGraph(nextGraph);
    updateNode(sceneId, {
        parentNode: undefined,
        position,
    });
    syncSceneNodeData(nextGraph, sceneId);
}

/**
 * 持久化一个 Thread 内 Scene 的局部坐标。
 */
function persistThreadScenePosition(sceneId: string, position: PlotTreePosition): void {
    const nextGraph = updateScenePosition(draftGraph.value, sceneId, position);

    persistGraph(nextGraph);
    updateNode(sceneId, {
        position,
    });
    syncSceneNodeData(nextGraph, sceneId);
    syncThreadNodes(nextGraph);
}

/**
 * 同步某个 Scene 节点的数据，不重建整图。
 */
function syncSceneNodeData(graph: PlotTreeGraph, sceneId: string): void {
    const scene = graph.scenes.find((item) => item.id === sceneId) ?? null;
    const thread = scene?.threadId
        ? (graph.threads.find((item) => item.id === scene.threadId) ?? null)
        : null;

    if (!scene) {
        return;
    }

    updateNodeData(scene.id, {
        scene,
        thread,
        branchRole: scene.isMainBranch ? "main" : "side",
        childCount: graph.scenes.filter((item) => item.sourceId === scene.id).length,
        editable: props.editable,
        actions: nodeActions,
    });
}

/**
 * 同步 Thread 组尺寸和统计。
 */
function syncThreadNodes(graph: PlotTreeGraph): void {
    const metricsMap = buildThreadMetricsMap(graph);

    for (const thread of graph.threads) {
        const metrics = metricsMap.get(thread.id);

        if (!metrics) {
            continue;
        }

        updateNode(thread.id, {
            style: {
                width: `${metrics.width}px`,
                height: `${metrics.height}px`,
            },
        });

        updateNodeData(thread.id, {
            thread,
            metrics,
            editable: props.editable,
            actions: nodeActions,
        });
    }
}

/**
 * 原型阶段使用 alert 足够直接。
 */
function notifyUser(message: string): void {
    globalThis.alert?.(message);
}
</script>

<template>
    <!-- Vue Flow 画布 -->
    <div class="relative h-[780px] w-full overflow-hidden rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[0_24px_80px_color-mix(in_srgb,var(--shadow-color)_12%,transparent)]">
        <ClientOnly>
            <VueFlow
                :id="flowId"
                v-model:nodes="nodes"
                v-model:edges="edges"
                :node-types="nodeTypes"
                :is-valid-connection="isValidSceneConnection"
                class="plot-tree-flow-canvas"
                fit-view-on-init
                nodes-draggable
                nodes-connectable
                elements-selectable
                zoom-on-scroll
                pan-on-drag
                pan-on-scroll
                connect-on-click
                only-render-visible-elements
                :min-zoom="0.35"
                :max-zoom="1.8"
                selection-key-code="Shift"
                multi-selection-key-code="Control"
                @node-click="handleNodeClick"
                @node-drag-stop="handleNodeDragStop"
                @connect="handleConnect"
            >
                <Background :gap="24" :size="1.1" pattern-color="var(--border-color)" />

                <MiniMap
                    pannable
                    zoomable
                    :node-color="resolveMiniMapColor"
                    :mask-color="'color-mix(in srgb, var(--shadow-color) 8%, transparent)'"
                    class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)]/95 shadow-[0_10px_30px_color-mix(in_srgb,var(--shadow-color)_12%,transparent)]"
                />

                <Controls position="top-right" class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)]/95 shadow-[0_10px_30px_color-mix(in_srgb,var(--shadow-color)_12%,transparent)]" />

                <Panel position="top-left">
                    <PlotTreeToolbar
                        :editable="props.editable"
                        @add-thread="addThread"
                        @add-orphan-scene="addOrphanScene"
                        @auto-layout="autoLayoutTree"
                        @fit-view="fitTreeToView"
                    />
                </Panel>
            </VueFlow>
        </ClientOnly>
    </div>
</template>

<style scoped>
.plot-tree-flow-canvas :deep(.vue-flow__pane) {
    background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--accent-main) 8%, transparent), transparent 22%),
        linear-gradient(180deg, color-mix(in srgb, var(--bg-panel) 78%, transparent), color-mix(in srgb, var(--bg-main) 88%, var(--bg-panel)));
}

.plot-tree-flow-canvas :deep(.vue-flow__node.plot-tree-node--selected > div) {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-main) 35%, transparent);
}
</style>
