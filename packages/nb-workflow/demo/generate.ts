/**
 * nb-workflow 演示页生成器（自包含 HTML，mermaid 走 CDN）。
 *
 * 四个板块，全部来自 mock 实跑（不是手画示意图）：
 *   1. 实时回放播放器：按运行事件流逐步点亮 trace 图 / 日志 / 进度，遇 ask 暂停等应答
 *      —— 模拟接入 NeuroBook 后用户最终看到的体验（事件流 = SSE 前置形态）
 *   2. 静态投影：声明骨架 + AST 近似 CFG
 *   3. 缓存失效：改脚本参数后 rerun，命中/重跑节点着色
 *   4. RP 持久参与者：leader session 树跨两轮 run + 轮间直聊的真实生长
 *
 * 运行：bun demo/generate.ts → 打开 demo/index.html
 */
import { MemorySessionStore, MockAgentPort, WorkflowRunner, createMemoryWorkspace, extractCfg, skeletonMermaid, traceGraph } from "../src/index";
import type {
    ActivityRecord,
    AgentWorkflowDefinition as WorkflowDefinition,
    JsonValue,
    Wf,
    WorkflowEvent,
} from "../src/index";
import { directChat } from "../test/helpers";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const mlabel = (s: string) => s.replaceAll('"', "'"); // mermaid 标签内引号净化

// ==================== 板块 1 + 3：拆书（事件流 + 失效重跑） ====================

const book = [
    "# 第一章\n主角出场，捡到神秘玉佩。",
    "# 第二章\n玉佩引来追杀，主角初显身手。",
    "# 第三章\n拜入宗门，结识挚友。",
    "# 第四章\n宗门大比，一鸣惊人。",
].join("\n---\n");

let sink: WorkflowEvent[] = [];
const store = new MemorySessionStore();
const agents = new MockAgentPort(store);
const runner = new WorkflowRunner({ sessions: store, agents }, {
    workspace: createMemoryWorkspace({ "manuscript/book.md": book }),
    onEvent: (e) => sink.push(e),
});

agents.register("summarizer.chapter", async ({ input }) => {
    await sleep(20 + ((input as { text: string }).text.length % 4) * 15); // 制造乱序完成
    return { message: "已摘要", data: { brief: (input as { text: string }).text.split("\n")[0] } };
});
agents.register("plot.analyst", async ({ mode, input }) => {
    await sleep(40);
    if (mode === "followup") return { message: "深度分析完成", data: { foreshadowing: ["玉佩来历", "宗门隐秘"] } };
    return { message: "剧情分析完成", data: { arcs: (input as { briefs: unknown[] }).briefs.length, theme: "逆袭" } };
});
agents.register("style.extractor", async ({ input }) => {
    await sleep(30);
    const q = input as { chapter: string; mode: string };
    return { message: "文风提取完成", data: { from: q.chapter, style: q.mode } };
});

let styleMode = "白描"; // 板块 3 会"编辑脚本"改这个参数

const splitBook: WorkflowDefinition = {
    key: "split-book",
    phases: [
        { key: "brief", title: "逐章摘要（小模型 ×N 并发）" },
        { key: "plot", title: "剧情分析（高性能模型吃 brief）" },
        { key: "pick", title: "人工圈选章节" },
        { key: "style", title: "文风提取（高性能模型）" },
    ],
    run: async (wf: Wf) => {
        const raw = await wf.workspace.read("manuscript/book.md");
        const chapters = raw.split("\n---\n").map((text, i) => ({ id: `ch${i + 1}`, text }));

        wf.progress({ phase: "brief", total: chapters.length });
        wf.log(`读取书稿，共 ${chapters.length} 章，派发小模型并发摘要`);
        let doneCount = 0;
        const briefs = await wf.map(chapters, async (ch) => {
            const s = await wf.agents.create("summarizer.chapter", { ephemeral: true });
            const r = await s.invoke({ input: { text: ch.text } });
            wf.progress({ phase: "brief", done: ++doneCount });
            return { chapter: ch.id, brief: (r.result.data as { brief: string }).brief };
        }, { concurrency: 2 });

        wf.progress({ phase: "plot" });
        wf.log("摘要完成，高性能模型基于 brief 分析剧情（隔离文风干扰）");
        const analyst = await wf.agents.create("plot.analyst", { ephemeral: true });
        const plot = await analyst.invoke({ input: { briefs } });

        // if 条件分支：长篇追加深度分析（静态 CFG 里是虚线节点，trace 里只有走到才出现）
        if ((plot.result.data as { arcs: number }).arcs >= 4) {
            wf.log("检测到 4 条剧情弧线（长篇），追加深度伏笔分析");
            await analyst.invoke({ mode: "followup", input: { focus: "伏笔与铺垫" } });
        }

        const picks = await wf.ask({
            kind: "select", multi: true, title: "选择要提取文风的章节",
            options: chapters.map((ch) => ({ id: ch.id, label: ch.id })),
        });

        wf.progress({ phase: "style" });
        wf.log(`用户圈选 ${(picks as string[]).join("、")}，提取文风`);
        const styles = await wf.map(picks as string[], async (chapterId) => {
            const s = await wf.agents.create("style.extractor", { ephemeral: true });
            const r = await s.invoke({ input: { chapter: chapterId, mode: styleMode } });
            return r.result.data;
        });

        return { briefs, plot: plot.result.data, styles } as JsonValue;
    },
};

// —— 实跑：挂起 → resume，事件全程入 liveEvents ——
const liveEvents: WorkflowEvent[] = sink = [];
const waitingView = await runner.start(splitBook, null);
const askKey = waitingView.pendingAsks[0].key;
const askAnswer: JsonValue = ["ch2", "ch4"];
const doneView = await runner.resume(waitingView.runId, { [askKey]: askAnswer });

// —— 播放器帧：activity_started 渲染"进行中"虚线节点（并发可见），完成后转实心 ——
type Frame = { ev: WorkflowEvent; graph?: string };
const order: ActivityRecord[] = [];
const seen = new Map<string, number>();
const running = new Map<string, ActivityRecord>(); // 进行中的伪记录（result 占位 null）

function buildGraph(highlightKey?: string): string {
    const combined = [...order, ...running.values()];
    const g = traceGraph(combined);
    const styles: string[] = [];
    combined.forEach((r, i) => {
        if (running.has(r.key)) styles.push(`    style t${i} fill:#33200f,stroke:#d97706,stroke-dasharray:5 5,color:#ffcf87`);
        else if (r.key === highlightKey) styles.push(`    style t${i} fill:#f9e2af,stroke:#b45309,stroke-width:2px`);
    });
    return [g.mermaid, ...styles].join("\n");
}

const frames: Frame[] = liveEvents.map((ev) => {
    if (ev.type === "activity_started") {
        running.set(ev.key, {
            key: ev.key,
            path: ev.path,
            seq: ev.seq,
            kind: ev.kind,
            fingerprint: "",
            result: { kind: "inline", value: null },
        });
        return { ev, graph: buildGraph() };
    }
    if (ev.type === "activity") {
        running.delete(ev.record.key);
        if (!seen.has(ev.record.key)) {
            seen.set(ev.record.key, order.length);
            order.push(ev.record);
        }
        return { ev, graph: buildGraph(ev.record.key) };
    }
    return { ev };
});

// —— 板块 3：模拟"编辑脚本"（改 style 提取参数）后 rerun，同 journal 局部失效 ——
styleMode = "工笔细描";
const invEvents: WorkflowEvent[] = sink = [];
const rerunView = await runner.rerun(waitingView.runId);
const cachedByKey = new Map<string, boolean>();
for (const ev of invEvents) if (ev.type === "activity") cachedByKey.set(ev.record.key, ev.cached);
const invTrace = traceGraph(rerunView.journal);
const invStyles = invTrace.nodes.map((n, i) =>
    cachedByKey.get(n.key)
        ? `    style t${i} fill:#14261a,stroke:#2ea043,color:#7ee787`
        : `    style t${i} fill:#33200f,stroke:#d97706,color:#ffcf87`).join("\n");
const invMermaid = `${invTrace.mermaid}\n${invStyles}`;
const invCached = [...cachedByKey.values()].filter(Boolean).length;
const invRerun = cachedByKey.size - invCached;

const skeleton = skeletonMermaid(splitBook);
const cfg = extractCfg(splitBook.run.toString());

// ==================== 板块 4：RP 持久参与者的 session 树 ====================

const store2 = new MemorySessionStore();
const agents2 = new MockAgentPort(store2);
const runner2 = new WorkflowRunner({ sessions: store2, agents: agents2 });
agents2.register("simulator.leader", ({ mode, message, input }) => {
    if (mode === "followup") {
        const reactions = (input as { reactions: { message: string }[] }).reactions;
        return { message: `结算：${reactions.map((r) => r.message).join("；")}` };
    }
    if (message?.startsWith("聊：")) return { message: `（闲聊）酒保是老约翰，消息灵通` };
    return {
        message: "世界模拟，派发角色",
        data: { dispatch: [{ subjectId: "alice", packet: `艾丽丝回应「${message}」` }, { subjectId: "bob", packet: `鲍勃回应「${message}」` }] } as JsonValue,
    };
});
agents2.register("simulator.actor", ({ input }) => ({ message: `${(input as { packet: string }).packet}` }));

const rpTurn: WorkflowDefinition = {
    key: "rp-turn",
    run: async (wf: Wf, args) => {
        const leader = await wf.agents.acquire({ profileKey: "simulator.leader", tag: "rp:main" });
        const plan = await leader.invoke({ message: (args as { userInput: string }).userInput });
        const dispatch = (plan.result.data as { dispatch: { subjectId: string; packet: string }[] }).dispatch;
        const reactions = await wf.map(dispatch, async (d) => {
            const actor = await wf.agents.acquire({ profileKey: "simulator.actor", tag: `rp:actor:${d.subjectId}`, parent: leader });
            return { subjectId: d.subjectId, message: (await actor.invoke({ input: { packet: d.packet } })).result.message, actorSession: actor.id };
        }, { concurrency: 2 });
        await leader.invoke({ mode: "followup", input: { reactions } as JsonValue });
        return { leaderSession: leader.id, reactions } as JsonValue;
    },
};

const rp1 = await runner2.start(rpTurn, { userInput: "我推开酒馆的门" });
const leaderId = (rp1.result as { leaderSession: number }).leaderSession;
await directChat(store2, agents2, leaderId, "聊：刚才的酒保是谁？");
const rp2 = await runner2.start(rpTurn, { userInput: "我向吧台走去" });
const rpReuse = (rp2.result as { leaderSession: number }).leaderSession === leaderId;

/** leader session 树 → mermaid（origin 着色 + active leaf 标记） */
async function sessionTreeMermaid(sessionId: number): Promise<string> {
    const entries = store2.allEntries(sessionId);
    const active = await store2.activeLeaf(sessionId);
    const lines = entries.map((e) => {
        const text = e.message ?? (e.input !== undefined ? "[input]" : "[data]");
        const snippet = mlabel(text.length > 18 ? `${text.slice(0, 17)}…` : text);
        const icon = e.role === "user" ? "🧑" : "🤖";
        return `    e${e.id}["${icon} ${snippet}${e.id === active ? " ◀ leaf" : ""}"]:::${e.origin}`;
    });
    const edges = entries.filter((e) => e.parentId !== null).map((e) => `    e${e.parentId} --> e${e.id}`);
    return ["graph TD", ...lines, ...edges,
        "    classDef workflow fill:#16202e,stroke:#3d5a99,color:#a9c4ff",
        "    classDef direct fill:#2a2313,stroke:#8a6d1e,color:#ffd479"].join("\n");
}
const rpTree = await sessionTreeMermaid(leaderId);

// ==================== 渲染 HTML ====================

const framesJson = JSON.stringify(frames).replaceAll("</", "<\\/");
const answerJson = JSON.stringify(askAnswer).replaceAll("</", "<\\/");

const cfgRows = cfg.nodes.map((n) =>
    `<tr><td>c${n.id}</td><td><code>${esc(n.call)}</code></td><td>${n.controls.map((c) => `<span class="chip">${esc(c)}</span>`).join(" ")}</td><td class="fp">${esc(n.hint)}</td></tr>`).join("\n");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>nb-workflow · 运行演示</title>
<style>
    body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; background: #12141a; color: #d8dce6; }
    header { padding: 22px 32px 10px; border-bottom: 1px solid #262b36; }
    h1 { margin: 0 0 4px; font-size: 21px; } h1 small { color: #7a8399; font-weight: normal; font-size: 13px; }
    section { padding: 20px 32px; border-bottom: 1px solid #1d212b; }
    h2 { font-size: 16px; color: #8ab4ff; margin: 0 0 6px; }
    .note { color: #9aa3b5; font-size: 13px; margin: 0 0 14px; max-width: 76em; line-height: 1.6; }
    .graph { background: #f7f8fa; border-radius: 8px; padding: 12px; overflow-x: auto; min-height: 60px; }
    .cols { display: flex; gap: 16px; flex-wrap: wrap; } .cols > div { flex: 1 1 420px; min-width: 0; }
    table { border-collapse: collapse; font-size: 12px; width: 100%; }
    th, td { border: 1px solid #2a3040; padding: 4px 8px; text-align: left; vertical-align: top; }
    th { background: #1a1e28; color: #8ab4ff; }
    code { color: #ffcf87; } .fp { color: #7a8399; font-family: Consolas, monospace; word-break: break-all; }
    .chip { display: inline-block; background: #223; border: 1px solid #354060; border-radius: 10px; padding: 1px 8px; font-size: 11px; color: #a9c4ff; }
    button { background: #24406e; color: #cfe1ff; border: 1px solid #3d5a99; border-radius: 6px; padding: 6px 18px; cursor: pointer; font-size: 14px; }
    button:hover { background: #2d5090; } button:disabled { opacity: .4; cursor: default; }
    .badge { display: inline-block; border-radius: 10px; padding: 2px 12px; font-size: 12px; margin-left: 10px; }
    .badge.running { background: #1c2f52; color: #8ab4ff; } .badge.waiting { background: #4a3a12; color: #ffd479; }
    .badge.completed { background: #14361d; color: #7ee787; } .badge.idle { background: #262b36; color: #9aa3b5; }
    #live-progress { color: #9aa3b5; font-size: 13px; margin: 8px 0; }
    #live-logs { list-style: none; margin: 8px 0; padding: 0; font-size: 12px; color: #9aa3b5; max-height: 140px; overflow-y: auto; }
    #live-logs li { padding: 2px 0; border-bottom: 1px dashed #1d212b; }
    #live-logs li.act { color: #6f7a90; } #live-logs li.hit { color: #4f8f5f; }
    #ask-box { display: none; background: #1c1a12; border: 1px solid #5c4a1e; border-radius: 8px; padding: 12px 16px; margin: 10px 0; max-width: 44em; }
    #ask-box .ask-title { color: #ffd479; font-weight: 600; margin-bottom: 8px; }
    .legend span { display: inline-block; margin-right: 14px; font-size: 12px; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
</style>
</head>
<body>
<header>
    <h1>nb-workflow 运行演示 <small>Task 110 spike · 全部内容来自 mock 实跑事件流</small></h1>
</header>

<!-- 板块 1：实时回放播放器 -->
<section>
    <h2>① 实时运行视图（接入后的用户体验）</h2>
    <p class="note">「拆书」workflow 的真实事件流回放：<b style="color:#ffcf87">虚线橙节点 = 正在执行</b>——并发摘要阶段会同时挂着 2 个（concurrency=2），并行一眼可见；完成后转实心（黄色高亮 = 最新完成），并行分支组由 subgraph 框出。跑到 <b>ask</b> 时 run 挂起等你应答；resume 后前缀记录以「⚡缓存命中」快闪掠过（零重跑）。剧情分析后有一个 <code>if</code> 条件步（长篇追加深度伏笔分析）——它只在实际走到时出现在 trace 里，未走的分支去看投影②。</p>
    <button id="play-btn">▶ 开始运行</button><span id="live-badge" class="badge idle">未开始</span>
    <div id="live-progress"></div>
    <div id="ask-box">
        <div class="ask-title" id="ask-title"></div>
        <div id="ask-opts"></div>
        <div style="margin-top:10px"><button id="ask-answer-btn"></button></div>
    </div>
    <div class="cols">
        <div class="graph" id="live-graph"><span style="color:#7a8399">点击「开始运行」</span></div>
        <div><ul id="live-logs"></ul></div>
    </div>
</section>

<!-- 板块 2：静态投影 -->
<section>
    <h2>② 静态投影：声明骨架 + AST 近似 CFG</h2>
    <div class="cols">
        <div>
            <p class="note">骨架来自 phases 元数据（运行前可见）。</p>
            <div class="graph"><pre class="mermaid">${skeleton}</pre></div>
        </div>
        <div>
            <p class="note">CFG 解析脚本源码，<b>虚线 = 被 if / map 回调包裹、静态无法断言必经</b>。if 的两种可能都在这张图上（如第二个 analyst.invoke 标注 if）；trace 只画实际发生的执行——静态图管"可能"，动态图管"事实"，两图配合。</p>
            <div class="graph"><pre class="mermaid">${cfg.mermaid}</pre></div>
        </div>
    </div>
    <table><tr><th>节点</th><th>调用</th><th>控制结构</th><th>首参摘要</th></tr>${cfgRows}</table>
</section>

<!-- 板块 3：缓存失效着色 -->
<section>
    <h2>③ 改脚本后 rerun：缓存局部失效</h2>
    <p class="note">完成后"编辑脚本"——把文风提取参数从 <code>白描</code> 改为 <code>工笔细描</code>，对同一 run rerun：
        <b style="color:#7ee787">${invCached} 条命中缓存</b>（读稿 / 摘要 / 分析 / ask 应答全部不重跑），
        <b style="color:#ffcf87">${invRerun} 条重跑</b>（只有两个 style 分支里参数变了的 invoke）。兄弟路径互不影响。</p>
    <p class="legend"><span><span class="dot" style="background:#2ea043"></span>缓存命中</span><span><span class="dot" style="background:#d97706"></span>参数变更重跑</span></p>
    <div class="graph"><pre class="mermaid">${invMermaid}</pre></div>
</section>

<!-- 板块 4：RP 持久参与者 session 树 -->
<section>
    <h2>④ RP 持久参与者：leader session 树跨 run 生长</h2>
    <p class="note">两轮 rp-turn workflow + 轮间用户直聊，acquire 拿到的是同一个 leader session（复用${rpReuse ? "✓" : "✗"}）。
        蓝色 = workflow 写入（回合模拟），黄色 = 用户直接对话——两种入口混排在同一棵主线上，历史对 leader 连续可见。session 是持久一等公民，workflow 只是借用它的无状态 conductor。</p>
    <div class="graph"><pre class="mermaid">${rpTree}</pre></div>
</section>

<script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    mermaid.initialize({ startOnLoad: true, theme: "neutral", flowchart: { curve: "basis" } });

    const FRAMES = ${framesJson};
    const ANSWER = ${answerJson};
    let idx = 0, renderCount = 0, playing = false;
    const el = (id) => document.getElementById(id);
    const badge = el("live-badge"), logs = el("live-logs"), graphBox = el("live-graph");

    async function drawGraph(code) {
        const out = await mermaid.render("live" + (renderCount++), code);
        graphBox.innerHTML = out.svg;
    }
    function addLog(text, cls) {
        const li = document.createElement("li");
        li.textContent = text;
        if (cls) li.className = cls;
        logs.prepend(li);
    }
    function setBadge(status, text) {
        badge.className = "badge " + status;
        badge.textContent = text;
    }

    async function step() {
        if (!playing || idx >= FRAMES.length) { playing = false; return; }
        const frame = FRAMES[idx++];
        const ev = frame.ev;
        let delay = 300;
        if (ev.type === "status") {
            const names = { running: "运行中", waiting: "⏸ 等待应答", completed: "✅ 完成", failed: "失败" };
            setBadge(ev.status, names[ev.status] || ev.status);
            delay = 200;
        } else if (ev.type === "progress") {
            el("live-progress").textContent = "阶段: " + (ev.state.phase || "-") +
                (ev.state.total ? "（" + (ev.state.done || 0) + "/" + ev.state.total + "）" : "");
            delay = 150;
        } else if (ev.type === "log") {
            addLog("📋 " + ev.message);
            delay = 350;
        } else if (ev.type === "activity_started") {
            if (frame.graph) await drawGraph(frame.graph);
            addLog("▶ 执行中 " + ev.kind + " @" + ev.key, "act");
            delay = 220;
        } else if (ev.type === "activity") {
            if (frame.graph) await drawGraph(frame.graph);
            addLog((ev.cached ? "⚡ 缓存命中 " : "● ") + ev.record.kind + " @" + ev.record.key, ev.cached ? "hit" : "act");
            delay = ev.cached ? 90 : 520;
        } else if (ev.type === "ask_pending") {
            el("ask-title").textContent = "⏸ " + ev.ask.spec.title;
            el("ask-opts").innerHTML = (ev.ask.spec.options || []).map((o) => '<span class="chip">' + o.label + "</span>").join(" ");
            el("ask-answer-btn").textContent = "应答：" + JSON.stringify(ANSWER) + "（resume）";
            el("ask-box").style.display = "block";
            playing = false; // 暂停等人
            return;
        }
        setTimeout(step, delay);
    }

    el("play-btn").addEventListener("click", () => {
        if (playing) return;
        idx = 0; logs.innerHTML = ""; el("ask-box").style.display = "none";
        playing = true;
        el("play-btn").textContent = "↺ 重新运行";
        step();
    });
    el("ask-answer-btn").addEventListener("click", () => {
        el("ask-box").style.display = "none";
        addLog("🧑 用户应答: " + JSON.stringify(ANSWER));
        playing = true;
        step();
    });
</script>
</body>
</html>
`;

await Bun.write(new URL("./index.html", import.meta.url), html);
console.log("demo 已生成: demo/index.html");
console.log(`  播放器帧数: ${frames.length}（含 ask 暂停点）`);
console.log(`  失效快照: ${invCached} 命中 / ${invRerun} 重跑`);
console.log(`  RP leader 复用: ${rpReuse}，树 entry 数: ${store2.allEntries(leaderId).length}`);
