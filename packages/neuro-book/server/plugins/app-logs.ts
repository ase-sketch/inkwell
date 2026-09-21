import {consola} from "consola";
import {appLogger} from "nbook/server/app-logs/logger";

type ConsolaLogObject = {
    type?: string;
    level?: number;
    tag?: string;
    args?: unknown[];
};

const globalState = globalThis as typeof globalThis & {
    __nbookAppLogsInstalled?: boolean;
};

/**
 * 安装进程级日志桥接。热重载时只安装一次，避免重复写入。
 */
export default defineNitroPlugin(() => {
    if (globalState.__nbookAppLogsInstalled) {
        return;
    }
    globalState.__nbookAppLogsInstalled = true;

    const reporter = {
        log(logObject: ConsolaLogObject) {
            const level = resolveConsolaLevel(logObject);
            void safeLog(() => appLogger[level]("consola", {
                type: logObject.type,
                tag: logObject.tag,
                args: logObject.args ?? [],
            }));
        },
    };
    if (process.env.NODE_ENV === "production") {
        // Product 的父 stdout/stderr 可能随 supervisor 生命周期关闭；JSONL 是唯一稳定出口。
        consola.setReporters([reporter]);
    } else {
        consola.addReporter(reporter);
    }

    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);
    console.warn = (...args: unknown[]) => {
        if (process.env.NODE_ENV !== "production") {
            originalWarn(...args);
        }
        void safeLog(() => appLogger.warn("console.warn", {args}, formatConsoleArgs(args)));
    };
    console.error = (...args: unknown[]) => {
        if (process.env.NODE_ENV !== "production") {
            originalError(...args);
        }
        void safeLog(() => appLogger.error("console.error", {args}, firstErrorArg(args), formatConsoleArgs(args)));
    };

    process.on("unhandledRejection", (reason) => {
        appLogger.fatalSync("process.unhandledRejection", undefined, reason, "Unhandled promise rejection");
        setImmediate(() => {
            throw reason instanceof Error ? reason : new Error(`Unhandled promise rejection: ${String(reason)}`);
        });
    });
    process.on("uncaughtExceptionMonitor", (error) => {
        appLogger.fatalSync("process.uncaughtException", undefined, error, "Uncaught exception");
    });

    void safeLog(() => appLogger.info("app.logs.ready", {
        directory: appLogger.logDirectory,
        currentFile: appLogger.currentFilePath,
        nodeEnv: process.env.NODE_ENV ?? null,
    }));
});

async function safeLog(task: () => Promise<void>): Promise<void> {
    await Promise.resolve().then(task).catch(() => undefined);
}

function resolveConsolaLevel(logObject: ConsolaLogObject): "debug" | "info" | "warn" | "error" {
    if (logObject.type === "error" || logObject.type === "fatal") {
        return "error";
    }
    if (logObject.type === "warn") {
        return "warn";
    }
    if (typeof logObject.level === "number" && logObject.level >= 4) {
        return "debug";
    }
    return "info";
}

function firstErrorArg(args: unknown[]): unknown {
    return args.find((arg) => arg instanceof Error);
}

function formatConsoleArgs(args: unknown[]): string {
    return args.map((arg) => {
        if (arg instanceof Error) {
            return arg.message;
        }
        if (typeof arg === "string") {
            return arg;
        }
        return typeof arg;
    }).join(" ");
}
