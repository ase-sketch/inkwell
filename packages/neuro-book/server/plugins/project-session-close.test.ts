import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
    shutdown: vi.fn(async () => undefined),
}));

vi.mock("nitropack/runtime", () => ({
    defineNitroPlugin: (plugin: unknown) => plugin,
}));

vi.mock("nbook/server/runtime/shutdown/product-shutdown", () => ({
    productShutdownController: {shutdown: mocks.shutdown},
}));

import projectSessionClosePlugin from "nbook/server/plugins/project-session-close";

describe("Project runtime shutdown plugin", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.shutdown.mockResolvedValue(undefined);
    });

    it("Nitro close同时收口Agent、ProjectSession与plain Workspace File Index", async () => {
        const close = installCloseHook();

        await close();

        expect(mocks.shutdown).toHaveBeenCalledTimes(1);
    });

    it("前序关闭失败时仍尝试全部资源并汇总失败", async () => {
        const shutdownFailure = new AggregateError([new Error("agent shutdown failed")], "shutdown failed");
        mocks.shutdown.mockRejectedValue(shutdownFailure);
        const close = installCloseHook();

        await expect(close()).rejects.toBe(shutdownFailure);
        expect(mocks.shutdown).toHaveBeenCalledTimes(1);
    });
});

/** 安装Nitro close hook并返回其真实关闭回调。 */
function installCloseHook(): () => Promise<void> {
    let close: (() => Promise<void>) | null = null;
    const plugin = projectSessionClosePlugin as unknown as (app: {
        hooks: {hook(name: "close", handler: () => Promise<void>): void};
    }) => void;
    plugin({
        hooks: {
            hook(name, handler): void {
                expect(name).toBe("close");
                close = handler;
            },
        },
    });
    if (!close) {
        throw new Error("Project runtime shutdown plugin未注册close hook");
    }
    return close;
}
