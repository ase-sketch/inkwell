#!/usr/bin/env bun
import {resolve} from "node:path";
import {defaultRepoRoot, git, gitBranch, governanceRoots, primaryCheckoutRoot, verifyMonorepoWorktreeLayout} from "#scripts/ci/agent-governance-contract";

const args = process.argv.slice(2);
const repoArgument = args.indexOf("--repo-root");
const repoRoot = resolve(repoArgument >= 0 ? args[repoArgument + 1] ?? "" : defaultRepoRoot(import.meta.url));
const roots = governanceRoots(repoRoot);
const worktrees = git(repoRoot, ["worktree", "list", "--porcelain"]);
const entries = worktrees.split(/\n\n/u).filter(Boolean).map((block) => Object.fromEntries(block.split(/\r?\n/u).map((line) => {
    const separator = line.indexOf(" ");
    return separator < 0 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)];
})));
const failures = verifyMonorepoWorktreeLayout(repoRoot);
console.log(JSON.stringify({
    schema: "nbook.governance-worktree/v1",
    repoRoot,
    primaryCheckoutRoot: primaryCheckoutRoot(repoRoot),
    branch: gitBranch(repoRoot),
    configuredRoot: roots.worktreeRoot,
    failures,
    current: entries.find((entry) => entry.worktree === repoRoot) ?? null,
    worktrees: entries,
}, null, 2));
if (failures.length > 0) process.exitCode = 1;
