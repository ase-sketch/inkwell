import {randomUUID} from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {resolveStateLogRoot, resolveStateWorkspaceRoot} from "nbook/server/runtime/installation-paths";
import {redactSensitiveText} from "nbook/server/utils/sensitive-text";

export {redactSensitiveText} from "nbook/server/utils/sensitive-text";

export type AppLogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type AppLogEntry = {
    timestamp: string;
    level: AppLogLevel;
    event: string;
    message?: string;
    data?: unknown;
    error?: unknown;
};

export type AppLogFileSummary = {
    path: string;
    name: string;
    size: number;
    mtimeMs: number;
};

export type AppLogStatus = {
    directory: string;
    currentFile: string;
    files: AppLogFileSummary[];
    fileCount: number;
    totalBytes: number;
    latestMtimeMs: number | null;
};

type AppFileLoggerOptions = {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    maxFileBytes?: number;
    retention?: number;
    maxAgeMs?: number;
    maxTotalBytes?: number;
    now?: () => Date;
};

const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_RETENTION = 8;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const CURRENT_SERVER_LOG_NAME = "server-current.jsonl";
const REDACTED = "[REDACTED]";
const MAX_STRING_LENGTH = 4000;
const MAX_ERROR_STACK_LENGTH = 12000;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 80;
const MAX_DEPTH = 6;
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|set-cookie|api[-_]?key|apikey|password|token|secret|credential|device[-_]?code|grant|recovery[-_]?code|backup[-_]?key|backup[-_]?keyring)/iu;

/**
 * 解析运行时日志目录。Windows portable 会通过环境变量显式指向 data/logs。
 */
export function resolveAppLogDirectory(options: Pick<AppFileLoggerOptions, "cwd" | "env"> = {}): string {
    const cwd = options.cwd ?? process.cwd();
    const env = options.env ?? process.env;
    const configured = env.NEURO_BOOK_LOG_DIR?.trim();
    if (configured) {
        return path.isAbsolute(configured) ? path.resolve(configured) : path.resolve(cwd, configured);
    }
    if (env.NODE_ENV === "production") {
        return resolveStateLogRoot(cwd, env);
    }
    return path.join(resolveStateWorkspaceRoot(cwd, env), ".nbook", "logs");
}

/**
 * 返回当前 server JSONL 文件路径。
 */
export function resolveCurrentServerLogPath(directory = resolveAppLogDirectory()): string {
    return path.join(directory, CURRENT_SERVER_LOG_NAME);
}

/**
 * 将未知值转成适合写入日志的安全结构，并移除常见密钥字段。
 */
export function sanitizeAppLogValue(input: unknown): unknown {
    return sanitizeValue(input, 0, new WeakSet<object>());
}

/**
 * 将未知错误序列化为日志安全对象。
 */
export function serializeAppLogError(error: unknown): unknown {
    if (error instanceof Error) {
        const output: Record<string, unknown> = {
            name: error.name,
            message: truncateString(redactSensitiveText(error.message), MAX_STRING_LENGTH),
        };
        if (error.stack) {
            output.stack = truncateString(redactSensitiveText(error.stack), MAX_ERROR_STACK_LENGTH);
        }
        if ("cause" in error && error.cause !== undefined) {
            output.cause = sanitizeAppLogValue(error.cause);
        }
        return output;
    }
    return sanitizeAppLogValue(error);
}

/**
 * 列出当前日志目录中的 server / launcher 日志。
 */
export async function listAppLogFiles(directory = resolveAppLogDirectory()): Promise<AppLogFileSummary[]> {
    const entries = await fs.readdir(directory, {withFileTypes: true}).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
    const files: AppLogFileSummary[] = [];
    for (const entry of entries) {
        if (!entry.isFile() || !isAppLogFileName(entry.name)) {
            continue;
        }
        const filePath = path.join(directory, entry.name);
        const stat = await fs.stat(filePath);
        files.push({
            path: filePath,
            name: entry.name,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
        });
    }
    return files.sort((left, right) => right.mtimeMs - left.mtimeMs || left.name.localeCompare(right.name));
}

/**
 * 汇总日志目录状态，供错误报告界面或 API 展示。
 */
export async function readAppLogStatus(directory = resolveAppLogDirectory()): Promise<AppLogStatus> {
    const files = await listAppLogFiles(directory);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    return {
        directory,
        currentFile: resolveCurrentServerLogPath(directory),
        files,
        fileCount: files.length,
        totalBytes,
        latestMtimeMs: files[0]?.mtimeMs ?? null,
    };
}

/**
 * JSONL 文件日志器。写入失败不应打断业务请求。
 */
export class AppFileLogger {
    private readonly directory: string;
    private readonly maxFileBytes: number;
    private readonly retention: number;
    private readonly maxAgeMs: number;
    private readonly maxTotalBytes: number;
    private readonly now: () => Date;
    private queue: Promise<void> = Promise.resolve();
    private initialPruneComplete = false;

    constructor(options: AppFileLoggerOptions = {}) {
        this.directory = resolveAppLogDirectory(options);
        this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
        this.retention = options.retention ?? DEFAULT_RETENTION;
        this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
        this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
        this.now = options.now ?? (() => new Date());
    }

    /**
     * 写 debug 级别诊断事件。
     */
    debug(event: string, data?: unknown, message?: string): Promise<void> {
        return this.write("debug", event, data, undefined, message);
    }

    /**
     * 写 info 级别诊断事件。
     */
    info(event: string, data?: unknown, message?: string): Promise<void> {
        return this.write("info", event, data, undefined, message);
    }

    /**
     * 写 warn 级别诊断事件。
     */
    warn(event: string, data?: unknown, message?: string): Promise<void> {
        return this.write("warn", event, data, undefined, message);
    }

    /**
     * 写 error 级别诊断事件。
     */
    error(event: string, data?: unknown, error?: unknown, message?: string): Promise<void> {
        return this.write("error", event, data, error, message);
    }

    /**
     * 写 fatal 级别诊断事件。
     */
    fatal(event: string, data?: unknown, error?: unknown, message?: string): Promise<void> {
        return this.write("fatal", event, data, error, message);
    }

    /**
     * 同步写 fatal 日志，用于即将崩溃的进程级异常路径。
     */
    fatalSync(event: string, data?: unknown, error?: unknown, message?: string): void {
        try {
            this.appendLineSync(this.formatLine("fatal", event, data, error, message));
        } catch {
            // 日志出口本身不可用时必须静默收口；再次写 stderr 会在断管时递归触发 EPIPE。
        }
    }

    /**
     * 等待当前日志写入队列清空，主要供测试使用。
     */
    async flush(): Promise<void> {
        await this.queue;
    }

    get logDirectory(): string {
        return this.directory;
    }

    get currentFilePath(): string {
        return resolveCurrentServerLogPath(this.directory);
    }

    private write(level: AppLogLevel, event: string, data?: unknown, error?: unknown, message?: string): Promise<void> {
        const line = this.formatLine(level, event, data, error, message);
        const task = this.queue.then(() => this.appendLine(line)).catch(() => undefined);
        this.queue = task.then(() => undefined, () => undefined);
        return task;
    }

    private formatLine(level: AppLogLevel, event: string, data?: unknown, error?: unknown, message?: string): string {
        const entry: AppLogEntry = {
            timestamp: this.now().toISOString(),
            level,
            event,
            ...(message ? {message: truncateString(redactSensitiveText(message), MAX_STRING_LENGTH)} : {}),
            ...(data !== undefined ? {data: sanitizeAppLogValue(data)} : {}),
            ...(error !== undefined ? {error: serializeAppLogError(error)} : {}),
        };
        return `${JSON.stringify(entry)}\n`;
    }

    private async appendLine(line: string): Promise<void> {
        await fs.mkdir(this.directory, {recursive: true});
        const nextBytes = Buffer.byteLength(line, "utf8");
        if (!this.initialPruneComplete) {
            const currentBytes = await currentLogBytes(this.currentFilePath);
            await pruneAppLogFiles(
                this.directory,
                this.retention - 1,
                this.maxTotalBytes - currentBytes - nextBytes,
                this.now().getTime() - this.maxAgeMs,
                this.currentFilePath,
            );
            this.initialPruneComplete = true;
        }
        await this.rotateIfNeeded(nextBytes);
        await fs.appendFile(this.currentFilePath, line, "utf8");
    }

    private appendLineSync(line: string): void {
        fsSync.mkdirSync(this.directory, {recursive: true});
        const nextBytes = Buffer.byteLength(line, "utf8");
        if (!this.initialPruneComplete) {
            const currentBytes = currentLogBytesSync(this.currentFilePath);
            pruneAppLogFilesSync(
                this.directory,
                this.retention - 1,
                this.maxTotalBytes - currentBytes - nextBytes,
                this.now().getTime() - this.maxAgeMs,
                this.currentFilePath,
            );
            this.initialPruneComplete = true;
        }
        this.rotateIfNeededSync(nextBytes);
        fsSync.appendFileSync(this.currentFilePath, line, "utf8");
    }

    private async rotateIfNeeded(nextBytes: number): Promise<void> {
        const stat = await fs.stat(this.currentFilePath).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (!stat || stat.size + nextBytes <= this.maxFileBytes) {
            return;
        }

        const rotatedName = `server-${formatLogTimestamp(this.now())}-${process.pid}-${randomUUID().slice(0, 8)}.jsonl`;
        await fs.rename(this.currentFilePath, path.join(this.directory, rotatedName)).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") {
                throw error;
            }
        });
        await pruneAppLogFiles(
            this.directory,
            this.retention - 1,
            this.maxTotalBytes - nextBytes,
            this.now().getTime() - this.maxAgeMs,
            this.currentFilePath,
        );
    }

    private rotateIfNeededSync(nextBytes: number): void {
        let size = 0;
        try {
            size = fsSync.statSync(this.currentFilePath).size;
        } catch (error) {
            if (!isNodeErrorCode(error, "ENOENT")) {
                throw error;
            }
            return;
        }
        if (size + nextBytes <= this.maxFileBytes) {
            return;
        }

        const rotatedName = `server-${formatLogTimestamp(this.now())}-${process.pid}-${randomUUID().slice(0, 8)}.jsonl`;
        try {
            fsSync.renameSync(this.currentFilePath, path.join(this.directory, rotatedName));
        } catch (error) {
            if (!isNodeErrorCode(error, "ENOENT")) {
                throw error;
            }
        }
        pruneAppLogFilesSync(
            this.directory,
            this.retention - 1,
            this.maxTotalBytes - nextBytes,
            this.now().getTime() - this.maxAgeMs,
            this.currentFilePath,
        );
    }
}

export const appLogger = new AppFileLogger();

/**
 * 回收非 current 的 server / launcher 日志，同时满足文件数、总字节与保留期预算。
 */
async function pruneAppLogFiles(
    directory: string,
    historicalRetention: number,
    historicalByteBudget: number,
    oldestMtimeMs: number,
    protectedPath: string,
): Promise<void> {
    const files = (await listAppLogFiles(directory)).filter((file) => file.path !== protectedPath);
    let keptFiles = 0;
    let keptBytes = 0;
    for (const file of files) {
        const exceedsBudget = keptFiles >= Math.max(0, historicalRetention)
            || keptBytes + file.size > Math.max(0, historicalByteBudget);
        if (exceedsBudget || file.mtimeMs < oldestMtimeMs) {
            await fs.rm(file.path, {force: true});
            continue;
        }
        keptFiles += 1;
        keptBytes += file.size;
    }
}

function pruneAppLogFilesSync(
    directory: string,
    historicalRetention: number,
    historicalByteBudget: number,
    oldestMtimeMs: number,
    protectedPath: string,
): void {
    const files = fsSync.readdirSync(directory, {withFileTypes: true})
        .filter((entry) => entry.isFile() && isAppLogFileName(entry.name))
        .map((entry) => {
            const filePath = path.join(directory, entry.name);
            const stat = fsSync.statSync(filePath);
            return {
                path: filePath,
                name: entry.name,
                size: stat.size,
                mtimeMs: stat.mtimeMs,
            };
        })
        .filter((file) => file.path !== protectedPath)
        .sort((left, right) => right.mtimeMs - left.mtimeMs || left.name.localeCompare(right.name));
    let keptFiles = 0;
    let keptBytes = 0;
    for (const file of files) {
        const exceedsBudget = keptFiles >= Math.max(0, historicalRetention)
            || keptBytes + file.size > Math.max(0, historicalByteBudget);
        if (exceedsBudget || file.mtimeMs < oldestMtimeMs) {
            fsSync.rmSync(file.path, {force: true});
            continue;
        }
        keptFiles += 1;
        keptBytes += file.size;
    }
}

async function currentLogBytes(filePath: string): Promise<number> {
    return await fs.stat(filePath).then((stat) => stat.size).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return 0;
        throw error;
    });
}

function currentLogBytesSync(filePath: string): number {
    try {
        return fsSync.statSync(filePath).size;
    } catch (error) {
        if (isNodeErrorCode(error, "ENOENT")) return 0;
        throw error;
    }
}

function isAppLogFileName(name: string): boolean {
    return name === CURRENT_SERVER_LOG_NAME
        || /^server-\d{8}-\d{6}-\d+-[a-f0-9]+\.jsonl$/iu.test(name)
        || /^launcher-\d{4}-\d{2}-\d{2}(?:-\d{6}-\d+-[a-f0-9]+)?\.log$/iu.test(name);
}

function sanitizeValue(input: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (input === null || input === undefined) {
        return input;
    }
    if (typeof input === "string") {
        return truncateString(redactSensitiveText(input), MAX_STRING_LENGTH);
    }
    if (typeof input === "number" || typeof input === "boolean") {
        return input;
    }
    if (typeof input === "bigint") {
        return input.toString();
    }
    if (typeof input === "symbol" || typeof input === "function") {
        return `[${typeof input}]`;
    }
    if (input instanceof Date) {
        return input.toISOString();
    }
    if (input instanceof Error) {
        return serializeAppLogError(input);
    }
    if (depth >= MAX_DEPTH) {
        return "[MaxDepth]";
    }
    if (Array.isArray(input)) {
        return input.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1, seen));
    }
    if (typeof input === "object") {
        if (seen.has(input)) {
            return "[Circular]";
        }
        seen.add(input);
        const output: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(input).slice(0, MAX_OBJECT_KEYS)) {
            output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeValue(value, depth + 1, seen);
        }
        seen.delete(input);
        return output;
    }
    return String(input);
}

function truncateString(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function isNodeErrorCode(error: unknown, code: string): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function formatLogTimestamp(date: Date): string {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}-${hour}${minute}${second}`;
}
