/**
 * 启发式查询规划器（方案 C）：零 LLM、零 embedding，纯词表 + 注册表求解。
 *
 * 存在理由：对话里相当一部分轮次根本不需要模型来规划——「她昨天说的那个方案呢」
 * 里的主体锚点和时间窗口，注册表和词表就能解出来。把 LLM 从常见路径上移走，
 * 只在真需要判断时调用，这是检索侧成本纪律的直接落实
 * （检索基线必须保持 0 次 LLM + 1 次 embed）。
 *
 * 覆盖不到就**如实降级**：命中不了任何规则时返回朴素单步计划，
 * 无法表达的意图记进 `unresolved` 交给上层决定要不要升级到便宜模型规划。
 *
 * ## 一条刻意的限制：tick 不是时间
 *
 * 「昨天」「上周」这类**日历表达只有在语料带故事时间（instant）且宿主给了
 * 一天多少秒时才解析**。没有 instant 就记进 unresolved，绝不把它硬映射成
 * tick 窗口——tick 是摄入序，t12 和 t13 之间是五分钟还是三年，它说不出来。
 * 硬映射会得到一个看起来能用、实则随语料密度漂移的窗口，比不解析更糟。
 *
 * 「刚才」「最近」是例外：它们问的本来就是「最近说过/记过的」，
 * 那正是摄入序的语义，因此在纯 tick 模式下也能解析。
 */
import type {AsOf} from "../core/types";
import type {QueryPlan, PlanStep} from "./plan";
import {plainPlan} from "./plan";

/** 规划所需的上下文 */
export interface PlanContext {
    /** 发问时刻 */
    now: {tick: number; instant?: bigint};
    /**
     * 故事日历里一天多少秒。与 `now.instant` 同时具备时才能解析日历表达
     * （「昨天」「上周」）；缺任一个则这类表达记入 unresolved。
     */
    secondsPerDay?: number;
    /** 「刚才 / 最近」折算成多少个 tick 的窗口；缺省 20 */
    recentTicks?: number;
    /** 注册表（只用到点名检测这一个能力） */
    registry: {mentionedIn(text: string, asOf?: AsOf): string[]};
}

/** 相对日期表达 → 距今天数区间（闭区间，0 = 今天） */
const DAY_PHRASES: ReadonlyArray<{phrases: readonly string[]; days: [number, number]}> = [
    {phrases: ["今天", "今日", "今早", "今晚"], days: [0, 0]},
    {phrases: ["昨天", "昨日", "昨晚", "昨夜"], days: [1, 1]},
    {phrases: ["前天"], days: [2, 2]},
    {phrases: ["这几天", "这两天", "这阵子"], days: [0, 3]},
    {phrases: ["上周", "上个星期", "上星期"], days: [7, 13]},
    {phrases: ["上个月", "上月"], days: [30, 59]},
];

/** 摄入序表达：问的就是「最近记下的」，与故事时间无关 */
const RECENT_PHRASES: readonly string[] = ["刚才", "刚刚", "方才", "最近", "刚提到"];

/** 无名指称 → 主体类型。命中它说明问题在描述一个没被点名的实体 */
const ENTITY_NOUNS: ReadonlyArray<{nouns: readonly string[]; type: string}> = [
    {nouns: ["女孩", "男孩", "女生", "男生", "女人", "男人", "姑娘", "小伙", "同学", "老师", "家伙", "那个人", "孩子"], type: "character"},
    {nouns: ["社团", "公司", "组织", "门派", "帮派", "团队", "社"], type: "faction"},
    {nouns: ["东西", "道具", "物件"], type: "item"},
];

const DEFAULT_RECENT_TICKS = 20;

/**
 * 从一句提问生成查询计划。
 *
 * 规则（按优先级）：
 * 1. 问题里点了名 → 不做多跳，交给门面既有的主体锚点逻辑，只补时间窗口；
 * 2. 有时间窗口 + 有无名指称 → 两跳：先按窗口和类型解出主体，再按主体检索；
 * 3. 只有时间窗口 → 单步加窗口检索；
 * 4. 都没有 → 朴素单步检索（与不用规划器完全等价，零额外成本）。
 */
export function planHeuristically(query: string, ctx: PlanContext): QueryPlan {
    const unresolved: string[] = [];
    const window = resolveWindow(query, ctx, unresolved);
    const named = ctx.registry.mentionedIn(query).length > 0;
    const types = detectEntityTypes(query);

    // 点了名：门面的主体卡与按主体补召已经覆盖，规划器只负责把时间窗口带上
    if (named || types.length === 0 || window === null) {
        const step: PlanStep = {op: "search", query, ...(window ?? {})};
        const plan: QueryPlan = {source: "heuristic", steps: [step]};
        return unresolved.length > 0 ? {...plan, unresolved} : plan;
    }

    // 无名指称 + 时间窗口 = 「昨天遇到的女孩」这类两跳查询的典型形状
    const plan: QueryPlan = {
        source: "heuristic",
        steps: [
            {op: "findSubjects", ...window, types, note: `窗口内出现过的 ${types.join("/")}`},
            {op: "search", query, subjectsFrom: 0, note: "按解出的主体检索"},
        ],
    };
    return unresolved.length > 0 ? {...plan, unresolved} : plan;
}

/** 解析时间表达 → 窗口；解析不出返回 null，无法解析的表达记入 unresolved */
function resolveWindow(
    query: string,
    ctx: PlanContext,
    unresolved: string[],
): {tickRange: [number, number]} | {instantRange: [bigint, bigint]} | null {
    const day = DAY_PHRASES.find((item) => item.phrases.some((phrase) => query.includes(phrase)));
    if (day) {
        if (ctx.now.instant === undefined || ctx.secondsPerDay === undefined) {
            // tick 是摄入序不是时间，硬映射会得到随语料密度漂移的窗口——如实报告
            unresolved.push(`「${day.phrases[0]!}」需要故事时间轴（instant + secondsPerDay）才能解析成窗口`);
        } else {
            const perDay = BigInt(ctx.secondsPerDay);
            const from = ctx.now.instant - BigInt(day.days[1] + 1) * perDay;
            const to = ctx.now.instant - BigInt(day.days[0]) * perDay;
            return {instantRange: [from, to]};
        }
    }
    if (RECENT_PHRASES.some((phrase) => query.includes(phrase))) {
        const span = ctx.recentTicks ?? DEFAULT_RECENT_TICKS;
        return {tickRange: [Math.max(0, ctx.now.tick - span), ctx.now.tick]};
    }
    return null;
}

/** 检出问题里的无名指称对应的主体类型（去重，保持词表顺序） */
function detectEntityTypes(query: string): string[] {
    const types: string[] = [];
    for (const {nouns, type} of ENTITY_NOUNS) {
        if (types.includes(type)) continue;
        if (nouns.some((noun) => query.includes(noun))) types.push(type);
    }
    return types;
}

/** 计划的一行人读摘要（调试与评测归因用） */
export function describePlan(plan: QueryPlan): string {
    const steps = plan.steps.map((step, i) => {
        if (step.op === "findSubjects") {
            const scope = step.instantRange
                ? `instant∈[${String(step.instantRange[0])}, ${String(step.instantRange[1])}]`
                : step.tickRange ? `tick∈[${String(step.tickRange[0])}, ${String(step.tickRange[1])}]` : "全量";
            const described = step.describedAs === undefined ? "" : ` 描述「${step.describedAs}」`;
            return `${String(i)}. findSubjects ${scope}${described}${step.types ? ` type=${step.types.join("/")}` : ""}`;
        }
        const anchor = step.subjectsFrom === undefined ? "" : ` ←步骤${String(step.subjectsFrom)}的主体`;
        return `${String(i)}. search「${step.query}」${anchor}`;
    });
    const tail = plan.unresolved?.length ? `（未解析：${plan.unresolved.join("；")}）` : "";
    return `[${plan.source}] ${steps.join(" → ")}${tail}`;
}

export {plainPlan};
