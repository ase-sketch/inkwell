import {spawn} from "node:child_process";
import {mkdir, mkdtemp, readdir, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {dirname, join, resolve} from "node:path";
import {afterEach, describe, expect, it} from "vitest";

const roots: string[] = [];
const applicationRoot = resolve(dirname(import.meta.dirname), "..", "packages", "neuro-book");
const profileCommand = resolve(applicationRoot, "server", "agent", "profiles", "profile-command.ts");
const variableCommand = resolve(applicationRoot, "server", "agent", "variables", "variable-command.ts");

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Authoring CLI blackbox", () => {
    it("Profile 对未编译、非法 import、stale 与 preview failure 返回非零", async () => {
        const fixture = await authoringFixture();
        const profileRoot = join(fixture.stateRoot, "workspace", ".nbook", "agent", "profiles");
        const validPath = join(profileRoot, "valid.profile.ts");
        const illegalPath = join(profileRoot, "illegal.profile.ts");
        const brokenPath = join(profileRoot, "broken.profile.ts");
        await mkdir(profileRoot, {recursive: true});
        await writeFile(validPath, validProfileSource(), "utf8");
        await writeFile(illegalPath, illegalProfileSource(), "utf8");
        await writeFile(brokenPath, brokenProfileSource(), "utf8");

        expect((await runCli(profileCommand, ["status", "valid.profile.ts"], fixture)).code).toBe(1);

        const illegalCompile = await runCli(profileCommand, ["compile", "illegal.profile.ts"], fixture);
        expect(illegalCompile.code).toBe(1);
        expect(`${illegalCompile.stdout}\n${illegalCompile.stderr}`).toContain("Profile SDK 违规");
        expect(`${illegalCompile.stdout}\n${illegalCompile.stderr}`).toContain("- zod");

        const brokenCompile = await runCli(profileCommand, ["compile", "broken.profile.ts"], fixture);
        expect(brokenCompile.code).toBe(1);
        expect(`${brokenCompile.stdout}\n${brokenCompile.stderr}`).toContain("compile_failed");

        const brokenPreview = await runCli(profileCommand, ["preview", "broken.profile.ts"], fixture);
        expect(brokenPreview.code).toBe(1);
        expect(`${brokenPreview.stdout}\n${brokenPreview.stderr}`).toContain("profile preview 编译失败");

        expect((await runCli(profileCommand, ["compile", "valid.profile.ts"], fixture)).code).toBe(0);
        expect((await runCli(profileCommand, ["status", "valid.profile.ts"], fixture)).code).toBe(0);
        const validPreview = await runCli(profileCommand, ["preview", "valid.profile.ts", "--input-json", "{}"], fixture);
        expect(validPreview, `stdout:\n${validPreview.stdout}\nstderr:\n${validPreview.stderr}`).toMatchObject({code: 0});
        expect(validPreview.stdout).toContain("preview ok: yes");

        await writeFile(validPath, `${validProfileSource()}\n// source changed\n`, "utf8");
        const stale = await runCli(profileCommand, ["status", "valid.profile.ts"], fixture);
        expect(stale.code).toBe(1);
        expect(stale.stdout).toContain("compile_stale");
    }, 300_000);

    it("Variable 强制显式 Global/Project locator，并对 typecheck、SDK gate 与 stale 返回非零", async () => {
        const fixture = await authoringFixture();
        const globalRoot = join(fixture.stateRoot, "workspace", ".nbook", "agent", "variables");
        const globalPath = join(globalRoot, "definitions.ts");
        await mkdir(globalRoot, {recursive: true});
        await writeFile(globalPath, invalidVariableSource(), "utf8");

        expect((await runCli(variableCommand, ["definition", "status"], fixture)).code).toBe(1);
        expect((await runCli(variableCommand, ["definition", "status", "--global"], fixture)).code).toBe(1);
        expect((await runCli(variableCommand, ["definition", "compile", "--global"], fixture)).code).toBe(1);

        await writeFile(globalPath, validVariableSource("global-smoke"), "utf8");
        const globalCompile = await runCli(variableCommand, ["definition", "compile", "--global"], fixture);
        expect(globalCompile, `stdout:\n${globalCompile.stdout}\nstderr:\n${globalCompile.stderr}`).toMatchObject({code: 0});
        expect((await runCli(variableCommand, ["definition", "status", "--global"], fixture)).code).toBe(0);

        await writeFile(globalPath, `${validVariableSource("global-smoke")}\n// source changed\n`, "utf8");
        expect((await runCli(variableCommand, ["definition", "status", "--global"], fixture)).code).toBe(1);

        const projectRoot = join(fixture.stateRoot, "workspace", "demo");
        const projectVariableRoot = join(projectRoot, ".nbook", "agent", "variables");
        await mkdir(projectVariableRoot, {recursive: true});
        await writeFile(join(projectVariableRoot, "definitions.ts"), validVariableSource("project-smoke"), "utf8");
        expect((await runCli(variableCommand, ["definition", "compile", "--project", "demo"], fixture, projectRoot)).code).toBe(0);
        expect((await runCli(variableCommand, ["definition", "status", "--project", "demo"], fixture, projectRoot)).code).toBe(0);
        expect((await runCli(variableCommand, ["definition", "status", "--project", ".."], fixture, projectRoot)).code).toBe(1);
    }, 180_000);

    it("Profile typecheck 准备失败时立即回收 authoring lease", async () => {
        const fixture = await authoringFixture();
        const profileRoot = join(fixture.stateRoot, "workspace", ".nbook", "agent", "profiles");
        const variableCompiledRoot = join(fixture.stateRoot, "workspace", ".nbook", "agent", "variables", ".compiled");
        await Promise.all([
            mkdir(profileRoot, {recursive: true}),
            mkdir(variableCompiledRoot, {recursive: true}),
        ]);
        await writeFile(join(profileRoot, "valid.profile.ts"), validProfileSource(), "utf8");
        await writeFile(join(variableCompiledRoot, "manifest.json"), "{ invalid json", "utf8");

        const result = await runCli(profileCommand, ["check", "valid.profile.ts"], fixture);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("JSON");
        await expect(leaseEntries(fixture.cacheRoot, "profile-variable-types")).resolves.toEqual([]);
    }, 120_000);
});

type AuthoringFixture = {
    stateRoot: string;
    cacheRoot: string;
    env: NodeJS.ProcessEnv;
};

type CliResult = {
    code: number;
    stdout: string;
    stderr: string;
};

/** 建立 Application、State、Cache 彼此显式分离的 CLI 环境。 */
async function authoringFixture(): Promise<AuthoringFixture> {
    const root = await mkdtemp(testHostPath("nbook-authoring-cli-"));
    roots.push(root);
    const stateRoot = join(root, "state");
    const cacheRoot = join(root, "cache");
    await Promise.all([mkdir(stateRoot, {recursive: true}), mkdir(cacheRoot, {recursive: true})]);
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        NEURO_BOOK_APPLICATION_ROOT: applicationRoot,
        NEURO_BOOK_STATE_ROOT: stateRoot,
        NEURO_BOOK_CACHE_ROOT: cacheRoot,
        NODE_PATH: "",
    };
    delete env.NEURO_BOOK_PRODUCT_IMAGE_ROOT;
    return {stateRoot, cacheRoot, env};
}

/** 启动真实 Bun CLI 并保留 stdout、stderr 与退出码。 */
async function runCli(
    entry: string,
    args: string[],
    fixture: AuthoringFixture,
    cwd = applicationRoot,
): Promise<CliResult> {
    return await new Promise((resolvePromise, rejectPromise) => {
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        const child = spawn(process.versions.bun ? process.execPath : "bun", [entry, ...args], {
            cwd,
            env: fixture.env,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });
        child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
        child.once("error", rejectPromise);
        child.once("exit", (code, signal) => {
            if (signal) rejectPromise(new Error(`Authoring CLI 被信号中断：${signal}`));
            else resolvePromise({
                code: code ?? 1,
                stdout: Buffer.concat(stdout).toString("utf8"),
                stderr: Buffer.concat(stderr).toString("utf8"),
            });
        });
    });
}

/** 返回指定 authoring kind 下尚未清理的 lease；kind root 不存在等价于空。 */
async function leaseEntries(cacheRoot: string, kind: string): Promise<string[]> {
    try {
        return await readdir(join(cacheRoot, "authoring", kind));
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

function validProfileSource(): string {
    return `
import {ProfilePrompt, System, Type, defineAgentProfile, toolset} from "nbook/profile-sdk";

export default defineAgentProfile({
    manifest: {key: "valid", name: "Valid"},
    initialSchema: Type.Object({}),
    tools: toolset(),
    context() { return ProfilePrompt({children: System({children: "ok"})}); },
});
`;
}

function illegalProfileSource(): string {
    return `
import {z} from "zod";
import {ProfilePrompt, Type, defineAgentProfile, toolset} from "nbook/profile-sdk";

export default defineAgentProfile({
    manifest: {key: "illegal", name: z.string().parse("Illegal")},
    initialSchema: Type.Object({}),
    tools: toolset(),
    context() { return ProfilePrompt({children: "blocked"}); },
});
`;
}

function brokenProfileSource(): string {
    return `
import {ProfilePrompt, Type, defineAgentProfile, toolset} from "nbook/profile-sdk";

throw new Error("fixture compile failure");

export default defineAgentProfile({
    manifest: {key: "broken", name: "Broken"},
    initialSchema: Type.Object({}),
    tools: toolset(),
    context() { return ProfilePrompt({children: "blocked"}); },
});
`;
}

function invalidVariableSource(): string {
    return `
import {Type, defineWorkspaceRootVariable} from "nbook/variable-sdk";
const invalid: string = 1;
export default [defineWorkspaceRootVariable({key: invalid, schema: Type.String(), default: ""})];
`;
}

function validVariableSource(key: string): string {
    return `
import {Type, defineWorkspaceRootVariable} from "nbook/variable-sdk";
export default [defineWorkspaceRootVariable({key: ${JSON.stringify(key)}, schema: Type.String(), default: ""})];
`;
}
