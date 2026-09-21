import {
    execFileSync,
    spawnSync,
} from "node:child_process";
import {
    mkdtempSync,
    mkdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 在仓库外、无 typescript 依赖的干净目录验证发布产物：
 * - 主入口 import 必须成功（typescript 是 optional，不能成为加载依赖）；
 * - extractCfg 缺失 typescript 时必须给出清晰错误而不是 MODULE_NOT_FOUND。
 */
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const tempRoot = mkdtempSync(join(tmpdir(), "nbwf-isolated-"));
const consumerRoot = join(tempRoot, "consumer");
try {
    const pack = execFileSync(
        "npm",
        ["pack", "--silent", "--pack-destination", tempRoot],
        {
            cwd: repoRoot,
            encoding: "utf8",
            shell: true,
        },
    ).trim();
    const tarball = join(tempRoot, pack);
    const packageRoot = join(
        consumerRoot,
        "node_modules",
        "@notnotype",
        "nb-workflow",
    );
    mkdirSync(packageRoot, { recursive: true });
    execFileSync(
        "tar",
        ["-xzf", tarball, "-C", packageRoot, "--strip-components=1"],
        { stdio: "pipe" },
    );

    const smoke = join(consumerRoot, "smoke.mjs");
    writeFileSync(smoke, `
import {
    WorkflowRunner,
    extractCfg,
} from "@notnotype/nb-workflow";

const runner = new WorkflowRunner();
const result = await runner.start({
    key: "isolated-smoke",
    manifestHash: "sha256:isolated-smoke-v1",
    run: async (workflow) => ({
        now: await workflow.now(),
    }),
}, null);
if (
    result.status !== "completed"
    || typeof result.result?.now !== "string"
) {
    throw new Error("isolated package run failed");
}

let message = "";
try {
    extractCfg("const x = 1;");
} catch (error) {
    message = error.message;
}
if (!message.includes("optional 'typescript'")) {
    throw new Error(
        "extractCfg without typescript must fail with a clear "
        + "message, got: " + message,
    );
}
console.log("ISOLATED_PACKAGE_SMOKE_OK");
`);

    const hostileNodePath = join(tempRoot, "empty-node-path");
    mkdirSync(hostileNodePath, { recursive: true });
    const env = {
        ...process.env,
        NODE_PATH: hostileNodePath,
    };
    const run = spawnSync(
        process.execPath,
        ["smoke.mjs"],
        {
            cwd: consumerRoot,
            env,
            encoding: "utf8",
            timeout: 60_000,
        },
    );
    if (run.status !== 0) {
        throw new Error(
            "Isolated package smoke failed:\n"
            + `${run.stdout}\n${run.stderr}`,
        );
    }
    if (!run.stdout.includes("ISOLATED_PACKAGE_SMOKE_OK")) {
        throw new Error(
            "Isolated package smoke did not report success:\n"
            + run.stdout,
        );
    }
    console.log(run.stdout.trim());
} finally {
    rmSync(tempRoot, { recursive: true, force: true });
}
