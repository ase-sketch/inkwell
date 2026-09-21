import {mkdtemp, mkdir, readFile, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";

import {assertCleanWorktree, createStagedWorktree, materializeRepository, removeMaterializedRepository, removeStagedWorktree, repositoryRevision} from "#manager/git";
import {pathExists} from "#manager/files";
import {removePath} from "#manager/files";
import {run} from "#manager/process";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => removePath(root)));
});

describe("Git repository materialize", () => {
    it("允许目标目录预先存在 Manager-owned 路径", async () => {
        const fixture = await mkdtemp(testHostPath("nbook-manager-git-source-"));
        const target = await mkdtemp(testHostPath("nbook-manager-git-target-"));
        roots.push(fixture, target);
        await run("git", ["init", "-b", "master"], {cwd: fixture});
        await run("git", ["config", "user.email", "manager-test@example.com"], {cwd: fixture});
        await run("git", ["config", "user.name", "Manager Test"], {cwd: fixture});
        await writeFile(join(fixture, "package.json"), "{\"name\":\"neuro-book\"}\n", "utf8");
        await run("git", ["add", "package.json"], {cwd: fixture});
        await run("git", ["commit", "-m", "fixture"], {cwd: fixture});
        await mkdir(join(target, ".runtime"), {recursive: true});

        await materializeRepository(target, fixture, "master");

        expect(await readFile(join(target, "package.json"), "utf8")).toContain("neuro-book");
        expect(await repositoryRevision(target)).toMatch(/^[a-f0-9]{40}$/u);
    });

    it("dirty worktree 明确停止", async () => {
        const fixture = await mkdtemp(testHostPath("nbook-manager-git-dirty-"));
        roots.push(fixture);
        await run("git", ["init", "-b", "master"], {cwd: fixture});
        await writeFile(join(fixture, "untracked.txt"), "dirty", "utf8");
        await expect(assertCleanWorktree(fixture)).rejects.toThrow("不会自动 restore");
    });

    it("失败恢复只删除本次物化的checkout并保留Manager-owned目录", async () => {
        const fixture = await mkdtemp(testHostPath("nbook-manager-git-source-"));
        const target = await mkdtemp(testHostPath("nbook-manager-git-target-"));
        roots.push(fixture, target);
        await run("git", ["init", "-b", "master"], {cwd: fixture});
        await run("git", ["config", "user.email", "manager-test@example.com"], {cwd: fixture});
        await run("git", ["config", "user.name", "Manager Test"], {cwd: fixture});
        await writeFile(join(fixture, "package.json"), "{\"name\":\"neuro-book\"}\n", "utf8");
        await run("git", ["add", "package.json"], {cwd: fixture});
        await run("git", ["commit", "-m", "fixture"], {cwd: fixture});
        await mkdir(join(target, ".deploy"), {recursive: true});
        await writeFile(join(target, ".deploy", "operation.json"), "owned", "utf8");
        await materializeRepository(target, fixture, "master");

        await removeMaterializedRepository(target);

        expect(await pathExists(join(target, ".git"))).toBe(false);
        expect(await pathExists(join(target, "package.json"))).toBe(false);
        expect(await readFile(join(target, ".deploy", "operation.json"), "utf8")).toBe("owned");
    });

    it("创建并清理固定revision的staged checkout", async () => {
        const fixture = await mkdtemp(testHostPath("nbook-manager-stage-source-"));
        const staged = testHostPath(`nbook-manager-stage-${Date.now()}`);
        roots.push(fixture, staged);
        await run("git", ["init", "-b", "master"], {cwd: fixture});
        await run("git", ["config", "user.email", "manager-test@example.com"], {cwd: fixture});
        await run("git", ["config", "user.name", "Manager Test"], {cwd: fixture});
        await writeFile(join(fixture, "package.json"), "{\"name\":\"neuro-book\"}\n", "utf8");
        await run("git", ["add", "package.json"], {cwd: fixture});
        await run("git", ["commit", "-m", "fixture"], {cwd: fixture});
        const revision = await repositoryRevision(fixture);
        await createStagedWorktree(fixture, staged, revision);
        if (process.platform === "win32") {
            expect(await readFile(join(staged, "package.json"), "utf8")).toContain("neuro-book");
            expect(await pathExists(join(staged, ".git"))).toBe(false);
        } else {
            expect(await repositoryRevision(staged)).toBe(revision);
        }
        await removeStagedWorktree(fixture, staged);
        expect(await pathExists(staged)).toBe(false);
    });
});
