#!/usr/bin/env bun
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
    defaultRepoRoot,
    git,
    verifyGovernanceDocumentLimits,
    verifyApplicationScriptBoundary,
    verifyMonorepoCutover,
    verifyWorkspacePackageGovernance,
} from "#scripts/ci/agent-governance-contract";

const args = process.argv.slice(2);
const repoArgument = args.indexOf("--repo-root");
const repoRoot = resolve(repoArgument >= 0 ? args[repoArgument + 1] ?? "" : defaultRepoRoot(import.meta.url));
const failures: string[] = [];
const warnings: string[] = [];

failures.push(...verifyWorkspacePackageGovernance(repoRoot));
failures.push(...verifyMonorepoCutover(repoRoot));
failures.push(...verifyApplicationScriptBoundary(repoRoot));
failures.push(...verifyGovernanceDocumentLimits(repoRoot));

function isIgnored(relativePath: string): boolean {
    try {
        const candidate = relativePath === ".worktree" ? ".worktree/placeholder" : relativePath;
        git(repoRoot, ["check-ignore", "--no-index", "-q", candidate]);
        return true;
    } catch {
        return false;
    }
}

for (const relativePath of [".env.local", ".worktree", ".agent/"]) {
    if (!isIgnored(relativePath)) failures.push(`运行态未被忽略：${relativePath}`);
}
for (const relativePath of ["AGENTS.md", ".agents/AGENTS.md", ".agents/README.md"]) {
    if (isIgnored(relativePath)) failures.push(`治理入口被错误忽略：${relativePath}`);
}

const bunfig = readFileSync(resolve(repoRoot, "bunfig.toml"), "utf8");
for (const pattern of [".agent/**", ".agents/**"]) {
    if (!bunfig.includes(`"${pattern}"`)) failures.push(`bunfig.toml 缺少测试忽略：${pattern}`);
}

const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
};
const scripts = packageJson.scripts ?? {};
for (const [name, expected] of [
    ["governance:check", "scripts/ci/agent-governance.ts"],
    ["governance:worktree", "scripts/cli/create-agent-worktree.ts"],
] as const) {
    if (!scripts[name]?.includes(expected)) failures.push(`package.json 缺少命令入口：${name} -> ${expected}`);
}

const trackedAgent = git(repoRoot, ["ls-files", ".agent"]).split(/\r?\n/u).filter(Boolean);
if (trackedAgent.length > 0) failures.push(`仓库仍跟踪开发运行态 .agent 文件：${trackedAgent.join(", ")}`);

console.log(JSON.stringify({schema: "nbook.governance-report/v1", repoRoot, failures, warnings}, null, 2));
if (failures.length > 0) process.exitCode = 1;
