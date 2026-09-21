#!/usr/bin/env bun
import process from "node:process";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2_000, 10_000] as const;

export type InstallAttemptResult = {
    exitCode: number;
    stdout: string;
    stderr: string;
};

type InstallDependenciesOptions = {
    linker?: "hoisted";
    run?: (args: string[]) => Promise<InstallAttemptResult>;
    sleep?: (milliseconds: number) => Promise<void>;
    writeOutput?: (result: InstallAttemptResult) => void;
};

const TRANSIENT_INSTALL_FAILURES = [
    /fail(?:ed)? extracting tarball/u,
    /failed to download/u,
    /(?:econnreset|etimedout|eai_again|enetunreach|socket hang up|connection reset)/u,
    /(?:unexpected end of file|err_tar_bad_archive|tar_bad_archive|z_data_error)/u,
    /(?:http|https)[^\r\n]*\b(?:408|425|429|500|502|503|504)\b/u,
] as const;

/** 只把重新下载即可恢复的网络或归档错误识别为瞬时失败。 */
export function isTransientInstallFailure(output: string): boolean {
    const normalized = output.toLowerCase();
    return TRANSIENT_INSTALL_FAILURES.some((pattern) => pattern.test(normalized));
}

/**
 * 为正式 Release checkout 安装完整依赖。
 * frozen lockfile 是固定合同；只有明确的瞬时下载错误最多尝试三次。
 */
export async function installReleaseDependencies(options: InstallDependenciesOptions = {}): Promise<void> {
    const run = options.run ?? runInstallAttempt;
    const sleep = options.sleep ?? Bun.sleep;
    const writeOutput = options.writeOutput ?? writeAttemptOutput;
    const args = ["install", "--frozen-lockfile"];
    if (options.linker === "hoisted") args.push("--linker", "hoisted");

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const result = await run(args);
        writeOutput(result);
        if (result.exitCode === 0) return;

        const output = `${result.stdout}\n${result.stderr}`;
        const transient = isTransientInstallFailure(output);
        if (!transient) {
            throw installError(`依赖安装失败，错误不属于可重试的网络或归档故障`, attempt, result);
        }
        if (attempt === MAX_ATTEMPTS) {
            throw installError(`依赖安装在 ${MAX_ATTEMPTS} 次尝试后仍失败`, attempt, result);
        }

        const delay = RETRY_DELAYS_MS[attempt - 1]!;
        console.warn(`依赖下载或归档解压出现瞬时错误，${delay / 1_000} 秒后重试（${attempt + 1}/${MAX_ATTEMPTS}）。`);
        await sleep(delay);
    }
}

/** 在当前 Bun、checkout 和环境内执行一次 frozen install。 */
async function runInstallAttempt(args: string[]): Promise<InstallAttemptResult> {
    const child = Bun.spawn([process.execPath, ...args], {
        cwd: process.cwd(),
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    return {exitCode, stdout, stderr};
}

/** 保留 Bun 的原始 stdout/stderr，方便 Actions 日志定位最终失败包。 */
function writeAttemptOutput(result: InstallAttemptResult): void {
    if (result.stdout.length > 0) process.stdout.write(result.stdout);
    if (result.stderr.length > 0) process.stderr.write(result.stderr);
}

/** 生成包含最后一次原始错误的稳定失败。 */
function installError(message: string, attempt: number, result: InstallAttemptResult): Error {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
    return new Error(`${message}（第 ${attempt} 次，exit code ${result.exitCode}）：\n${detail}`);
}

/** CLI 只允许 Release workflow 当前需要的 hoisted linker 变体。 */
function parseLinker(args: string[]): "hoisted" | undefined {
    if (args.length === 0) return undefined;
    if (args.length === 2 && args[0] === "--linker" && args[1] === "hoisted") return "hoisted";
    throw new Error("用法：bun scripts/release/install-dependencies.ts [--linker hoisted]");
}

if (import.meta.main) {
    await installReleaseDependencies({linker: parseLinker(process.argv.slice(2))});
}
