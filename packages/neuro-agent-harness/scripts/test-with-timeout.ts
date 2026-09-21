import {resolve} from "node:path";

const DEFAULT_TIMEOUT_MS = 300_000;

/** 从环境变量读取总超时毫秒数；未设置或非法值时使用默认值。 */
function resolveTimeoutMs(): number {
    const raw = process.env.TEST_TIMEOUT_MS;
    if (raw === undefined) return DEFAULT_TIMEOUT_MS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
    return Math.floor(parsed);
}

/**
 * 进程级测试兜底（默认 test 脚本不使用本包装器）：bun test 用例级 timeout
 * 覆盖不到顶层挂起
 * （beforeAll/afterAll、模块顶层 await、dispose 挂死等），
 * 这里在总时限后强制终止整个测试进程并以 124 退出（GNU timeout 语义）。
 * 2026-08-12 第九十三轮：Windows 上经 Bun.spawn(stdio: inherit) 运行的
 * bun test 在尾部跨进程测试附近间歇性停滞（直接运行稳定通过），默认
 * `bun test --parallel=1` 不再经过本包装器；CI 或需要总时限的场景用
 * `bun run test:bounded`。
 */
async function main(): Promise<void> {
    const timeoutMs = resolveTimeoutMs();
    const child = Bun.spawn({
        // 串行执行测试文件（--parallel=1）：bun test 默认按 CPU 核数起
        // worker 进程，本机在 worker 内再 spawn bun/node 跨进程测试时会
        // 间歇性整体挂死（2026-08-12 第八十九轮排查，多次 900s 兜底触发；
        // 串行 42s 稳定通过）。串行只损失约 3-5s 墙钟，换取门禁确定性。
        cmd: [process.execPath, "test", "--parallel=1", ...process.argv.slice(2)],
        cwd: resolve(import.meta.dir, ".."),
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
        console.error(`[test-with-timeout] bun test 超过 ${timeoutMs}ms 仍未结束，已强制终止。`);
    }, timeoutMs);
    const exitCode = await child.exited;
    clearTimeout(timer);
    if (timedOut) process.exit(124);
    process.exit(exitCode ?? 1);
}

await main();
