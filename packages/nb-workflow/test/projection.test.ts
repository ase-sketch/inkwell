import { describe, expect, test } from "bun:test";
import { makeEnv } from "./helpers";
import { createMemoryWorkspace, extractCfg, skeletonMermaid, traceGraph } from "../src/index";
import type {
    AgentWorkflowDefinition as WorkflowDefinition,
    Wf,
} from "../src/index";

/** 三种投影：声明骨架（运行前）/ AST 近似 CFG（静态尽力）/ 动态 trace（精确执行图） */
describe("三种投影", () => {
    const def: WorkflowDefinition = {
        key: "demo",
        phases: [
            { key: "brief", title: "逐章摘要" },
            { key: "analyze", title: "剧情分析" },
        ],
        run: async (wf: Wf) => {
            const raw = await wf.workspace.read("book.md");
            const chapters = (raw as string).split("|");
            const briefs = await wf.map(chapters, async (text) => {
                const s = await wf.agents.create("summarizer", { ephemeral: true });
                return (await s.invoke({ input: { text } })).result.data;
            }, { concurrency: 2 });
            const analyst = await wf.agents.create("analyst", { ephemeral: true });
            const plot = await analyst.invoke({ input: { briefs } });
            if (briefs.length > 10) await wf.ask({ kind: "approve", title: "超长书确认" });
            return plot.result.data;
        },
    };

    test("投影一：声明骨架", () => {
        const mermaid = skeletonMermaid(def);
        expect(mermaid).toContain('p0["逐章摘要"]');
        expect(mermaid).toContain("p0 --> p1");
    });

    test("投影二：AST 近似 CFG 识别编排调用点与控制结构", () => {
        const cfg = extractCfg(def.run.toString());
        const calls = cfg.nodes.map((n) => n.call);
        expect(calls).toContain("wf.workspace.read");
        expect(calls).toContain("wf.map");
        expect(calls).toContain("wf.ask");
        // map 回调内的调用被标记为并发分支体
        const createNode = cfg.nodes.find((n) => n.call === "wf.agents.create" && n.controls.includes("map-fn"));
        expect(createNode).toBeDefined();
        // ask 在 if 内 → 控制结构标注 + 虚线边
        const askNode = cfg.nodes.find((n) => n.call === "wf.ask");
        expect(askNode?.controls).toContain("if");
        expect(cfg.mermaid).toContain("-.->");
    });

    test("投影三：journal trace 是精确执行图，含分支派生与汇合边", async () => {
        const { agents, runner } = makeEnv({ workspace: createMemoryWorkspace({ "book.md": "一|二|三" }) });
        agents.register("summarizer", ({ input }) => ({ message: "ok", data: { brief: (input as { text: string }).text } }));
        agents.register("analyst", () => ({ message: "ok", data: { arcs: 3 } }));

        const view = await runner.start(def, null);
        expect(view.status).toBe("completed");

        const trace = traceGraph(view.journal);
        // 3 个分支路径各 2 个 Activity + root 上 read/create/invoke
        const branchNodes = trace.nodes.filter((n) => n.path.includes(":"));
        expect(branchNodes).toHaveLength(6);
        // 派生边：read（root#0）→ 各分支首个 Activity
        const forkEdges = trace.edges.filter(([from, to]) => from === "root#0" && to.includes(":"));
        expect(forkEdges).toHaveLength(3);
        // 汇合边：各分支末个 Activity → map 之后 root 上第一个 Activity（analyst create root#2）
        const joinEdges = trace.edges.filter(([from, to]) => from.includes(":") && to === "root#2");
        expect(joinEdges).toHaveLength(3);
        expect(trace.mermaid).toContain("agents.invoke");
    });

    test("投影三：嵌套 map 分支按真实父路径解析派生与汇合边", () => {
        const record = (
            key: string,
            path: string,
            seq: number,
            kind: string,
        ) => ({
            key,
            path,
            seq,
            kind,
            fingerprint: "sha256:test",
            result: {
                kind: "inline" as const,
                value: null,
            },
        });
        const journal = [
            record("root#0", "root", 0, "action"),
            record("root#1", "root", 1, "kernel.map"),
            record("root/1:0#0", "root/1:0", 0, "action"),
            record("root/1:0#1", "root/1:0", 1, "kernel.map"),
            record("root/1:0/1:0#0", "root/1:0/1:0", 0, "action"),
            record("root/1:0/2:0#0", "root/1:0/2:0", 0, "action"),
            record("root/1:0#2", "root/1:0", 2, "action"),
            record("root/1:1#0", "root/1:1", 0, "action"),
            record("root#2", "root", 2, "action"),
        ];

        const trace = traceGraph(journal);

        expect(trace.edges).toContainEqual([
            "root/1:0#0",
            "root/1:0/1:0#0",
        ]);
        expect(trace.edges).toContainEqual([
            "root/1:0/1:0#0",
            "root/1:0#2",
        ]);
        expect(trace.mermaid).toContain("并行 ×2（root/1:0）");
    });
});
