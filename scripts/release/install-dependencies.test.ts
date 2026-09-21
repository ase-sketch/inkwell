import {describe, expect, it, vi} from "vitest";

import {
    installReleaseDependencies,
    isTransientInstallFailure,
    type InstallAttemptResult,
} from "#scripts/release/install-dependencies";

describe("Release dependency installation", () => {
    it("只把下载、网络和归档解压失败识别为可重试错误", () => {
        expect(isTransientInstallFailure([
            "error: Fail extracting tarball for \"@rolldown/binding-linux-x64-musl\"",
            "error: failed to download @rolldown/binding-linux-x64-musl@1.1.5",
        ].join("\n"))).toBe(true);
        expect(isTransientInstallFailure("error: socket hang up while downloading package")).toBe(true);
        expect(isTransientInstallFailure("error: lockfile had changes, but lockfile is frozen")).toBe(false);
        expect(isTransientInstallFailure("error: No version matching dependency")).toBe(false);
    });

    it("保留frozen合同并在瞬时错误后有限重试", async () => {
        const attempts: string[][] = [];
        const results: InstallAttemptResult[] = [
            {exitCode: 1, stdout: "", stderr: "error: failed to download package"},
            {exitCode: 0, stdout: "installed", stderr: ""},
        ];
        const sleep = vi.fn(async () => undefined);

        await installReleaseDependencies({
            linker: "hoisted",
            run: async (args) => {
                attempts.push(args);
                return results.shift()!;
            },
            sleep,
            writeOutput: () => undefined,
        });

        expect(attempts).toEqual([
            ["install", "--frozen-lockfile", "--linker", "hoisted"],
            ["install", "--frozen-lockfile", "--linker", "hoisted"],
        ]);
        expect(sleep).toHaveBeenCalledTimes(1);
    });

    it("确定性错误立即失败且不会被重试掩盖", async () => {
        const run = vi.fn(async (): Promise<InstallAttemptResult> => ({
            exitCode: 1,
            stdout: "",
            stderr: "error: lockfile had changes, but lockfile is frozen",
        }));

        await expect(installReleaseDependencies({
            run,
            sleep: async () => undefined,
            writeOutput: () => undefined,
        })).rejects.toThrow("依赖安装失败");
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("连续瞬时错误达到上限后传播最后一次失败", async () => {
        const run = vi.fn(async (): Promise<InstallAttemptResult> => ({
            exitCode: 1,
            stdout: "",
            stderr: "error: Fail extracting tarball for package",
        }));

        await expect(installReleaseDependencies({
            run,
            sleep: async () => undefined,
            writeOutput: () => undefined,
        })).rejects.toThrow("3 次尝试");
        expect(run).toHaveBeenCalledTimes(3);
    });
});
