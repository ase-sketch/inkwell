import {existsSync} from "node:fs";
import {join} from "node:path";

/** Bundles one worker fixture into a temporary Node ESM file. */
export async function bundleWorker(
    directory: string,
    fixtureName: string,
    outputName: string,
): Promise<string> {
    const result = await Bun.build({
        entrypoints: [join(import.meta.dir, fixtureName)],
        outdir: directory,
        naming: outputName,
        target: "node",
        format: "esm",
    });
    if (!result.success) {
        throw new Error(`${fixtureName} bundle 失败：${result.logs.map((log) => log.message).join("\n")}`);
    }
    const bundled = result.outputs[0]?.path;
    if (!bundled || !existsSync(bundled)) {
        throw new Error(`${fixtureName} bundle 输出缺失`);
    }
    return bundled;
}

export type WorkerOutcome = {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
};

/** Spawns one worker with a single bounded deadline; kills and awaits exit on timeout. */
export async function runWorkerWithTimeout(
    executable: string,
    workerPath: string,
    args: readonly string[],
    timeoutMs = 30_000,
): Promise<WorkerOutcome> {
    const child = Bun.spawn({
        cmd: [executable, workerPath, ...args],
        stdout: "pipe",
        stderr: "pipe",
    });
    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];
    const collect = async (stream: ReadableStream<Uint8Array>, chunks: Uint8Array[]): Promise<void> => {
        try {
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
        } catch {
            // 管道被 kill 关闭时忽略读取错误，保留已收集部分。
        }
    };
    const collecting = Promise.all([
        collect(child.stdout, stdoutChunks),
        collect(child.stderr, stderrChunks),
    ]);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const decode = () => ({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
    });
    try {
        await Promise.race([
            child.exited,
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => {
                    child.kill();
                    void child.exited.finally(() => {
                        const partial = decode();
                        reject(new Error(
                            `worker 未在限定时间内退出：stdout=${partial.stdout} stderr=${partial.stderr}`,
                        ));
                    });
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }
    }
    await collecting;
    return {
        ...decode(),
        exitCode: await child.exited,
    };
}

/** Parses the first JSON stdout line with the expected status. */
export function parseWorkerMarker<TMarker extends {readonly status: string}>(
    stdout: string,
    status: TMarker["status"],
): TMarker | undefined {
    return stdout.trim().split(/\r?\n/)
        .map((line) => {
            try {
                return JSON.parse(line) as TMarker;
            } catch {
                return undefined;
            }
        })
        .find((value) => value?.status === status);
}

/** Bundles, spawns and parses one worker fixture in one bounded call. */
export async function runWorkerFixture<TMarker extends {readonly status: string}>(
    directory: string,
    fixtureName: string,
    outputName: string,
    args: readonly string[],
    expectedStatus: TMarker["status"],
): Promise<{marker: TMarker; stdout: string; stderr: string}> {
    const executable = Bun.which("node");
    if (!executable) {
        throw new Error("跨进程测试需要 Node.js");
    }
    const workerPath = await bundleWorker(directory, fixtureName, outputName);
    const {stdout, stderr, exitCode} = await runWorkerWithTimeout(executable, workerPath, args);
    if (exitCode !== 0) {
        throw new Error(`${fixtureName} 退出码 ${exitCode}：stdout=${stdout} stderr=${stderr}`);
    }
    const marker = parseWorkerMarker<TMarker>(stdout, expectedStatus);
    if (!marker) {
        throw new Error(`${fixtureName} 输出缺失：stdout=${stdout} stderr=${stderr}`);
    }
    return {marker, stdout, stderr};
}
