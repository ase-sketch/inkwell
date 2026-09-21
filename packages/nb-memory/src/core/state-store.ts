/**
 * 轻量状态层：可变认知（state）带失效语义（工作假设 A/C）。
 * 事件溯源 jsonl（set / invalidate），失效不删除——as-of 查询需要看到
 * 「当时有效」的旧状态；「新状态取代旧状态」表达为旧条目 invalidate + 新条目 set。
 *
 * 双时间轴（ADR 0005）：有效区间同时记摄入序 [sinceTick, invalidatedAtTick)
 * 与故事时间 [sinceInstant, invalidatedAtInstant)，两轴各自回答不同的问题。
 *
 * 不复用 World Engine 存储；「注册表 → WorldSubject」导出桥留待 spike 后期。
 */
import type {AsOf, StateEntry} from "./types";
import type {StoragePort} from "../ports/ports";
import {appendJsonl, readJsonl} from "./jsonl";

const FILE = "state.jsonl";

/** 状态层事件（jsonl 每行一条） */
export type StateEvent =
    | {op: "set"; entry: StateEntry}
    | {op: "invalidate"; id: string; atTick: number; atInstant?: bigint};

export class StateStore {
    private constructor(
        private readonly storage: StoragePort,
        private readonly entries: Map<string, StateEntry>,
    ) {}

    static async open(storage: StoragePort): Promise<StateStore> {
        const entries = new Map<string, StateEntry>();
        for (const event of await readJsonl<StateEvent>(storage, FILE)) {
            StateStore.apply(entries, event);
        }
        return new StateStore(storage, entries);
    }

    private static apply(entries: Map<string, StateEntry>, event: StateEvent): void {
        if (event.op === "set") {
            entries.set(event.entry.id, structuredClone(event.entry));
            return;
        }
        const entry = entries.get(event.id);
        if (!entry) throw new Error(`状态失效事件引用未知条目：${event.id}`);
        entry.invalidatedAtTick = event.atTick;
        if (event.atInstant !== undefined) entry.invalidatedAtInstant = event.atInstant;
    }

    get all(): readonly StateEntry[] {
        return [...this.entries.values()];
    }

    /** 写入一条状态；id 缺省自动分配 st-<序号> */
    async set(input: Omit<StateEntry, "id"> & {id?: string}): Promise<StateEntry> {
        const entry: StateEntry = {...input, id: input.id ?? `st-${String(this.entries.size + 1).padStart(4, "0")}`};
        const event: StateEvent = {op: "set", entry};
        StateStore.apply(this.entries, event);
        await appendJsonl(this.storage, FILE, event);
        return entry;
    }

    /** 标记状态失效（不删除，as-of 仍可见「当时有效」） */
    async invalidate(id: string, atTick: number, atInstant?: bigint): Promise<void> {
        const event: StateEvent = {op: "invalidate", id, atTick, ...(atInstant !== undefined ? {atInstant} : {})};
        StateStore.apply(this.entries, event);
        await appendJsonl(this.storage, FILE, event);
    }

    /**
     * 查询某时点有效的状态：生效时点已到达，且（未失效或失效在该时点之后）。
     * asOf 两轴皆空 = 当前认知（只排除已失效条目）。可按 subjectId 过滤。
     */
    activeAt(asOf?: AsOf, subjectId?: string): StateEntry[] {
        return [...this.entries.values()].filter((entry) => {
            if (subjectId !== undefined && entry.subjectId !== subjectId) return false;
            if (asOf?.tick === undefined && asOf?.instant === undefined) return entry.invalidatedAtTick === undefined;
            if (asOf.tick !== undefined) {
                if (entry.sinceTick > asOf.tick) return false;
                if (entry.invalidatedAtTick !== undefined && entry.invalidatedAtTick <= asOf.tick) return false;
            }
            if (asOf.instant !== undefined) {
                if (entry.sinceInstant === undefined || entry.sinceInstant > asOf.instant) return false;
                if (entry.invalidatedAtInstant !== undefined && entry.invalidatedAtInstant <= asOf.instant) return false;
            }
            return true;
        });
    }
}
