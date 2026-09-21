/**
 * @notnotype/nb-memory 公开面。
 *
 * NeuroBook 记忆框架（Task 113）：
 * episode + facts（主体 ID 归一）+ 关键主体注册表（带 tick alias）+ 轻量状态层。
 *
 * 用法：
 *   const memory = await NbMemory.open({storage: await FsStorage.open(dir), embedder});
 *   await memory.addFact({tick: 1, time: "第一天", text: "……", subjectIds: []});
 *   const hits = await memory.search("……", {asOfTick: 5});
 */
import type {AsOf, Episode, Fact, StateEntry, Subject} from "./core/types";
import type {EmbedPort, LlmPort, StoragePort} from "./ports/ports";
import type {IndexStorePort} from "./ports/index-store";
import {MemoryIndexStore} from "./ports/index-store";
import {EpisodeStore} from "./core/episode-store";
import {FactStore} from "./core/fact-store";
import {SubjectRegistry} from "./core/subject-registry";
import {StateStore} from "./core/state-store";
import {SemanticIndex, type IndexEntry, type SearchHit, type SearchOptions} from "./retrieval/search";
import {resolveFactsBatch, type StateProposal} from "./ingest/resolve-facts";
import {extractFacts, type ExtractOptions} from "./ingest/extract";

/** 主体描述条目的 refId 前缀（形如 `subj:su-006@432`）；与 fact/state 的 id 空间隔离 */
const SUBJECT_REF_PREFIX = "subj:";

/** 主体锚点上限：一次检索最多用几个主体做补充召回与主体对查询 */
const SUBJECT_ANCHOR_LIMIT = 3;

/** 打开选项 */
export interface NbMemoryOptions {
    storage: StoragePort;
    embedder: EmbedPort;
    /** 摄入期「抽取+归一」联合调用用；纯 facts 直报模式可不传 */
    llm?: LlmPort;
    /**
     * 索引存储；缺省为内存实现（进程退出即失，每次 open 全量重嵌）。
     * 长期库应传 SqliteIndexStore——向量持久化解决的正是「每次 open 都要把
     * 全库重新送去嵌入」这个真实瓶颈。
     */
    indexStore?: IndexStorePort;
    /**
     * 摄入时只落库不嵌入（默认 false）。置 true 后 `flush()` 不再调用 embedding，
     * 新内容立刻可被字面路召回，语义路等 `backfillVectors()` 补齐——
     * 把 embedding 成本移出摄入关键路径。
     */
    deferEmbedding?: boolean;
}

/** 索引状态：宿主据此判断语义路是否处于降级状态 */
export interface MemoryStats {
    /** 索引条目总数 */
    entries: number;
    /** 尚未嵌入向量的条目数；>0 表示这些条目当前只能被字面路召回 */
    pendingVectors: number;
}

/** 一份待摄入的原始内容 */
export interface IngestRawInput {
    /** 来源标注（如 "chapter:03" / "session:2026-08-01"） */
    source: string;
    text: string;
    /** 该 episode 的故事时间；为空表示未提供 */
    instant?: bigint;
    /** 故事时间的人读标记；抽取器没给 time 的事实会继承它 */
    time?: string;
}

/** 原始内容摄入选项 */
export interface IngestRawOptions extends ExtractOptions {
    /** 联合消解批大小；缺省 16 */
    batchSize?: number;
}

/** 原始内容摄入结果 */
export interface IngestRawResult {
    episodes: Episode[];
    facts: Fact[];
    /** 抽取失败被跳过的块数；>0 表示有原文没进库（原文仍完整留档，可重放） */
    skippedChunks: number;
}

/** 门面检索选项：在索引层选项之上补一个需要注册表知识的维度 */
export interface MemorySearchOptions extends SearchOptions {
    /** 只召回涉及这些类型主体的条目（门面展开成 subjectIds 后下传）；为空表示不限 */
    subjectTypes?: string[];
    /**
     * 字面路解不出任何主体时，按本体描述兜底解一次（默认 false）。
     *
     * 默认关是为了保住与历史评测跑次的可比性——它会改变主体锚点，进而改变
     * 补充召回与主体对查询的结果。开启不产生额外网络调用（复用主查询向量）。
     */
    resolveByDescription?: boolean;
}

/**
 * 主体查询（多跳检索的第一跳）：不做语义检索，只在倒排与注册表上求解，
 * 零 LLM、零 embedding。「昨天遇到的女孩」这类问题的断点就在这一跳。
 */
export interface SubjectQuery {
    /** 摄入序窗口（闭区间）：只要在该窗口内的事实中出现过的主体；为空表示不限 */
    tickRange?: [number, number];
    /** 故事时间窗口（闭区间）；无 instant 的事实不参与；为空表示不限 */
    instantRange?: [bigint, bigint];
    /** 只要这些类型的主体；为空表示不限 */
    types?: string[];
    /** 只要与这些主体共同出现在同一条事实里的主体（不含它们自己）；为空表示不限 */
    coOccurWith?: string[];
    /** as-of 已知口径：该时点尚未登记的主体不返回 */
    asOf?: AsOf;
}

export class NbMemory {
    /** 尚未嵌入索引的新条目（惰性批量嵌入，search 前 flush） */
    private pending: IndexEntry[] = [];
    /** 已进索引的主体描述条目 refId；null = 尚未从 store 初始化（lazy，避免拖慢 open） */
    private syncedSubjectRefs: Set<string> | null = null;
    /** 已补过失效标记的主体描述条目 refId（每个只补一次） */
    private readonly invalidatedSubjectRefs = new Set<string>();
    /** 联合消解重试仍失败而跳过的批次数（审计用；跳过批的事实照常落库、subjectIds 留空） */
    skippedResolveBatches = 0;

    private constructor(
        readonly episodes: EpisodeStore,
        readonly facts: FactStore,
        readonly registry: SubjectRegistry,
        readonly states: StateStore,
        private readonly index: SemanticIndex,
        private readonly llm: LlmPort | null,
        private readonly deferEmbedding: boolean,
    ) {}

    /**
     * 打开记忆库：从 jsonl 事实源装载。
     *
     * 索引是派生物：内存实现下 open 即把全库排进待嵌入队列；SqliteIndexStore
     * 下已持久化的向量直接复用，只有新增/换模型的条目会重新嵌入。
     */
    static async open(opts: NbMemoryOptions): Promise<NbMemory> {
        const [episodes, facts, registry, states] = await Promise.all([
            EpisodeStore.open(opts.storage),
            FactStore.open(opts.storage),
            SubjectRegistry.open(opts.storage),
            StateStore.open(opts.storage),
        ]);
        const store = opts.indexStore ?? new MemoryIndexStore();
        const memory = new NbMemory(
            episodes, facts, registry, states,
            new SemanticIndex(opts.embedder, store),
            opts.llm ?? null,
            opts.deferEmbedding ?? false,
        );
        // 已在索引里的条目不重复入队（持久化后端跨进程复用向量的前提）
        const known = new Set((await store.texts()).map((row) => row.refId));
        for (const fact of facts.all) {
            if (!known.has(fact.id)) memory.pending.push(factEntry(fact));
        }
        for (const entry of states.all) {
            if (!known.has(entry.id)) memory.pending.push(stateEntry(entry));
        }
        return memory;
    }

    /** 记录一条 episode（原始叙事单元） */
    async addEpisode(input: Omit<Episode, "id"> & {id?: string}): Promise<Episode> {
        return this.episodes.add(input);
    }

    /**
     * 原始内容摄入：episode 落库 → 分块 → 逐块抽取事实 → 联合消解 → 落库。
     *
     * tick 由库统一分配（episode 一个、其下每条事实各一个，共用同一个序列），
     * 宿主不需要自己数——两套 tick 并行是本形态最容易踩的坑。
     *
     * 故事时间：同一 episode 内的事实**共享该 episode 的 instant**。更细的时间
     * 需要宿主用 Calendar 把 `fact.time` 解析成 instant 后走 `ingestBatch` 自行上报
     * ——库里不内置日历，解析人读时间串不是它的职责。
     *
     * 抽取质量没有兜底：bench 里的事实流是人工校对过的金标，真接入后没人校对。
     * episode 原文完整留档正是为此——换抽取器或改提示词后可以整批重放重建语义层。
     */
    async ingestRaw(inputs: IngestRawInput[], opts: IngestRawOptions = {}): Promise<IngestRawResult> {
        if (this.llm === null) throw new Error("ingestRaw 需要 llm（抽取与消解都要）；只有已抽好的事实请用 ingestBatch");
        const batchSize = opts.batchSize ?? 16;
        const result: IngestRawResult = {episodes: [], facts: [], skippedChunks: 0};

        for (const input of inputs) {
            const episode = await this.episodes.add({
                tick: this.nextTick(),
                source: input.source,
                text: input.text,
                ...(input.instant !== undefined ? {instant: input.instant} : {}),
                ...(input.time !== undefined ? {time: input.time} : {}),
            });
            result.episodes.push(episode);

            // 注册表快照逐 episode 更新：前一篇登记的主体会影响后一篇的指称一致性
            const extracted = await extractFacts(this.llm, this.registry.all, input.text, opts);
            result.skippedChunks += extracted.skippedChunks;

            // tick 必须一次性按序分配：nextTick 读的是已落库内容，而这些事实还没落，
            // 逐条调用会让整批拿到同一个 tick
            const base = this.nextTick();
            const pending = extracted.facts.map((fact, offset) => ({
                tick: base + offset,
                text: fact.text,
                episodeId: episode.id,
                ...(episode.instant !== undefined ? {instant: episode.instant} : {}),
                ...(fact.time !== undefined ? {time: fact.time} : episode.time !== undefined ? {time: episode.time} : {}),
            }));
            for (let i = 0; i < pending.length; i += batchSize) {
                result.facts.push(...await this.ingestBatch(pending.slice(i, i + batchSize)));
            }
        }
        return result;
    }

    /**
     * 下一个可用 tick：episode 与 fact 共用一条摄入序。
     * 每次现算，避免宿主中途用 addFact 插入自有 tick 后计数器失准。
     */
    private nextTick(): number {
        let max = 0;
        for (const fact of this.facts.all) max = Math.max(max, fact.tick);
        for (const episode of this.episodes.all) max = Math.max(max, episode.tick);
        return max + 1;
    }

    /** 直接上报一条 happening 事实（facts 模式 / agent 抽好事实再上报的现行用法） */
    async addFact(input: Omit<Fact, "id"> & {id?: string}): Promise<Fact> {
        const fact = await this.facts.add(input);
        this.pending.push(factEntry(fact));
        return fact;
    }

    /**
     * 批量摄入事实并做「抽取+归一」联合消解（一批一次 LLM 调用，工作假设 E）：
     * 登记新关键主体、别名合并（带 sinceTick）、本体描述更新、subjectIds 归一。
     * open 时未注入 llm 则跳过消解直接落库。
     */
    async ingestBatch(batch: Array<Omit<Fact, "id" | "subjectIds"> & {id?: string}>): Promise<Fact[]> {
        let subjectIdsPerFact: string[][] = batch.map(() => []);
        let stateProposals: StateProposal[] = [];
        if (this.llm !== null) {
            const result = await resolveFactsBatch(
                this.llm,
                this.registry,
                batch.map((f) => ({
                    tick: f.tick,
                    ...(f.instant !== undefined ? {instant: f.instant} : {}),
                    ...(f.time !== undefined ? {time: f.time} : {}),
                    text: f.text,
                })),
                this.states.activeAt(),
            );
            subjectIdsPerFact = result.subjectIdsPerFact;
            stateProposals = result.stateProposals;
            if (result.skipped) this.skippedResolveBatches += 1;
        }
        const added: Fact[] = [];
        for (const [i, input] of batch.entries()) {
            added.push(await this.addFact({...input, subjectIds: subjectIdsPerFact[i]!}));
        }
        // 状态提案：同主体同 topic 的旧在效认知先失效再写新（happening/state 二分的取代语义）
        // 失效时点与新状态生效时点必须同一坐标，两条轴都要对齐，否则故事时间轴上会出现空档或重叠
        for (const proposal of stateProposals) {
            const old = this.states.activeAt(undefined, proposal.subjectId).find((e) => e.topic === proposal.topic);
            if (old) await this.invalidateState(old.id, proposal.sinceTick, proposal.sinceInstant);
            await this.setState(proposal);
        }
        return added;
    }

    /** 写入一条状态（可变认知）；旧认知取代用 invalidateState + 新 setState 表达 */
    async setState(input: Omit<StateEntry, "id"> & {id?: string}): Promise<StateEntry> {
        const entry = await this.states.set(input);
        this.pending.push(stateEntry(entry));
        return entry;
    }

    /**
     * 标记状态失效。注意：索引里的旧条目引用同一对象，失效标记即时生效
     * ——但 store 重放构造的是克隆，所以这里同步改索引侧条目。
     */
    async invalidateState(id: string, atTick: number, atInstant?: bigint): Promise<void> {
        await this.states.invalidate(id, atTick, atInstant);
        // 索引条目与 store 条目各自持有副本，失效标记需双写（索引是派生物，重建时自然一致）
        for (const item of this.pending) {
            if (item.refId !== id) continue;
            item.invalidatedAtTick = atTick;
            if (atInstant !== undefined) item.invalidatedAtInstant = atInstant;
        }
        await this.index.markStateInvalidated(id, atTick, atInstant);
    }

    /**
     * 确保新增内容已进索引。`deferEmbedding` 为真时只落库不嵌入
     * （字面路立即可用，语义路等 backfillVectors）。
     */
    async flush(): Promise<void> {
        await this.syncSubjectDescriptions();
        const batch = this.pending;
        this.pending = [];
        await (this.deferEmbedding ? this.index.addDeferred(batch) : this.index.add(batch));
    }

    /**
     * 把注册表的 ontology 版本同步成索引里的主体描述条目（source: "subject"），
     * 供 `findSubjects` 的 `describedAs` 按描述解主体。
     *
     * 只增量补新版本：refId 形如 `subj:<主体id>@<版本tick>`，版本一旦产生就不可变。
     * 新版本出现时给上一版补失效标记——版本链就是取代链，as-of 语义因此完全由
     * `passesFilter` 承担，这条路上不另写时间判据。
     *
     * 主体数量是几十量级（不是事实的几百上千），全量遍历的成本可以忽略。
     */
    private async syncSubjectDescriptions(): Promise<void> {
        if (this.syncedSubjectRefs === null) {
            this.syncedSubjectRefs = new Set((await this.index.refIds()).filter((id) => id.startsWith(SUBJECT_REF_PREFIX)));
        }
        for (const row of this.registry.describeVersions()) {
            const refId = `${SUBJECT_REF_PREFIX}${row.subjectId}@${String(row.atTick)}`;
            if (!this.syncedSubjectRefs.has(refId)) {
                this.syncedSubjectRefs.add(refId);
                this.pending.push({
                    refId,
                    text: row.text,
                    tick: row.atTick,
                    ...(row.atInstant !== undefined ? {instant: row.atInstant} : {}),
                    source: "subject",
                    subjectIds: [row.subjectId],
                    ...(row.untilTick !== undefined ? {invalidatedAtTick: row.untilTick} : {}),
                    ...(row.untilInstant !== undefined ? {invalidatedAtInstant: row.untilInstant} : {}),
                });
                continue;
            }
            // 已同步的版本后来被新版取代：补失效标记（每个 refId 只补一次）
            if (row.untilTick === undefined || this.invalidatedSubjectRefs.has(refId)) continue;
            this.invalidatedSubjectRefs.add(refId);
            await this.index.markStateInvalidated(refId, row.untilTick, row.untilInstant);
        }
    }

    /**
     * 补齐尚未嵌入的向量，返回本次补齐条数；返回 0 表示已全部就绪。
     * 后台循环调用即可，中途失败不影响已落库的条目。
     */
    async backfillVectors(limit = 256): Promise<number> {
        if (this.pending.length > 0) await this.flush();
        return this.index.backfillVectors(limit);
    }

    /** 索引状态；`pendingVectors > 0` 表示语义路当前降级，宿主可据此提示或阻塞补齐 */
    async stats(): Promise<MemoryStats> {
        if (this.pending.length > 0) await this.flush();
        return {entries: await this.index.count(), pendingVectors: await this.index.pendingVectorCount()};
    }

    /**
     * 检索（自动 flush 未嵌入条目）：语义命中 + 提及主体的补充召回 + 主体对
     * 关系事实（「边 = 按 id 对查」的派生视图）+ 注册表主体卡注入。
     * 主体卡是 as-of 裁剪过的档案（别名按已知时点、描述取当时版本），
     * 排在语义命中之前；补充召回不挤占主 limit，按 refId 去重。
     */
    async search(query: string, opts?: MemorySearchOptions): Promise<SearchHit[]> {
        if (this.pending.length > 0) await this.flush();
        const asOf = asOfOf(opts);
        const scoped = this.applySubjectTypes(opts);
        // 一次检索会发出「主查询 + 每个提及主体 2 次 + 主体对若干次」共约 10 个子查询，
        // 查询文本自始至终是同一个——嵌入一次复用到底，否则同一句话要付 10 次 embedding。
        const queryVec = await this.index.embedQuery(query);
        const hits = await this.index.search(query, scoped, queryVec);

        // 问题中提及的主体（as-of 已知口径），每个主体的等价 id 集含被并入的分身 id
        const mentioned = this.registry.mentionedIn(query, asOf).map((id) => this.registry.canonicalId(id));
        // 字面路锚点不满时，按描述补齐空位（复用已算好的 queryVec，零额外网络调用）。
        // 补齐而非「仅在空手时兜底」：实测语料里 10 道召回失败的题有 9 道字面路都能
        // 解出至少一个主体——问句提到了 A，真正要问的却是只用描述指代的 B
        // （「学校认识的猫娘兽人，与魔法少女风信子是什么关系」解出风信子、缺南嘉鱼），
        // 只在空手时兜底覆盖不到这类**部分锚定**，而关系类问题恰恰需要两个主体都在场。
        if (opts?.resolveByDescription ?? false) {
            const room = SUBJECT_ANCHOR_LIMIT - mentioned.length;
            if (room > 0) {
                for (const id of await this.resolveByDescription(query, queryVec, room, asOf)) {
                    if (!mentioned.includes(id)) mentioned.push(id);
                }
            }
        }
        const groups = [...new Set(mentioned)].slice(0, SUBJECT_ANCHOR_LIMIT).map((id) => this.registry.equivalentIds(id));

        const extras: SearchHit[] = [];
        // 每个提及主体：补充 subjectId 过滤检索（注册表作检索锚点）+ 注入**与问题最相关**的在效状态。
        // 状态按相关性取 top2 而非全量注入——主体状态条数会随剧情增长，
        // 全量注入等于用无关 topic 挤占上下文（S3 扩题实证：8 条态度类状态淹没了被问的处境类）。
        for (const group of groups) {
            extras.push(...await this.index.search(query, {...scoped, subjectIds: group, limit: 3}, queryVec));
            extras.push(...await this.index.search(query, {...scoped, subjectIds: group, sources: ["state"], limit: 2}, queryVec));
        }
        // 提及 ≥2 个主体：按主体对查共同事实（关系问题的直接证据）
        // subjectGroups 追加而非覆盖——上游 subjectTypes 的类型约束也寄存在这里
        for (let i = 0; i < groups.length; i++) {
            for (let j = i + 1; j < groups.length; j++) {
                const pair = [...(scoped?.subjectGroups ?? []), groups[i]!, groups[j]!];
                extras.push(...await this.index.search(query, {...scoped, subjectGroups: pair, limit: 2}, queryVec));
            }
        }

        const seen = new Set(hits.map((hit) => hit.refId));
        const merged = [...hits];
        for (const extra of extras) {
            if (seen.has(extra.refId)) continue;
            seen.add(extra.refId);
            merged.push(extra);
        }
        // 主体卡是**上下文注入**而非被检索的层，所以不跟着 sources 走——否则规划器
        // 随手给个 sources:["state"] 就会把主体卡连带丢掉，而答案常常正在卡里
        // （p018「匿名账号叫什么」的答案就是苏天晴的一个别名）。
        // 唯一要关掉它的是「内部解主体」那种检索：那时调用方要的是主体 id，不是给人读的档案。
        const wantCards = !(opts?.sources?.length === 1 && opts.sources[0] === "subject");
        return wantCards ? [...this.subjectCards(query, merged, asOf), ...merged] : merged;
    }

    /**
     * 按 id 取主体（分身 id 自动折算到存续主体）；不存在返回 null。
     * `findSubjects` 的 `describedAs` 用它把命中的描述条目还原成主体。
     */
    subject(id: string): Subject | null {
        return this.registry.get(this.registry.canonicalId(id)) ?? null;
    }

    /**
     * 按条件列出关键主体：多跳检索的第一跳，纯倒排 + 注册表求解。
     *
     * 「昨天遇到的女孩的发色是什么」拆开就是：先用本方法解出「昨天出现的
     * character」，再把结果作为 subjectIds 发第二跳检索。现有 search() 的
     * 主体锚点来自「问题文本里字面提到的主体」，问题里没有专名时就断在这。
     */
    subjectsIn(query: SubjectQuery): Subject[] {
        const hitIds = new Set<string>();
        const coOccur = query.coOccurWith?.map((id) => this.registry.canonicalId(id));
        for (const fact of this.facts.all) {
            if (query.tickRange && (fact.tick < query.tickRange[0] || fact.tick > query.tickRange[1])) continue;
            if (query.instantRange) {
                if (fact.instant === undefined) continue;
                if (fact.instant < query.instantRange[0] || fact.instant > query.instantRange[1]) continue;
            }
            const ids = [...new Set(fact.subjectIds.map((id) => this.registry.canonicalId(id)))];
            // 共现约束：本条事实必须涉及全部指定主体，命中的才是「与它们一起出现的人」
            if (coOccur && !coOccur.every((id) => ids.includes(id))) continue;
            for (const id of ids) {
                if (coOccur?.includes(id)) continue;
                hitIds.add(id);
            }
        }
        const subjects: Subject[] = [];
        for (const id of hitIds) {
            const subject = this.registry.get(id);
            if (!subject) continue;
            if (query.types !== undefined && !query.types.includes(subject.type)) continue;
            // as-of 已知口径：该时点尚未登记的主体不返回（用 card 复用同一套可见性判据）
            if (this.registry.card(id, query.asOf) === null) continue;
            subjects.push(subject);
        }
        return subjects;
    }

    /** 记忆库明文导出（可审查性评审用） */
    dump(): string {
        const subjects = this.registry.all.map((s: Subject) => {
            const aliases = s.aliases.map((a) => `${a.alias}(t≥${String(a.sinceTick)})`).join("、") || "无";
            return `- [${s.type}] ${s.name}（id ${s.id}；别名：${aliases}）：${s.ontology}`;
        });
        const states = this.states.all.map((e: StateEntry) => {
            const validity = e.invalidatedAtTick === undefined ? `t≥${String(e.sinceTick)}` : `t∈[${String(e.sinceTick)}, ${String(e.invalidatedAtTick)})`;
            return `- ${e.subjectId} / ${e.topic}（${validity}）：${e.view}`;
        });
        const facts = this.facts.all.map((f: Fact) => {
            // merge 后折算到存续主体 id，避免 dump 里出现幽灵分身
            const canonical = [...new Set(f.subjectIds.map((id) => this.registry.canonicalId(id)))];
            const who = canonical.length > 0 ? `〔${canonical.join("+")}〕` : "";
            return `- (t${String(f.tick)}${f.time !== undefined ? ` / ${f.time}` : ""})${who} ${f.text}`;
        });
        return [
            `# 关键主体注册表（${String(subjects.length)}）`,
            subjects.join("\n") || "(空)",
            `\n# 状态层（${String(states.length)}）`,
            states.join("\n") || "(空)",
            `\n# happening 事实（${String(facts.length)}）`,
            facts.join("\n") || "(空)",
        ].join("\n");
    }

    /**
     * 按描述兜底解主体：拿查询去检索主体的本体描述（`source: "subject"`）。
     *
     * 补的是「查询侧不含专名」这个盲区——`mentionedIn` 靠 `text.includes(name)`
     * 匹配主名与已知别名，「学校认识的猫娘兽人」一个主体都解不出来，于是拿不到
     * 主体锚点，于是关系事实与主体状态整条召回路径失效。
     *
     * 三个刻意的取舍：
     * - **补齐锚点空位，而不是只在字面路空手时兜底**。实测语料里 10 道召回失败的题有
     *   9 道字面路都能解出至少一个主体——问句提到了 A，真正要问的却是只用描述指代的 B。
     *   只在空手时兜底覆盖不到这类**部分锚定**，而关系类问题恰恰需要两个主体都在场。
     * - **只走语义路**。字面路的价值是专名召回，而这条路上恰恰没有专名；CJK bigram
     *   会让「银发的剑士」和「戴兜帽的陌生人」因共享一个「的」互相召回。
     * - **传 asOf**。描述条目带 tick 与失效区间，传了坐标 `passesFilter` 才会挡住
     *   尚未形成的描述版本——这是 as-of 红线上的一条新路径。
     *
     * @param queryVec 主查询已算好的向量，直接复用（本方法不产生任何网络调用）
     * @param limit 还剩几个锚点空位
     */
    private async resolveByDescription(query: string, queryVec: number[], limit: number, asOf?: AsOf): Promise<string[]> {
        const hits = await this.index.search(query, {
            sources: ["subject"],
            semanticOnly: true,
            limit,
            ...(asOf?.tick !== undefined ? {asOfTick: asOf.tick} : {}),
            ...(asOf?.instant !== undefined ? {asOfInstant: asOf.instant} : {}),
        }, queryVec);
        const ids: string[] = [];
        for (const hit of hits) {
            for (const id of hit.subjectIds) {
                const canonical = this.registry.canonicalId(id);
                if (!ids.includes(canonical)) ids.push(canonical);
            }
        }
        return ids;
    }

    /**
     * subjectTypes 展开：注册表按类型选主体，作为**独立的一组**追加进 subjectGroups。
     *
     * 刻意不写进 subjectIds：补充召回会把 subjectIds 整个换成被提及主体的等价 id 集，
     * 类型约束若寄生在同一个字段上就会被静默覆盖（首版即踩），而 subjectGroups 是
     * all-of 语义、只增不覆盖，结构上杜绝这类过滤泄漏。
     * 类型下无主体时该组为空数组 → 无条目能与之相交 → 结果为空，而非退化成不过滤。
     */
    private applySubjectTypes(opts?: MemorySearchOptions): SearchOptions | undefined {
        if (opts?.subjectTypes === undefined || opts.subjectTypes.length === 0) return opts;
        const {subjectTypes, ...rest} = opts;
        const byType = this.registry.all
            .filter((s) => subjectTypes.includes(s.type))
            .flatMap((s) => this.registry.equivalentIds(s.id));
        return {...rest, subjectGroups: [...(rest.subjectGroups ?? []), byType]};
    }

    /** 主体卡候选：问题里提及的主体优先，其次是 top 命中片段涉及的主体；上限 4 张 */
    private subjectCards(query: string, hits: SearchHit[], asOf?: AsOf): SearchHit[] {
        const ids = new Set<string>(this.registry.mentionedIn(query, asOf));
        for (const hit of hits.slice(0, 5)) {
            for (const id of hit.subjectIds) ids.add(this.registry.canonicalId(id));
        }
        const cards: SearchHit[] = [];
        const emitted = new Set<string>();
        for (const id of ids) {
            if (cards.length >= 4) break;
            const text = this.registry.card(id, asOf);
            if (text === null || emitted.has(text)) continue;
            emitted.add(text);
            cards.push({refId: id, text, tick: this.registry.get(id)?.registeredTick ?? 0, source: "registry", subjectIds: [id], score: 1});
        }
        return cards;
    }
}

/** 从检索选项抽出 as-of 坐标（注册表侧裁剪用） */
function asOfOf(opts?: SearchOptions): AsOf | undefined {
    if (opts?.asOfTick === undefined && opts?.asOfInstant === undefined) return undefined;
    return {
        ...(opts.asOfTick !== undefined ? {tick: opts.asOfTick} : {}),
        ...(opts.asOfInstant !== undefined ? {instant: opts.asOfInstant} : {}),
    };
}

/** fact → 索引条目 */
function factEntry(fact: Fact): IndexEntry {
    return {
        refId: fact.id,
        text: fact.text,
        tick: fact.tick,
        ...(fact.instant !== undefined ? {instant: fact.instant} : {}),
        ...(fact.time !== undefined ? {time: fact.time} : {}),
        source: "fact",
        subjectIds: fact.subjectIds,
        ...(fact.meta !== undefined ? {meta: fact.meta} : {}),
    };
}

/** state → 索引条目（嵌入文本带 topic 前缀，与主仓 memory chunk 口径一致） */
function stateEntry(entry: StateEntry): IndexEntry {
    return {
        refId: entry.id,
        text: `${entry.topic}: ${entry.view}`,
        tick: entry.sinceTick,
        ...(entry.sinceInstant !== undefined ? {instant: entry.sinceInstant} : {}),
        source: "state",
        subjectIds: [entry.subjectId],
        ...(entry.invalidatedAtTick !== undefined ? {invalidatedAtTick: entry.invalidatedAtTick} : {}),
        ...(entry.invalidatedAtInstant !== undefined ? {invalidatedAtInstant: entry.invalidatedAtInstant} : {}),
    };
}

export {FsStorage, MemStorage} from "./ports/ports";
export type {EmbedPort, LlmPort, LlmRequest, StoragePort} from "./ports/ports";
export {MemoryIndexStore} from "./ports/index-store";
export type {IndexRow, IndexStorePort} from "./ports/index-store";
export {SqliteIndexStore, encodeVector, decodeVector} from "./ports/sqlite-index-store";
export type {SqliteIndexStoreOptions} from "./ports/sqlite-index-store";
export type {AsOf, Episode, Fact, FactMeta, FactMetaValue, StateEntry, Subject, SubjectAlias} from "./core/types";
export {EpisodeStore} from "./core/episode-store";
export {FactStore} from "./core/fact-store";
export {SubjectRegistry, type RegistryEvent} from "./core/subject-registry";
export {StateStore, type StateEvent} from "./core/state-store";
export {SemanticIndex, NORMALIZED_DISTANCE_CUTOFF, passesFilter} from "./retrieval/search";
export type {IndexEntry, MetaFilter, SearchHit, SearchOptions} from "./retrieval/search";
export {executePlan, plainPlan} from "./retrieval/plan";
export type {FindSubjectsStep, PlanResult, PlanStep, PlanTarget, QueryPlan, SearchStep} from "./retrieval/plan";
export {planHeuristically, describePlan} from "./retrieval/heuristic-planner";
export type {PlanContext} from "./retrieval/heuristic-planner";
export {planWithLlm} from "./retrieval/llm-planner";
export type {LlmPlanInput} from "./retrieval/llm-planner";
export {chunk} from "./ingest/chunk";
export type {ChunkOptions} from "./ingest/chunk";
export {extractFacts} from "./ingest/extract";
export type {ExtractOptions, ExtractResult, Pov} from "./ingest/extract";
