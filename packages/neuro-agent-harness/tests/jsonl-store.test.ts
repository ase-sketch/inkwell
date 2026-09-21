import {afterEach, describe, expect, test} from "bun:test";
import {appendFile, mkdir, mkdtemp, readFile, rm, stat, truncate, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import type {JsonObject} from "../src/json.js";
import {JsonlLockCorruptError, JsonlSessionStore} from "../src/storage/jsonl.js";
import {
    SessionConflictError,
    SessionInvariantError,
    type SessionCommitResult,
    type SessionWritePlan,
} from "../src/session.js";
import {verifyNumericStore} from "./store-contract.js";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

async function directory(): Promise<string> {
    const value = await mkdtemp(join(tmpdir(), "neuro-agent-harness-"));
    directories.push(value);
    return value;
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return {promise, resolve};
}

class GatedReconciliationJsonlStore extends JsonlSessionStore {
    readonly reconciliationCommitStarted = deferred();
    private readonly reconciliationCommitReleased = deferred();
    private gateFirstReconciliationCommit = true;

    releaseReconciliationCommit(): void {
        this.reconciliationCommitReleased.resolve();
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (this.gateFirstReconciliationCommit && plan.cause === "store.reconcileInterrupted") {
            this.gateFirstReconciliationCommit = false;
            this.reconciliationCommitStarted.resolve();
            await this.reconciliationCommitReleased.promise;
        }
        return super.commit(plan);
    }
}

async function nodeWorkerPath(path: string): Promise<string> {
    const output = join(path, "jsonl-commit-worker-node.mjs");
    const result = await Bun.build({
        entrypoints: [join(import.meta.dir, "fixtures", "jsonl-commit-worker-node.ts")],
        outdir: path,
        naming: "jsonl-commit-worker-node.mjs",
        target: "node",
        format: "esm",
    });
    if (!result.success) {
        throw new Error(`Node worker bundle 失败：${result.logs.map((log) => log.message).join("\n")}`);
    }
    const bundled = result.outputs[0]?.path;
    if (!bundled || !existsSync(bundled)) {
        throw new Error(`Node worker bundle 输出缺失：requested=${output} actual=${bundled ?? "undefined"}`);
    }
    return bundled;
}

async function nodeCreateWorkerPath(path: string): Promise<string> {
    const output = join(path, "jsonl-create-worker-node.mjs");
    const result = await Bun.build({
        entrypoints: [join(import.meta.dir, "fixtures", "jsonl-create-worker-node.ts")],
        outdir: path,
        naming: "jsonl-create-worker-node.mjs",
        target: "node",
        format: "esm",
    });
    if (!result.success) {
        throw new Error(`Node create worker bundle 失败：${result.logs.map((log) => log.message).join("\n")}`);
    }
    const bundled = result.outputs[0]?.path;
    if (!bundled || !existsSync(bundled)) {
        throw new Error(`Node create worker bundle 输出缺失：requested=${output} actual=${bundled ?? "undefined"}`);
    }
    return bundled;
}

type WorkerResult =
    | {readonly status: "fulfilled"; readonly version: number; readonly value: number}
    | {readonly status: "rejected"; readonly name: string; readonly message: string}
    | {readonly status: "error"; readonly name: string; readonly message: string};

async function runConcurrentCommitWorkers(
    path: string,
    sessionId: number,
    expectedVersion: number,
    runtime: "bun" | "node" = "bun",
): Promise<WorkerResult[]> {
    const readyDirectory = join(path, "workers-ready");
    await mkdir(readyDirectory);
    const startFile = join(path, "workers-start");
    const workerPath = runtime === "node"
        ? await nodeWorkerPath(path)
        : join(import.meta.dir, "fixtures", "jsonl-commit-worker.ts");
    const executable = runtime === "node" ? Bun.which("node") : process.execPath;
    if (!executable) {
        throw new Error("Node 子进程竞争测试需要 Node.js");
    }
    const values = [1, 2] as const;
    const processes = values.map((value) => {
        const readyFile = join(readyDirectory, `${value}`);
        return Bun.spawn({
            cmd: [
                executable,
                workerPath,
                path,
                String(sessionId),
                String(expectedVersion),
                String(value),
                startFile,
                readyFile,
            ],
            stdout: "pipe",
            stderr: "pipe",
        });
    });

    const deadline = Date.now() + 5_000;
    while (!values.every((value) => existsSync(join(readyDirectory, `${value}`)))) {
        if (Date.now() > deadline) {
            const diagnostics = await Promise.all(processes.map(async (child) => {
                child.kill();
                const [stdout, stderr, exitCode] = await Promise.all([
                    new Response(child.stdout).text(),
                    new Response(child.stderr).text(),
                    child.exited,
                ]);
                return {exitCode, stdout: stdout.trim(), stderr: stderr.trim()};
            }));
            throw new Error(`commit worker 未在限定时间内 ready：${JSON.stringify(diagnostics)}`);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    await writeFile(startFile, "go", "utf8");

    return Promise.all(processes.map(async (child) => {
        const [stdout, stderr, exitCode] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
        ]);
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        if (!line) {
            throw new Error(`commit worker 没有输出，exitCode=${exitCode}，stderr=${stderr}`);
        }
        const result = JSON.parse(line) as WorkerResult;
        if (exitCode !== 0 && result.status !== "error") {
            throw new Error(`commit worker 异常退出，exitCode=${exitCode}，stderr=${stderr}`);
        }
        return result;
    }));
}

type CreateWorkerResult =
    | {readonly status: "fulfilled"; readonly sessionId: number; readonly owner: string}
    | {readonly status: "rejected"; readonly name: string; readonly message: string; readonly owner: string};

async function runConcurrentCreateWorkers(
    path: string,
    mode: "auto" | "explicit",
    runtime: "bun" | "node",
    explicitId?: number,
): Promise<CreateWorkerResult[]> {
    const readyDirectory = join(path, "create-workers-ready");
    await mkdir(readyDirectory);
    const startFile = join(path, "create-workers-start");
    const workerPath = runtime === "node"
        ? await nodeCreateWorkerPath(path)
        : join(import.meta.dir, "fixtures", "jsonl-create-worker.ts");
    const executable = runtime === "node" ? Bun.which("node") : process.execPath;
    if (!executable) {
        throw new Error("Node 子进程创建测试需要 Node.js");
    }
    const owners = ["first", "second"] as const;
    const processes = owners.map((owner) => {
        const readyFile = join(readyDirectory, owner);
        return Bun.spawn({
            cmd: [
                executable,
                workerPath,
                path,
                mode,
                owner,
                startFile,
                readyFile,
                ...(explicitId === undefined ? [] : [String(explicitId)]),
            ],
            stdout: "pipe",
            stderr: "pipe",
        });
    });

    const deadline = Date.now() + 5_000;
    while (!owners.every((owner) => existsSync(join(readyDirectory, owner)))) {
        if (Date.now() > deadline) {
            const diagnostics = await Promise.all(processes.map(async (child) => {
                child.kill();
                const [stdout, stderr, exitCode] = await Promise.all([
                    new Response(child.stdout).text(),
                    new Response(child.stderr).text(),
                    child.exited,
                ]);
                return {exitCode, stdout: stdout.trim(), stderr: stderr.trim()};
            }));
            throw new Error(`create worker 未在限定时间内 ready：${JSON.stringify(diagnostics)}`);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    await writeFile(startFile, "go", "utf8");

    return Promise.all(processes.map(async (child) => {
        const [stdout, stderr, exitCode] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
        ]);
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        if (!line) {
            throw new Error(`create worker 没有输出，exitCode=${exitCode}，stderr=${stderr}`);
        }
        const result = JSON.parse(line) as CreateWorkerResult;
        if (exitCode !== 0) {
            throw new Error(`create worker 异常退出，exitCode=${exitCode}，stderr=${stderr}`);
        }
        return result;
    }));
}

describe("JsonlSessionStore", () => {
    test("满足公共 Store 合同", async () => {
        await verifyNumericStore(new JsonlSessionStore({directory: await directory()}));
    });

    test("reconcileInterrupted 在 sessions 目录尚不存在时返回空列表", async () => {
        const store = new JsonlSessionStore({directory: await directory()});

        expect(await store.reconcileInterrupted()).toEqual([]);
    });

    test("reconcileInterrupted 不吞掉 sessions 路径类型错误", async () => {
        const path = await directory();
        await writeFile(join(path, "sessions"), "not a directory", "utf8");
        const store = new JsonlSessionStore({directory: path});

        await expect(store.reconcileInterrupted()).rejects.toMatchObject({code: "ENOTDIR"});
    });

    test("两个独立 Store 的并发重启协调收敛到一次 interrupted transition", async () => {
        const path = await directory();
        const first = new JsonlSessionStore({directory: path});
        const second = new JsonlSessionStore({directory: path});
        const session = await first.create({profileKey: "p", initial: null, hostContext: {}});
        await first.commit({
            target: session.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.start.concurrent-reconcile",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: "active",
                    sessionId: session.metadata.sessionId,
                    profileKey: "p",
                    caller: {kind: "system", name: "test"},
                    input: null,
                    createdAt: 1,
                },
            }],
        });

        const reconciled = await Promise.all([
            first.reconcileInterrupted(),
            second.reconcileInterrupted(),
        ]);

        expect(reconciled.flat()).toHaveLength(1);
        expect(reconciled.flat()[0]?.status).toBe("interrupted");
        const restored = await new JsonlSessionStore({directory: path}).read(session.metadata.sessionId);
        expect(restored.version).toBe(2);
        expect(restored.status).toBe("interrupted");
        expect(restored.activeInvocationId).toBeNull();
        expect(restored.invocations[0]?.status).toBe("interrupted");
    });

    test("重启协调在独立 Store 的同一 owner 写入后刷新 Snapshot 并重试", async () => {
        const path = await directory();
        const first = new GatedReconciliationJsonlStore({directory: path});
        const second = new JsonlSessionStore({directory: path});
        const session = await first.create({profileKey: "p", initial: null, hostContext: {}});
        await first.commit({
            target: session.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.start.reconcile-retry",
            operations: [{
                type: "startInvocation",
                invocation: {
                    id: "active",
                    sessionId: session.metadata.sessionId,
                    profileKey: "p",
                    caller: {kind: "system", name: "test"},
                    input: null,
                    createdAt: 1,
                },
            }],
        });

        const reconciliation = first.reconcileInterrupted();
        await first.reconciliationCommitStarted.promise;
        let concurrentWrite: SessionCommitResult<number, JsonObject>;
        try {
            concurrentWrite = await second.commit({
                target: session.metadata.sessionId,
                expectedVersion: 1,
                cause: "test.concurrent-write-before-reconcile",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.concurrent", payload: true, invocationId: "active"}],
                }],
            });
        } finally {
            first.releaseReconciliationCommit();
        }
        const reconciled = await reconciliation;

        expect(concurrentWrite.snapshot.version).toBe(2);
        expect(reconciled).toHaveLength(1);
        expect(reconciled[0]?.status).toBe("interrupted");
        const restored = await new JsonlSessionStore({directory: path}).read(session.metadata.sessionId);
        expect(restored.version).toBe(3);
        expect(restored.entries.map((entry) => entry.kind)).toEqual(["test.concurrent"]);
        expect(restored.status).toBe("interrupted");
        expect(restored.activeInvocationId).toBeNull();
    });

    test("两个独立 Store 并发自动创建分配不同 ID 且都可恢复", async () => {
        const path = await directory();
        const first = new JsonlSessionStore({directory: path});
        const second = new JsonlSessionStore({directory: path});

        const created = await Promise.all([
            first.create({profileKey: "p", initial: {owner: "first"}, hostContext: {}}),
            second.create({profileKey: "p", initial: {owner: "second"}, hostContext: {}}),
        ]);

        expect(created.map((snapshot) => snapshot.metadata.sessionId).sort((left, right) => left - right)).toEqual([1, 2]);
        const restored = new JsonlSessionStore({directory: path});
        expect((await restored.read(created[0]!.metadata.sessionId)).metadata.initial).toEqual({owner: "first"});
        expect((await restored.read(created[1]!.metadata.sessionId)).metadata.initial).toEqual({owner: "second"});
    });

    test("两个独立 Store 并发创建相同显式 ID 时只有一个成功且不会覆盖", async () => {
        const path = await directory();
        const first = new JsonlSessionStore({directory: path});
        const second = new JsonlSessionStore({directory: path});

        const results = await Promise.allSettled([
            first.create({sessionId: 7, profileKey: "p", initial: {owner: "first"}, hostContext: {}}),
            second.create({sessionId: 7, profileKey: "p", initial: {owner: "second"}, hostContext: {}}),
        ]);

        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(SessionInvariantError);
        const winner = fulfilled[0];
        if (winner?.status !== "fulfilled") {
            throw new Error("显式 Session ID 竞争缺少获胜方");
        }
        expect((await new JsonlSessionStore({directory: path}).read(7)).metadata.initial)
            .toEqual(winner.value.metadata.initial);
    });

    test("损坏的 Session sequence fail closed 且不重置为 0", async () => {
        const path = await directory();
        const sequencePath = join(path, "session-seq.json");
        await writeFile(sequencePath, "{broken", "utf8");

        await expect(new JsonlSessionStore({directory: path}).allocateId())
            .rejects.toBeInstanceOf(SessionInvariantError);
        expect(await readFile(sequencePath, "utf8")).toBe("{broken");
    });

    test("非法或耗尽的 Session sequence value fail closed", async () => {
        const root = await directory();
        const cases = [
            "{}",
            JSON.stringify({value: "1"}),
            JSON.stringify({value: -1}),
            JSON.stringify({value: 0.5}),
            JSON.stringify({value: Number.MAX_SAFE_INTEGER + 1}),
            JSON.stringify({value: Number.MAX_SAFE_INTEGER}),
        ];
        for (const [index, text] of cases.entries()) {
            const path = join(root, String(index));
            await mkdir(path);
            const sequencePath = join(path, "session-seq.json");
            await writeFile(sequencePath, `${text}\n`, "utf8");

            await expect(new JsonlSessionStore({directory: path}).allocateId())
                .rejects.toBeInstanceOf(SessionInvariantError);
            expect(await readFile(sequencePath, "utf8")).toBe(`${text}\n`);
        }
    });

    test("显式 Session ID 推进 sequence，后续自动创建不会回撞", async () => {
        const path = await directory();
        await new JsonlSessionStore({directory: path}).create({
            sessionId: 7,
            profileKey: "p",
            initial: {owner: "explicit"},
            hostContext: {},
        });

        const automatic = await new JsonlSessionStore({directory: path}).create({
            profileKey: "p",
            initial: {owner: "automatic"},
            hostContext: {},
        });

        expect(automatic.metadata.sessionId).toBe(8);
        expect((await new JsonlSessionStore({directory: path}).read(7)).metadata.initial).toEqual({owner: "explicit"});
        expect((await new JsonlSessionStore({directory: path}).read(8)).metadata.initial).toEqual({owner: "automatic"});
    });

    test("自动创建跳过有效但落后的 sequence candidate", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        await store.create({
            sessionId: 1,
            profileKey: "p",
            initial: {owner: "existing"},
            hostContext: {},
        });
        await writeFile(join(path, "session-seq.json"), `${JSON.stringify({value: 0})}\n`, "utf8");

        const created = await new JsonlSessionStore({directory: path}).create({
            profileKey: "p",
            initial: {owner: "automatic"},
            hostContext: {},
        });

        expect(created.metadata.sessionId).toBe(2);
        expect((await new JsonlSessionStore({directory: path}).read(1)).metadata.initial).toEqual({owner: "existing"});
        expect((await new JsonlSessionStore({directory: path}).read(2)).metadata.initial).toEqual({owner: "automatic"});
    });

    test("Bun 与 Node ESM 子进程并发自动创建分配不同 ID 且都可恢复", async () => {
        for (const runtime of ["bun", "node"] as const) {
            const path = await directory();
            const results = await runConcurrentCreateWorkers(path, "auto", runtime);
            expect(results.every((result) => result.status === "fulfilled")).toBe(true);
            const fulfilled = results.filter((result) => result.status === "fulfilled");
            expect(fulfilled.map((result) => result.sessionId).sort((left, right) => left - right)).toEqual([1, 2]);
            const restored = new JsonlSessionStore({directory: path});
            for (const result of fulfilled) {
                expect((await restored.read(result.sessionId)).metadata.initial).toEqual({owner: result.owner});
            }
        }
    });

    test("Bun 与 Node ESM 子进程并发创建相同显式 ID 时只有一个成功", async () => {
        for (const runtime of ["bun", "node"] as const) {
            const path = await directory();
            const results = await runConcurrentCreateWorkers(path, "explicit", runtime, 7);
            const fulfilled = results.filter((result) => result.status === "fulfilled");
            const rejected = results.filter((result) => result.status === "rejected");
            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(1);
            expect(rejected[0]?.name).toBe("SessionInvariantError");
            const winner = fulfilled[0];
            if (!winner) {
                throw new Error(`${runtime} 显式 Session ID 竞争缺少获胜方`);
            }
            expect((await new JsonlSessionStore({directory: path}).read(7)).metadata.initial).toEqual({owner: winner.owner});
            expect((await new JsonlSessionStore({directory: path}).create({
                profileKey: "p",
                initial: {owner: "automatic"},
                hostContext: {},
            })).metadata.sessionId).toBe(8);
        }
    });

    test("进程重建后从 JSONL 恢复 Snapshot", async () => {
        const path = await directory();
        const first = new JsonlSessionStore({directory: path});
        const created = await first.create({profileKey: "p", initial: {seed: 1}, hostContext: {project: "book"}});
        await first.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.append",
            operations: [{type: "appendEntries", entries: [{kind: "fact", payload: "persisted"}]}],
        });
        const restored = await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId);
        expect(restored.version).toBe(1);
        expect(restored.entries[0]?.payload).toBe("persisted");
    });

    test("忽略崩溃留下的损坏尾行", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const created = await store.create({profileKey: "中文-profile", initial: null, hostContext: {label: "银龙"}});
        await appendFile(join(path, "sessions", `${created.metadata.sessionId}.jsonl`), "{broken", "utf8");
        const restored = await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId);
        expect(restored.version).toBe(0);
    });

    test("人工清理 crashed owner 后的首个 commit 会修复损坏尾行并保持后续恢复", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const created = await store.create({profileKey: "中文-profile", initial: null, hostContext: {label: "银龙"}});
        const sessionPath = join(path, "sessions", `${created.metadata.sessionId}.jsonl`);
        await appendFile(sessionPath, "{broken", "utf8");

        const restarted = new JsonlSessionStore({directory: path});
        expect((await restarted.read(created.metadata.sessionId)).version).toBe(0);
        const beforeRejectedPlan = await readFile(sessionPath, "utf8");
        await expect(restarted.commit({
            target: created.metadata.sessionId,
            expectedVersion: 99,
            cause: "test.reject-before-partial-tail-repair",
            operations: [],
        })).rejects.toBeInstanceOf(SessionConflictError);
        expect(await readFile(sessionPath, "utf8")).toBe(beforeRejectedPlan);

        const committed = await restarted.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.repair-partial-tail",
            operations: [{type: "appendEntries", entries: [{kind: "recovered", payload: true}]}],
        });

        expect(committed.snapshot.version).toBe(1);
        const restored = await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId);
        expect(restored.version).toBe(1);
        expect(restored.entries.at(-1)?.payload).toBe(true);
        const followedUp = await new JsonlSessionStore({directory: path}).commit({
            target: created.metadata.sessionId,
            expectedVersion: 1,
            cause: "test.commit-after-partial-tail-repair",
            operations: [{type: "appendEntries", entries: [{kind: "after-repair", payload: true}]}],
        });
        expect(followedUp.snapshot.version).toBe(2);
        expect((await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId)).version).toBe(2);
        const records = (await readFile(sessionPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line) as {
            readonly snapshot: {readonly version: number};
        });
        expect(records.map((record) => record.snapshot.version)).toEqual([0, 1, 2]);
    });

    test("完整尾记录只缺换行时保留该记录并在下一次 commit 前补 separator", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const created = await store.create({profileKey: "p", initial: null, hostContext: {}});
        const sessionPath = join(path, "sessions", `${created.metadata.sessionId}.jsonl`);
        const initialRecord = (await readFile(sessionPath, "utf8")).trimEnd();
        await writeFile(sessionPath, initialRecord, "utf8");

        const committed = await new JsonlSessionStore({directory: path}).commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.complete-tail-without-newline",
            operations: [{type: "appendEntries", entries: [{kind: "after-complete-tail", payload: true}]}],
        });

        expect(committed.snapshot.version).toBe(1);
        const restored = await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId);
        expect(restored.version).toBe(1);
        const records = (await readFile(sessionPath, "utf8")).trim().split(/\r?\n/);
        expect(records).toHaveLength(2);
        expect(records.map((line) => JSON.parse(line))).toHaveLength(2);
    });

    test("tail repair truncate 完成后、append 前退出仍留下可继续提交的合法前缀", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const created = await store.create({profileKey: "中文-profile", initial: null, hostContext: {label: "银龙"}});
        const sessionPath = join(path, "sessions", `${created.metadata.sessionId}.jsonl`);
        await appendFile(sessionPath, "{broken", "utf8");
        const crashedBytes = await readFile(sessionPath);
        const repairOffset = crashedBytes.lastIndexOf(0x0a) + 1;
        expect(repairOffset).toBeGreaterThan(0);
        await truncate(sessionPath, repairOffset);

        expect((await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId)).version).toBe(0);
        const committed = await new JsonlSessionStore({directory: path}).commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.resume-after-tail-truncate",
            operations: [{type: "appendEntries", entries: [{kind: "after-truncate-crash", payload: true}]}],
        });

        expect(committed.snapshot.version).toBe(1);
        expect((await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId)).version).toBe(1);
    });

    test("同版本并发 commit 只允许一个成功", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const created = await store.create({profileKey: "p", initial: null, hostContext: {}});
        const plan = (value: number) => store.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: `test.concurrent.${value}`,
            operations: [{type: "appendEntries" as const, entries: [{kind: "value", payload: value}]}],
        });
        const results = await Promise.allSettled([plan(1), plan(2)]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected?.reason).toBeInstanceOf(SessionConflictError);
        const text = await readFile(join(path, "sessions", `${created.metadata.sessionId}.jsonl`), "utf8");
        expect(text.trim().split(/\r?\n/)).toHaveLength(2);
    });

    test("两个独立 JsonlSessionStore 实例竞争同一版本时只允许一个成功", async () => {
        const path = await directory();
        const first = new JsonlSessionStore({directory: path});
        const second = new JsonlSessionStore({directory: path});
        const created = await first.create({profileKey: "p", initial: null, hostContext: {}});
        const plan = (store: JsonlSessionStore, value: number) => store.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: `test.independent-store.${value}`,
            operations: [{type: "appendEntries" as const, entries: [{kind: "value", payload: value}]}],
        });

        const results = await Promise.allSettled([plan(first, 1), plan(second, 2)]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected?.reason).toBeInstanceOf(SessionConflictError);

        const restored = await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId);
        expect(restored.version).toBe(1);
        expect(restored.entries).toHaveLength(1);
    });

    test("独立进程竞争同一版本时只允许一个成功并可继续恢复", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const created = await store.create({profileKey: "p", initial: null, hostContext: {}});
        const seedEntries = Array.from({length: 12}, (_, index) => ({
            kind: "seed",
            payload: `${index}:${"x".repeat(20_000)}`,
        }));
        const seeded = await store.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.process.seed",
            operations: [{type: "appendEntries", entries: seedEntries}],
        });

        const results = await runConcurrentCommitWorkers(path, created.metadata.sessionId, seeded.snapshot.version);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected?.name).toBe("SessionConflictError");

        const restored = await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId);
        expect(restored.version).toBe(2);
        expect(restored.entries).toHaveLength(seedEntries.length + 1);
        expect(existsSync(join(path, "sessions", `${created.metadata.sessionId}.jsonl.lock`))).toBe(false);
        const records = (await readFile(join(path, "sessions", `${created.metadata.sessionId}.jsonl`), "utf8"))
            .trim()
            .split(/\r?\n/)
            .map((line) => JSON.parse(line) as {
                readonly kind: "snapshot" | "commit";
                readonly snapshot?: {readonly version: number};
                readonly version?: number;
            });
        expect(records.map((record) => record.kind === "snapshot" ? record.snapshot!.version : record.version)).toEqual([0, 1, 2]);
    });

    test("Node ESM 子进程竞争同一版本时只允许一个成功并可继续恢复", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const created = await store.create({profileKey: "p", initial: null, hostContext: {}});
        const seeded = await store.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.node-process.seed",
            operations: [{type: "appendEntries", entries: [{kind: "seed", payload: "node"}]}],
        });

        const results = await runConcurrentCommitWorkers(path, created.metadata.sessionId, seeded.snapshot.version, "node");
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected?.name).toBe("SessionConflictError");

        const restored = await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId);
        expect(restored.version).toBe(2);
        expect(restored.entries).toHaveLength(2);
        expect(existsSync(join(path, "sessions", `${created.metadata.sessionId}.jsonl.lock`))).toBe(false);
        const records = (await readFile(join(path, "sessions", `${created.metadata.sessionId}.jsonl`), "utf8"))
            .trim()
            .split(/\r?\n/)
            .map((line) => JSON.parse(line) as {
                readonly kind: "snapshot" | "commit";
                readonly snapshot?: {readonly version: number};
                readonly version?: number;
            });
        expect(records.map((record) => record.kind === "snapshot" ? record.snapshot!.version : record.version)).toEqual([0, 1, 2]);
    });

    test("损坏的跨进程 lock 不伪装成 SessionConflictError", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const created = await store.create({profileKey: "p", initial: null, hostContext: {}});
        const lockPath = join(path, "sessions", `${created.metadata.sessionId}.jsonl.lock`);
        await writeFile(lockPath, "not a directory", "utf8");

        const failure = await store.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.corrupt-lock",
            operations: [{type: "appendEntries", entries: [{kind: "value", payload: 1}]}],
        }).then(
            () => undefined,
            (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(JsonlLockCorruptError);
        expect(failure).not.toBeInstanceOf(SessionConflictError);
        expect((await store.read(created.metadata.sessionId)).version).toBe(0);
    });

    test("有效但不连续的 JSONL 尾记录不会被忽略", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const created = await store.create({profileKey: "p", initial: null, hostContext: {}});
        const sessionPath = join(path, "sessions", `${created.metadata.sessionId}.jsonl`);
        const initialRecord = JSON.parse((await readFile(sessionPath, "utf8")).trim()) as {
            readonly snapshot: {
                readonly metadata: typeof created.metadata;
                readonly status: "idle";
                readonly activeLeafId: null;
                readonly activeInvocationId: null;
                readonly invocations: readonly [];
            };
        };
        await appendFile(sessionPath, `${JSON.stringify({
            kind: "commit",
            cause: "test.invalid-tail-version",
            version: 2,
            metadata: initialRecord.snapshot.metadata,
            status: initialRecord.snapshot.status,
            activeLeafId: initialRecord.snapshot.activeLeafId,
            activeInvocationId: initialRecord.snapshot.activeInvocationId,
            appendedEntries: [],
            invocations: initialRecord.snapshot.invocations,
        })}\n`, "utf8");

        const failure = await new JsonlSessionStore({directory: path}).read(created.metadata.sessionId).then(
            () => undefined,
            (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).name).toBe("SessionInvariantError");
    });

    test("可选 delta + checkpoint 格式恢复一致，并减少重复 Snapshot", async () => {
        const checkpointPath = await directory();
        const checkpointStore = new JsonlSessionStore({directory: checkpointPath, checkpointEvery: 5});
        const created = await checkpointStore.create({profileKey: "p", initial: null, hostContext: {}});
        let version = 0;
        for (let index = 0; index < 12; index += 1) {
            const result = await checkpointStore.commit({
                target: created.metadata.sessionId,
                expectedVersion: version,
                cause: `checkpoint.${index}`,
                operations: [{type: "appendEntries", entries: [{kind: "data", payload: `${index}:${"x".repeat(100)}`}]}],
            });
            version = result.snapshot.version;
        }
        const restored = await new JsonlSessionStore({directory: checkpointPath, checkpointEvery: 5}).read(created.metadata.sessionId);
        expect(restored.version).toBe(12);
        expect(restored.entries).toHaveLength(12);
        const checkpointFile = join(checkpointPath, "sessions", `${created.metadata.sessionId}.jsonl`);
        const records = (await readFile(checkpointFile, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line) as {kind: string});
        expect(records.map((record) => record.kind)).toEqual([
            "snapshot", "commit", "commit", "commit", "commit", "snapshot",
            "commit", "commit", "commit", "commit", "snapshot", "commit", "commit",
        ]);

        const snapshotPath = await directory();
        const snapshotStore = new JsonlSessionStore({directory: snapshotPath});
        const snapshotSession = await snapshotStore.create({profileKey: "p", initial: null, hostContext: {}});
        version = 0;
        for (let index = 0; index < 12; index += 1) {
            version = (await snapshotStore.commit({
                target: snapshotSession.metadata.sessionId,
                expectedVersion: version,
                cause: `snapshot.${index}`,
                operations: [{type: "appendEntries", entries: [{kind: "data", payload: `${index}:${"x".repeat(100)}`}]}],
            })).snapshot.version;
        }
        const snapshotFile = join(snapshotPath, "sessions", `${snapshotSession.metadata.sessionId}.jsonl`);
        expect((await stat(checkpointFile)).size).toBeLessThan((await stat(snapshotFile)).size);
    });
});
