import {randomUUID} from "node:crypto";
import {lstat, mkdir, readFile, readdir, rm, rmdir, writeFile} from "node:fs/promises";
import {hostname} from "node:os";
import {dirname, join} from "node:path";

const LOCK_WAIT_TIMEOUT_MS = 5_000;
const LOCK_POLL_INTERVAL_MS = 25;
const HEARTBEAT_INTERVAL_MS = 1_000;

export class JsonlLockError extends Error {
    operationCompleted: boolean | undefined;

    constructor(
        readonly lockPath: string,
        message: string,
    ) {
        super(message);
        this.name = "JsonlLockError";
        this.operationCompleted = undefined;
    }
}

export class JsonlLockBusyError extends JsonlLockError {
    constructor(lockPath: string) {
        super(lockPath, `JSONL Session lock 忙或未释放：${lockPath}`);
        this.name = "JsonlLockBusyError";
    }
}

export class JsonlLockCorruptError extends JsonlLockError {
    constructor(lockPath: string, detail: string) {
        super(lockPath, `JSONL Session lock 结构损坏：${lockPath}（${detail}）`);
        this.name = "JsonlLockCorruptError";
    }
}

export class JsonlLockLostError extends JsonlLockError {
    constructor(lockPath: string, detail: string) {
        super(lockPath, `JSONL Session lock 所有权丢失：${lockPath}（${detail}）`);
        this.name = "JsonlLockLostError";
    }
}

export class JsonlLockIoError extends JsonlLockError {
    readonly code: string | undefined;

    constructor(
        lockPath: string,
        readonly operation: string,
        error: unknown,
    ) {
        super(lockPath, `JSONL Session lock I/O 失败：${lockPath}（${operation}：${readErrorMessage(error)}）`);
        this.name = "JsonlLockIoError";
        this.code = readErrorCode(error);
        this.cause = error;
    }
}

export class JsonlSessionLock {
    private readonly ownerPath: string;
    private readonly metadataPath: string;
    private readonly heartbeatPath: string;
    private readonly token: string;
    private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    private heartbeatTail: Promise<void> = Promise.resolve();
    private heartbeatFailure: JsonlLockError | undefined;
    private released = false;

    private constructor(private readonly lockPath: string, token: string) {
        this.token = token;
        this.ownerPath = join(lockPath, `owner.${token}`);
        this.metadataPath = join(this.ownerPath, "owner.json");
        this.heartbeatPath = join(this.ownerPath, "heartbeat");
    }

    static async acquire(lockPath: string): Promise<JsonlSessionLock> {
        await mkdir(dirname(lockPath), {recursive: true}).catch((error: unknown) => {
            throw new JsonlLockIoError(lockPath, "创建 lock parent", error);
        });
        const lock = new JsonlSessionLock(lockPath, randomUUID());
        const deadline = performance.now() + LOCK_WAIT_TIMEOUT_MS;
        while (true) {
            try {
                await mkdir(lockPath);
                try {
                    await mkdir(lock.ownerPath);
                    await writeFile(lock.metadataPath, JSON.stringify({
                        token: lock.token,
                        pid: process.pid,
                        hostname: hostname(),
                        acquiredAt: Date.now(),
                    }) + "\n", {encoding: "utf8", flag: "wx"});
                    await lock.touchHeartbeat();
                    lock.heartbeatTimer = setInterval(() => {
                        lock.heartbeatTail = lock.heartbeatTail
                            .then(() => lock.touchHeartbeat())
                            .catch((error: unknown) => {
                                lock.heartbeatFailure = error instanceof JsonlLockError
                                    ? error
                                    : new JsonlLockIoError(lockPath, "写入 heartbeat", error);
                            });
                    }, HEARTBEAT_INTERVAL_MS);
                    return lock;
                } catch (error) {
                    await rm(lock.ownerPath, {recursive: true, force: true}).catch(() => undefined);
                    await rmdir(lockPath).catch(() => undefined);
                    throw error instanceof JsonlLockError
                        ? error
                        : new JsonlLockIoError(lockPath, "初始化 lock owner", error);
                }
            } catch (error) {
                if (error instanceof JsonlLockError) {
                    throw error;
                }
                if (readErrorCode(error) !== "EEXIST") {
                    throw new JsonlLockIoError(lockPath, "创建 lock root", error);
                }
                await assertExistingLockShape(lockPath);
                if (performance.now() >= deadline) {
                    throw new JsonlLockBusyError(lockPath);
                }
                await delay(LOCK_POLL_INTERVAL_MS);
            }
        }
    }

    async assertOwnedOnDisk(): Promise<void> {
        await this.heartbeatTail;
        if (this.released) {
            throw new JsonlLockLostError(this.lockPath, "lock 已经释放");
        }
        if (this.heartbeatFailure) {
            throw this.heartbeatFailure;
        }
        const root = await lstat(this.lockPath).catch((error: unknown) => {
            if (readErrorCode(error) === "ENOENT") {
                throw new JsonlLockLostError(this.lockPath, "lock root 不存在");
            }
            throw new JsonlLockIoError(this.lockPath, "检查 lock root", error);
        });
        if (!root.isDirectory()) {
            throw new JsonlLockCorruptError(this.lockPath, "lock root 不是目录");
        }
        const owner = await lstat(this.ownerPath).catch((error: unknown) => {
            if (readErrorCode(error) === "ENOENT") {
                throw new JsonlLockLostError(this.lockPath, "owner 目录不存在");
            }
            throw new JsonlLockIoError(this.lockPath, "检查 owner 目录", error);
        });
        if (!owner.isDirectory()) {
            throw new JsonlLockCorruptError(this.lockPath, "owner 不是目录");
        }
        const metadata = await readFile(this.metadataPath, "utf8").catch((error: unknown) => {
            if (readErrorCode(error) === "ENOENT") {
                throw new JsonlLockLostError(this.lockPath, "owner metadata 不存在");
            }
            throw new JsonlLockIoError(this.lockPath, "读取 owner metadata", error);
        });
        let parsed: unknown;
        try {
            parsed = JSON.parse(metadata);
        } catch {
            throw new JsonlLockCorruptError(this.lockPath, "owner metadata 不是有效 JSON");
        }
        if (!parsed || typeof parsed !== "object" || !("token" in parsed) || parsed.token !== this.token) {
            throw new JsonlLockLostError(this.lockPath, "owner token 不匹配");
        }
    }

    async release(): Promise<void> {
        if (this.released) {
            return;
        }
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        try {
            await this.heartbeatTail;
            await this.assertOwnedOnDisk();
            try {
                await rm(this.ownerPath, {recursive: true, force: false});
            } catch (error) {
                if (readErrorCode(error) === "ENOENT") {
                    throw new JsonlLockLostError(this.lockPath, "释放时 owner 目录已消失");
                }
                throw new JsonlLockIoError(this.lockPath, "释放 owner", error);
            }
            try {
                await rmdir(this.lockPath);
            } catch (error) {
                if (readErrorCode(error) === "ENOTEMPTY" || readErrorCode(error) === "EEXIST") {
                    throw new JsonlLockCorruptError(this.lockPath, "owner 释放后 lock root 仍非空");
                }
                if (readErrorCode(error) === "ENOENT") {
                    throw new JsonlLockLostError(this.lockPath, "释放时 lock root 已消失");
                }
                throw new JsonlLockIoError(this.lockPath, "释放 lock root", error);
            }
        } finally {
            this.released = true;
        }
    }

    private async touchHeartbeat(): Promise<void> {
        await writeFile(this.heartbeatPath, `${Date.now()}\n`, "utf8").catch((error: unknown) => {
            if (readErrorCode(error) === "ENOENT") {
                throw new JsonlLockLostError(this.lockPath, "heartbeat owner 目录不存在");
            }
            throw new JsonlLockIoError(this.lockPath, "写入 heartbeat", error);
        });
    }
}

export async function withJsonlSessionLock<TResult>(
    lockPath: string,
    task: (lock: JsonlSessionLock) => Promise<TResult>,
): Promise<TResult> {
    const lock = await JsonlSessionLock.acquire(lockPath);
    let result!: TResult;
    let taskError: unknown;
    try {
        result = await task(lock);
    } catch (error) {
        taskError = error;
    }
    try {
        await lock.release();
    } catch (releaseError) {
        const normalizedReleaseError = releaseError instanceof JsonlLockError
            ? releaseError
            : new JsonlLockError(lockPath, `释放 lock 失败：${readErrorMessage(releaseError)}`);
        normalizedReleaseError.operationCompleted = taskError === undefined;
        if (taskError !== undefined) {
            throw new AggregateError([taskError, normalizedReleaseError], "JSONL operation 与 lock release 均失败");
        }
        throw normalizedReleaseError;
    }
    if (taskError !== undefined) {
        throw taskError;
    }
    return result;
}

async function assertExistingLockShape(lockPath: string): Promise<void> {
    const root = await lstat(lockPath).catch((error: unknown) => {
        if (readErrorCode(error) === "ENOENT") {
            return undefined;
        }
        throw new JsonlLockIoError(lockPath, "检查现有 lock root", error);
    });
    if (!root) {
        return;
    }
    if (!root.isDirectory()) {
        throw new JsonlLockCorruptError(lockPath, "lock root 不是目录");
    }
    const entries = await readdir(lockPath, {withFileTypes: true}).catch((error: unknown) => {
        if (readErrorCode(error) === "ENOENT") {
            return undefined;
        }
        throw new JsonlLockIoError(lockPath, "读取现有 lock root", error);
    });
    if (!entries) {
        return;
    }
    const owners = entries.filter((entry) => entry.name.startsWith("owner."));
    const unknown = entries.filter((entry) => !entry.name.startsWith("owner."));
    if (unknown.length > 0) {
        throw new JsonlLockCorruptError(lockPath, `存在未知条目：${unknown.map((entry) => entry.name).join(",")}`);
    }
    if (owners.length > 1) {
        throw new JsonlLockCorruptError(lockPath, "存在多个 owner");
    }
    if (owners.length === 1 && !owners[0]!.isDirectory()) {
        throw new JsonlLockCorruptError(lockPath, "owner 不是目录");
    }
}

function readErrorCode(error: unknown): string | undefined {
    return error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
}

function readErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
