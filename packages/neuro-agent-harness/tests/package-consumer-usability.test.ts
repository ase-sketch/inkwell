import {mkdtemp, mkdir, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {describe, expect, test} from "bun:test";

const packageRoot = resolve(import.meta.dir, "..");
const fixturePath = resolve(import.meta.dir, "fixtures", "package-consumer.ts");

async function runCommand(
    command: string,
    args: readonly string[],
    cwd: string,
    label: string,
): Promise<string> {
    const child = Bun.spawn({
        cmd: [command, ...args],
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    if (exitCode !== 0) {
        throw new Error(label + " 失败（exitCode=" + exitCode + "）\\nstdout:\\n" + stdout + "\\nstderr:\\n" + stderr);
    }
    return stdout;
}

async function installTarball(npm: string, tarball: string, directory: string): Promise<void> {
    await runCommand(
        npm,
        ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", tarball],
        directory,
        "在 " + directory + " 安装 tarball",
    );
}

describe("安装后 package consumer usability", () => {
    test("同一个公开 consumer 在 Bun/Node tarball 安装后完成完整组合并可从 JSONL 重启恢复", async () => {
        const workspace = await mkdtemp(join(tmpdir(), "neuro-harness-package-consumer-"));
        try {
            const packDirectory = join(workspace, "pack");
            const bunConsumer = join(workspace, "bun-consumer");
            const nodeConsumer = join(workspace, "node-consumer");
            await Promise.all([mkdir(packDirectory), mkdir(bunConsumer), mkdir(nodeConsumer)]);

            const npm = Bun.which("npm");
            const node = Bun.which("node");
            if (!npm || !node) throw new Error("package consumer test 需要 npm 和 Node.js");

            await runCommand(process.execPath, ["run", "build"], packageRoot, "构建发布产物");
            await runCommand(npm, ["pack", "--ignore-scripts", "--pack-destination", packDirectory], packageRoot, "生成 npm tarball");
            const tarballName = (await readdir(packDirectory)).find((name) => name.endsWith(".tgz"));
            if (!tarballName) throw new Error("npm pack 未生成 tarball");
            const tarball = join(packDirectory, tarballName);

            const fixture = await Bun.file(fixturePath).text();
            const consumerPackage = JSON.stringify({private: true, type: "module"}, null, 4);
            await Promise.all([
                writeFile(join(bunConsumer, "package.json"), consumerPackage),
                writeFile(join(nodeConsumer, "package.json"), consumerPackage),
                writeFile(join(bunConsumer, "consumer.ts"), fixture),
                writeFile(join(nodeConsumer, "consumer.ts"), fixture),
                writeFile(join(nodeConsumer, "tsconfig.json"), JSON.stringify({
                    compilerOptions: {
                        target: "ES2023",
                        module: "NodeNext",
                        moduleResolution: "NodeNext",
                        strict: true,
                        skipLibCheck: false,
                        outDir: "dist",
                    },
                    include: ["consumer.ts"],
                }, null, 4)),
            ]);
            await installTarball(npm, tarball, bunConsumer);
            await installTarball(npm, tarball, nodeConsumer);

            const bunOutput = await runCommand(process.execPath, ["run", "consumer.ts"], bunConsumer, "Bun package consumer");
            expect(bunOutput).toContain("PACKAGE_CONSUMER_OK");

            const typescript = join(packageRoot, "node_modules", "typescript", "bin", "tsc");
            await runCommand(node, [typescript, "--project", "tsconfig.json"], nodeConsumer, "Node package consumer typecheck");
            const nodeOutput = await runCommand(node, [join(nodeConsumer, "dist", "consumer.js")], nodeConsumer, "Node package consumer");
            expect(nodeOutput).toContain("PACKAGE_CONSUMER_OK");
        } finally {
            await rm(workspace, {recursive: true, force: true});
        }
    }, 120_000);
});
