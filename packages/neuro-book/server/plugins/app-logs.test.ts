import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
    addReporter: vi.fn(),
    setReporters: vi.fn(),
    info: vi.fn(async () => undefined),
    warn: vi.fn(async () => undefined),
    error: vi.fn(async () => undefined),
}));

vi.mock("consola", () => ({
    consola: {
        addReporter: mocks.addReporter,
        setReporters: mocks.setReporters,
    },
}));
vi.mock("nbook/server/app-logs/logger", () => ({
    appLogger: {
        info: mocks.info,
        warn: mocks.warn,
        error: mocks.error,
        fatalSync: vi.fn(),
        logDirectory: "C:/state/logs",
        currentFilePath: "C:/state/logs/server-current.jsonl",
    },
}));

describe("app logs production bridge", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal("defineNitroPlugin", (plugin: unknown) => plugin);
        vi.stubEnv("NODE_ENV", "production");
        delete (globalThis as typeof globalThis & {__nbookAppLogsInstalled?: boolean}).__nbookAppLogsInstalled;
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("production 只安装 JSONL reporter 且不调用原始 console", async () => {
        const originalWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const originalError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const plugin = (await import("nbook/server/plugins/app-logs")).default;
        plugin();

        expect(mocks.setReporters).toHaveBeenCalledOnce();
        expect(mocks.addReporter).not.toHaveBeenCalled();
        console.warn("断管警告");
        console.error("断管错误");
        await Promise.resolve();
        expect(originalWarn).not.toHaveBeenCalled();
        expect(originalError).not.toHaveBeenCalled();
        expect(mocks.warn).toHaveBeenCalledWith("console.warn", {args: ["断管警告"]}, "断管警告");
        expect(mocks.error).toHaveBeenCalledWith("console.error", {args: ["断管错误"]}, undefined, "断管错误");
    });
});
