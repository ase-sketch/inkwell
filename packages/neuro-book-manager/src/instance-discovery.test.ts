import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";

import {afterEach, describe, expect, it} from "vitest";

import {discoverInstances, inspectInstance} from "#manager/instance-discovery";
import {run} from "#manager/process";

const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true}))));

describe("实例检测与有限发现", () => {
    it("识别未接管NeuroBook checkout并拒绝dirty worktree", async () => {
        const root = await gitFixture();
        let inspection = await inspectInstance(join(root, "nested"));
        expect(inspection.kind).toBe("neuro-book-checkout");
        expect(inspection.git?.dirty).toBe(false);

        await writeFile(join(root, "dirty.txt"), "dirty", "utf8");
        inspection = await inspectInstance(root);
        expect(inspection.blockers.some((issue) => issue.code === "git.dirty")).toBe(true);
    }, 15_000);

    it("损坏Manifest不会退化为普通Git checkout", async () => {
        const root = await gitFixture();
        await mkdir(join(root, ".deploy"), {recursive: true});
        await writeFile(join(root, ".deploy", "installation.json"), "{}", "utf8");
        const inspection = await inspectInstance(root);
        expect(inspection.kind).toBe("invalid-installation");
        expect(inspection.blockers.some((issue) => issue.code === "manifest.invalid")).toBe(true);
    });

    it("允许有完整回滚Operation证据的checkout重新接管", async () => {
        const root = await gitFixture();
        await mkdir(join(root, ".deploy", "operations"), {recursive: true});
        await mkdir(join(root, ".deploy", "staging"), {recursive: true});
        await mkdir(join(root, ".runtime", "manager"), {recursive: true});
        await writeFile(join(root, ".deploy", "operations", "failed.json"), JSON.stringify({phase: "committed", outcome: "rolled-back"}), "utf8");
        const inspection = await inspectInstance(root);
        expect(inspection.kind).toBe("neuro-book-checkout");
        expect(inspection.blockers.some((issue) => issue.code.startsWith("manager.unknown-"))).toBe(false);
        expect(inspection.warnings.some((issue) => issue.code === "manager.rolled-back-attempt")).toBe(true);
    });

    it("按深度发现候选并跳过已注册实例与node_modules", async () => {
        const search = await temporaryRoot("nbook-discovery-");
        const candidate = join(search, "group", "candidate");
        const ignored = join(search, "node_modules", "ignored");
        await createGitFixture(candidate);
        await createGitFixture(ignored);
        const result = await discoverInstances([search], [], 3);
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]?.root.replaceAll("\\", "/")).toMatch(/\/group\/candidate$/u);
        expect((await discoverInstances([search], [candidate], 3)).candidates).toEqual([]);
    }, 20_000);

    it("不把其他JavaScript Git仓库当作NeuroBook候选，空搜索根关闭发现", async () => {
        const search = await temporaryRoot("nbook-unrelated-");
        const unrelated = join(search, "other");
        await mkdir(unrelated, {recursive: true});
        await writeFile(join(unrelated, "package.json"), JSON.stringify({name: "other-app"}), "utf8");
        await run("git", ["init", "-b", "master"], {cwd: unrelated, stdio: "ignore"});
        expect((await inspectInstance(unrelated)).kind).toBe("unrelated");
        expect((await discoverInstances([search])).candidates).toEqual([]);
        expect(await discoverInstances([])).toEqual({candidates: [], warnings: []});
    });

    it("识别.git为文件的linked worktree", async () => {
        const source = await gitFixture();
        const worktree = await temporaryRoot("nbook-linked-worktree-");
        await rm(worktree, {recursive: true, force: true});
        await run("git", ["worktree", "add", "--detach", worktree, "HEAD"], {cwd: source, stdio: "ignore"});
        try {
            const inspection = await inspectInstance(worktree);
            expect(inspection.kind).toBe("neuro-book-checkout");
            expect(inspection.blockers.some((issue) => issue.code === "git.branch")).toBe(true);
        } finally {
            await run("git", ["worktree", "remove", "--force", worktree], {cwd: source, stdio: "ignore"});
        }
    });
});

async function gitFixture(): Promise<string> {
    const root = await temporaryRoot("nbook-inspection-");
    await mkdir(join(root, "nested"), {recursive: true});
    await writeFile(join(root, "nested", ".gitkeep"), "", "utf8");
    await createGitFixture(root);
    return root;
}

async function createGitFixture(root: string): Promise<void> {
    await mkdir(root, {recursive: true});
    await writeFile(join(root, "package.json"), JSON.stringify({name: "neuro-book", version: "1.0.0"}), "utf8");
    await run("git", ["init", "-b", "master"], {cwd: root, stdio: "ignore"});
    await run("git", ["config", "user.email", "test@example.com"], {cwd: root, stdio: "ignore"});
    await run("git", ["config", "user.name", "Test"], {cwd: root, stdio: "ignore"});
    await run("git", ["add", "."], {cwd: root, stdio: "ignore"});
    await run("git", ["commit", "-m", "fixture"], {cwd: root, stdio: "ignore"});
    await run("git", ["remote", "add", "origin", "https://github.com/notnotype/neuro-book.git"], {cwd: root, stdio: "ignore"});
    await run("git", ["branch", "--set-upstream-to", "master"], {cwd: root, stdio: "ignore"}).catch(() => undefined);
    await run("git", ["config", "branch.master.remote", "origin"], {cwd: root, stdio: "ignore"});
    await run("git", ["config", "branch.master.merge", "refs/heads/master"], {cwd: root, stdio: "ignore"});
}

async function temporaryRoot(prefix: string): Promise<string> {
    const root = await mkdtemp(testHostPath(prefix));
    roots.push(root);
    return root;
}
