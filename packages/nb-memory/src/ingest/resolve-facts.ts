/**
 * 摄入期「抽取+归一」联合调用（工作假设 E）：一批事实一次 LLM 调用，
 * 注册表全量进上下文，产出四类操作：
 * 1. 新关键主体登记（register）
 * 2. 别名合并（alias，带「得知同一性」的 sinceTick——工作假设 B）
 * 3. 一行本体描述显式更新（ontology）
 * 4. 每条事实的 subjectIds 归一（facts）
 *
 * 成本口径：~O(批次) 次调用（对齐「20 次调用完成消解」理念）。
 * 失败语义：JSON 解析/结构非法重试，仍失败则跳过本批（事实照常落库、
 * subjectIds 留空，计入 skippedBatches）——消解是增强不是闸门。
 */
import type {StateEntry, Subject} from "../core/types";
import type {LlmPort} from "../ports/ports";
import type {SubjectRegistry} from "../core/subject-registry";

/** 待归一的一条事实（尚未落库） */
export interface UnresolvedFact {
    tick: number;
    /** 故事时间；为空表示来源未提供 */
    instant?: bigint;
    /** 故事时间的人读原文标记；为空表示来源未提供 */
    time?: string;
    text: string;
}

/** 联合调用产出：每条事实的 subjectIds（与输入等长对齐） */
export interface ResolveResult {
    subjectIdsPerFact: string[][];
    /** 状态变更提案（宿主负责 invalidate 旧条目 + set 新条目，保持索引同步） */
    stateProposals: StateProposal[];
    /** 本批是否因 LLM 输出非法而被跳过（跳过时 subjectIds 全空） */
    skipped: boolean;
}

/** 状态变更提案：同主体同 topic 的旧在效状态将被失效取代 */
export interface StateProposal {
    subjectId: string;
    topic: string;
    view: string;
    sinceTick: number;
    /** 由该 tick 对应事实的故事时间推导；为空表示语料没有故事时间轴 */
    sinceInstant?: bigint;
}

/** LLM 输出 JSON 形状（subject 字段可引用已登记 id 或本批 register 的 name） */
interface ResolveResponse {
    register?: Array<{name: string; type: string; ontology: string}>;
    alias?: Array<{subject: string; alias: string; sinceTick: number}>;
    /** 分身修复：早前被误拆成两个主体、本批得知是同一实体 */
    merge?: Array<{keep: string; drop: string; sinceTick: number}>;
    ontology?: Array<{subject: string; ontology: string}>;
    facts?: Array<{i: number; subjects: string[]}>;
    state?: Array<{subject: string; topic: string; view: string; sinceTick: number}>;
}

const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `你是小说记忆系统的摄入器。输入是「关键主体注册表」当前快照和一批按时间顺序编号的新事实（第一人称视角，每条带 tick 时间序号）。

关键主体的判据：值得长期追踪、会反复出现或状态会变化的实体——人物、势力/组织、有状态的物品、特殊的专有物品。路人、一次性道具、普通地名不算（它们留在事实原文里即可）。

你的任务，全部基于本批事实：
1. register：识别**尚未登记**的新关键主体，给出 type（character/faction/item 等小写英文单词）、name（正文最常用的称呼）、ontology（一行「这是什么」的本体描述，不写经历流水账）。
2. alias：发现「某个称呼其实指向某已登记主体」时登记别名，sinceTick = 本批中**得知这一同一性**的那条事实的 tick（同一性是何时揭晓的，不是该称呼首次出现的时刻）。已在注册表 aliases 里的别名不要重复提交。
   **铁律：同一实体只能有一个主体条目。**真名、代号、化名、笔名、网名、马甲、旧名的揭晓（如「A 的真名是 B」「A 就是 B」「A 用 B 这个账号」）一律用 alias 挂到已登记主体上，**绝不 register 成新主体**——「B」不是新出现的人，只是已登记主体的另一个称呼。别名要挂正文里**实际用作称呼的字符串**（署名、ID、代号本身），不要挂推理的中间产物。
3. merge：如果发现注册表里**已经存在**的两个主体其实是同一实体（早前被误拆），输出 merge 修复：keep 填保留者 id（选正文更常用的称呼），drop 填被吸收者 id，sinceTick = 本批得知同一性的事实 tick。
4. ontology：若本批事实显著改变了对某主体「是什么」的理解（身份揭晓、本质变化），给出新的一行本体描述；日常琐事不更新。
5. facts：为每条事实标出涉及的关键主体（用已登记主体的 id，或本批 register 条目的 name 引用）；未涉及关键主体则给空数组。
6. state：关键主体的**可变状态**——两类都要覆盖：
   (a) 客观处境类：收入/生计来源、作品或项目的进展状态、持有的道具与能力、公开身份的可见性与舆论定位、住处与所属、健康或战力状况；
   (b) 主观认知类：对某人某事的态度判断、关系状态、进行中的计划。
   当本批事实**改变或修正**了某项状态时提出更新 {subject, topic, view, sinceTick}。topic 用稳定短语（如「生计来源」「视频账号的可见性」「对反派身份的态度」），**状态层快照里已有同主体同 topic 的条目时必须复用其 topic 原文**（新 view 会取代旧的）。
   判据：读者问「现在……怎么样了？」而答案会随剧情变化的，就是 state；一次性事件不进 state（事实层已完整记录）。没有状态变化就给空数组。

只输出一个 JSON 对象，形如：
{"register":[{"name":"…","type":"…","ontology":"…"}],"alias":[{"subject":"<id或本批register的name>","alias":"…","sinceTick":12}],"merge":[{"keep":"<id>","drop":"<id>","sinceTick":12}],"ontology":[{"subject":"<id>","ontology":"…"}],"facts":[{"i":0,"subjects":["<id或name>"]}],"state":[{"subject":"<id或name>","topic":"…","view":"…","sinceTick":12}]}
六个数组都可为空；facts 必须覆盖每一条输入事实的编号。不要输出 JSON 以外的任何文字。`;

/** 组装 user 消息：注册表快照 + 编号事实批 */
function buildUserMessage(registry: SubjectRegistry, batch: UnresolvedFact[], activeStates: readonly StateEntry[]): string {
    const subjects = registry.all.map((s: Subject) => {
        const aliases = s.aliases.map((a) => `${a.alias}(自tick${String(a.sinceTick)})`).join("、") || "无";
        return `- id=${s.id} type=${s.type} name=${s.name} 别名=${aliases}：${s.ontology}`;
    });
    const states = activeStates.map((e) => `- [${e.subjectId} / ${e.topic}]（自tick${String(e.sinceTick)}）${e.view}`);
    const facts = batch.map((fact, i) => `${String(i)}. (tick${String(fact.tick)}${fact.time !== undefined ? ` / ${fact.time}` : ""}) ${fact.text}`);
    return `# 关键主体注册表（${String(subjects.length)} 个）\n${subjects.join("\n") || "（空）"}\n\n# 状态层快照（在效认知 ${String(states.length)} 条）\n${states.join("\n") || "（空）"}\n\n# 本批事实（${String(batch.length)} 条）\n${facts.join("\n")}`;
}

/**
 * 对一批事实执行联合抽取归一，并把 register/alias/ontology 操作落入注册表。
 * 返回与输入等长的 subjectIds 数组（未涉及/跳过 = 空数组）。
 */
export async function resolveFactsBatch(
    llm: LlmPort,
    registry: SubjectRegistry,
    batch: UnresolvedFact[],
    activeStates: readonly StateEntry[] = [],
): Promise<ResolveResult> {
    const empty = batch.map(() => []);
    if (batch.length === 0) return {subjectIdsPerFact: empty, stateProposals: [], skipped: false};

    let parsed: ResolveResponse | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && parsed === null; attempt++) {
        try {
            const raw = await llm.chat({system: SYSTEM_PROMPT, user: buildUserMessage(registry, batch, activeStates), json: true});
            parsed = tryParse(raw);
        } catch {
            // 传输层异常（宿主客户端自带重试耗尽后抛出）也按失败尝试计——消解是增强不是闸门
            parsed = null;
        }
    }
    if (parsed === null) {
        return {subjectIdsPerFact: empty, stateProposals: [], skipped: true};
    }
    try {
        return {...await applyOps(registry, batch, parsed), skipped: false};
    } catch {
        // op 应用段的意外异常同样只跳过本批（已落盘的事件是合法前缀，append-only 无需回滚）
        return {subjectIdsPerFact: empty, stateProposals: [], skipped: true};
    }
}

/** 应用联合调用产出的四类操作，返回每条事实的 subjectIds */
async function applyOps(registry: SubjectRegistry, batch: UnresolvedFact[], parsed: ResolveResponse): Promise<{subjectIdsPerFact: string[][]; stateProposals: StateProposal[]}> {
    // 先算后登：从 facts 映射反查每个引用（id 或新登记 name）首次出现的事实 tick，
    // 作为新主体的 registeredTick——避免批首 tick 让主体提前可见
    const firstRefTick = new Map<string, number>();
    for (const item of parsed.facts ?? []) {
        if (!Number.isInteger(item.i) || item.i < 0 || item.i >= batch.length) continue;
        for (const ref of item.subjects) {
            const tick = batch[item.i]!.tick;
            if (tick < (firstRefTick.get(ref) ?? Infinity)) firstRefTick.set(ref, tick);
        }
    }

    const minTick = batch[0]!.tick;
    const maxTick = batch[batch.length - 1]!.tick;
    const clampTick = (tick: number): number => Math.min(Math.max(tick, minTick), maxTick);

    /**
     * tick → 故事时间。模型只会给 tick（它不知道世界零点的秒数），故事时间一律
     * 从本批事实推导：取 tick 不晚于给定值的**最后一条**事实的 instant，
     * 也就是「那一刻的故事时间」。语料没有故事时间轴时返回 undefined。
     */
    const instantAt = (tick: number): bigint | undefined => {
        let found: bigint | undefined;
        for (const fact of batch) {
            if (fact.tick > tick) break;
            if (fact.instant !== undefined) found = fact.instant;
        }
        return found;
    };

    // 新主体登记：id 由注册表分配；同名已登记则视为引用不重复登记
    const nameToId = new Map<string, string>();
    for (const item of parsed.register ?? []) {
        const existing = registry.resolve(item.name);
        if (existing) {
            nameToId.set(item.name, existing.id);
            continue;
        }
        const id = registry.allocateId();
        const registeredTick = firstRefTick.get(item.name) ?? batch[0]!.tick;
        const registeredInstant = instantAt(registeredTick);
        await registry.register({
            id,
            type: item.type,
            name: item.name,
            aliases: [],
            ontology: item.ontology,
            ontologyTick: registeredTick,
            registeredTick,
            ...(registeredInstant !== undefined ? {ontologyInstant: registeredInstant, registeredInstant} : {}),
        });
        nameToId.set(item.name, id);
    }

    /** 引用解析：已登记 id / 本批新登记 name / 已登记主体名或别名；折算分身合并；解析不到返回 null */
    const refToId = (ref: string): string | null => {
        if (registry.get(ref)) return registry.canonicalId(ref);
        const byNew = nameToId.get(ref);
        if (byNew !== undefined) return registry.canonicalId(byNew);
        const resolved = registry.resolve(ref);
        return resolved ? registry.canonicalId(resolved.id) : null;
    };

    for (const item of parsed.merge ?? []) {
        const keepId = refToId(item.keep);
        const dropId = refToId(item.drop);
        if (keepId === null || dropId === null || keepId === dropId) continue;
        const sinceTick = clampTick(item.sinceTick);
        await registry.merge(keepId, dropId, sinceTick, instantAt(sinceTick));
    }

    for (const item of parsed.alias ?? []) {
        const id = refToId(item.subject);
        if (id === null) continue;
        const subject = registry.get(id)!;
        if (subject.name === item.alias || subject.aliases.some((a) => a.alias === item.alias)) continue;
        // sinceTick 必须落在本批范围内（同一性只能由本批事实揭晓），越界则收敛到边界
        const sinceTick = clampTick(item.sinceTick);
        await registry.addAlias(id, item.alias, sinceTick, instantAt(sinceTick));
    }

    for (const item of parsed.ontology ?? []) {
        const id = refToId(item.subject);
        if (id === null) continue;
        await registry.updateOntology(id, item.ontology, maxTick, instantAt(maxTick));
    }

    // 引擎不变式（不依赖提示词）：一个名字不能既是 A 的主名又是 B 的别名——
    // 出现即为分身（S2 轮2实证：register 与 alias 同批到达时存在性检查拦不住），自动合并修复
    for (const subject of registry.all) {
        const owner = registry.all.find((other) =>
            other.id !== subject.id && other.aliases.some((a) => a.alias === subject.name));
        if (owner) {
            const alias = owner.aliases.find((a) => a.alias === subject.name)!;
            await registry.merge(owner.id, subject.id, Math.max(alias.sinceTick, subject.registeredTick));
        }
    }

    const subjectIdsPerFact = batch.map(() => [] as string[]);
    for (const item of parsed.facts ?? []) {
        if (!Number.isInteger(item.i) || item.i < 0 || item.i >= batch.length) continue;
        const ids = item.subjects.map(refToId).filter((id): id is string => id !== null);
        subjectIdsPerFact[item.i] = [...new Set(ids)];
    }

    // 状态提案：主体引用归一 + sinceTick 收敛；取代逻辑（invalidate+set）由宿主执行
    const stateProposals: StateProposal[] = [];
    for (const item of parsed.state ?? []) {
        const id = refToId(item.subject);
        if (id === null || !item.topic || !item.view) continue;
        const sinceTick = clampTick(item.sinceTick);
        const sinceInstant = instantAt(sinceTick);
        stateProposals.push({
            subjectId: id, topic: item.topic.trim(), view: item.view, sinceTick,
            ...(sinceInstant !== undefined ? {sinceInstant} : {}),
        });
    }
    return {subjectIdsPerFact, stateProposals};
}

/** 宽松解析：剥掉可能的代码围栏后取第一个 JSON 对象；结构不符返回 null */
function tryParse(raw: string): ResolveResponse | null {
    const text = raw.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        const value = JSON.parse(text.slice(start, end + 1)) as ResolveResponse;
        if (value === null || typeof value !== "object") return null;
        for (const key of ["register", "alias", "merge", "ontology", "facts", "state"] as const) {
            if (value[key] !== undefined && !Array.isArray(value[key])) return null;
        }
        return value;
    } catch {
        return null;
    }
}
