import {MarkerType, Position} from "@vue-flow/core";
import type {
    PlotTreeFlowEdge,
    PlotTreeFlowNode,
    PlotTreeGraph,
    PlotTreeNodeActions,
    PlotTreePosition,
    PlotTreeScene,
    PlotTreeSelectionState,
    PlotTreeThread,
    PlotTreeThreadMetrics,
} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";
import {
    DEFAULT_PLOT_TREE_START_LABEL,
    PLOT_TREE_LAYOUT,
    PLOT_TREE_ROOT_NODE_ID,
    PLOT_TREE_SCENE_CARD,
    PLOT_TREE_THREAD_LAYOUT,
    resolvePlotTreeBranchRole,
} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";

/**
 * Scene 连线结果。
 */
export type PlotTreeConnectResult =
    | {ok: true; graph: PlotTreeGraph}
    | {ok: false; message: string};

/**
 * 深拷贝一份树图草稿。
 */
export function clonePlotTreeGraph(graph: PlotTreeGraph): PlotTreeGraph {
    return {
        story: {...graph.story},
        threads: graph.threads.map((thread) => ({
            ...thread,
            position: {...thread.position},
        })),
        scenes: graph.scenes.map((scene) => ({
            ...scene,
            position: {...scene.position},
        })),
    };
}

/**
 * 构造整张图的节点。
 */
export function buildPlotTreeNodes(
    graph: PlotTreeGraph,
    selection: PlotTreeSelectionState,
    editable: boolean,
    actions: PlotTreeNodeActions,
): PlotTreeFlowNode[] {
    const threadMap = new Map(graph.threads.map((thread) => [thread.id, thread]));
    const threadMetrics = buildThreadMetricsMap(graph);
    const nodes: PlotTreeFlowNode[] = [
        {
            id: PLOT_TREE_ROOT_NODE_ID,
            type: "plot-root",
            position: {x: PLOT_TREE_LAYOUT.rootX, y: PLOT_TREE_LAYOUT.rootY},
            draggable: false,
            selectable: false,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            data: {
                kind: "root",
                title: graph.story.startLabel ?? DEFAULT_PLOT_TREE_START_LABEL,
                subtitle: graph.story.title,
                threadCount: graph.threads.length,
                sceneCount: graph.scenes.length,
            },
        },
    ];

    for (const thread of graph.threads) {
        const metrics = threadMetrics.get(thread.id) ?? createEmptyThreadMetrics();

        nodes.push({
            id: thread.id,
            type: "plot-thread",
            position: {...thread.position},
            draggable: editable,
            selectable: true,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            class: selection.selectedThreadId === thread.id ? "plot-tree-node--selected" : undefined,
            style: {
                width: `${metrics.width}px`,
                height: `${metrics.height}px`,
            },
            data: {
                kind: "thread",
                thread,
                metrics,
                editable,
                actions,
            },
        });
    }

    for (const scene of graph.scenes) {
        const thread = scene.threadId ? (threadMap.get(scene.threadId) ?? null) : null;

        nodes.push({
            id: scene.id,
            type: "plot-scene",
            parentNode: scene.threadId ?? undefined,
            position: {...scene.position},
            draggable: editable,
            selectable: true,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            class: selection.selectedSceneId === scene.id ? "plot-tree-node--selected" : undefined,
            data: {
                kind: "scene",
                scene,
                thread,
                branchRole: resolvePlotTreeBranchRole(scene),
                childCount: countSceneChildren(graph, scene.id),
                editable,
                actions,
            },
        });
    }

    return nodes;
}

/**
 * 构造整张图的边。
 * 只有 `sourceId !== null` 的 Scene 才会生成连线。
 */
export function buildPlotTreeEdges(graph: PlotTreeGraph): PlotTreeFlowEdge[] {
    const edges: PlotTreeFlowEdge[] = [];

    for (const scene of graph.scenes) {
        if (!scene.sourceId) {
            continue;
        }

        const branchRole = resolvePlotTreeBranchRole(scene);
        const sourceId = scene.sourceId;
        const edgeColor = branchRole === "main" ? "var(--accent-main)" : "var(--text-muted)";

        edges.push({
            id: `${sourceId}->${scene.id}`,
            source: sourceId,
            target: scene.id,
            type: "smoothstep",
            animated: branchRole === "main",
            selectable: false,
            markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 16,
                height: 16,
                color: edgeColor,
            },
            style: {
                strokeWidth: branchRole === "main" ? 2.8 : 1.8,
                stroke: edgeColor,
                strokeDasharray: branchRole === "side" ? "6 6" : undefined,
            },
            data: {
                kind: sourceId === PLOT_TREE_ROOT_NODE_ID ? "start" : "scene",
                branchRole,
            },
        });
    }

    return edges;
}

/**
 * 创建一个新的 Thread 草稿。
 */
export function createThreadDraft(graph: PlotTreeGraph): PlotTreeThread {
    return {
        id: createDraftId("thread"),
        title: `新 Thread ${graph.threads.length + 1}`,
        summary: "补充这条线的长期因果目标、节奏和约束。",
        status: "draft",
        isMainThread: graph.threads.length === 0,
        tone: resolveNextThreadTone(graph.threads.length),
        position: {
            x: PLOT_TREE_LAYOUT.threadX,
            y: PLOT_TREE_LAYOUT.threadStartY + (graph.threads.length * PLOT_TREE_LAYOUT.threadGapY),
        },
    };
}

/**
 * 创建一个新的 Scene 草稿。
 * 若归属某个 Thread，则默认追加到该 Thread 尾部。
 */
export function createSceneDraft(
    graph: PlotTreeGraph,
    options: {
        threadId: string | null;
        position?: PlotTreePosition;
        sourceId?: string | null;
    },
): PlotTreeScene {
    const ownerThread = options.threadId
        ? (graph.threads.find((thread) => thread.id === options.threadId) ?? null)
        : null;
    const tailScene = options.threadId ? findThreadTailScene(graph, options.threadId) : null;
    const sourceScene = options.sourceId
        ? (graph.scenes.find((scene) => scene.id === options.sourceId) ?? null)
        : null;
    const sourceId = options.sourceId === undefined
        ? (tailScene?.id ?? (options.threadId ? PLOT_TREE_ROOT_NODE_ID : null))
        : options.sourceId;

    return {
        id: createDraftId("scene"),
        threadId: options.threadId,
        title: `新 Scene ${graph.scenes.length + 1}`,
        summary: "补充这一场发生了什么、要推进什么冲突或兑现什么信息。",
        status: "draft",
        chapterLabel: null,
        sourceId,
        isMainBranch: sourceScene?.isMainBranch ?? ownerThread?.isMainThread ?? false,
        position: options.position ?? resolveDefaultScenePosition(graph, options.threadId, sourceScene),
    };
}

/**
 * 应用一条 Scene 连线。
 * 返回结果包含合法性和新的 graph。
 */
export function connectPlotTreeScene(
    graph: PlotTreeGraph,
    sourceId: string,
    targetId: string,
): PlotTreeConnectResult {
    const targetScene = graph.scenes.find((scene) => scene.id === targetId) ?? null;

    if (!targetScene) {
        return {
            ok: false,
            message: "目标 Scene 不存在。",
        };
    }

    if (sourceId === targetId) {
        return {
            ok: false,
            message: "Scene 不能连接到自己。",
        };
    }

    if (sourceId === PLOT_TREE_ROOT_NODE_ID) {
        return connectRootToScene(graph, targetScene);
    }

    const sourceScene = graph.scenes.find((scene) => scene.id === sourceId) ?? null;

    if (!sourceScene) {
        return {
            ok: false,
            message: "来源 Scene 不存在。",
        };
    }

    if (targetScene.threadId && sourceScene.threadId === targetScene.threadId) {
        return connectSceneWithinThread(graph, sourceScene, targetScene);
    }

    return connectSceneAcrossThread(graph, sourceScene, targetScene);
}

/**
 * 更新一个 Scene 的坐标，不改结构。
 */
export function updateScenePosition(
    graph: PlotTreeGraph,
    sceneId: string,
    position: PlotTreePosition,
): PlotTreeGraph {
    const nextGraph = clonePlotTreeGraph(graph);
    const scene = nextGraph.scenes.find((item) => item.id === sceneId);

    if (!scene) {
        return nextGraph;
    }

    scene.position = {...position};

    return nextGraph;
}

/**
 * 把一个 Scene 从原 Thread 中摘出，并追加到另一个 Thread 尾部。
 * 目标 `threadId = null` 时，当前 Scene 会变成游离且断开连线。
 */
export function moveSceneToThread(
    graph: PlotTreeGraph,
    sceneId: string,
    threadId: string | null,
    position: PlotTreePosition,
): PlotTreeGraph {
    const nextGraph = clonePlotTreeGraph(graph);
    const scene = nextGraph.scenes.find((item) => item.id === sceneId);

    if (!scene) {
        return nextGraph;
    }

    if (scene.threadId) {
        spliceSceneOutOfThread(nextGraph, scene.id);
    }

    scene.threadId = threadId;
    scene.position = {...position};

    if (threadId === null) {
        scene.sourceId = null;
        return nextGraph;
    }

    const tailScene = findThreadTailScene(nextGraph, threadId);
    scene.sourceId = tailScene ? tailScene.id : PLOT_TREE_ROOT_NODE_ID;

    return nextGraph;
}

/**
 * 仅断开一个 Scene 的来源连线，不改线程归属。
 */
export function disconnectSceneSource(graph: PlotTreeGraph, sceneId: string): PlotTreeGraph {
    const nextGraph = clonePlotTreeGraph(graph);
    const scene = nextGraph.scenes.find((item) => item.id === sceneId);

    if (!scene) {
        return nextGraph;
    }

    scene.sourceId = null;

    return nextGraph;
}

/**
 * 切换一个 Scene 的主线分支标记。
 * 只在存在同源兄弟时做互斥处理。
 */
export function toggleSceneMainBranch(graph: PlotTreeGraph, sceneId: string): PlotTreeGraph {
    const nextGraph = clonePlotTreeGraph(graph);
    const scene = nextGraph.scenes.find((item) => item.id === sceneId);

    if (!scene) {
        return nextGraph;
    }

    scene.isMainBranch = !scene.isMainBranch;

    if (scene.isMainBranch) {
        enforceSingleMainBranch(nextGraph, scene.sourceId, scene.id);
    }

    return nextGraph;
}

/**
 * 删除一个 Scene 草稿。
 * 当前调用方需先保证该 Scene 没有任何子节点。
 */
export function removeSceneDraft(graph: PlotTreeGraph, sceneId: string): PlotTreeGraph {
    const nextGraph = clonePlotTreeGraph(graph);
    const scene = nextGraph.scenes.find((item) => item.id === sceneId);

    if (!scene) {
        return nextGraph;
    }

    if (scene.threadId) {
        spliceSceneOutOfThread(nextGraph, scene.id);
    }

    nextGraph.scenes = nextGraph.scenes.filter((item) => item.id !== sceneId);

    return nextGraph;
}

/**
 * 删除一个 Thread 草稿。
 */
export function removeThreadDraft(graph: PlotTreeGraph, threadId: string): PlotTreeGraph {
    const nextGraph = clonePlotTreeGraph(graph);
    nextGraph.threads = nextGraph.threads.filter((thread) => thread.id !== threadId);
    return nextGraph;
}

/**
 * 判断一个 Scene 是否还有子节点。
 */
export function hasSceneChildren(graph: PlotTreeGraph, sceneId: string): boolean {
    return graph.scenes.some((scene) => scene.sourceId === sceneId);
}

/**
 * 判断一个 Thread 是否仍有 Scene。
 */
export function hasThreadScenes(graph: PlotTreeGraph, threadId: string): boolean {
    return graph.scenes.some((scene) => scene.threadId === threadId);
}

/**
 * 为所有 Thread 计算组节点尺寸。
 */
export function buildThreadMetricsMap(graph: PlotTreeGraph): Map<string, PlotTreeThreadMetrics> {
    const metrics = new Map<string, PlotTreeThreadMetrics>();

    for (const thread of graph.threads) {
        const threadScenes = graph.scenes.filter((scene) => scene.threadId === thread.id);

        if (threadScenes.length === 0) {
            metrics.set(thread.id, createEmptyThreadMetrics());
            continue;
        }

        const maxX = Math.max(...threadScenes.map((scene) => scene.position.x + PLOT_TREE_SCENE_CARD.width));
        const maxY = Math.max(...threadScenes.map((scene) => scene.position.y + PLOT_TREE_SCENE_CARD.height));

        metrics.set(thread.id, {
            width: Math.max(PLOT_TREE_THREAD_LAYOUT.minWidth, maxX + PLOT_TREE_THREAD_LAYOUT.paddingRight),
            height: Math.max(PLOT_TREE_THREAD_LAYOUT.minHeight, maxY + PLOT_TREE_THREAD_LAYOUT.paddingBottom),
            sceneCount: threadScenes.length,
            mainBranchSceneCount: threadScenes.filter((scene) => scene.isMainBranch).length,
        });
    }

    return metrics;
}

/**
 * 读取 Thread 的入口 Scene。
 * 入口 Scene 没有同 Thread 前驱。
 */
export function findThreadEntryScene(graph: PlotTreeGraph, threadId: string): PlotTreeScene | null {
    const threadScenes = graph.scenes.filter((scene) => scene.threadId === threadId);

    return threadScenes.find((scene) => getSameThreadPredecessor(graph, scene)?.id === undefined) ?? null;
}

/**
 * 读取 Thread 的尾 Scene。
 * 尾 Scene 没有同 Thread 后继。
 */
export function findThreadTailScene(graph: PlotTreeGraph, threadId: string): PlotTreeScene | null {
    const threadScenes = graph.scenes.filter((scene) => scene.threadId === threadId);

    return threadScenes.find((scene) => findSameThreadSuccessor(graph, scene.id)?.id === undefined) ?? null;
}

/**
 * 返回某个 Scene 在同 Thread 内的前驱。
 */
function getSameThreadPredecessor(graph: PlotTreeGraph, scene: PlotTreeScene): PlotTreeScene | null {
    if (!scene.threadId || !scene.sourceId || scene.sourceId === PLOT_TREE_ROOT_NODE_ID) {
        return null;
    }

    const sourceScene = graph.scenes.find((item) => item.id === scene.sourceId) ?? null;

    if (!sourceScene || sourceScene.threadId !== scene.threadId) {
        return null;
    }

    return sourceScene;
}

/**
 * 返回某个 Scene 在同 Thread 内的后继。
 */
function findSameThreadSuccessor(graph: PlotTreeGraph, sceneId: string): PlotTreeScene | null {
    const scene = graph.scenes.find((item) => item.id === sceneId) ?? null;

    if (!scene?.threadId) {
        return null;
    }

    return graph.scenes.find((item) => item.threadId === scene.threadId && item.sourceId === sceneId) ?? null;
}

/**
 * 把一个 Scene 从所属 Thread 单链中摘出，并自动缝合前后节点。
 */
function spliceSceneOutOfThread(graph: PlotTreeGraph, sceneId: string): void {
    const scene = graph.scenes.find((item) => item.id === sceneId) ?? null;

    if (!scene?.threadId) {
        return;
    }

    const successor = findSameThreadSuccessor(graph, sceneId);

    if (successor) {
        successor.sourceId = scene.sourceId;
    }
}

/**
 * 连接根节点到某个 Scene。
 * 线程内只允许连到入口 Scene。
 */
function connectRootToScene(graph: PlotTreeGraph, targetScene: PlotTreeScene): PlotTreeConnectResult {
    if (targetScene.threadId && getSameThreadPredecessor(graph, targetScene)) {
        return {
            ok: false,
            message: "Thread 内只允许入口 Scene 直接接 root。",
        };
    }

    const nextGraph = clonePlotTreeGraph(graph);
    const nextTargetScene = nextGraph.scenes.find((scene) => scene.id === targetScene.id);

    if (!nextTargetScene) {
        return {
            ok: false,
            message: "目标 Scene 不存在。",
        };
    }

    nextTargetScene.sourceId = PLOT_TREE_ROOT_NODE_ID;

    return {
        ok: true,
        graph: nextGraph,
    };
}

/**
 * 在同一个 Thread 内重排 Scene 顺序。
 * 规则是把目标 Scene 插到来源 Scene 后面，并自动缝合链。
 */
function connectSceneWithinThread(
    graph: PlotTreeGraph,
    sourceScene: PlotTreeScene,
    targetScene: PlotTreeScene,
): PlotTreeConnectResult {
    const currentSuccessor = findSameThreadSuccessor(graph, sourceScene.id);

    if (currentSuccessor?.id === targetScene.id) {
        return {
            ok: true,
            graph: clonePlotTreeGraph(graph),
        };
    }

    const nextGraph = clonePlotTreeGraph(graph);
    const nextSourceScene = nextGraph.scenes.find((scene) => scene.id === sourceScene.id) ?? null;
    const nextTargetScene = nextGraph.scenes.find((scene) => scene.id === targetScene.id) ?? null;

    if (!nextSourceScene || !nextTargetScene) {
        return {
            ok: false,
            message: "来源或目标 Scene 不存在。",
        };
    }

    const targetSuccessor = findSameThreadSuccessor(nextGraph, nextTargetScene.id);
    const sourceSuccessor = findSameThreadSuccessor(nextGraph, nextSourceScene.id);
    const targetOriginalSourceId = nextTargetScene.sourceId;

    if (targetSuccessor) {
        targetSuccessor.sourceId = targetOriginalSourceId;
    }

    nextTargetScene.sourceId = nextSourceScene.id;

    if (sourceSuccessor && sourceSuccessor.id !== nextTargetScene.id) {
        sourceSuccessor.sourceId = nextTargetScene.id;
    }

    return {
        ok: true,
        graph: nextGraph,
    };
}

/**
 * 处理跨 Thread 或 orphan 的连接。
 * Thread Scene 只允许作为入口接外部来源。
 */
function connectSceneAcrossThread(
    graph: PlotTreeGraph,
    sourceScene: PlotTreeScene,
    targetScene: PlotTreeScene,
): PlotTreeConnectResult {
    if (targetScene.threadId && getSameThreadPredecessor(graph, targetScene)) {
        return {
            ok: false,
            message: "跨 Thread 连线只能接到目标 Thread 的入口 Scene。",
        };
    }

    if (wouldCreateCycle(graph, sourceScene.id, targetScene.id)) {
        return {
            ok: false,
            message: "当前连接会形成循环。",
        };
    }

    const nextGraph = clonePlotTreeGraph(graph);
    const nextTargetScene = nextGraph.scenes.find((scene) => scene.id === targetScene.id);

    if (!nextTargetScene) {
        return {
            ok: false,
            message: "目标 Scene 不存在。",
        };
    }

    nextTargetScene.sourceId = sourceScene.id;

    return {
        ok: true,
        graph: nextGraph,
    };
}

/**
 * 检测一条新的父子连接是否会形成环。
 * 仅用于跨 Thread / orphan 的普通连接。
 */
function wouldCreateCycle(graph: PlotTreeGraph, sourceId: string, targetId: string): boolean {
    let currentId: string | null = sourceId;

    while (currentId && currentId !== PLOT_TREE_ROOT_NODE_ID) {
        if (currentId === targetId) {
            return true;
        }

        currentId = graph.scenes.find((scene) => scene.id === currentId)?.sourceId ?? null;
    }

    return false;
}

/**
 * 统计 Scene 子节点数量。
 */
function countSceneChildren(graph: PlotTreeGraph, sceneId: string): number {
    return graph.scenes.filter((scene) => scene.sourceId === sceneId).length;
}

/**
 * 解析新 Scene 的默认位置。
 * Thread 内默认追加到右侧，orphan 默认排到下方区域。
 */
function resolveDefaultScenePosition(
    graph: PlotTreeGraph,
    threadId: string | null,
    sourceScene: PlotTreeScene | null,
): PlotTreePosition {
    if (threadId) {
        const tailScene = findThreadTailScene(graph, threadId);

        if (sourceScene?.threadId === threadId) {
            return {
                x: sourceScene.position.x + PLOT_TREE_LAYOUT.sceneGapX,
                y: sourceScene.position.y,
            };
        }

        if (tailScene) {
            return {
                x: tailScene.position.x + PLOT_TREE_LAYOUT.sceneGapX,
                y: tailScene.position.y,
            };
        }

        return {
            x: PLOT_TREE_LAYOUT.threadSceneX,
            y: PLOT_TREE_LAYOUT.threadSceneY,
        };
    }

    const orphanScenes = graph.scenes.filter((scene) => scene.threadId === null);

    if (sourceScene) {
        return {
            x: sourceScene.position.x + PLOT_TREE_LAYOUT.sceneGapX,
            y: sourceScene.position.y,
        };
    }

    return {
        x: PLOT_TREE_LAYOUT.orphanStartX,
        y: PLOT_TREE_LAYOUT.orphanStartY + (orphanScenes.length * 32),
    };
}

/**
 * 保证同一来源下最多只有一个主线子节点。
 */
function enforceSingleMainBranch(
    graph: PlotTreeGraph,
    sourceId: string | null,
    mainSceneId: string,
): void {
    for (const scene of graph.scenes) {
        if (scene.sourceId === sourceId && scene.id !== mainSceneId) {
            scene.isMainBranch = false;
        }
    }
}

/**
 * 创建默认空 Thread 的统计。
 */
function createEmptyThreadMetrics(): PlotTreeThreadMetrics {
    return {
        width: PLOT_TREE_THREAD_LAYOUT.minWidth,
        height: PLOT_TREE_THREAD_LAYOUT.minHeight,
        sceneCount: 0,
        mainBranchSceneCount: 0,
    };
}

/**
 * 生成 draft id。
 */
function createDraftId(prefix: "thread" | "scene"): string {
    const randomToken = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${randomToken}`;
}

/**
 * 按索引轮换色带，避免新线程都长得一样。
 */
function resolveNextThreadTone(index: number): PlotTreeThread["tone"] {
    const tones: PlotTreeThread["tone"][] = ["amber", "sky", "emerald", "rose"];
    return tones[index % tones.length] ?? "amber";
}
