import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";

type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};

/** 为公开GHCR门禁写入可恢复的崩溃fixture；脚本必须脱离Source依赖独立运行。 */
const rootArgument = process.argv[2]?.trim();
if (!rootArgument) throw new Error("需要Installation Root。" );
const root = resolve(rootArgument);
const manifestPath = join(root, ".deploy", "installation.json");
// JSON来自待验收Installation，先按外部数据读取，再收窄本fixture实际消费的字段。
const manifestValue: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
if (!isJsonObject(manifestValue)) throw new Error("Installation Manifest不是JSON对象。" );
if (manifestValue.containerEngine !== "docker" && manifestValue.containerEngine !== "podman") {
    throw new Error("Installation Manifest缺少合法Container Engine。" );
}

const marker = join(root, ".deploy", "staging", "release-recovery-marker");
const operations = join(root, ".deploy", "operations");
const journalPath = join(operations, "release-recovery.json");
const backupRoot = join(root, ".deploy", "backups", "release-recovery");
const createdAt = new Date().toISOString();
const markerEffect = {
    kind: "path-create",
    state: "planned",
    owner: "staging",
    path: ".deploy/staging/release-recovery-marker",
} as const;
const backupEffect = {
    kind: "path-create",
    state: "planned",
    owner: "backup",
    path: ".deploy/backups/release-recovery",
} as const;
const journal = {
    schemaVersion: 5,
    id: "release-recovery",
    action: "update",
    phase: "planned",
    root,
    containerEngine: manifestValue.containerEngine,
    effects: [markerEffect, backupEffect],
    backupRoot,
    previousManifest: manifestValue,
    nextManifest: null,
    createdAt,
    updatedAt: createdAt,
} as const;

await mkdir(operations, {recursive: true});
await writeJsonAtomic(journalPath, journal);
await mkdir(marker, {recursive: true});
await writeJsonAtomic(journalPath, {
    ...journal,
    effects: [backupEffect, {...markerEffect, state: "applied"}],
    updatedAt: new Date().toISOString(),
});

/** 原子发布fixture，避免Verifier观察到半个Journal。 */
async function writeJsonAtomic(path: string, value: object): Promise<void> {
    const temporary = `${path}.${String(process.pid)}.pending`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
    await rename(temporary, path);
}

/** 收窄外部JSON对象，字段值继续由JsonValue约束。 */
function isJsonObject(value: unknown): value is {[key: string]: JsonValue} {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
