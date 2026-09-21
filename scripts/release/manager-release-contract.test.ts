import {execFile} from "node:child_process";
import {readFile} from "node:fs/promises";
import {fileURLToPath, pathToFileURL} from "node:url";
import {promisify} from "node:util";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {normalizeBunLockfileWorkspaceFileSpecifiers} from "#scripts/release/normalize-bun-lockfile";

const execFileAsync = promisify(execFile);
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const APPLICATION_ROOT = resolve(ROOT, "packages", "neuro-book");

type RootPackage = {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
};

type ReleaseWorkflow = string;

type GeneratedTsConfig = {
    extends?: string;
    include?: string[];
    compilerOptions: {
        module: string;
        moduleResolution: string;
    };
};

describe("Manager release clean-checkout contract", () => {
    it("Runtime typecheck self-prepares Prisma and directly owns imported mdast types", async () => {
        const packageJson = JSON.parse(
            await readFile(resolve(APPLICATION_ROOT, "package.json"), "utf8"),
        ) as RootPackage;
        const releaseWorkflow = await readFile(
            resolve(ROOT, ".github", "workflows", "release-manager.yml"),
            "utf8",
        ) as ReleaseWorkflow;
        const generatedTsConfig = JSON.parse(
            (await readFile(resolve(APPLICATION_ROOT, "server", "generated", "tsconfig.json"), "utf8"))
                .replace(/^\s*\/\/.*$/gmu, ""),
        ) as GeneratedTsConfig;
        const sharedTsConfig = JSON.parse(
            await readFile(resolve(APPLICATION_ROOT, "shared", "tsconfig.json"), "utf8"),
        ) as GeneratedTsConfig;

        expect(packageJson.scripts["runtime:typecheck"]).toMatch(/^bun run generate && /u);
        expect(releaseWorkflow.indexOf("bun run --cwd packages/neuro-book nuxt:prepare")).toBeGreaterThan(-1);
        expect(releaseWorkflow.indexOf("bun run --cwd packages/neuro-book nuxt:prepare")).toBeLessThan(
            releaseWorkflow.indexOf("bun run manager:test"),
        );
        expect(packageJson.devDependencies["@types/mdast"]).toBeTruthy();
        expect(generatedTsConfig.extends).toBeUndefined();
        expect(generatedTsConfig.compilerOptions).toMatchObject({
            module: "ESNext",
            moduleResolution: "Bundler",
        });
        expect(sharedTsConfig.extends).toBeUndefined();
        expect(sharedTsConfig.compilerOptions).toMatchObject({
            module: "ESNext",
            moduleResolution: "Bundler",
        });
    });
    it("bun.lock对workspace file依赖保持POSIX分隔符", async () => {
        const lockfile = await readFile(resolve(ROOT, "bun.lock"), "utf8");
        expect(lockfile).not.toMatch(/file:[^"]*\\/u);
    });
    it("规范化 Windows file specifier 时保留其它 lockfile 文本", () => {
        const source = String.raw`["pkg@file:packages\\neuro-book-test-support", "file:../already-posix"]`;
        expect(normalizeBunLockfileWorkspaceFileSpecifiers(source)).toBe(
            `["pkg@file:packages/neuro-book-test-support", "file:../already-posix"]`,
        );
    });

    it("clean Manager build 的 installation 公开入口可由 Node 实际加载", async () => {
        await execFileAsync("bun", ["run", "manager:build"], {cwd: ROOT, windowsHide: true});
        const entrypoint = pathToFileURL(resolve(ROOT, "packages/neuro-book-manager/dist/installation-entry.mjs")).href;
        const expectedExports = [
            "discoverInstallationRoot",
            "installationPaths",
            "managerCacheRoot",
            "readInstallationManifest",
            "writeInstallationManifest",
        ];
        const expectedRoot = resolve("C:/neuro-book");
        const expectedManifest = resolve(expectedRoot, ".deploy", "installation.json");
        const probe = [
            `const installation = await import(${JSON.stringify(entrypoint)});`,
            `const expectedExports = ${JSON.stringify(expectedExports)};`,
            "if (JSON.stringify(Object.keys(installation).sort()) !== JSON.stringify(expectedExports)) throw new Error('installation export contract mismatch');",
            `const paths = installation.installationPaths(${JSON.stringify(expectedRoot)});`,
            `if (paths.root !== ${JSON.stringify(expectedRoot)} || paths.manifest !== ${JSON.stringify(expectedManifest)}) throw new Error('installation path behavior mismatch');`,
            "console.log('installation-entry import ok');",
        ].join("\n");
        const result = await execFileAsync("node", ["--input-type=module", "-e", probe], {cwd: ROOT, windowsHide: true});
        expect(result.stdout.trim()).toBe("installation-entry import ok");
    });
});
