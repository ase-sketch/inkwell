#!/usr/bin/env bun
import {execFile, spawn} from "node:child_process";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {promisify} from "node:util";
import {Command} from "commander";
import * as p from "@clack/prompts";

const DEFAULT_APP_IMAGE = "ghcr.io/notnotype/neuro-book";
const execFileAsync = promisify(execFile);

const program = new Command()
    .name("publish-ghcr-image")
    .description("Build and push one NeuroBook app candidate image to GHCR.")
    .requiredOption("--candidate <id>", "Candidate identity; output tag is always candidate-<id>.")
    .option("--app-image <name>", "Target app image name.", process.env.NEURO_BOOK_APP_IMAGE ?? DEFAULT_APP_IMAGE)
    .option("--platform <platform>", "Docker build platform.", process.env.NEURO_BOOK_IMAGE_PLATFORM ?? "linux/amd64")
    .option("--revision <sha>", "Source revision embedded in the Product Runtime Image.", process.env.NEURO_BOOK_SOURCE_REVISION)
    .option("--dry-run", "Print the docker buildx commands without running them.", false);

/** 运行外部命令，并把输出直接继承给当前终端。 */
function run(command, args, options = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            stdio: options.stdio ?? "inherit",
        });

        child.on("error", (error) => {
            rejectPromise(new Error(`命令不可用或启动失败：${command}\n${error.message}`));
        });

        child.on("exit", (code, signal) => {
            if (signal) {
                rejectPromise(new Error(`命令被信号中断：${command} ${signal}`));
                return;
            }

            if (code !== 0) {
                rejectPromise(new Error(`命令执行失败：${command} ${args.join(" ")}，退出码 ${code}`));
                return;
            }

            resolvePromise();
        });
    });
}

/** 检查本机 Docker buildx 是否可用。 */
async function checkDockerBuildx(dryRun) {
    if (dryRun) {
        return;
    }

    await run("docker", ["buildx", "version"], {stdio: "ignore"});
}

/** 把人工发布入口限制为不具备正式发现语义的候选 tag。 */
export function candidateTag(value) {
    const candidate = String(value ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,95}$/u.test(candidate)) {
        throw new Error(`Candidate identity无效：${candidate || "<missing>"}`);
    }
    return `candidate-${candidate}`;
}

/** 校验并规范化传给Git-less Product Runtime Image Builder的Source revision。 */
export function normalizeSourceRevision(value) {
    const revision = String(value ?? "").trim().toLowerCase();
    if (!/^[a-f0-9]{40,64}$/u.test(revision)) {
        throw new Error(`Source revision无效：${revision || "<missing>"}`);
    }
    return revision;
}

/** 优先消费显式revision；本地发布默认只接受干净Git HEAD。 */
export async function resolveSourceRevision(explicitRevision) {
    if (explicitRevision?.trim()) {
        return normalizeSourceRevision(explicitRevision);
    }

    try {
        const [{stdout: revisionOutput}, {stdout: statusOutput}] = await Promise.all([
            execFileAsync("git", ["rev-parse", "--verify", "HEAD"], {cwd: process.cwd(), encoding: "utf8", windowsHide: true}),
            execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {cwd: process.cwd(), encoding: "utf8", windowsHide: true}),
        ]);
        if (statusOutput.trim()) {
            throw new Error("本地Source存在未提交变更；请先提交，或从已验证的Source snapshot显式传入--revision。");
        }
        return normalizeSourceRevision(revisionOutput);
    } catch (error) {
        if (error instanceof Error && (error.message.includes("未提交变更") || error.message.includes("Source revision无效"))) {
            throw error;
        }
        throw new Error("无法读取Source revision；请在Git checkout中运行，或显式传入--revision。", {cause: error});
    }
}

/** 组装只能写候选 tag 的 docker buildx build --push 命令参数。 */
export function buildArgs({candidate, image, platform, sourceRevision}) {
    const args = ["buildx", "build", "--platform", platform, "--push"];

    if (sourceRevision) {
        args.push("--build-arg", `NEURO_BOOK_SOURCE_REVISION=${normalizeSourceRevision(sourceRevision)}`);
    }
    args.push("--file", "packages/neuro-book/Dockerfile");
    args.push("-t", `${image}:${candidateTag(candidate)}`);
    args.push(".");
    return args;
}

/** CLI 主流程。 */
async function main() {
    const options = program.opts();
    const sourceRevision = await resolveSourceRevision(options.revision);
    const command = buildArgs({
        candidate: options.candidate,
        image: options.appImage,
        platform: options.platform,
        sourceRevision,
    });

    p.intro("Publish NeuroBook candidate image to GHCR");
    await checkDockerBuildx(options.dryRun);

    if (options.dryRun) {
        p.log.info(`app candidate: docker ${command.join(" ")}`);
        p.outro("Dry run complete.");
        return;
    }

    p.log.info(`Pushing ${options.appImage}:${candidateTag(options.candidate)}`);
    await run("docker", command);
    p.outro(`Pushed ${options.appImage}:${candidateTag(options.candidate)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    program.parse();
    main().catch((error) => {
        p.log.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
