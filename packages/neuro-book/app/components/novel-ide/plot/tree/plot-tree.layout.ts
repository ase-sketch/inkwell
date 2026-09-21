import type {
    PlotTreeGraph,
    PlotTreeScene,
    PlotTreeThread,
} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";
import {
    PLOT_TREE_LAYOUT,
    PLOT_TREE_ROOT_NODE_ID,
} from "nbook/app/components/novel-ide/plot/tree/plot-tree.types";

/**
 * 生成一份自动布局后的树图草稿。
 * 该函数只改位置，不改线程归属、连线来源和主支标记。
 */
export function autoLayoutPlotTreeGraph(graph: PlotTreeGraph): PlotTreeGraph {
    const nextGraph: PlotTreeGraph = {
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
    const depthMap = buildSceneDepthMap(nextGraph.scenes);
    const orderedThreads = [...nextGraph.threads].sort(compareThreadsForLayout);
    const sceneMap = new Map(nextGraph.scenes.map((scene) => [scene.id, scene]));

    orderedThreads.forEach((thread, index) => {
        thread.position = {
            x: PLOT_TREE_LAYOUT.threadX,
            y: PLOT_TREE_LAYOUT.threadStartY + (index * PLOT_TREE_LAYOUT.threadGapY),
        };

        const orderedScenes = getThreadScenesInOrder(nextGraph.scenes, thread.id);

        orderedScenes.forEach((scene) => {
            const depth = Math.max(depthMap.get(scene.id) ?? 1, 1);

            scene.position = {
                x: PLOT_TREE_LAYOUT.threadSceneX + ((depth - 1) * PLOT_TREE_LAYOUT.sceneGapX),
                y: PLOT_TREE_LAYOUT.threadSceneY,
            };
        });

        const fallbackScenes = nextGraph.scenes
            .filter((scene) => scene.threadId === thread.id && !orderedScenes.some((item) => item.id === scene.id))
            .sort(compareScenesForFallback);

        fallbackScenes.forEach((scene, sceneIndex) => {
            scene.position = {
                x: PLOT_TREE_LAYOUT.threadSceneX + (sceneIndex * PLOT_TREE_LAYOUT.sceneGapX),
                y: PLOT_TREE_LAYOUT.threadSceneY,
            };
        });
    });

    const orphanScenes = nextGraph.scenes
        .filter((scene) => scene.threadId === null)
        .sort((left, right) => {
            const depthDiff = (depthMap.get(left.id) ?? 0) - (depthMap.get(right.id) ?? 0);

            if (depthDiff !== 0) {
                return depthDiff;
            }

            return compareScenesForFallback(left, right);
        });
    const orphanRowMap = new Map<number, number>();

    orphanScenes.forEach((scene) => {
        const depth = Math.max(depthMap.get(scene.id) ?? 0, 0);
        const rowIndex = orphanRowMap.get(depth) ?? 0;

        scene.position = {
            x: PLOT_TREE_LAYOUT.orphanStartX + (depth * PLOT_TREE_LAYOUT.sceneGapX),
            y: PLOT_TREE_LAYOUT.orphanStartY + (rowIndex * PLOT_TREE_LAYOUT.orphanGapY),
        };
        orphanRowMap.set(depth, rowIndex + 1);
    });

    for (const scene of nextGraph.scenes) {
        const sourceId = scene.sourceId;

        if (sourceId && sourceId !== PLOT_TREE_ROOT_NODE_ID && !sceneMap.has(sourceId)) {
            scene.sourceId = null;
        }
    }

    return nextGraph;
}

/**
 * 计算每个 Scene 的全局深度。
 * `null` 来源视为无连线，深度为 0。
 * `root` 来源深度为 1。
 */
function buildSceneDepthMap(scenes: PlotTreeScene[]): Map<string, number> {
    const depthMap = new Map<string, number>();
    const sceneMap = new Map(scenes.map((scene) => [scene.id, scene]));
    const visiting = new Set<string>();

    /**
     * 深度优先计算单个 Scene 的深度。
     */
    const visitDepth = (sceneId: string): number => {
        const cached = depthMap.get(sceneId);

        if (cached !== undefined) {
            return cached;
        }

        if (visiting.has(sceneId)) {
            return 0;
        }

        const scene = sceneMap.get(sceneId);

        if (!scene) {
            return 0;
        }

        visiting.add(sceneId);

        let depth = 0;

        if (scene.sourceId === PLOT_TREE_ROOT_NODE_ID) {
            depth = 1;
        } else if (scene.sourceId) {
            depth = visitDepth(scene.sourceId) + 1;
        }

        visiting.delete(sceneId);
        depthMap.set(sceneId, depth);

        return depth;
    };

    for (const scene of scenes) {
        visitDepth(scene.id);
    }

    return depthMap;
}

/**
 * 按当前线程位置和主线标记给线程排序。
 */
function compareThreadsForLayout(left: PlotTreeThread, right: PlotTreeThread): number {
    if (left.isMainThread !== right.isMainThread) {
        return left.isMainThread ? -1 : 1;
    }

    const yDiff = left.position.y - right.position.y;

    if (yDiff !== 0) {
        return yDiff;
    }

    return left.title.localeCompare(right.title, "zh-Hans-CN");
}

/**
 * 读取一个 Thread 内的单链顺序。
 * 若图里存在脏数据，则把无法纳入单链的 Scene 留给 fallback 排序处理。
 */
function getThreadScenesInOrder(scenes: PlotTreeScene[], threadId: string): PlotTreeScene[] {
    const threadScenes = scenes.filter((scene) => scene.threadId === threadId);
    const sceneMap = new Map(threadScenes.map((scene) => [scene.id, scene]));
    const entryScenes = threadScenes
        .filter((scene) => {
            if (!scene.sourceId || scene.sourceId === PLOT_TREE_ROOT_NODE_ID) {
                return true;
            }

            return (sceneMap.get(scene.sourceId)?.threadId ?? null) !== threadId;
        })
        .sort(compareScenesForFallback);

    const orderedScenes: PlotTreeScene[] = [];
    const visited = new Set<string>();

    for (const entryScene of entryScenes) {
        let currentScene: PlotTreeScene | undefined = entryScene;

        while (currentScene && !visited.has(currentScene.id)) {
            orderedScenes.push(currentScene);
            visited.add(currentScene.id);
            currentScene = threadScenes.find((scene) => scene.sourceId === currentScene?.id) ?? undefined;
        }
    }

    return orderedScenes;
}

/**
 * fallback 排序优先保留用户当前的大致排列。
 */
function compareScenesForFallback(left: PlotTreeScene, right: PlotTreeScene): number {
    const yDiff = left.position.y - right.position.y;

    if (yDiff !== 0) {
        return yDiff;
    }

    const xDiff = left.position.x - right.position.x;

    if (xDiff !== 0) {
        return xDiff;
    }

    return left.title.localeCompare(right.title, "zh-Hans-CN");
}
