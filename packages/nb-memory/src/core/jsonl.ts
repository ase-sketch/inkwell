/**
 * jsonl 事实源读写小工具：四个 store 共用（episodes/facts/registry/state）。
 * jsonl 是唯一事实源，索引全部是可删可重建的派生物。
 *
 * bigint 序列化（ADR 0005）：故事时间轴用 bigint（与 Calendar 内核同构，
 * 覆盖量劫级跨度），而 JSON 不认 bigint。这里按**字段名白名单**在十进制
 * 字符串与 bigint 之间双向转换——比 `{"$n":"..."}` 之类的标记法可读，
 * jsonl 保持人可审、可 git diff。
 *
 * 白名单之外出现 bigint 直接抛错：新增故事时间字段却忘了登记时会立刻炸，
 * 而不是静默退化成字符串（引擎不变式兜底，不赌调用方记性）。
 */
import type {StoragePort} from "../ports/ports";

/** 域内全部 bigint 字段名（故事时间轴） */
const INSTANT_FIELDS: ReadonlySet<string> = new Set([
    "instant",
    "sinceInstant",
    "invalidatedAtInstant",
    "ontologyInstant",
    "registeredInstant",
    "atInstant",
]);

/** 读 jsonl 文件为对象数组（文件不存在 = 空数组） */
export async function readJsonl<T>(storage: StoragePort, name: string): Promise<T[]> {
    const content = await storage.read(name);
    if (content === null) return [];
    return content.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line, reviveInstant) as T);
}

/** 追加一条记录 */
export async function appendJsonl(storage: StoragePort, name: string, item: unknown): Promise<void> {
    await storage.appendLine(name, JSON.stringify(item, replaceInstant));
}

/** bigint → 十进制字符串（仅限白名单字段） */
function replaceInstant(this: unknown, key: string, value: unknown): unknown {
    if (typeof value !== "bigint") return value;
    if (!INSTANT_FIELDS.has(key)) {
        throw new Error(`未登记的 bigint 字段「${key}」：请在 jsonl.ts 的 INSTANT_FIELDS 中登记，否则无法正确读回`);
    }
    return value.toString();
}

/** 十进制字符串 → bigint（仅限白名单字段） */
function reviveInstant(this: unknown, key: string, value: unknown): unknown {
    if (typeof value !== "string" || !INSTANT_FIELDS.has(key)) return value;
    return BigInt(value);
}
