/**
 * episode 存储：append-only，jsonl 事实源。
 * episode 是「语义层永远可重放重建」纪律的根基（rebuild 从这里出发）。
 */
import type {Episode} from "./types";
import type {StoragePort} from "../ports/ports";
import {appendJsonl, readJsonl} from "./jsonl";

const FILE = "episodes.jsonl";

export class EpisodeStore {
    private constructor(private readonly storage: StoragePort, private readonly episodes: Episode[]) {}

    static async open(storage: StoragePort): Promise<EpisodeStore> {
        return new EpisodeStore(storage, await readJsonl<Episode>(storage, FILE));
    }

    get all(): readonly Episode[] {
        return this.episodes;
    }

    /** 追加一条 episode；id 缺省自动分配 ep-<序号> */
    async add(input: Omit<Episode, "id"> & {id?: string}): Promise<Episode> {
        const episode: Episode = {...input, id: input.id ?? `ep-${String(this.episodes.length + 1).padStart(4, "0")}`};
        this.episodes.push(episode);
        await appendJsonl(this.storage, FILE, episode);
        return episode;
    }
}
