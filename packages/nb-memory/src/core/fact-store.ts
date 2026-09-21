/**
 * happening 事实存储：append-only 永不失效（工作假设 C），jsonl 事实源。
 * 「边」不作为存储对象（工作假设 D）：subjectIds 含 ≥2 个 id 的事实即边，
 * 关系查询 = 按 id 对过滤事实，这里只提供数据面。
 */
import type {Fact} from "./types";
import type {StoragePort} from "../ports/ports";
import {appendJsonl, readJsonl} from "./jsonl";

const FILE = "facts.jsonl";

export class FactStore {
    private constructor(private readonly storage: StoragePort, private readonly facts: Fact[]) {}

    static async open(storage: StoragePort): Promise<FactStore> {
        return new FactStore(storage, await readJsonl<Fact>(storage, FILE));
    }

    get all(): readonly Fact[] {
        return this.facts;
    }

    /** 追加一条事实；id 缺省自动分配 fact-<序号>（宿主可传入自有 id 保持金标溯源） */
    async add(input: Omit<Fact, "id"> & {id?: string}): Promise<Fact> {
        const fact: Fact = {...input, id: input.id ?? `fact-${String(this.facts.length + 1).padStart(4, "0")}`};
        this.facts.push(fact);
        await appendJsonl(this.storage, FILE, fact);
        return fact;
    }
}
