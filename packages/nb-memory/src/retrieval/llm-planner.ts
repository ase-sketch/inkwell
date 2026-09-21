/**
 * 便宜模型查询规划器（方案 B）：截断最近上下文 + 注册表快照 → 一次小模型调用 → 查询计划。
 *
 * 相对「主 session 直接调记忆工具」（方案 A）的取舍：
 * - **可并行**：不依赖主 session，用户输入落地即可发出，延迟能藏在主模型的准备阶段里；
 *   方案 A 是「先决定查什么 → 等结果 → 再生成回复」，用户感知延迟约等于两次长上下文推理。
 * - **可评测**：计划是结构化 JSON，能记录、回放、离线打分。方案 A 的查询决策埋在
 *   主 session 里，没法单独评测——这在调优阶段是决定性差别。
 * - 代价是效果略逊，且计划错了没有第二次机会（宿主可自行加一次重规划，上限一次不递归）。
 *
 * ## 为什么必须把注册表快照给它
 *
 * 便宜模型的指代消解能力是这个方案的天花板。「昨天那个女孩」它得先知道
 * 「昨天」和「女孩」指什么。注册表快照（主体名 + 别名 + 一行本体）比同等 token 的
 * 对话原文信息密度高一个数量级，而且指代消解本来就该查注册表而不是靠模型猜。
 *
 * ## 降级
 *
 * 解析失败、结构非法、全部步骤无效 → 返回朴素单步计划。
 * 增强路径永远不能变成必经之路：规划挂了检索照常可用，只是回到朴素口径。
 */
import type {LlmPort} from "../ports/ports";
import type {Subject} from "../core/types";
import type {PlanStep, QueryPlan, SearchStep, FindSubjectsStep} from "./plan";
import {plainPlan} from "./plan";

/** 规划输入 */
export interface LlmPlanInput {
    /** 当前这轮的提问 */
    query: string;
    /** 最近若干轮对话原文（宿主自行截断；给空数组表示无上下文） */
    recentTurns: string[];
    /** 注册表快照：主体名 + 别名 + 一行本体 */
    subjects: readonly Subject[];
    /** 发问时刻 */
    now: {tick: number; instant?: bigint};
    /** 故事日历里一天多少秒；有它模型才能把「昨天」换算成 instant 窗口 */
    secondsPerDay?: number;
}

const SYSTEM_PROMPT = `你是记忆系统的检索规划器。输入是一段最近对话、一份关键主体注册表快照和用户当前的提问；你要输出一个**查询计划**，告诉检索引擎去哪里找答案。

引擎有两种步骤：
1. findSubjects：解出「这问的是谁/是什么」。两种解法可以叠加——按时间窗口解（「昨天出现过的角色」），或按描述解（describedAs，「学校认识的猫娘兽人」）。用于提问没有点名、只给了描述或指代的情况。
2. search：语义 + 字面混合检索，可选按时间窗口、主体、来源层过滤；可以引用前面某个 findSubjects 步骤的结果作为主体锚点。

**describedAs 只写那个指代短语本身，不要写整句提问。** 这一条很关键：它是拿去和主体的一行本体描述做语义匹配的，混进提问里的别的实体或疑问句式会把匹配带偏。
- 提问「主角在学校认识的猫娘兽人，和魔法少女风信子是什么关系？」→ describedAs 写「学校认识的猫娘兽人」，**不要**写整句，也不要带上「风信子」。
- 提问「那本会说话的黑色古书叫什么名字？」→ describedAs 写「会说话的黑色古书」。
- 短语越接近对那个实体本身的客观描述（外貌、身份、关系），匹配越准。

时间有两条轴，别混：
- tick 是**摄入序**（第几条记录），只有先后没有长短。「最近」「刚才」用它。
- instant 是**故事时间秒数**，「昨天」「上周」这类日历表达只能用它。**没给你 instant 基准时不要编 tick 窗口**，把这类无法解析的意图写进 unresolved。

规划准则：
- 提问里点了名（注册表里能对上号）的，直接 search 即可，不需要 findSubjects——引擎自己会按主体补召。
- **提问里出现了没点名、只用描述指代的实体，就用 findSubjects + describedAs 把它解出来，再 search**。不需要有时间线索也该这么做。
- 提问同时点了名 A、又用描述指代了 B（关系类问题常见），仍然要为 B 出 findSubjects——A 引擎自己会认出来，B 不解出来就没人找得到。
- 步骤越少越好。拿不准就只出一个 search 步。
- query 字段写**利于检索的关键词**，不要照抄原问句的语气词；代词要用注册表里的主体名替换掉。

只输出一个 JSON 对象：
{"steps":[{"op":"findSubjects","describedAs":"…","tickRange":[100,120],"instantRange":["1000","2000"],"types":["character"],"note":"…"},{"op":"search","query":"…","subjectsFrom":0,"sources":["fact","state"],"limit":10,"note":"…"}],"unresolved":["…"]}
instantRange / instant 一律用十进制**字符串**表示（数值会丢精度）。所有字段都可省略。不要输出 JSON 以外的任何文字。`;

/** 模型输出的原始形状（字段全部按可缺失处理） */
interface RawPlan {
    steps?: unknown[];
    unresolved?: unknown;
}

/**
 * 生成查询计划。任何失败都降级为朴素单步计划，绝不抛错。
 *
 * @returns 计划，以及本次是否发生了降级（宿主可据此决定要不要升级到方案 A）
 */
export async function planWithLlm(llm: LlmPort, input: LlmPlanInput): Promise<{plan: QueryPlan; degraded: boolean}> {
    let raw: string;
    try {
        raw = await llm.chat({system: SYSTEM_PROMPT, user: buildUserMessage(input), json: true});
    } catch {
        return {plan: plainPlan(input.query), degraded: true};
    }
    const parsed = tryParse(raw);
    if (parsed === null) return {plan: plainPlan(input.query), degraded: true};

    const steps = (parsed.steps ?? []).map(normalizeStep).filter((step): step is PlanStep => step !== null);
    if (steps.length === 0) return {plan: plainPlan(input.query), degraded: true};

    const unresolved = Array.isArray(parsed.unresolved)
        ? parsed.unresolved.filter((item): item is string => typeof item === "string")
        : [];
    return {
        plan: {source: "llm", steps, ...(unresolved.length > 0 ? {unresolved} : {})},
        degraded: false,
    };
}

/** 组装 user 消息：注册表快照 + 时间基准 + 最近对话 + 提问 */
function buildUserMessage(input: LlmPlanInput): string {
    const subjects = input.subjects.map((s) => {
        const aliases = s.aliases.map((a) => a.alias).join("、") || "无";
        return `- id=${s.id} type=${s.type} name=${s.name} 别名=${aliases}：${s.ontology}`;
    });
    const clock = [
        `当前 tick=${String(input.now.tick)}`,
        input.now.instant === undefined ? "当前无故事时间基准（instant 不可用）" : `当前 instant=${input.now.instant.toString()}`,
        input.secondsPerDay === undefined ? "未提供一天的秒数" : `一天 = ${String(input.secondsPerDay)} 秒`,
    ].join("；");
    const turns = input.recentTurns.length > 0 ? input.recentTurns.join("\n") : "（无）";
    return `# 关键主体注册表（${String(subjects.length)} 个）\n${subjects.join("\n") || "（空）"}\n\n# 时间基准\n${clock}\n\n# 最近对话\n${turns}\n\n# 当前提问\n${input.query}`;
}

/** 校验并归一化一个步骤；结构非法返回 null（丢掉坏步骤而不是废掉整个计划） */
function normalizeStep(value: unknown): PlanStep | null {
    if (value === null || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    if (raw.op === "findSubjects") {
        const step: FindSubjectsStep = {
            op: "findSubjects",
            ...(typeof raw.describedAs === "string" && raw.describedAs.trim() !== "" ? {describedAs: raw.describedAs.trim()} : {}),
            ...(numberPair(raw.tickRange) !== null ? {tickRange: numberPair(raw.tickRange)!} : {}),
            ...(bigintPair(raw.instantRange) !== null ? {instantRange: bigintPair(raw.instantRange)!} : {}),
            ...(stringArray(raw.types) !== null ? {types: stringArray(raw.types)!} : {}),
            ...(stringArray(raw.coOccurWith) !== null ? {coOccurWith: stringArray(raw.coOccurWith)!} : {}),
            ...(typeof raw.note === "string" ? {note: raw.note} : {}),
        };
        return step;
    }
    if (raw.op !== "search" || typeof raw.query !== "string" || raw.query.trim() === "") return null;
    const sources = stringArray(raw.sources)?.filter((s): s is "fact" | "state" => s === "fact" || s === "state");
    const step: SearchStep = {
        op: "search",
        query: raw.query.trim(),
        ...(Number.isInteger(raw.subjectsFrom) ? {subjectsFrom: raw.subjectsFrom as number} : {}),
        ...(Number.isInteger(raw.asOfTick) ? {asOfTick: raw.asOfTick as number} : {}),
        ...(toBigint(raw.asOfInstant) !== null ? {asOfInstant: toBigint(raw.asOfInstant)!} : {}),
        ...(numberPair(raw.tickRange) !== null ? {tickRange: numberPair(raw.tickRange)!} : {}),
        ...(bigintPair(raw.instantRange) !== null ? {instantRange: bigintPair(raw.instantRange)!} : {}),
        ...(sources !== undefined && sources.length > 0 ? {sources} : {}),
        ...(stringArray(raw.subjectTypes) !== null ? {subjectTypes: stringArray(raw.subjectTypes)!} : {}),
        ...(Number.isInteger(raw.limit) && (raw.limit as number) > 0 ? {limit: raw.limit as number} : {}),
        ...(typeof raw.note === "string" ? {note: raw.note} : {}),
    };
    return step;
}

function stringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
    return items.length > 0 ? items : null;
}

function numberPair(value: unknown): [number, number] | null {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [a, b] = value;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return [Number(a), Number(b)];
}

/** instant 一律按十进制字符串解析（模型给数值时也兜住，但会丢精度，属于它的问题） */
function toBigint(value: unknown): bigint | null {
    if (typeof value === "string" && /^-?\d+$/u.test(value.trim())) return BigInt(value.trim());
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    return null;
}

function bigintPair(value: unknown): [bigint, bigint] | null {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [a, b] = [toBigint(value[0]), toBigint(value[1])];
    return a === null || b === null ? null : [a, b];
}

/** 宽松解析：剥掉可能的代码围栏后取第一个 JSON 对象 */
function tryParse(raw: string): RawPlan | null {
    const text = raw.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        const value = JSON.parse(text.slice(start, end + 1)) as RawPlan;
        if (value === null || typeof value !== "object") return null;
        if (value.steps !== undefined && !Array.isArray(value.steps)) return null;
        return value;
    } catch {
        return null;
    }
}
