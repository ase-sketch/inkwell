#!/usr/bin/env bun
import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
    CANONICAL_ROLES,
    defaultRepoRoot,
    git,
    gitBranch,
    gitRevision,
    governanceRoots,
    resolveWorkReadmePath,
    resolveWorkTaskReadmePath,
} from "#scripts/ci/agent-governance-contract";

const args = process.argv.slice(2);
const repoArgument = args.indexOf("--repo-root");
const roleArgument = args.indexOf("--role");
const workArgument = args.indexOf("--work");
const taskArgument = args.indexOf("--task");
const repoRoot = resolve(repoArgument >= 0 ? args[repoArgument + 1] ?? "" : defaultRepoRoot(import.meta.url));
const role = roleArgument >= 0 ? args[roleArgument + 1] : undefined;
const work = workArgument >= 0 ? args[workArgument + 1] : undefined;
const task = taskArgument >= 0 ? args[taskArgument + 1] : undefined;
const failures: string[] = [];

if (role && !CANONICAL_ROLES.includes(role as typeof CANONICAL_ROLES[number])) failures.push(`未知角色：${role}`);
if (role && !task) failures.push("Role 必须与 Task 一起指定");
if (task && !work) failures.push(`Task 必须同时指定 Work：${task}`);

let taskResolution: {workPath: string | null; taskPath: string | null; taskRole: typeof CANONICAL_ROLES[number] | null; failures: string[]} = {
    workPath: null,
    taskPath: null,
    taskRole: null,
    failures: [],
};
if (work && task) taskResolution = resolveWorkTaskReadmePath(repoRoot, work, task);
else if (work) {
    const workResolution = resolveWorkReadmePath(repoRoot, work);
    taskResolution = {workPath: workResolution.path, taskPath: null, taskRole: null, failures: workResolution.failures};
}
failures.push(...taskResolution.failures);

const taskRole = taskResolution.taskRole;
if (role && taskRole && role !== taskRole) failures.push(`指定 role 与 Task role 不一致：${role} != ${taskRole}`);

const statusText = existsSync(resolve(repoRoot, "PROJECT-STATUS.md"))
    ? readFileSync(resolve(repoRoot, "PROJECT-STATUS.md"), "utf8")
    : "";
const statusLine = statusText.split(/\r?\n/u).find((line) => line.startsWith("NeuroBook 当前处于"))
    ?? statusText.split(/\r?\n/u).find((line) => line.startsWith(">"))
    ?? "PROJECT-STATUS.md 未提供一句话结论";
const roots = governanceRoots(repoRoot);
const worktreePath = git(repoRoot, ["rev-parse", "--show-toplevel"]);
const report = {
    schema: "nbook.governance-context/v1",
    repoRoot,
    revision: gitRevision(repoRoot),
    branch: gitBranch(repoRoot),
    worktree: worktreePath,
    role: taskRole,
    requestedRole: role ?? null,
    work: work ?? null,
    workReadme: taskResolution.workPath,
    task: task ?? null,
    taskReadme: taskResolution.taskPath,
    taskRole,
    roleContract: taskRole ? `.agents/roles/${taskRole}/AGENTS.md` : null,
    status: statusLine.replace(/^>\s*/u, "").trim(),
    roots,
    trackedChanges: git(repoRoot, ["status", "--short"]),
    failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
