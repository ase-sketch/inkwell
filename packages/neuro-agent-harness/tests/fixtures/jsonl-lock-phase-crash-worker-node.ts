import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {appendFile, mkdir, writeFile} from "node:fs/promises";
import {hostname} from "node:os";
import {dirname, join} from "node:path";
import {JsonlSessionLock} from "../../src/storage/jsonl-lock.js";
import {reduceSessionWritePlan} from "../../src/session.js";
import {JsonlSessionStore} from "../../src/storage/jsonl.js";

const [phase, directory, sessionIdText, lockPath, readyFile] = process.argv.slice(2);
if (!phase || !directory || !sessionIdText || !lockPath || !readyFile) {
    throw new Error("jsonl-lock-phase-crash-worker-node 参数不完整");
}

const token = randomUUID();
const ownerPath = join(lockPath, `owner.${token}`);

if (phase === "append") {
    const sessionId = Number(sessionIdText);
    const store = new JsonlSessionStore({directory});
    const lock = await JsonlSessionLock.acquire(lockPath);
    await lock.assertOwnedOnDisk();
    const current = await store.read(sessionId);
    const result = reduceSessionWritePlan(current, {
        target: sessionId,
        expectedVersion: current.version,
        cause: "test.phase-crash.append",
        operations: [{type: "appendEntries", entries: [{kind: "phase", payload: "appended-before-crash"}]}],
    }, {
        now: Date.now,
        entryId: randomUUID,
    });
    await appendFile(join(directory, "sessions", `${sessionId}.jsonl`), `${JSON.stringify({
        kind: "snapshot",
        cause: "test.phase-crash.append",
        snapshot: result.snapshot,
        appendedEntryIds: result.entries.map((entry) => entry.id),
    })}\n`, "utf8");
} else {
    await mkdir(dirname(lockPath), {recursive: true});
    await mkdir(lockPath);
    if (phase !== "root") {
        await mkdir(ownerPath);
    }
    if (phase === "metadata" || phase === "heartbeat") {
        await writeFile(join(ownerPath, "owner.json"), JSON.stringify({
            token,
            pid: process.pid,
            hostname: hostname(),
            acquiredAt: Date.now(),
        }) + "\n", "utf8");
    }
    if (phase === "heartbeat") {
        await writeFile(join(ownerPath, "heartbeat"), `${Date.now()}\n`, "utf8");
    }
}

if (!existsSync(dirname(readyFile))) {
    await mkdir(dirname(readyFile), {recursive: true});
}
await writeFile(readyFile, phase, "utf8");
process.exit(0);
