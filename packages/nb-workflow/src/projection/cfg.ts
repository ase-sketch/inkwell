import {createRequire} from "node:module";
import type * as TypeScript from "typescript";

/**
 * typescript 是 ~9MB 的单文件 CJS 包：只能在调用 extractCfg 时同步 require，
 * 不能在模块顶层加载——否则主入口 import 就会强制拉起 typescript，既让
 * 无 typescript 依赖的消费者崩溃，也让宿主打包器把它拉进模块图。
 */
function loadTypeScript(): typeof TypeScript {
    try {
        const require = createRequire(import.meta.url);
        return require("typescript") as typeof TypeScript;
    } catch (error) {
        throw new Error(
            "extractCfg requires the optional 'typescript' package. "
            + "Install typescript or avoid calling extractCfg.",
            { cause: error },
        );
    }
}

export type CfgNode = {
    id: number;
    /** wf API 全名（wf.map / wf.ask / xxx.invoke ...） */
    call: string;
    /** 首参摘要，便于人识别 */
    hint: string;
    /** 包裹的控制结构（if / for / while / map-fn），体现"这是近似图"的虚线语义 */
    controls: string[];
};

export type CfgGraph = { nodes: CfgNode[]; mermaid: string };

/** handle 方法：任意 receiver 都算（invoke 可能挂在 writer/actor 等变量上） */
const HANDLE_METHODS = new Set(["invoke", "append", "checkout", "excursion", "transcript"]);

/** 标签净化：折叠空白、去引号、截断——mermaid 标签内不能出现引号与换行 */
const sanitize = (s: string) => s.replace(/\s+/g, " ").replaceAll('"', "'").slice(0, 40);

/** receiver 展示名：简单标识符链保留，复杂表达式折叠为 (…)，防止整段代码进标签 */
const shortReceiver = (recv: string) => (/^[\w$.]+$/.test(recv) && recv.length <= 20 ? recv : "(…)");

/**
 * 判定编排调用并给出展示名：按命名空间收窄，避免把 Array.prototype.map 等误报进图。
 * 返回 null 表示不是编排调用。
 */
function orchCallName(receiver: string, method: string): string | null {
    if (["map", "all", "ask", "caller"].includes(method)) return receiver === "wf" ? `wf.${method}` : null;
    if (method === "read") return receiver.endsWith("workspace") ? "wf.workspace.read" : null;
    if (["create", "acquire", "profile"].includes(method)) return receiver.endsWith("agents") ? `wf.agents.${method}` : null;
    if (method === "open") return receiver.endsWith("sessions") ? "wf.sessions.open" : null;
    if (HANDLE_METHODS.has(method)) return `${shortReceiver(receiver)}.${method}`;
    return null;
}

/**
 * 投影二：AST 近似控制流图。解析脚本源码（fn.toString()），
 * 收集 wf.* / handle 方法调用点及其包裹控制结构。静态、best-effort、允许漏报误报。
 */
export function extractCfg(source: string): CfgGraph {
    const ts = loadTypeScript();
    const sf = ts.createSourceFile("workflow.ts", source, ts.ScriptTarget.ES2022, true);
    const nodes: CfgNode[] = [];

    const controlOf = (node: TypeScript.Node): string[] => {
        const out: string[] = [];
        let cursor: TypeScript.Node | undefined = node.parent;
        while (cursor) {
            if (ts.isIfStatement(cursor)) out.push("if");
            else if (ts.isForStatement(cursor) || ts.isForOfStatement(cursor)) out.push("for");
            else if (ts.isWhileStatement(cursor)) out.push("while");
            else if (ts.isArrowFunction(cursor) || ts.isFunctionExpression(cursor)) {
                // 落在 wf.map/all 的回调里 → 标记为并发分支体
                const call = cursor.parent;
                if (ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression)) {
                    out.push(`${call.expression.name.text}-fn`);
                }
            }
            cursor = cursor.parent;
        }
        return out.reverse();
    };

    const visit = (node: TypeScript.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const receiver = node.expression.expression.getText(sf);
            const name = orchCallName(receiver, node.expression.name.text);
            if (name !== null) {
                nodes.push({
                    id: nodes.length,
                    call: name,
                    hint: sanitize(node.arguments[0]?.getText(sf) ?? ""),
                    controls: controlOf(node),
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);

    const lines = nodes.map((n) => `    c${n.id}["${sanitize(n.call)}${n.controls.length ? ` (${n.controls.join("›")})` : ""}"]`);
    const edges = nodes.slice(1).map((n, i) => {
        // 有控制结构包裹的用虚线：静态图无法断言必经
        const dashed = n.controls.length > 0 || (nodes[i]?.controls.length ?? 0) > 0;
        return `    c${i} ${dashed ? "-.->" : "-->"} c${i + 1}`;
    });
    return { nodes, mermaid: ["graph TD", ...lines, ...edges].join("\n") };
}
