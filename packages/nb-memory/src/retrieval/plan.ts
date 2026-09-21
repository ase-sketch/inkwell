/**
 * 查询计划：把「先解出主体，再按主体检索」这类多跳查询表达成可执行的结构化步骤。
 *
 * ## 为什么是 JSON 计划而不是检索 DSL
 *
 * DSL 要写 parser、要教模型语法、出错难 debug；JSON 计划模型天生会输出，
 * 且能直接映射到 SearchOptions。更重要的是计划**可缓存、可回放、可评测**——
 * 同一个计划跑两遍结果一样，能离线打分，这在调优阶段是决定性差别。
 *
 * ## 三种产出方式共用同一份 schema
 *
 * - 启发式（heuristic-planner.ts）：零 LLM，覆盖常见轮次；
 * - 便宜模型（llm-planner.ts）：截断上下文 + 注册表快照，覆盖启发式漏掉的；
 * - 手写：批处理场景直接给计划，零 LLM。
 *
 * 谁产出计划是宿主的选择，执行器完全一样。因此便宜模型的计划质量可以拿
 * 主模型的计划做离线对照——这是能落地的调优闭环。
 *
 * ## 成本纪律
 *
 * 执行计划本身**零 LLM**：findSubjects 是纯倒排 + 注册表求解，search 只付
 * 一次 query 嵌入。LLM 只可能出现在「产出计划」这一步，且必须可降级——
 * 规划失败就退回朴素检索，绝不让增强路径变成必经之路。
 */
import type {SearchHit, MetaFilter} from "./search";
import type {AsOf, Subject} from "../core/types";

/** `describedAs` 默认取前几个主体：给太多会让后续检索的主体锚点失去区分度 */
const DESCRIBED_AS_LIMIT = 3;

/** 从 findSubjects 步抽出 as-of 坐标；两轴都缺省返回 undefined（= 当前认知口径） */
function asOfOf(step: {asOfTick?: number; asOfInstant?: bigint}): AsOf | undefined {
    if (step.asOfTick === undefined && step.asOfInstant === undefined) return undefined;
    return {
        ...(step.asOfTick !== undefined ? {tick: step.asOfTick} : {}),
        ...(step.asOfInstant !== undefined ? {instant: step.asOfInstant} : {}),
    };
}

/** 第一跳：解出主体（纯倒排 + 注册表 + 主体描述索引，零 LLM、至多一次 embedding） */
export interface FindSubjectsStep {
    op: "findSubjects";
    /**
     * 按描述解主体：拿这句话去检索主体的本体描述（`source: "subject"`）。
     *
     * 补的是「查询侧不含专名」这个盲区——「学校认识的猫娘兽人」「那本会说话的黑色古书」
     * 这类指代，字面匹配主名/别名一个都解不出来。与下面的结构约束是 AND 关系。
     */
    describedAs?: string;
    /** `describedAs` 取前几个主体（默认 3）；给太多会让后续检索的主体锚点失去区分度 */
    describedAsLimit?: number;
    /** 摄入序窗口（闭区间） */
    tickRange?: [number, number];
    /** 故事时间窗口（闭区间） */
    instantRange?: [bigint, bigint];
    /** as-of 知识边界：该时点尚未登记的主体不返回，`describedAs` 也只匹配该时点生效的描述版本 */
    asOfTick?: number;
    /** as-of 故事时间 */
    asOfInstant?: bigint;
    /** 只要这些类型的主体 */
    types?: string[];
    /** 只要与这些主体共现的主体 */
    coOccurWith?: string[];
    /** 供人阅读/调试的意图说明（如「昨天出现过的角色」）；不参与执行 */
    note?: string;
}

/** 检索步：可引用前序 findSubjects 的结果作为主体锚点 */
export interface SearchStep {
    op: "search";
    query: string;
    /** 引用第 N 步（0-based）findSubjects 的结果作为 subjectIds；越界或非该类型步骤则忽略 */
    subjectsFrom?: number;
    asOfTick?: number;
    asOfInstant?: bigint;
    tickRange?: [number, number];
    instantRange?: [bigint, bigint];
    sources?: Array<"fact" | "state" | "subject">;
    subjectTypes?: string[];
    meta?: MetaFilter;
    limit?: number;
    note?: string;
}

export type PlanStep = FindSubjectsStep | SearchStep;

/** 一个查询计划 */
export interface QueryPlan {
    /** 计划来源，用于评测归因；不影响执行 */
    source: "heuristic" | "llm" | "manual";
    steps: PlanStep[];
    /**
     * 规划器判断但无法表达的东西（如「问句里有『昨天』，但语料没有故事时间轴，
     * 无法解析成窗口」）。宿主可以据此提示或升级到更强的规划器。
     */
    unresolved?: string[];
}

/** 计划执行只依赖这两个能力——不绑死在 NbMemory 上，也便于单测替身 */
export interface PlanTarget {
    search(query: string, opts?: {
        asOfTick?: number; asOfInstant?: bigint;
        tickRange?: [number, number]; instantRange?: [bigint, bigint];
        subjectIds?: string[]; subjectTypes?: string[];
        sources?: Array<"fact" | "state" | "subject" | "registry">; meta?: MetaFilter; limit?: number;
        semanticOnly?: boolean;
    }): Promise<SearchHit[]>;
    subjectsIn(query: {
        tickRange?: [number, number]; instantRange?: [bigint, bigint];
        types?: string[]; coOccurWith?: string[]; asOf?: AsOf;
    }): Subject[];
    /** 按 id 取主体（`describedAs` 把命中条目的 subjectIds 还原成主体用） */
    subject(id: string): Subject | null;
}

/** 计划执行结果 */
export interface PlanResult {
    /** 全部 search 步的命中，按步骤顺序合并、按 refId 去重（先出现的保留） */
    hits: SearchHit[];
    /** 每个 findSubjects 步解出的主体（下标与 steps 对齐；非该类型步为空数组） */
    subjectsPerStep: Subject[][];
}

/**
 * 执行查询计划。步骤按序执行，findSubjects 的结果可被后续 search 引用。
 * 全程零 LLM；每个 search 步各自付一次 query 嵌入。
 */
export async function executePlan(target: PlanTarget, plan: QueryPlan): Promise<PlanResult> {
    const subjectsPerStep: Subject[][] = [];
    const hits: SearchHit[] = [];
    const seen = new Set<string>();

    for (const step of plan.steps) {
        if (step.op === "findSubjects") {
            const asOf = asOfOf(step);
            const structural = target.subjectsIn({
                ...(step.tickRange !== undefined ? {tickRange: step.tickRange} : {}),
                ...(step.instantRange !== undefined ? {instantRange: step.instantRange} : {}),
                ...(step.types !== undefined ? {types: step.types} : {}),
                ...(step.coOccurWith !== undefined ? {coOccurWith: step.coOccurWith} : {}),
                ...(asOf !== undefined ? {asOf} : {}),
            });
            if (step.describedAs === undefined) {
                subjectsPerStep.push(structural);
                continue;
            }
            // 按描述解：主体描述条目必须显式点名 sources，否则 passesFilter 会把它们挡掉
            const described = await target.search(step.describedAs, {
                sources: ["subject"],
                semanticOnly: true,
                limit: step.describedAsLimit ?? DESCRIBED_AS_LIMIT,
                ...(step.asOfTick !== undefined ? {asOfTick: step.asOfTick} : {}),
                ...(step.asOfInstant !== undefined ? {asOfInstant: step.asOfInstant} : {}),
            });
            const ids: string[] = [];
            for (const hit of described) {
                for (const id of hit.subjectIds) if (!ids.includes(id)) ids.push(id);
            }
            // 结构约束与描述是 AND：两者都给了就取交，只给描述则直接用
            const allowed = new Set(structural.map((s) => s.id));
            const resolved: Subject[] = [];
            for (const id of ids) {
                if (step.tickRange !== undefined || step.instantRange !== undefined || step.types !== undefined || step.coOccurWith !== undefined) {
                    if (!allowed.has(id)) continue;
                }
                const subject = target.subject(id);
                if (subject !== null) resolved.push(subject);
            }
            subjectsPerStep.push(resolved);
            continue;
        }
        subjectsPerStep.push([]);
        const anchored = step.subjectsFrom === undefined ? undefined : subjectsPerStep[step.subjectsFrom];
        // 引用了主体锚点却一个都没解出来：该步没有可查的对象，跳过而不是退化成全库检索
        if (step.subjectsFrom !== undefined && (anchored === undefined || anchored.length === 0)) continue;
        for (const hit of await target.search(step.query, {
            ...(anchored !== undefined ? {subjectIds: anchored.map((s) => s.id)} : {}),
            ...(step.asOfTick !== undefined ? {asOfTick: step.asOfTick} : {}),
            ...(step.asOfInstant !== undefined ? {asOfInstant: step.asOfInstant} : {}),
            ...(step.tickRange !== undefined ? {tickRange: step.tickRange} : {}),
            ...(step.instantRange !== undefined ? {instantRange: step.instantRange} : {}),
            ...(step.sources !== undefined ? {sources: step.sources} : {}),
            ...(step.subjectTypes !== undefined ? {subjectTypes: step.subjectTypes} : {}),
            ...(step.meta !== undefined ? {meta: step.meta} : {}),
            ...(step.limit !== undefined ? {limit: step.limit} : {}),
        })) {
            if (seen.has(hit.refId)) continue;
            seen.add(hit.refId);
            hits.push(hit);
        }
    }
    return {hits, subjectsPerStep};
}

/** 朴素计划：单步全库检索。任何规划失败都退回这里——增强路径永远可降级 */
export function plainPlan(query: string, limit?: number): QueryPlan {
    return {source: "manual", steps: [{op: "search", query, ...(limit !== undefined ? {limit} : {})}]};
}
