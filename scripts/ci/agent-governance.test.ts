import {execFile as execFileCallback} from "node:child_process";
import {mkdir, realpath, rm, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {promisify} from "node:util";
import {afterEach, describe, expect, it} from "vitest";

import {
    primaryCheckoutRoot,
    verifyApplicationScriptBoundary,
    verifyMonorepoCutover,
    verifyMonorepoWorktreeLayout,
    verifyWorkspacePackageGovernance,
} from "#scripts/ci/agent-governance-contract";
import {createTestTmpRoot} from "@notnotype/neuro-book-test-support/tmp";

const execFile = promisify(execFileCallback);
const fixtureRoots: string[] = [];
const repositoryRoot = join(import.meta.dirname, "..", "..");

afterEach(async () => {
    await Promise.all(fixtureRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("workspace 包级治理门禁", () => {
    it("当前 workspace 包治理检查通过", () => {
        expect(verifyWorkspacePackageGovernance(repositoryRoot)).toEqual([]);
    });

    it("拒绝被跟踪的包级运行态", async () => {
        const trackedRoot = await createPackageFixture({runtime: ".agent", trackRuntime: true});
        expect(verifyWorkspacePackageGovernance(trackedRoot)).toContain("包级运行态被 Git 跟踪：packages/sample/.agent");
    });
});

describe("最终 monorepo 收敛门禁", () => {
    it("当前迁移结果的旧根入口与应用脚本边界均闭合", () => {
        expect(verifyMonorepoCutover(repositoryRoot)).toEqual([]);
        expect(verifyApplicationScriptBoundary(repositoryRoot)).toEqual([]);
    });

    it("拒绝旧根应用源码和根应用命令重新出现", async () => {
        const repoRoot = await createTestTmpRoot("governance-cutover", "governance-cutover-test");
        fixtureRoots.push(repoRoot);
        await writeText(repoRoot, "package.json", JSON.stringify({name: "fixture", version: "1.0.0", scripts: {dev: "nuxt dev"}}));
        await writeText(repoRoot, "server/index.ts", "export {};\n");
        await runGit(repoRoot, ["init", "--initial-branch", "master"]);
        await runGit(repoRoot, ["add", "."]);

        expect(verifyMonorepoCutover(repoRoot)).toEqual(expect.arrayContaining([
            "旧根应用路径重新出现：server/index.ts",
            "根 workspace orchestrator 不得声明产品 version",
            "根 workspace 保留应用或同步命令：dev",
        ]));
    });

    it("只允许 source-dev 读取根 workspace locator", async () => {
        const repoRoot = await createTestTmpRoot("governance-app-scripts", "governance-app-scripts-test");
        fixtureRoots.push(repoRoot);
        await writeText(repoRoot, "packages/neuro-book/scripts/cli/source-dev.ts", [
            'import {resolveWorkspaceRoots} from "#scripts/utils/workspace-roots";',
            'import type {WorkspaceRoots} from "#scripts/utils/workspace-roots";',
            "export {resolveWorkspaceRoots};",
        ].join("\n"));
        expect(verifyApplicationScriptBoundary(repoRoot)).toEqual([]);

        await writeText(repoRoot, "packages/neuro-book/scripts/smoke/agent.ts", 'import "#scripts/utils/workspace-roots";\n');
        await writeText(repoRoot, "packages/neuro-book/scripts/cli/source-dev.ts", 'import "#scripts/utils/process.mjs";\n');
        expect(verifyApplicationScriptBoundary(repoRoot)).toEqual([
            "应用跨根 #scripts 导入违规：packages/neuro-book/scripts/cli/source-dev.ts -> #scripts/utils/process.mjs",
            "应用跨根 #scripts 导入违规：packages/neuro-book/scripts/smoke/agent.ts -> #scripts/utils/workspace-roots",
        ]);
    });
});

describe("monorepo worktree 根门禁", () => {
    it("解析 linked worktree 的主 checkout，并拒绝 canonical 根外 worktree", async () => {
        const {primary, linked, outside} = await createWorktreeFixture();
        try {
            expect(primaryCheckoutRoot(linked)).toBe(await realpath(primary));
            expect(verifyMonorepoWorktreeLayout(linked).some((failure) => failure.includes("monorepo worktree 位置违规"))).toBe(true);
        } finally {
            await runGit(primary, ["worktree", "remove", "--force", linked]);
            await runGit(primary, ["worktree", "remove", "--force", outside]);
        }
    });
});

async function writeText(root: string, relativePath: string, content: string): Promise<void> {
    const absolutePath = join(root, relativePath);
    await mkdir(dirname(absolutePath), {recursive: true});
    await writeFile(absolutePath, content, "utf8");
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
    const {stdout} = await execFile("git", [...args], {cwd, encoding: "utf8"});
    return stdout.trim();
}

async function createPackageFixture(options: {
    runtime: ".agent" | ".local" | null;
    trackRuntime?: boolean;
}): Promise<string> {
    const repoRoot = await createTestTmpRoot("governance-package", "governance-package-test");
    fixtureRoots.push(repoRoot);
    await runGit(repoRoot, ["init", "--initial-branch", "master"]);
    await runGit(repoRoot, ["config", "user.name", "Test"]);
    await runGit(repoRoot, ["config", "user.email", "test@example.com"]);
    await writeText(repoRoot, ".gitignore", ".agent/\n.local/\n");
    await writeText(repoRoot, "package.json", JSON.stringify({
        name: "root",
        workspaces: ["packages/sample"],
    }));
    await writeText(repoRoot, "packages/sample/package.json", JSON.stringify({
        name: "@scope/sample",
        version: "0.0.0",
    }));

    if (options.runtime) {
        await writeText(repoRoot, `packages/sample/${options.runtime}/file.txt`, "data\n");
    }

    await runGit(repoRoot, ["add", "."]);
    if (options.trackRuntime && options.runtime) {
        await runGit(repoRoot, ["add", "-f", `packages/sample/${options.runtime}/file.txt`]);
    }
    await runGit(repoRoot, ["commit", "-m", "init"]);
    return repoRoot;
}

async function createWorktreeFixture(): Promise<{primary: string; linked: string; outside: string}> {
    const primary = await createTestTmpRoot("governance-worktree", "governance-worktree-test");
    fixtureRoots.push(primary);
    await mkdir(join(primary, ".worktree"), {recursive: true});
    const linked = join(primary, ".worktree", "inside");
    const outside = `${primary}-outside`;
    await writeText(primary, "README.md", "fixture\n");
    await runGit(primary, ["init", "--initial-branch", "master"]);
    await runGit(primary, ["config", "user.email", "governance-test@example.invalid"]);
    await runGit(primary, ["config", "user.name", "Governance Test"]);
    await runGit(primary, ["add", "README.md"]);
    await runGit(primary, ["commit", "-m", "fixture"]);
    await runGit(primary, ["worktree", "add", "--detach", linked]);
    await runGit(primary, ["worktree", "add", "--detach", outside]);
    return {primary, linked, outside};
}