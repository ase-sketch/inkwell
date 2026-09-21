import {execFile} from "node:child_process";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {dirname, join, resolve} from "node:path";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {afterEach, describe, expect, it} from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "packages", "neuro-book");
const agentBinRoot = join(repoRoot, "assets", "workspace", ".nbook", "agent", "bin");
const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

const cliCases = [
    {id: "profile", source: "server/agent/profiles/profile-command.ts"},
    {id: "variable", source: "server/agent/variables/variable-command.ts"},
    {id: "workspace", source: "server/workspace-files/workspace-command.ts"},
] as const;

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Agent CLI Product Runtime path", () => {
    it.each(cliCases)("$id 的 POSIX 与 Windows wrapper 只通过逻辑命令进入 Product", async ({id}) => {
        const [shellWrapper, cmdWrapper] = await Promise.all([
            readFile(join(agentBinRoot, id), "utf8"),
            readFile(join(agentBinRoot, `${id}.cmd`), "utf8"),
        ]);

        for (const wrapper of [shellWrapper, cmdWrapper]) {
            expect(wrapper).toContain("NEURO_BOOK_APPLICATION_ROOT");
            expect(wrapper).toContain("product-command.mjs");
            expect(wrapper).toContain(`command ${id}`);
            expect(wrapper).toContain("--no-install");
            expect(wrapper).not.toMatch(/server[\\/]scripts/u);
            expect(wrapper).not.toContain(`commands/${id}.mjs`);
            expect(wrapper).not.toContain(`commands\\${id}.mjs`);
        }
    });

    it.each(cliCases)("$id 在 Product 中通过 bootstrap 转发参数", async ({id}) => {
        const root = await productFixture();
        const result = await runWrapper(id, root, ["first", "two words"], "production");
        const report = JSON.parse(result.stdout.trim()) as {args: string[]; cwd: string; applicationRoot?: string};

        expect(report.args).toEqual(["command", id, "first", "two words"]);
        expect(normalizePath(report.cwd)).toBe(normalizePath(result.invocationRoot));
        expect(normalizePath(report.applicationRoot ?? "")).toBe(normalizePath(root));
    });

    it.each(cliCases)("$id 只在明确源码开发布局中执行源码入口", async ({id, source}) => {
        const root = await sourceFixture(source);
        const result = await runWrapper(id, root, ["check"], "development");
        const report = JSON.parse(result.stdout.trim()) as {args: string[]; cwd: string};

        expect(report.args).toEqual(["check"]);
        expect(normalizePath(report.cwd)).toBe(normalizePath(result.invocationRoot));
    });

    it.each(cliCases)("$id 遇到残缺 Product 时不回退源码", async ({id, source}) => {
        const root = await sourceFixture(source);
        await mkdir(join(root, ".output"), {recursive: true});
        await writeFile(join(root, ".output", "runtime-image.json"), "{}\n", "utf8");

        await expect(runWrapper(id, root, [], "production")).rejects.toMatchObject({
            stderr: expect.stringContaining("Product Runtime"),
        });
    });
});

/** 创建只包含稳定 bootstrap 的最小 Product fixture。 */
async function productFixture(): Promise<string> {
    const root = await temporaryRoot("nbook-agent-cli-product-");
    const bootstrap = join(root, ".output", "server", "commands", "product-command.mjs");
    await mkdir(dirname(bootstrap), {recursive: true});
    await writeFile(join(root, "package.json"), JSON.stringify({name: "neuro-book"}), "utf8");
    await writeFile(bootstrap, reportScript(), "utf8");
    return root;
}

/** 创建具备源码入口和开发依赖目录的明确 Source dev fixture。 */
async function sourceFixture(source: string): Promise<string> {
    const root = await temporaryRoot("nbook-agent-cli-source-");
    const entry = join(root, ...source.split("/"));
    await mkdir(dirname(entry), {recursive: true});
    await mkdir(join(root, "node_modules"), {recursive: true});
    await writeFile(join(root, "package.json"), JSON.stringify({name: "neuro-book"}), "utf8");
    await writeFile(entry, reportScript(), "utf8");
    return root;
}

/** 执行当前平台的真实 wrapper。 */
async function runWrapper(
    id: string,
    root: string,
    args: string[],
    nodeEnv: string,
): Promise<{stdout: string; stderr: string; invocationRoot: string}> {
    const invocationRoot = join(root, "invocation");
    await mkdir(invocationRoot, {recursive: true});
    const env = {
        ...process.env,
        BUN: bunExecutable(),
        NEURO_BOOK_APPLICATION_ROOT: root,
        NODE_ENV: nodeEnv,
    };
    if (process.platform === "win32") {
        const wrapper = join(agentBinRoot, `${id}.cmd`);
        const result = await execFileAsync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", "call", wrapper, ...args], {
            cwd: invocationRoot,
            env,
            windowsHide: true,
        });
        return {...result, invocationRoot};
    }
    const result = await execFileAsync("sh", [join(agentBinRoot, id), ...args], {cwd: invocationRoot, env});
    return {...result, invocationRoot};
}

/** fixture 输出实际收到的参数和 wrapper 建立的运行根。 */
function reportScript(): string {
    return "console.log(JSON.stringify({args: process.argv.slice(2), cwd: process.cwd(), applicationRoot: process.env.NEURO_BOOK_APPLICATION_ROOT}));\n";
}

async function temporaryRoot(prefix: string): Promise<string> {
    const root = await mkdtemp(testHostPath(prefix));
    temporaryRoots.push(root);
    return root;
}

function bunExecutable(): string {
    return process.versions.bun ? process.execPath : "bun";
}

function normalizePath(filePath: string): string {
    return resolve(filePath).replaceAll("\\", "/").toLowerCase();
}
