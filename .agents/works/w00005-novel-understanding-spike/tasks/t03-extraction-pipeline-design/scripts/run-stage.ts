import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {resolveAgentRunRoot} from "@notnotype/neuro-book-test-support/paths";
import {findRepositoryRoot} from "../../../../../../scripts/utils/workspace-roots";
import {snapshotAt, type MemoryGraph} from "../../t02-novel-memory-model-design/schema";

/**
 * t03 S1/S2 真实调用 runner。
 *
 * 与 t01/scripts/generate-v7-brief.ts 同一套约定：单次 fetch、零重试、purpose 授权门、
 * 统计落 agent run root。差别是本脚本读的是已登记进 Git 的归一化正文（R4），不再解 EPUB。
 */

const WORK = "w00005-novel-understanding-spike";
const TASK_ROOT = ".agents/works/w00005-novel-understanding-spike/tasks";

const contract = {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    maxTokens: 4000,
    chapterNo: 1,
    sourceRef: `${TASK_ROOT}/t01-novel-understanding-spike/evidences/chapter-001-source-normalized.txt`,
    sourceNormalization: "chapter-source-normalization/v1",
    sourceSha256: "22c9b12d0305da4b64ea39751e809ed47cf9254d574caf875fbff91ef82552ee",
    promptRef: `${TASK_ROOT}/t03-extraction-pipeline-design/evidences/stage-prompts.md`,
    version: "extraction-stage-prompts/v1",
    stages: {
        s1: {purpose: "t03-s1-scene-segmentation-official", blocks: [0, 1] as const},
        s2: {purpose: "t03-s2-window-extraction-official", blocks: [2, 3] as const},
    },
} as const;

type Stage = keyof typeof contract.stages;
type ProviderConfig = {
    models?: {providers?: Array<{
        id?: string;
        enabled?: boolean;
        options?: {apiKey?: unknown; baseURL?: unknown; timeoutMs?: unknown};
        models?: Array<{id?: string; enabled?: boolean}>;
    }>};
};
type Window = {id: string; paragraphs: [number, number]; scene: string; location: string; pov: string; storyAfter: string | null; storyOffset: string | null};

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const visible = (value: string): string => value.replace(/[\s\p{Default_Ignorable_Code_Point}]/gu, "");

function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function valueAfter(args: string[], flag: string): string | undefined {
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
}

async function readPromptBlocks(root: string): Promise<string[]> {
    const file = await readFile(resolve(root, contract.promptRef), "utf8");
    const blocks = [...file.matchAll(/```text\r?\n([\s\S]*?)\r?\n```/gu)].map((match) => match[1] ?? "");
    check(blocks.length === 4, `prompt-block-count-${blocks.length}`);
    return blocks;
}

async function readSource(root: string): Promise<string[]> {
    const text = await readFile(resolve(root, contract.sourceRef), "utf8");
    check(sha256(text) === contract.sourceSha256, "source-hash-mismatch");
    return text.split("\n");
}

/** 候选表按 R1 只读前缀：切到 `窗口首段 − 1`，不是切到「库里现在有什么」。 */
function candidateTable(graph: MemoryGraph, prefixAt: number): string {
    const sliced = snapshotAt(graph, {chapter: contract.chapterNo, paragraph: prefixAt});
    if (sliced.individuals.length === 0) return "（空。这是本章第一个窗口，库里还没有任何实体，全部实体都要用 ?I 提名。）";
    return sliced.individuals
        .map((ind) => `- ${ind.id}\t${ind.kind}\t${ind.aliases.map((a) => `“${a.surface}”`).join(" ") || "（无称呼）"}`)
        .join("\n");
}

/** E10 的建议口径：并上全部 basicLevel Kind 的槽位，而不是只取候选主语所属 Kind 的槽位。 */
function predicateTable(graph: MemoryGraph): {text: string; count: number} {
    const allowed = new Set(graph.kinds.filter((k) => k.basicLevel).flatMap((k) => k.attributeSlots ?? []));
    const rows = graph.predicates
        .filter((p) => allowed.has(p.id))
        .map((p) => `- ${p.id}\t${(p.aliases ?? []).join(" / ")}\t主语:${p.domain.join("|")}`);
    return {text: rows.join("\n"), count: rows.length};
}

async function buildPrompts(root: string, stage: Stage, args: string[]): Promise<{system: string; user: string; meta: Record<string, unknown>}> {
    const blocks = await readPromptBlocks(root);
    const [systemIndex, userIndex] = contract.stages[stage].blocks;
    const system = blocks[systemIndex]!;
    const template = blocks[userIndex]!;
    const paragraphs = await readSource(root);

    if (stage === "s1") {
        const numbered = paragraphs.map((line, index) => `${index + 1}|${line}`).join("\n");
        const user = template
            .replace("{CHAPTER_NO}", String(contract.chapterNo))
            .replace("{PARAGRAPH_COUNT}", String(paragraphs.length))
            .replace("{CHAPTER_TEXT}", numbered);
        check(!/\{[A-Z_]+\}/u.test(user), "user-prompt-placeholder-unresolved");
        return {system, user, meta: {paragraphCount: paragraphs.length}};
    }

    const windowsArg = valueAfter(args, "--windows");
    const windowId = valueAfter(args, "--window");
    check(windowsArg && windowId, "windows-and-window-required");
    const windows = JSON.parse(await readFile(resolve(windowsArg), "utf8")).windows as Window[];
    const target = windows.find((w) => w.id === windowId);
    check(target, `window-not-found-${windowId}`);
    const [start, end] = target.paragraphs;
    check(start >= 1 && end <= paragraphs.length && start <= end, "window-range-invalid");

    const graph = JSON.parse(await readFile(resolve(root, `${TASK_ROOT}/t02-novel-memory-model-design/chapter-01.json`), "utf8")) as MemoryGraph;
    const predicates = predicateTable(graph);
    const windowText = paragraphs.slice(start - 1, end).map((line, index) => `${start + index}|${line}`).join("\n");
    const user = template
        .replace("{WINDOW_ID}", target.id)
        .replace("{CHAPTER_NO}", String(contract.chapterNo))
        .replace("{PARA_START}", String(start))
        .replace("{PARA_END}", String(end))
        .replace("{PREFIX_AT}", String(start - 1))
        .replace("{CANDIDATES}", candidateTable(graph, start - 1))
        .replace("{PREDICATES}", predicates.text)
        .replace("{WINDOW_TEXT}", windowText);
    check(!/\{[A-Z_]+\}/u.test(user), "user-prompt-placeholder-unresolved");
    return {system, user, meta: {windowId: target.id, paragraphs: target.paragraphs, predicateCount: predicates.count, windowChars: windowText.length}};
}

async function selfTest(root: string): Promise<void> {
    const blocks = await readPromptBlocks(root);
    check(blocks.every((block) => block.trim().length > 0), "prompt-block-empty");
    const paragraphs = await readSource(root);
    check(paragraphs.length === 77, `paragraph-count-${paragraphs.length}`);

    const s1 = await buildPrompts(root, "s1", []);
    check(s1.user.includes("\n1|") && s1.user.includes(`\n${paragraphs.length}|`), "s1-numbering-broken");

    // 用一个只覆盖第 50–63 段的临时窗口表验证 S2 的组装，不落任何仓库文件。
    const runRoot = resolveAgentRunRoot(WORK, "t03-stage-self-test");
    await mkdir(runRoot, {recursive: true});
    const windowsPath = resolve(runRoot, "windows.json");
    await writeFile(windowsPath, JSON.stringify({windows: [{id: "WX", paragraphs: [50, 63], scene: "自检", location: "自检", pov: "自检", storyAfter: null, storyOffset: null}]}), "utf8");
    const s2 = await buildPrompts(root, "s2", ["--windows", windowsPath, "--window", "WX"]);
    check(s2.user.includes("50|") && s2.user.includes("63|") && !s2.user.includes("\n64|"), "s2-window-slice-broken");

    // R1 只读前缀：候选表切到第 49 段，此时「小破书」（since 第 50 段）还不该出现在表里——
    // 但它会出现在窗口正文里，所以断言必须只看候选表，不能看整个提示词。
    const graph = JSON.parse(await readFile(resolve(root, `${TASK_ROOT}/t02-novel-memory-model-design/chapter-01.json`), "utf8")) as MemoryGraph;
    const prefix49 = candidateTable(graph, 49);
    const prefix63 = candidateTable(graph, 63);
    check(prefix49.includes("su_tianqing") && !prefix49.includes("小破书"), "s2-prefix-slice-broken");
    check(prefix63.includes("小破书"), "s2-prefix-slice-too-tight");
    check(s2.user.includes(prefix49), "s2-candidates-not-embedded");

    console.log(JSON.stringify({ok: true, httpRequestsAttempted: 0, configRead: false, repositoryWrites: 0, s1: s1.meta, s2: s2.meta}, null, 2));
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];
    const root = findRepositoryRoot(import.meta.dir);
    if (command === "self-test") return selfTest(root);
    check(command === "preflight" || command === "call", "command-required");

    const stage = valueAfter(args, "--stage") as Stage | undefined;
    check(stage === "s1" || stage === "s2", "stage-required");
    const runId = valueAfter(args, "--run-id");
    check(runId, "run-id-required");
    const runRoot = resolveAgentRunRoot(WORK, runId);
    check(!(await Bun.file(resolve(runRoot, "stats.json")).exists()), "run-id-already-exists");
    await mkdir(runRoot, {recursive: true});

    const {system, user, meta} = await buildPrompts(root, stage, args);
    const promptInfo = {
        version: contract.version,
        purpose: contract.stages[stage].purpose,
        systemSha256: sha256(system),
        userSha256: sha256(user),
        systemChars: system.length,
        userChars: user.length,
        maxTokens: contract.maxTokens,
        thinking: "disabled",
    };

    if (command === "preflight") {
        console.log(JSON.stringify({ok: true, mode: "preflight", stage, httpRequestsAttempted: 0, configRead: false, repositoryWrites: 0, prompt: promptInfo, ...meta}, null, 2));
        return;
    }

    check(process.env.NBOOK_AUTHORIZED_MODEL_CALL === contract.stages[stage].purpose, "model-call-not-authorized");
    const configArg = valueAfter(args, "--config");
    check(configArg, "config-required");
    const config = JSON.parse(await readFile(resolve(configArg), "utf8")) as ProviderConfig;
    const provider = config.models?.providers?.find((item) => item.id === contract.provider);
    check(provider?.enabled && provider.models?.some((item) => item.id === contract.model && item.enabled), "provider-or-model-disabled");
    check(typeof provider.options?.apiKey === "string" && typeof provider.options.baseURL === "string", "provider-config-missing");
    const baseUrl = provider.options.baseURL.replace(/\/+$/u, "");
    const providerUrl = new URL(baseUrl);
    check(providerUrl.protocol === "https:" && providerUrl.hostname === "api.deepseek.com", "provider-host-mismatch");
    check(providerUrl.pathname === "" || providerUrl.pathname === "/", "provider-path-mismatch");

    let httpRequestsAttempted = 0;
    let failureCategory: string | null = null;
    let responseInfo: Record<string, unknown> = {};
    let output = "";
    try {
        const started = performance.now();
        httpRequestsAttempted = 1;
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {"Content-Type": "application/json", Authorization: `Bearer ${provider.options.apiKey}`},
            body: JSON.stringify({
                model: contract.model,
                messages: [{role: "system", content: system}, {role: "user", content: user}],
                thinking: {type: "disabled"},
                stream: false,
                max_tokens: contract.maxTokens,
            }),
            redirect: "error",
            signal: AbortSignal.timeout(Math.min(typeof provider.options.timeoutMs === "number" ? provider.options.timeoutMs : 360_000, 360_000)),
        });
        const payload = await response.json() as {choices?: Array<{finish_reason?: unknown; message?: {content?: unknown}}>; usage?: {prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown}};
        responseInfo = {
            httpStatus: response.status,
            durationMs: Math.round(performance.now() - started),
            finishReason: payload.choices?.[0]?.finish_reason ?? null,
            observedChoiceCount: payload.choices?.length ?? null,
            usage: {inputTokens: payload.usage?.prompt_tokens ?? null, outputTokens: payload.usage?.completion_tokens ?? null, totalTokens: payload.usage?.total_tokens ?? null},
        };
        check(response.ok, `http-status-${response.status}`);
        check(payload.choices?.length === 1 && typeof payload.choices[0]?.message?.content === "string" && payload.choices[0].message.content.trim(), "response-content-invalid");
        output = payload.choices[0].message.content.trim();
        await writeFile(resolve(runRoot, "output.txt"), `${output}\n`, "utf8");
    } catch (error) {
        failureCategory = error instanceof Error ? error.message : "unknown-error";
    }

    const stats = {
        schema: "nbook.extraction-stage-call/v1",
        generatedAt: new Date().toISOString(),
        stage,
        provider: contract.provider,
        model: contract.model,
        baseUrlHost: providerUrl.hostname,
        source: {ref: contract.sourceRef, normalization: contract.sourceNormalization, sha256: contract.sourceSha256},
        prompt: {...promptInfo, ref: contract.promptRef},
        input: meta,
        transport: {kind: "single-fetch", redirects: "error", httpRequestsAttempted, applicationRetries: 0, libraryRetries: 0},
        response: responseInfo,
        output: output ? {sha256: sha256(output), chars: output.length, visibleChars: visible(output).length, lines: output.split("\n").length} : null,
        persistence: {outputPath: output ? "output.txt" : null, repositoryWrites: 0, responseEnvelopePersisted: false},
        failureCategory,
    };
    await writeFile(resolve(runRoot, "stats.json"), `${JSON.stringify(stats, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ok: failureCategory === null, stage, httpRequestsAttempted, runRoot, failureCategory}, null, 2));
    if (failureCategory !== null) process.exitCode = 2;
}

try {
    await main();
} catch (error) {
    console.error(JSON.stringify({ok: false, error: error instanceof Error ? error.message : "unknown-error", httpRequestsAttempted: 0, repositoryWrites: 0}));
    process.exitCode = 1;
}
