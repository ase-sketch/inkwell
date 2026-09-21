/**
 * 关键主体注册表：事件溯源 jsonl（register / alias / ontology / merge 四种事件），
 * 内存态由重放构建。alias 合并是**显式事件**且带 sinceTick（工作假设 B）：
 * as-of 查询在 sinceTick 之前应视作两实体——这是 graphiti 全局合并与
 * baseline 永不合并之外的第三条路。
 *
 * 双时间轴（ADR 0005）：「何时得知同一性」是认知事件，因此 alias / ontology /
 * merge 三类事件都同时记摄入序（tick）与故事时间（instant）。上帝视角按 tick
 * 裁剪（读者何时知道），角色视角按 instant 裁剪（角色在故事时间的何时知道）。
 *
 * 注册表刻意保持小（用户核心理念「保持图的节点，精简」）：只登记关键主体
 * （人物/势力/有状态物品/特殊物品等），次要主体不进注册表。
 *
 * ontology 历史由事件重放免费获得（内存保留全量历史）：as-of 检索取
 * 「当时的本体描述」，避免把后期揭晓的身份泄漏进早期时点。
 */
import type {AsOf, Subject, SubjectAlias} from "./types";
import type {StoragePort} from "../ports/ports";
import {appendJsonl, readJsonl} from "./jsonl";

const FILE = "registry.jsonl";

/** 注册表事件（jsonl 每行一条） */
export type RegistryEvent =
    | {op: "register"; subject: Subject}
    | {op: "alias"; subjectId: string; alias: string; sinceTick: number; sinceInstant?: bigint}
    | {op: "ontology"; subjectId: string; ontology: string; atTick: number; atInstant?: bigint}
    | {op: "merge"; keepId: string; dropId: string; sinceTick: number; sinceInstant?: bigint};

/** ontology 历史条目 */
interface OntologyVersion {
    ontology: string;
    atTick: number;
    /** 故事时间；为空表示来源未提供 */
    atInstant?: bigint;
}

/** 合并记录：dropId 何时被并入 keepId */
interface MergeRecord {
    keepId: string;
    sinceTick: number;
    /** 故事时间；为空表示来源未提供 */
    sinceInstant?: bigint;
}

export class SubjectRegistry {
    private constructor(
        private readonly storage: StoragePort,
        private readonly subjects: Map<string, Subject>,
        /** 每主体 ontology 全量历史（重放派生，不落盘——jsonl 事件即历史） */
        private readonly histories: Map<string, OntologyVersion[]>,
        /** 分身修复合并：dropId → 合并记录；合并前时点仍视作两实体 */
        private readonly merged: Map<string, MergeRecord>,
    ) {}

    static async open(storage: StoragePort): Promise<SubjectRegistry> {
        const subjects = new Map<string, Subject>();
        const histories = new Map<string, OntologyVersion[]>();
        const merged = new Map<string, MergeRecord>();
        for (const event of await readJsonl<RegistryEvent>(storage, FILE)) {
            SubjectRegistry.apply(subjects, histories, merged, event);
        }
        return new SubjectRegistry(storage, subjects, histories, merged);
    }

    /** 事件重放（open 与写入共用同一条代码路径，保证重建等价） */
    private static apply(
        subjects: Map<string, Subject>,
        histories: Map<string, OntologyVersion[]>,
        merged: Map<string, MergeRecord>,
        event: RegistryEvent,
    ): void {
        if (event.op === "register") {
            subjects.set(event.subject.id, structuredClone(event.subject));
            histories.set(event.subject.id, [{
                ontology: event.subject.ontology,
                atTick: event.subject.ontologyTick,
                ...(event.subject.ontologyInstant !== undefined ? {atInstant: event.subject.ontologyInstant} : {}),
            }]);
            return;
        }
        if (event.op === "merge") {
            const keep = subjects.get(event.keepId);
            const drop = subjects.get(event.dropId);
            if (!keep || !drop) throw new Error(`合并事件引用未注册主体：${event.keepId} / ${event.dropId}`);
            // drop 的主名与别名并入 keep：「该称呼指向 keep」的已知时点 = max(原别名时点, 合并时点)
            keep.aliases.push({
                alias: drop.name,
                sinceTick: event.sinceTick,
                ...(event.sinceInstant !== undefined ? {sinceInstant: event.sinceInstant} : {}),
            });
            for (const alias of drop.aliases) {
                if (keep.name === alias.alias || keep.aliases.some((a) => a.alias === alias.alias)) continue;
                keep.aliases.push({
                    alias: alias.alias,
                    sinceTick: Math.max(alias.sinceTick, event.sinceTick),
                    ...(maxInstant(alias.sinceInstant, event.sinceInstant) !== undefined
                        ? {sinceInstant: maxInstant(alias.sinceInstant, event.sinceInstant)!}
                        : {}),
                });
            }
            merged.set(event.dropId, {
                keepId: event.keepId,
                sinceTick: event.sinceTick,
                ...(event.sinceInstant !== undefined ? {sinceInstant: event.sinceInstant} : {}),
            });
            return;
        }
        const subject = subjects.get(event.subjectId);
        if (!subject) throw new Error(`注册表事件引用未注册主体：${event.subjectId}`);
        if (event.op === "alias") {
            subject.aliases.push({
                alias: event.alias,
                sinceTick: event.sinceTick,
                ...(event.sinceInstant !== undefined ? {sinceInstant: event.sinceInstant} : {}),
            });
        } else {
            subject.ontology = event.ontology;
            subject.ontologyTick = event.atTick;
            if (event.atInstant !== undefined) subject.ontologyInstant = event.atInstant;
            histories.get(event.subjectId)!.push({
                ontology: event.ontology,
                atTick: event.atTick,
                ...(event.atInstant !== undefined ? {atInstant: event.atInstant} : {}),
            });
        }
    }

    /** 当前有效主体（被合并吸收的分身不在列——图保持小） */
    get all(): readonly Subject[] {
        return [...this.subjects.values()].filter((s) => !this.merged.has(s.id));
    }

    /**
     * 全部主体的 ontology 版本，展平成带失效区间的描述条目——供「按描述解主体」建索引。
     *
     * 版本链天然是一条取代链：第 i 版在第 i+1 版生效时失效。展成这个形状后，
     * as-of 语义直接由检索侧的 `passesFilter` 承担（tick ≤ asOf 且未在 asOf 前失效），
     * 不需要在解主体这条路上另写一份时间判据——**多一份判据就多一处泄漏口子**。
     *
     * 分身（已被 merge 掉的 id）照常输出：合并前的时点它仍是独立主体，
     * 调用方负责在解出后过 `canonicalId` 折算。
     */
    describeVersions(): Array<{subjectId: string; text: string; atTick: number; atInstant?: bigint; untilTick?: number; untilInstant?: bigint}> {
        const rows: Array<{subjectId: string; text: string; atTick: number; atInstant?: bigint; untilTick?: number; untilInstant?: bigint}> = [];
        for (const [subjectId, versions] of this.histories) {
            const subject = this.subjects.get(subjectId);
            if (!subject) continue;
            for (const [i, version] of versions.entries()) {
                const next = versions[i + 1];
                rows.push({
                    subjectId,
                    // 名字与类型一并入文本：「那本会说话的黑色古书」既要匹配描述也要匹配 item 这个类型词
                    text: `${subject.name}（${subject.type}）：${version.ontology}`,
                    atTick: version.atTick,
                    ...(version.atInstant !== undefined ? {atInstant: version.atInstant} : {}),
                    ...(next !== undefined ? {untilTick: next.atTick} : {}),
                    ...(next?.atInstant !== undefined ? {untilInstant: next.atInstant} : {}),
                });
            }
        }
        return rows;
    }

    /** 规范化主体 id：分身 id 折算到合并后的存续 id（链式跟随） */
    canonicalId(id: string): string {
        let current = id;
        for (let hop = 0; hop < 10; hop++) {
            const entry = this.merged.get(current);
            if (!entry) return current;
            current = entry.keepId;
        }
        return current;
    }

    /** 一个存续主体的等价 id 集（自身 + 被并入的分身 id，facts 上的旧标注靠它命中） */
    equivalentIds(id: string): string[] {
        const keep = this.canonicalId(id);
        const ids = [keep];
        for (const [dropId] of this.merged) {
            if (this.canonicalId(dropId) === keep) ids.push(dropId);
        }
        return ids;
    }

    /** 按 id 取主体；不存在返回 null */
    get(id: string): Subject | null {
        return this.subjects.get(id) ?? null;
    }

    /**
     * 分配下一个主体 id：基于历史登记总数（subjects map 保留被合并分身，
     * 计数单调不回退），撞车时递增兜底——id 分配权归注册表，调用方不数数。
     */
    allocateId(): string {
        let n = this.subjects.size + 1;
        let id = `su-${String(n).padStart(3, "0")}`;
        while (this.subjects.has(id)) {
            n += 1;
            id = `su-${String(n).padStart(3, "0")}`;
        }
        return id;
    }

    /** 注册新关键主体 */
    async register(subject: Subject): Promise<void> {
        if (this.subjects.has(subject.id)) throw new Error(`主体已注册：${subject.id}`);
        await this.commit({op: "register", subject});
    }

    /** 追加别名（显式合并事件）：sinceTick 起「已知该别名指向此主体」 */
    async addAlias(subjectId: string, alias: string, sinceTick: number, sinceInstant?: bigint): Promise<void> {
        await this.commit({op: "alias", subjectId, alias, sinceTick, ...(sinceInstant !== undefined ? {sinceInstant} : {})});
    }

    /** 显式更新一行本体描述（不做滚动 summary） */
    async updateOntology(subjectId: string, ontology: string, atTick: number, atInstant?: bigint): Promise<void> {
        await this.commit({op: "ontology", subjectId, ontology, atTick, ...(atInstant !== undefined ? {atInstant} : {})});
    }

    /**
     * 分身修复合并：sinceTick 起已知 drop 与 keep 是同一实体，drop 的名字全部
     * 变成 keep 的别名；as-of 在 sinceTick 之前仍视作两实体。显式事件、可审计，
     * 与 graphiti 的静默永久合并相对。
     */
    async merge(keepId: string, dropId: string, sinceTick: number, sinceInstant?: bigint): Promise<void> {
        if (keepId === dropId || this.merged.has(dropId)) return;
        await this.commit({
            op: "merge",
            keepId: this.canonicalId(keepId),
            dropId,
            sinceTick,
            ...(sinceInstant !== undefined ? {sinceInstant} : {}),
        });
    }

    /** 应用并落盘一条事件（写入与重放共用 apply） */
    private async commit(event: RegistryEvent): Promise<void> {
        SubjectRegistry.apply(this.subjects, this.histories, this.merged, event);
        await appendJsonl(this.storage, FILE, event);
    }

    /**
     * 按名字/别名解析主体（as-of 语义）：
     * - 主名称在 registeredTick / registeredInstant 起可解析；
     * - 别名仅当其 sinceTick / sinceInstant 已到达时可解析（之前视作未知实体）。
     * 无命中返回 null。
     */
    resolve(name: string, asOf?: AsOf): Subject | null {
        for (const subject of this.subjects.values()) {
            if (!this.visibleAsOwn(subject.id, asOf)) continue;
            if (!registered(subject, asOf)) continue;
            if (subject.name === name) return subject;
            if (subject.aliases.some((a: SubjectAlias) => a.alias === name && aliasKnown(a, asOf))) return subject;
        }
        return null;
    }

    /** 该 id 在该时点是否作为独立主体存在（合并后归入 keep，不再独立可见） */
    private visibleAsOwn(id: string, asOf?: AsOf): boolean {
        const entry = this.merged.get(id);
        if (!entry) return true;
        // 合并事件尚未到达该时点 → 仍是独立主体
        return !reached({tick: entry.sinceTick, instant: entry.sinceInstant}, asOf);
    }

    /**
     * as-of 主体卡（检索期注入用）：按该时点已知的信息组装一行档案文本。
     * 该时点主体尚未登记返回 null；别名按其已知时点裁剪；本体描述取当时版本。
     */
    card(subjectId: string, asOf?: AsOf): string | null {
        // 分身 id：合并已知后折算到存续主体的卡；合并前时点仍出分身自己的卡
        const mergedEntry = this.merged.get(subjectId);
        if (mergedEntry && reached({tick: mergedEntry.sinceTick, instant: mergedEntry.sinceInstant}, asOf)) {
            return this.card(this.canonicalId(subjectId), asOf);
        }
        const subject = this.subjects.get(subjectId);
        if (!subject) return null;
        if (!registered(subject, asOf)) return null;
        const aliases = subject.aliases
            .filter((a) => aliasKnown(a, asOf))
            .map((a) => `${a.alias}（自tick${String(a.sinceTick)}得知是同一人/物）`);
        const ontology = this.ontologyAt(subjectId, asOf);
        const aliasPart = aliases.length > 0 ? `；别名：${aliases.join("、")}` : "";
        // 该时点连初版 ontology 都未形成（理论上登记时即有初版，此为防御分支）
        return `【主体档案】${subject.name}（${subject.type}${aliasPart}）：${ontology ?? "（该时点尚无描述）"}`;
    }

    /** 取该时点生效的本体描述版本；无坐标 = 取最新 */
    private ontologyAt(subjectId: string, asOf?: AsOf): string | null {
        const subject = this.subjects.get(subjectId);
        if (!subject) return null;
        if (asOf?.tick === undefined && asOf?.instant === undefined) return subject.ontology;
        const versions = this.histories.get(subjectId) ?? [];
        return [...versions].reverse().find((v) => reached({tick: v.atTick, instant: v.atInstant}, asOf))?.ontology ?? null;
    }

    /** 在一段文本中找出（as-of 已知的）被提及主体 id：按名字/别名子串匹配 */
    mentionedIn(text: string, asOf?: AsOf): string[] {
        const ids: string[] = [];
        for (const subject of this.subjects.values()) {
            if (!this.visibleAsOwn(subject.id, asOf)) continue;
            if (!registered(subject, asOf)) continue;
            const names = [subject.name, ...subject.aliases.filter((a) => aliasKnown(a, asOf)).map((a) => a.alias)];
            if (names.some((name) => name.length > 0 && text.includes(name))) ids.push(subject.id);
        }
        return ids;
    }
}

/**
 * 某个带双轴坐标的时点是否已被 as-of 到达。
 *
 * 查询给了某轴而记录缺该轴坐标时判 false——无法安放的记录宁可漏召回，
 * 也不能泄漏进它可能并不属于的时间窗口（与 search.passesFilter 同口径）。
 */
function reached(at: {tick: number; instant?: bigint}, asOf?: AsOf): boolean {
    if (asOf?.tick !== undefined && at.tick > asOf.tick) return false;
    if (asOf?.instant !== undefined) {
        if (at.instant === undefined) return false;
        if (at.instant > asOf.instant) return false;
    }
    return true;
}

/** 主体是否已在该时点登记 */
function registered(subject: Subject, asOf?: AsOf): boolean {
    return reached({tick: subject.registeredTick, instant: subject.registeredInstant}, asOf);
}

/** 别名在该时点是否已知指向该主体 */
function aliasKnown(alias: SubjectAlias, asOf?: AsOf): boolean {
    return reached({tick: alias.sinceTick, instant: alias.sinceInstant}, asOf);
}

/** 两个可选故事时间取较晚者；都为空返回 undefined */
function maxInstant(a?: bigint, b?: bigint): bigint | undefined {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return a > b ? a : b;
}
