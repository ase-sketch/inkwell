import {describe, expect, test} from "bun:test";
import {resolve} from "node:path";

type DriverProcess = ReturnType<typeof Bun.spawn>;

async function stopDriver(child: DriverProcess): Promise<void> {
    if (process.platform === "win32") {
        try {
            const killer = Bun.spawn({
                cmd: ["taskkill", "/PID", String(child.pid), "/T", "/F"],
                stdout: "ignore",
                stderr: "ignore",
            });
            await killer.exited;
        } catch {
            child.kill("SIGKILL");
        }
    } else {
        child.kill("SIGKILL");
    }
    await Promise.race([child.exited, new Promise((resolvePromise) => setTimeout(resolvePromise, 1000))]);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise((resolvePromise, reject) => {
        const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolvePromise(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

// 第一百零九轮：真实 HTTP SSE 边界（宿主 adapter 形状）。
// bun test 进程内直跑 Bun.serve 在本环境不稳定，故 worker 与驱动脚本作为
// fixture 子进程运行；本测试只启动驱动并断言其输出标记。
describe("真实 HTTP SSE Transport 边界（fixture 驱动）", () => {
    test("首连全量 + Last-Event-ID 续传只收新事件", async () => {
        const workerPath = resolve(import.meta.dir, "fixtures/sse-http-worker.ts");
        const driverPath = resolve(import.meta.dir, "fixtures/sse-http-driver.ts");
        const proc = Bun.spawn({
            cmd: [process.execPath, driverPath],
            stdout: "pipe",
            stderr: "pipe",
            env: {...process.env, NEURO_HARNESS_WORKER: workerPath},
        });
        try {
            const [stdout, stderr, exitCode] = await withTimeout(Promise.all([
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text(),
                proc.exited,
            ]), 55000, "SSE driver 超时");
            if (exitCode !== 0) {
                throw new Error("driver 失败 exit=" + exitCode + "\nstderr: " + stderr.slice(-2000) + "\nstdout: " + stdout.slice(-2000));
            }
            expect(stdout).toContain("FIRST_OK");
            expect(stdout).toContain("SECOND_OK");
            expect(stdout).toContain("STOP_OK");
        } finally {
            await stopDriver(proc);
        }
    }, 60000);
});
