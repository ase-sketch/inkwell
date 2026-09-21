import {afterEach, describe, expect, test} from "bun:test";
import {existsSync} from "node:fs";
import {mkdir, mkdtemp, readdir, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {JsonlLockBusyError, JsonlLockCorruptError, JsonlLockError, JsonlLockIoError, JsonlLockLostError, JsonlSessionStore} from "../src/storage/jsonl.js";
import {JsonlSessionLock, withJsonlSessionLock} from "../src/storage/jsonl-lock.js";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

async function directory(): Promise<string> {
    const value = await mkdtemp(join(tmpdir(), "neuro-agent-harness-lock-"));
    directories.push(value);
    return value;
}

async function buildNodeWorker(path: string): Promise<string> {
    const output = join(path, "jsonl-lock-crash-worker-node.mjs");
    const result = await Bun.build({
        entrypoints: [join(import.meta.dir, "fixtures", "jsonl-lock-crash-worker-node.ts")],
        outdir: path,
        naming: "jsonl-lock-crash-worker-node.mjs",
        target: "node",
        format: "esm",
    });
    if (!result.success) {
        throw new Error(`Node lock worker bundle 失败：${result.logs.map((log) => log.message).join("\n")}`);
    }
    const bundled = result.outputs[0]?.path;
    if (!bundled || !existsSync(bundled)) {
        throw new Error(`Node lock worker bundle 输出缺失：requested=${output} actual=${bundled ?? "undefined"}`);
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

async function holdWindowsFileExclusively(filePath: string, path: string, label: string): Promise<{
    signalRelease(): Promise<void>;
    wait(): Promise<void>;
}> {
    const readyFile = join(path, `${label}.ready`);
    const releaseFile = join(path, `${label}.release`);
    const powershell = Bun.which("pwsh") ?? Bun.which("powershell");
    if (!powershell) throw new Error("Windows sharing violation 测试需要 PowerShell");
    const child = Bun.spawn({
        cmd: [
            powershell,
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            [
                "$stream = [System.IO.File]::Open($env:NAH_LOCK_FILE, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)",
                "try {",
                "  [System.IO.File]::WriteAllText($env:NAH_LOCK_READY, 'ready')",
                "  while (-not [System.IO.File]::Exists($env:NAH_LOCK_RELEASE)) { Start-Sleep -Milliseconds 10 }",
                "} finally { $stream.Dispose() }",
            ].join("\n"),
        ],
        env: {
            ...process.env,
            NAH_LOCK_FILE: filePath,
            NAH_LOCK_READY: readyFile,
            NAH_LOCK_RELEASE: releaseFile,
        },
        stdout: "pipe",
        stderr: "pipe",
    });
    await waitForFile(readyFile);
    let waitPromise: Promise<void> | undefined;
    return {
        signalRelease: async () => {
            await writeFile(releaseFile, "release", "utf8");
        },
        wait: () => {
            waitPromise ??= (async () => {
                const [stdout, stderr, exitCode] = await Promise.all([
                    new Response(child.stdout).text(),
                    new Response(child.stderr).text(),
                    child.exited,
                ]);
                if (exitCode !== 0) {
                    throw new Error(`PowerShell sharing holder 失败：exit=${exitCode} stdout=${stdout} stderr=${stderr}`);
                }
            })();
            return waitPromise;
        },
    };
}

describe("JsonlSessionLock lifecycle", () => {
    test("owner 在 acquire 后崩溃时，后续 commit fail closed 为 busy", async () => {
        const path = await directory();
        const store = new JsonlSessionStore({directory: path});
        const created = await store.create({profileKey: "p", initial: null, hostContext: {}});
        const lockPath = join(path, "sessions", `${created.metadata.sessionId}.jsonl.lock`);
        const readyFile = join(path, "worker-ready");
        const workerPath = await buildNodeWorker(path);
        const node = Bun.which("node");
        if (!node) throw new Error("lock crash 测试需要 Node.js");

        const worker = Bun.spawn({
            cmd: [node, workerPath, lockPath, readyFile],
            stdout: "pipe",
            stderr: "pipe",
        });
        await waitForFile(readyFile);
        expect(await worker.exited).toBe(0);
        expect(existsSync(lockPath)).toBe(true);
        expect((await readdir(lockPath)).some((name) => name.startsWith("owner."))).toBe(true);

        const failure = await store.commit({
            target: created.metadata.sessionId,
            expectedVersion: 0,
            cause: "test.crashed-owner",
            operations: [{type: "appendEntries", entries: [{kind: "value", payload: 1}]}],
        }).then(
            () => undefined,
            (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(JsonlLockBusyError);
        expect((await store.read(created.metadata.sessionId)).version).toBe(0);
    }, 15_000);

    test("原 owner 晚释放时不会删除 contender 的 lock", async () => {
        const path = await directory();
        const lockPath = join(path, "session.jsonl.lock");
        const original = await JsonlSessionLock.acquire(lockPath);

        await rm(lockPath, {recursive: true, force: true});
        const contender = await JsonlSessionLock.acquire(lockPath);
        await expect(original.assertOwnedOnDisk()).rejects.toBeInstanceOf(JsonlLockLostError);
        const failure = await original.release().then(
            () => undefined,
            (error: unknown) => error,
        );

        expect(failure).toBeInstanceOf(JsonlLockLostError);
        expect(existsSync(lockPath)).toBe(true);
        expect((await readdir(lockPath)).filter((name) => name.startsWith("owner."))).toHaveLength(1);

        await contender.release();
        expect(existsSync(lockPath)).toBe(false);
    });

    test("正常 release 可幂等调用且不留下 lock root", async () => {
        const path = await directory();
        const lockPath = join(path, "idempotent.jsonl.lock");
        const owner = await JsonlSessionLock.acquire(lockPath);

        await owner.release();
        await owner.release();

        expect(existsSync(lockPath)).toBe(false);
    });

    test("owner token 丢失时 assertOwnedOnDisk 分类为 JsonlLockLostError", async () => {
        const path = await directory();
        const lockPath = join(path, "session.jsonl.lock");
        const owner = await JsonlSessionLock.acquire(lockPath);
        const ownerDirectory = (await readdir(lockPath)).find((name) => name.startsWith("owner."));
        if (!ownerDirectory) throw new Error("测试 lock 缺少 owner");

        await rm(join(lockPath, ownerDirectory), {recursive: true, force: true});
        await expect(owner.assertOwnedOnDisk()).rejects.toBeInstanceOf(JsonlLockLostError);
        expect(existsSync(lockPath)).toBe(true);
    });

    test.skipIf(process.platform !== "win32")("Windows metadata sharing violation 不伪装成 ownership lost", async () => {
        const path = await directory();
        const lockPath = join(path, "windows-sharing.jsonl.lock");
        const owner = await JsonlSessionLock.acquire(lockPath);
        const ownerDirectory = (await readdir(lockPath)).find((name) => name.startsWith("owner."));
        if (!ownerDirectory) throw new Error("测试 lock 缺少 owner");
        const metadataPath = join(lockPath, ownerDirectory, "owner.json");
        const holder = await holdWindowsFileExclusively(metadataPath, path, "metadata-share-holder");
        try {
            const releaseTimer = setTimeout(() => {
                void holder.signalRelease().catch(() => undefined);
            }, 250);
            const failure = await owner.assertOwnedOnDisk().then(
                () => undefined,
                (error: unknown) => error,
            );
            clearTimeout(releaseTimer);
            expect(failure).toBeInstanceOf(JsonlLockIoError);
            expect((failure as JsonlLockIoError).operation).toBe("读取 owner metadata");
            expect((failure as JsonlLockIoError).code).toBe("EBUSY");
        } finally {
            await holder.signalRelease();
            await holder.wait();
            await owner.release();
        }
    }, 15_000);

    test.skipIf(process.platform !== "win32")("Windows heartbeat sharing violation 保留 JsonlLockIoError taxonomy", async () => {
        const path = await directory();
        const lockPath = join(path, "windows-heartbeat-sharing.jsonl.lock");
        const owner = await JsonlSessionLock.acquire(lockPath);
        const ownerDirectory = (await readdir(lockPath)).find((name) => name.startsWith("owner."));
        if (!ownerDirectory) throw new Error("测试 lock 缺少 owner");
        const heartbeatPath = join(lockPath, ownerDirectory, "heartbeat");
        const holder = await holdWindowsFileExclusively(heartbeatPath, path, "heartbeat-share-holder");
        try {
            await new Promise<void>((resolve) => setTimeout(resolve, 1_200));
            const failure = await owner.assertOwnedOnDisk().then(
                () => undefined,
                (error: unknown) => error,
            );
            expect(failure).toBeInstanceOf(JsonlLockIoError);
            expect((failure as JsonlLockIoError).operation).toBe("写入 heartbeat");
            expect((failure as JsonlLockIoError).code).toBe("EBUSY");
        } finally {
            await holder.signalRelease();
            await holder.wait();
            await owner.release().catch(() => undefined);
            await rm(lockPath, {recursive: true, force: true});
        }
    }, 15_000);

    test("未知 lock 条目和多个 owner 分类为 JsonlLockCorruptError", async () => {
        const path = await directory();
        const unknownLockPath = join(path, "unknown.jsonl.lock");
        await mkdir(unknownLockPath, {recursive: true});
        await writeFile(join(unknownLockPath, "unexpected"), "corrupt", "utf8");
        await expect(JsonlSessionLock.acquire(unknownLockPath)).rejects.toBeInstanceOf(JsonlLockCorruptError);

        const multipleOwnerLockPath = join(path, "multiple-owner.jsonl.lock");
        await mkdir(join(multipleOwnerLockPath, "owner.a"), {recursive: true});
        await mkdir(join(multipleOwnerLockPath, "owner.b"), {recursive: true});
        await expect(JsonlSessionLock.acquire(multipleOwnerLockPath)).rejects.toBeInstanceOf(JsonlLockCorruptError);
    });

    test("release 原始错误被归一化，并保留 operationCompleted 语义", async () => {
        const path = await directory();
        const lockPath = join(path, "release-failure.jsonl.lock");
        const releaseFailure = await withJsonlSessionLock(lockPath, async (lock) => {
            const originalRelease = lock.release.bind(lock);
            lock.release = async () => {
                await originalRelease();
                throw new Error("injected release failure");
            };
            return "completed";
        }).then(
            () => undefined,
            (error: unknown) => error,
        );

        expect(releaseFailure).toBeInstanceOf(JsonlLockError);
        expect((releaseFailure as JsonlLockError).operationCompleted).toBe(true);
        expect((releaseFailure as Error).message).toContain("injected release failure");
        expect(existsSync(lockPath)).toBe(false);

        const taskFailure = new Error("task failure");
        const aggregate = await withJsonlSessionLock(lockPath, async (lock) => {
            const originalRelease = lock.release.bind(lock);
            lock.release = async () => {
                await originalRelease();
                throw new Error("second release failure");
            };
            throw taskFailure;
        }).then(
            () => undefined,
            (error: unknown) => error,
        );
        expect(aggregate).toBeInstanceOf(AggregateError);
        expect((aggregate as AggregateError).message).toBe("JSONL operation 与 lock release 均失败");
        const releaseError = (aggregate as AggregateError).errors[1];
        expect(releaseError).toBeInstanceOf(JsonlLockError);
        expect((releaseError as JsonlLockError).operationCompleted).toBe(false);
    });
});
