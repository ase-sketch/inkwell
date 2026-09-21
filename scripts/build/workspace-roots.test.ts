import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {readApplicationPackageManifest} from "#scripts/utils/application-package";
import {
    findRepositoryRoot,
    resolveWorkspaceRoots,
    SOURCE_APPLICATION_RELATIVE_PATH,
} from "#scripts/utils/workspace-roots";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("workspace roots", () => {
    it("从显式 repository root 读取 identity，并在物理迁移后切换 application root", async () => {
        const repositoryRoot = await fixtureRoot();
        const applicationRoot = join(repositoryRoot, SOURCE_APPLICATION_RELATIVE_PATH);
        await mkdir(applicationRoot, {recursive: true});
        await writeFile(join(applicationRoot, "package.json"), `${JSON.stringify({
            name: "@notnotype/neuro-book",
            version: "1.2.3",
            private: true,
            type: "module",
        })}\n`, "utf8");

        const beforeCutover = resolveWorkspaceRoots({repositoryRoot});
        expect(beforeCutover).toMatchObject({repositoryRoot, applicationSourceRoot: repositoryRoot});
        await expect(readApplicationPackageManifest(repositoryRoot)).resolves.toMatchObject({
            name: "@notnotype/neuro-book",
            version: "1.2.3",
        });

        await writeFile(join(applicationRoot, "nuxt.config.ts"), "export default {};\n", "utf8");
        expect(resolveWorkspaceRoots({repositoryRoot}).applicationSourceRoot).toBe(applicationRoot);
    });

    it("向上查找只接受带 workspace 标志的 repository root", async () => {
        const repositoryRoot = await fixtureRoot();
        const nested = join(repositoryRoot, "packages", "neuro-book", "server");
        await mkdir(nested, {recursive: true});
        expect(findRepositoryRoot(nested)).toBe(repositoryRoot);
    });
});

async function fixtureRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "nbook-workspace-roots-"));
    roots.push(root);
    await mkdir(join(root, "scripts"), {recursive: true});
    await writeFile(join(root, "package.json"), "{}\n", "utf8");
    await writeFile(join(root, "bun.lock"), "fixture\n", "utf8");
    return root;
}
