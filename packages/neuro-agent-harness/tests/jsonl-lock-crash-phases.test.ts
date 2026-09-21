import {afterEach, describe, expect, test} from "bun:test";
import {existsSync} from "node:fs";
import {mkdtemp, readdir, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {JsonlLockBusyError} from "../src/storage/jsonl-lock.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";

const directories: string[] = [];
const phases = ["root", "owner", "metadata", "heartbeat", "append"] as const;

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

async function directory(): Promise<string> {
    const value = await mkdtemp(join(tmpdir(), "neuro-agent-harness-lock-phase-"));
    directories.push(value);
    return value;
}

async function buildWorker(path: string): Promise<string> {
    const output = join(path, "jsonl-lock-phase-crash-worker-node.mjs");
    const result = await Bun.build({
        entrypoints: [join(import.meta.dir, "fixtures", "jsonl-lock-phase-crash-worker-node.ts")],
        outdir: path,
        naming: "jsonl-lock-phase-crash-worker-node.mjs",
        target: "node",
        format: "esm",
    });
    if (!result.success) {
        throw new Error(`Node lock phase worker bundle 失败：${result.logs.map((log) => log.message).join("\n")}`);
    }
    const bundled = result.outputs[0]?.path;
    if (!bundled || !existsSync(bundled)) {
        throw new Error(`Node lock phase worker bundle 输出缺失：requested=${output} actual=${bundled ?? "undefined"}`);
    }
    return bundled;
}

async function waitForFile(path: string, timeout = 5_000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (!existsSync(path)) {
        if (Date.now() > deadline) {
            throw new Error(`文件未在限定时间内出现：${path}`);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
}

describe("JsonlSessionLock crash phases", () => {
    test("root/owner/metadata/heartbeat/append 各阶段退出都 fail closed，append facts 仍可恢复", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const workerPath = await buildWorker(path);
        const node = Bun.which("node");
        if (!node) throw new Error("lock phase 测试需要 Node.js");

        for (const phase of phases) {
            const created = await store.create({profileKey: "p", initial: null, hostContext: {}});
            const sessionId = created.metadata.sessionId;
            const lockPath = join(path, "sessions", `${sessionId}.jsonl.lock`);
            const readyFile = join(path, `${phase}-${sessionId}.ready`);
            const worker = Bun.spawn({
                cmd: [node, workerPath, phase, path, String(sessionId), lockPath, readyFile],
                stdout: "pipe",
                stderr: "pipe",
            });
            await waitForFile(readyFile);
            expect(await worker.exited).toBe(0);
            expect(existsSync(lockPath)).toBe(true);
            expect((await readdir(lockPath)).some((name) => name.startsWith("owner.")) || phase === "root").toBe(true);

            const restored = await store.read(sessionId);
            expect(restored.version).toBe(phase === "append" ? 1 : 0);
            const failure = await store.commit({
                target: sessionId,
                expectedVersion: restored.version,
                cause: `test.phase-crash.${phase}.contender`,
                operations: [{type: "appendEntries", entries: [{kind: "contender", payload: phase}]}],
            }).then(
                () => undefined,
                (error: unknown) => error,
            );
            expect(failure).toBeInstanceOf(JsonlLockBusyError);
        }
    }, 45_000);
});
