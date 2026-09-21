/**
 * 原始内容 → 事实流抽取（ADR 0004 D3：抽取策略按视角参数化）。
 *
 * ## 视角是抽取期决定的
 *
 * 「视角」的三层里，叙述视角与称呼视角都在这一步落地（知识边界在宿主侧——
 * 宿主决定这个库该看到什么，库不管，见 ADR 0004 D1/D2）：
 * - `omniscient`（小说创作）：全知全收，别名时点记的是**叙事揭晓**时点；
 * - `character`（角色扮演 / 伴侣）：只收该角色亲历亲见或被告知的，指称跟着
 *   角色的认知走——得知名字之前只能用外貌/身份指称。
 *
 * ## 跨块携带比切法重要
 *
 * 「得知名字之前不许用名字」是个**跨块状态**。第 3 块的抽取器若不知道第 2 块里
 * 主角已经知道了名字，就会写错指称，而且错得很隐蔽——下游消解会一本正经地把
 * 错误指称归到正确主体上。所以每块的上下文里都带：注册表快照（谁是谁、何时
 * 得知）+ 上一块产出的最后几条事实。两者都比同等 token 的原文重叠信息密度高。
 *
 * ## 抽取质量没有兜底
 *
 * bench 里的事实流是**人工校对过的金标**；真接入后没人校对。抽取错一句，
 * 后面全错。因此 episode 原文必须完整留档（EpisodeStore 的存在意义），
 * 换了抽取器或改了提示词时可以整批重放重建语义层。
 */
import type {LlmPort} from "../ports/ports";
import type {Subject} from "../core/types";
import type {UnresolvedFact} from "./resolve-facts";
import {chunk, type ChunkOptions} from "./chunk";

/** 抽取视角 */
export type Pov = "omniscient" | "character";

/** 抽取选项 */
export interface ExtractOptions {
    /** 视角；缺省 `omniscient` */
    pov?: Pov;
    /** `character` 视角下的视角角色名；该视角下必填 */
    povSubject?: string;
    /** 分块选项 */
    chunk?: ChunkOptions;
    /** 携带给下一块的尾部事实条数；缺省 5 */
    carryFacts?: number;
    /** 单块抽取失败的重试次数；缺省 1（失败即跳过该块，不中断整轮） */
    retries?: number;
}

/** 抽取结果 */
export interface ExtractResult {
    /** 抽出的事实（尚未分配 tick，顺序即叙事顺序） */
    facts: Array<{time?: string; text: string}>;
    /** 抽取失败被跳过的块数；>0 表示这段原文有内容没进库 */
    skippedChunks: number;
}

const OMNISCIENT_RULES = `叙述视角：**全知视角**。
- 用第三人称客观叙述，所有角色的场景都要覆盖，包括某个角色不在场的情节。
- 涉及人物时用叙事此刻**已经揭晓**的称呼：真名尚未揭晓时用正文当下使用的指称（如「粉色头发的女生」），揭晓之后才用名字。判据是「读者读到这里知道了没有」。`;

const CHARACTER_RULES = `叙述视角：**{POV} 的第一人称**。
- 每条事实用「我」的口吻写，只写 {POV} 亲身经历、亲眼所见或被明确告知的事。
- 原文若切换到 {POV} 不在场的场景，**这些段落一律跳过**，绝不能改写成 {POV} 的见闻——不在场就不可能知道。
- 涉及人物时保留 {POV} 当时能用的指称：还不知道名字就用外貌/身份指称（如「粉色头发的女生」），得知之后才用名字。判据是「{POV} 此刻知道了没有」。**不要提前剧透名字**，这对下游至关重要。`;

const SYSTEM_PROMPT = `你是记忆系统的事实抽取器。把给定的原始内容转写成一条条独立的事实。

{POV_RULES}

通用要求：
- 每条事实一句话，自包含（脱离原文也能读懂）。
- 覆盖率优先：主线事件、人物互动、得知的信息都要抽；纯景物与情绪描写可略。
- 每条带 time：沿用原文的时间标记（如「第一天上午」「三天后」）；同一场景用同一个 time；原文没有明确标记时沿用上一条的 time，实在没有就省略该字段。
- 按叙事顺序输出。
- 给了「已知主体」和「上文末尾」时，务必与它们保持指称一致，不要给同一个人换个叫法。

只输出 JSON：{"facts":[{"time":"…","text":"…"}]}
text 内部禁止使用英文双引号；对话或引用一律用中文引号「」。不要输出 JSON 以外的任何文字。`;

/**
 * 把一段原始内容抽成事实流。分块 → 逐块调用 → 拼接。
 *
 * 单块失败重试后仍失败则跳过该块（计入 `skippedChunks`），不中断整轮——
 * 与「消解是增强不是闸门」同源：一块坏输出不该废掉整篇。
 */
export async function extractFacts(
    llm: LlmPort,
    subjects: readonly Subject[],
    text: string,
    opts: ExtractOptions = {},
): Promise<ExtractResult> {
    const pov = opts.pov ?? "omniscient";
    if (pov === "character" && !opts.povSubject) {
        throw new Error("character 视角必须给 povSubject——视角角色是谁决定了哪些内容有资格进库");
    }
    const chunks = chunk(text, opts.chunk);
    const carry = opts.carryFacts ?? 5;
    const attempts = (opts.retries ?? 1) + 1;

    const facts: Array<{time?: string; text: string}> = [];
    let skippedChunks = 0;
    for (const [index, piece] of chunks.entries()) {
        const user = buildUserMessage({
            piece,
            index,
            total: chunks.length,
            subjects,
            tail: facts.slice(-carry),
        });
        let parsed: Array<{time?: string; text: string}> | null = null;
        for (let attempt = 0; attempt < attempts && parsed === null; attempt++) {
            try {
                parsed = parseFacts(await llm.chat({system: systemPrompt(pov, opts.povSubject), user, json: true}));
            } catch {
                parsed = null;
            }
        }
        if (parsed === null) {
            skippedChunks += 1;
            continue;
        }
        facts.push(...parsed);
    }
    return {facts, skippedChunks};
}

/** 按视角组装 system 提示词 */
function systemPrompt(pov: Pov, povSubject?: string): string {
    const rules = pov === "character"
        ? CHARACTER_RULES.replaceAll("{POV}", povSubject!)
        : OMNISCIENT_RULES;
    return SYSTEM_PROMPT.replace("{POV_RULES}", rules);
}

/** 组装 user 消息：注册表快照 + 上一块尾部 + 本块原文 */
function buildUserMessage(input: {
    piece: string;
    index: number;
    total: number;
    subjects: readonly Subject[];
    tail: Array<{time?: string; text: string}>;
}): string {
    const parts: string[] = [];
    if (input.subjects.length > 0) {
        const lines = input.subjects.map((s) => {
            const aliases = s.aliases.map((a) => a.alias).join("、") || "无";
            return `- ${s.name}（${s.type}；别名：${aliases}）：${s.ontology}`;
        });
        parts.push(`# 已知主体（保持指称一致）\n${lines.join("\n")}`);
    }
    if (input.tail.length > 0) {
        parts.push(`# 上文末尾（接着往下写，不要重复）\n${input.tail.map((f) => `- ${f.text}`).join("\n")}`);
    }
    parts.push(`# 原文（第 ${String(input.index + 1)}/${String(input.total)} 块）\n${input.piece}`);
    return parts.join("\n\n");
}

/** 宽松解析模型输出；结构非法抛错交给重试 */
function parseFacts(raw: string): Array<{time?: string; text: string}> {
    const text = raw.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("抽取输出不含 JSON 对象");
    const value = JSON.parse(text.slice(start, end + 1)) as {facts?: unknown};
    if (!Array.isArray(value.facts)) throw new Error("抽取输出缺 facts 数组");
    return value.facts
        .filter((item): item is {time?: unknown; text: unknown} => item !== null && typeof item === "object")
        .filter((item) => typeof item.text === "string" && item.text.trim() !== "")
        .map((item) => ({
            ...(typeof item.time === "string" && item.time.trim() !== "" ? {time: item.time.trim()} : {}),
            text: (item.text as string).trim(),
        }));
}

export {chunk};
export type {ChunkOptions, UnresolvedFact};
