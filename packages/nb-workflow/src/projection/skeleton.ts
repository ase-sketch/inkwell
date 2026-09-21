import type { AnyWorkflowDefinition } from "../types";

/**
 * 投影一：声明骨架。运行前展示 workflow 大致形状（phases 元数据 → 线性 mermaid）。
 * 粗但稳定，不依赖执行也不解析代码。
 */
export function skeletonMermaid(def: AnyWorkflowDefinition): string {
    const phases = def.phases ?? [];
    if (phases.length === 0) return `graph TD\n    p0["${def.key}"]`;
    const lines = phases.map((p, i) => `    p${i}["${p.title}"]`);
    const edges = phases.slice(1).map((_, i) => `    p${i} --> p${i + 1}`);
    return ["graph TD", ...lines, ...edges].join("\n");
}
