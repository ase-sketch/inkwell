import { describe, expect, test } from "bun:test";
import { makeEnv } from "./helpers";
import { createMemoryWorkspace } from "../src/index";
import type {
    AgentWorkflowDefinition as WorkflowDefinition,
    JsonValue,
    Wf,
} from "../src/index";

/**
 * 场景一：拆书。
 * 小模型逐章摘要（并发、ephemeral）→ 高性能模型基于 brief 分析剧情 → 人工圈选 → 提取文风。
 */
describe("场景：拆书", () => {
    const book = [
        "# 第一章\n主角出场，捡到神秘玉佩。",
        "# 第二章\n玉佩引来追杀，主角初显身手。",
        "# 第三章\n拜入宗门，结识挚友。",
        "# 第四章\n宗门大比，一鸣惊人。",
    ].join("\n---\n");

    function setup() {
        const env = makeEnv({ workspace: createMemoryWorkspace({ "manuscript/book.md": book }) });
        const counters = { summarize: 0, plot: 0, style: 0 };
        env.agents.register("summarizer.chapter", ({ input }) => {
            counters.summarize++;
            const text = (input as { text: string }).text;
            return { message: "已摘要", data: { brief: text.split("\n")[0] ?? "" } };
        });
        env.agents.register("plot.analyst", ({ input }) => {
            counters.plot++;
            const briefs = (input as { briefs: { brief: string }[] }).briefs;
            return { message: "剧情分析完成", data: { arcs: briefs.length, theme: "逆袭" } };
        });
        env.agents.register("style.extractor", ({ input }) => {
            counters.style++;
            return { message: "文风提取完成", data: { from: (input as { chapter: string }).chapter, style: "白描" } };
        });
        return { ...env, counters };
    }

    const splitBook: WorkflowDefinition = {
        key: "split-book",
        phases: [
            { key: "brief", title: "逐章摘要" },
            { key: "plot", title: "剧情分析" },
            { key: "style", title: "文风提取" },
        ],
        run: async (wf: Wf) => {
            const raw = await wf.workspace.read("manuscript/book.md");
            const chapters = (raw as string).split("\n---\n").map((text, i) => ({ id: `ch${i + 1}`, text }));

            wf.progress({ phase: "brief", total: chapters.length });
            const briefs = await wf.map(chapters, async (ch) => {
                const s = await wf.agents.create("summarizer.chapter", { ephemeral: true });
                const r = await s.invoke({ input: { text: ch.text } });
                return { chapter: ch.id, brief: (r.result.data as { brief: string }).brief };
            }, { concurrency: 2 });

            wf.progress({ phase: "plot" });
            const analyst = await wf.agents.create("plot.analyst", { ephemeral: true });
            const plot = await analyst.invoke({ input: { briefs } });

            const picks = await wf.ask({
                kind: "select", multi: true, title: "选择要提取文风的章节",
                options: chapters.map((ch) => ({ id: ch.id, label: ch.id })),
            });

            wf.progress({ phase: "style" });
            const styles = await wf.map(picks as string[], async (chapterId) => {
                const s = await wf.agents.create("style.extractor", { ephemeral: true });
                const r = await s.invoke({ input: { chapter: chapterId } });
                return r.result.data;
            });

            return { briefs, plot: plot.result.data, styles } as JsonValue;
        },
    };

    test("全流程：并发摘要 → 分析 → 挂起圈选 → resume 提风格，摘要不重跑", async () => {
        const { runner, counters, store } = setup();
        const v1 = await runner.start(splitBook, null);
        expect(v1.status).toBe("waiting");
        expect(counters.summarize).toBe(4); // 4 章并发摘要已完成并进 journal
        expect(counters.plot).toBe(1);
        expect(v1.progress?.phase).toBe("plot");
        expect(v1.pendingAsks[0]!.spec.title).toBe("选择要提取文风的章节");

        const v2 = await runner.resume(v1.runId, { [v1.pendingAsks[0]!.key]: ["ch2", "ch4"] });
        expect(v2.status).toBe("completed");
        expect(counters.summarize).toBe(4); // 缓存命中，摘要没有重跑
        expect(counters.plot).toBe(1);
        expect(counters.style).toBe(2); // 只对圈选章节提取
        const result = v2.result as { briefs: { chapter: string; brief: string }[]; plot: { arcs: number }; styles: JsonValue[] };
        expect(result.briefs.map((b) => b.chapter)).toEqual(["ch1", "ch2", "ch3", "ch4"]);
        expect(result.plot.arcs).toBe(4);
        expect(result.styles).toHaveLength(2);

        // ephemeral：run 成功后 7 个临时 session（4 摘要 + 1 分析 + 2 文风）全部归档
        const archivedFlags = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(async (id) => {
            try { return (await store.meta(id)).archived; } catch { return false; }
        }));
        expect(archivedFlags.filter(Boolean).length).toBe(7);
    });
});
