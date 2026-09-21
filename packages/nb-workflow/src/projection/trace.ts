import type { ActivityRecord } from "../types";

export type TraceNode = {
    key: string;
    path: string;
    seq: number;
    kind: string;
};

export type TraceGraph = { nodes: TraceNode[]; edges: [string, string][]; mermaid: string };

/** 分支路径 `parent/<mapSeq>:<index>` 按段解析，嵌套路径取真实父路径。 */
function branchParent(path: string): {
    parent: string;
    mapSeq: number;
} | null {
    const segments = path.split("/");
    const leaf = segments[segments.length - 1];
    const match = leaf?.match(/^(\d+):(\d+)$/);
    if (!match || segments.length < 2) {
        return null;
    }
    return {
        parent: segments.slice(0, -1).join("/"),
        mapSeq: Number(match[1]),
    };
}

/**
 * 投影三：动态 trace。journal 本身就是精确执行图：
 * 同路径 Activity 顺序连边；子路径（map 分支）从父路径的派生点接入、汇合回派生点之后的下一个 Activity。
 */
export function traceGraph(journal: ActivityRecord[]): TraceGraph {
    const byPath = new Map<string, ActivityRecord[]>();
    for (const rec of journal) {
        const list = byPath.get(rec.path) ?? [];
        list.push(rec);
        byPath.set(rec.path, list);
    }
    for (const list of byPath.values()) list.sort((a, b) => a.seq - b.seq);

    const nodes: TraceNode[] = journal.map((r) => ({ key: r.key, path: r.path, seq: r.seq, kind: r.kind }));
    const edges: [string, string][] = [];

    // 同路径顺序边
    for (const list of byPath.values()) {
        for (let i = 1; i < list.length; i++) {
            const prev = list[i - 1];
            const curr = list[i];
            if (prev && curr) edges.push([prev.key, curr.key]);
        }
    }
    // 分支边：子路径 parent/<mapSeq>:<i> 从父路径中 seq < mapSeq 的最后一个 Activity 接入
    for (const [path, list] of byPath) {
        const branch = branchParent(path);
        const first = list[0];
        const last = list[list.length - 1];
        if (!branch || !first || !last) continue;
        const parentList = byPath.get(branch.parent) ?? [];
        const { mapSeq } = branch;
        const anchor = [...parentList].reverse().find((r) => r.seq < mapSeq);
        if (anchor) edges.push([anchor.key, first.key]);
        const join = parentList.find((r) => r.seq > mapSeq);
        if (join) edges.push([last.key, join.key]);
    }

    const idOf = new Map(nodes.map((n, i) => [n.key, `t${i}`]));
    const labelOf = (n: TraceNode) => {
        const label = `${n.kind} @${n.key}`;
        // ask 节点用体育场形突出人类参与点；其余方框
        return n.kind === "ask" ? `${idOf.get(n.key)}(["${label}"])` : `${idOf.get(n.key)}["${label}"]`;
    };
    // 并行分支组：同一 map/all 派生的子路径圈进 subgraph，图上明示并发结构
    const groupOf = (path: string) => branchParent(path)?.parent ?? null;
    const groups = new Map<string, TraceNode[]>();
    const plain: TraceNode[] = [];
    for (const n of nodes) {
        const group = groupOf(n.path);
        if (group === null) { plain.push(n); continue; }
        const list = groups.get(group) ?? [];
        list.push(n);
        groups.set(group, list);
    }
    const lines: string[] = plain.map((n) => `    ${labelOf(n)}`);
    let groupIndex = 0;
    for (const [group, members] of groups) {
        const branchCount = new Set(members.map((m) => m.path)).size;
        lines.push(`    subgraph g${groupIndex++}["并行 ×${branchCount}（${group}）"]`);
        for (const m of members) lines.push(`        ${labelOf(m)}`);
        lines.push("    end");
    }
    const edgeLines = edges.map(([a, b]) => `    ${idOf.get(a)} --> ${idOf.get(b)}`);
    return { nodes, edges, mermaid: ["graph TD", ...lines, ...edgeLines].join("\n") };
}
