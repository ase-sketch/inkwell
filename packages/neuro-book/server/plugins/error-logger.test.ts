import {beforeEach, describe, expect, it, vi} from "vitest";

describe("error logger plugin", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.stubGlobal("defineNitroPlugin", (plugin: unknown) => plugin);
    });

    it("logs request errors with pathname only and strips current query from error text", async () => {
        const loggerError = vi.fn();
        vi.doMock("nbook/server/app-logs/logger", () => ({
            appLogger: {
                error: loggerError,
            },
        }));
        vi.doMock("h3", () => ({
            getRequestURL: vi.fn(() => new URL("http://localhost/api/fail?q=小说正文片段")),
        }));

        let errorHook: ((error: unknown, context: {event?: {method?: string; path?: string}}) => void) | null = null;
        const nitroApp = {
            hooks: {
                hook: vi.fn((name: string, callback: typeof errorHook) => {
                    expect(name).toBe("error");
                    errorHook = callback;
                }),
            },
        };

        const plugin = (await import("nbook/server/plugins/error-logger")).default;
        plugin(nitroApp as never);

        const error = new Error("Cannot find any path matching /api/fail?q=小说正文片段.");
        error.stack = "Error: Cannot find any path matching /api/fail?q=小说正文片段.";
        errorHook?.(error, {event: {method: "GET", path: "/api/fail?q=小说正文片段"}});

        expect(loggerError).toHaveBeenCalledOnce();
        const [eventName, data, loggedError, message] = loggerError.mock.calls[0];
        expect(eventName).toBe("server.request.error");
        expect(data).toMatchObject({
            method: "GET",
            path: "/api/fail",
            message: "Cannot find any path matching /api/fail.",
        });
        expect(loggedError).toMatchObject({
            message: "Cannot find any path matching /api/fail.",
            stack: "Error: Cannot find any path matching /api/fail.",
        });
        expect(message).toBe("服务端请求失败: GET /api/fail");
        expect(JSON.stringify(loggerError.mock.calls[0])).not.toContain("小说正文片段");
    });
});
