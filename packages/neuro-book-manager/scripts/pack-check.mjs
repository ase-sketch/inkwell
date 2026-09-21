import {cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path";
import {createRequire} from "node:module";
import {resolveAgentCacheRoot} from "@notnotype/neuro-book-test-support/paths";
import {blessedTerminfoNames, createBlessedRuntimePlugin} from "./build.mjs";

const packageRoot = resolve(import.meta.dir, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
// 仅使用系统受控 cache；pack 产物可回收，不污染仓库 `.agent/tmp`。
const managedTmpRoot = resolveAgentCacheRoot("manager-pack");
await mkdir(managedTmpRoot, {recursive: true});
const temporaryRoot = await mkdtemp(join(managedTmpRoot, "run-"));

try {
    await run(["bun", "pm", "pack", "--destination", temporaryRoot], packageRoot);
    const archiveName = (await readdir(temporaryRoot)).find((name) => name.endsWith(".tgz"));
    if (!archiveName) throw new Error("bun pm pack 没有生成 tgz。" );
    const archive = join(temporaryRoot, archiveName);
    await writeFile(join(temporaryRoot, "package.json"), "{\"private\":true}\n", "utf8");
    await run(["bun", "add", archive, "--cwd", temporaryRoot], temporaryRoot);
    const installedPackageRoot = join(temporaryRoot, "node_modules", "@notnotype", "neuro-book-manager");
    const packageJson = JSON.parse(await readFile(join(installedPackageRoot, "package.json"), "utf8"));
    const installationSmoke = await runCapture([
        "node",
        "--input-type=module",
        "-e",
        `import {resolve} from "node:path";
const installation = await import("@notnotype/neuro-book-manager/installation");
const paths = installation.installationPaths("C:/neuro-book");
const expectedManifest = resolve("C:/neuro-book", ".deploy", "installation.json");
if (typeof installation.writeInstallationManifest !== "function" || paths.manifest !== expectedManifest) {
    throw new Error("packed installation export contract mismatch");
}
console.log("packed installation import ok");`,
    ], temporaryRoot);
    if (installationSmoke.trim() !== "packed installation import ok") {
        throw new Error(`packed installation smoke输出错误：${installationSmoke.trim()}`);
    }
    const forbidden = ["nuxt", "vue", "prisma", "@tiptap/core"];
    for (const name of forbidden) {
        if (packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]) {
            throw new Error(`Manager npm 包错误包含应用依赖：${name}`);
        }
    }
    if (packageJson.dependencies?.["@notnotype/owned-process"]) {
        throw new Error("Manager npm包不应携带私有Owned Process production dependency；实现必须内联进单文件bundle。" );
    }
    if (packageJson.dependencies?.["@notnotype/neuro-book-contracts"]) {
        throw new Error("Manager npm包不应携带私有Contracts production dependency；实现必须内联进单文件bundle。");
    }
    if (!packageJson.dependencies?.blessed) {
        throw new Error("Manager npm包必须声明blessed runtime dependency。");
    }
    const managerEntry = join(installedPackageRoot, "dist", "neuro-book.mjs");
    const managerSource = (await readFile(managerEntry, "utf8")).replace(/^#![^\n]*\n/u, "");
    const managerImports = new Bun.Transpiler({loader: "js"})
        .scanImports(managerSource)
        .filter((record) => record.kind === "import-statement")
        .map((record) => record.path);
    const blessedWidgetImports = managerImports.filter((specifier) => specifier === "blessed" || specifier.startsWith("blessed/"));
    if (blessedWidgetImports.length > 0) {
        throw new Error(`packed Manager必须内联blessed运行时：${blessedWidgetImports.join(", ")}`);
    }
    const runtimeImports = managerImports.filter((specifier) => specifier === "yaml" || specifier === "semver");
    if (runtimeImports.length > 0) {
        throw new Error(`packed Manager必须内联生产依赖：${runtimeImports.join(", ")}`);
    }
    const requireFromInstalledManager = createRequire(join(installedPackageRoot, "package.json"));
    const blessedPackage = requireFromInstalledManager.resolve("blessed/package.json");
    const blessedRoot = dirname(blessedPackage);
    for (const moduleId of ["blessed/lib/tput.js", "blessed/lib/widgets/screen.js"]) {
        const modulePath = requireFromInstalledManager.resolve(moduleId);
        if (!isPathInside(blessedRoot, modulePath)) {
            throw new Error(`${moduleId}未从已安装blessed依赖解析：${modulePath}`);
        }
    }
    const blessedAssets = blessedTerminfoNames;
    for (const asset of blessedAssets) {
        const base64 = (await readFile(join(blessedRoot, "usr", asset))).toString("base64");
        if (!managerSource.includes(base64)) {
            throw new Error(`packed Manager缺少内嵌blessed资源：${asset}`);
        }
    }
    for (const buildPath of [repositoryRoot, blessedRoot]) {
        if (containsPath(managerSource, buildPath)) {
            throw new Error(`packed Manager包含构建机绝对路径：${buildPath}`);
        }
    }
    await verifyBlessedRuntime(temporaryRoot, installedPackageRoot);
    const standaloneRoot = await mkdtemp(join(managedTmpRoot, "standalone-"));
    try {
        const standaloneManager = join(standaloneRoot, "neuro-book.mjs");
        await cp(managerEntry, standaloneManager);
        const standaloneVersion = await runCapture(["bun", "--no-install", "--no-env-file", standaloneManager, "--version"], standaloneRoot);
        if (standaloneVersion.trim() !== packageJson.version) {
            throw new Error(`单文件Manager --version输出错误：${standaloneVersion.trim()}`);
        }
    } finally {
        await rm(standaloneRoot, {recursive: true, force: true});
    }
    const managerVersion = await runCapture([
        "bun",
        managerEntry,
        "--version",
    ], temporaryRoot);
    if (managerVersion.trim() !== packageJson.version) {
        throw new Error(`Manager --version输出错误：${managerVersion.trim()}`);
    }
    const startHelp = await runCapture([
        "bun",
        join(temporaryRoot, "node_modules", "@notnotype", "neuro-book-manager", "dist", "neuro-book.mjs"),
        "start",
        "--help",
    ], temporaryRoot);
    if (!startHelp.includes("--no-health-check")) {
        throw new Error("packed Manager缺少start --no-health-check参数。");
    }
    await run([
        "bun",
        join(temporaryRoot, "node_modules", "@notnotype", "neuro-book-manager", "dist", "neuro-book.mjs"),
        "status",
        "--help",
    ], temporaryRoot);
    await run([
        "bun",
        join(temporaryRoot, "node_modules", "@notnotype", "neuro-book-manager", "dist", "neuro-book.mjs"),
        "instances",
        "config",
    ], temporaryRoot, {
        ...process.env,
        NEURO_BOOK_MANAGER_CONFIG: join(temporaryRoot, "manager-home", "config.json"),
    });
    const installPlanOutput = await runCapture([
        "bun",
        join(temporaryRoot, "node_modules", "@notnotype", "neuro-book-manager", "dist", "neuro-book.mjs"),
        "install",
        "--profile",
        "source-dev",
        "--dir",
        join(temporaryRoot, "dry-run-instance"),
        "--version",
        "0.8.2-canary.cli-route",
        "--yes",
        "--dry-run",
        "--json",
    ], temporaryRoot, {
        ...process.env,
        NEURO_BOOK_MANAGER_CONFIG: join(temporaryRoot, "manager-home", "config.json"),
    });
    const installDryRun = JSON.parse(installPlanOutput);
    if (installDryRun.plan?.action !== "install"
        || installDryRun.plan?.profile !== "source-dev"
        || !installDryRun.preflight?.blockers?.some((blocker) => blocker.code === "release.unsupported")) {
        throw new Error("install --version被顶层Manager版本选项截获。" );
    }
} finally {
    await rm(temporaryRoot, {recursive: true, force: true});
}

async function run(command, cwd, env = process.env) {
    const child = Bun.spawn(command, {cwd, env, stdout: "inherit", stderr: "inherit"});
    const exitCode = await child.exited;
    if (exitCode !== 0) throw new Error(`${command.join(" ")} 退出码 ${exitCode}`);
}

/** 执行真实packed CLI并返回标准输出，用于验证Commander参数路由。 */
async function runCapture(command, cwd, env = process.env) {
    const child = Bun.spawn(command, {cwd, env, stdout: "pipe", stderr: "pipe"});
    const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(`${command.join(" ")} 退出码 ${exitCode}：${stderr || stdout}`);
    return stdout;
}

async function verifyBlessedRuntime(temporaryRoot, installedPackageRoot) {
    const entrypoint = join(temporaryRoot, "blessed-runtime-check.mjs");
    const outfile = join(temporaryRoot, "blessed-runtime-check.bundle.mjs");
    await writeFile(entrypoint, `import {PassThrough} from "node:stream";
import Tput from "blessed/lib/tput.js";
import Screen from "blessed/lib/widgets/screen.js";

const missingTerminfo = process.platform === "win32" ? "Z:/neuro-book-missing/terminfo" : "/neuro-book-missing/terminfo";
const expected = new Map([
    ["linux", "linux"],
    ["windows-ansi", "ansi"],
    ["xterm", "xterm"],
    ["xterm-256color", "xterm-256color"],
]);
for (const [terminal, canonical] of expected) {
    const tput = new Tput({terminal, terminfoFile: missingTerminfo});
    if (tput.terminal !== canonical || tput.info.name !== canonical) {
        throw new Error(terminal + " resolved as " + tput.terminal + ":" + tput.info.name);
    }
}
const termcap = new Tput({terminal: "xterm-256color", terminfoFile: missingTerminfo, termcap: true});
if (termcap.terminal !== "xterm" || termcap.info.name !== "xterm") {
    throw new Error("termcap fallback resolved as " + termcap.terminal + ":" + termcap.info.name);
}
const input = new PassThrough();
const output = new PassThrough();
Object.assign(output, {columns: 80, rows: 24});
const screen = new Screen({input, output, terminal: "neuro-book-missing-terminfo"});
try {
    if (screen.tput.terminal !== "xterm" || screen.tput.info.name !== "xterm") {
        throw new Error("Screen fallback resolved as " + screen.tput.terminal + ":" + screen.tput.info.name);
    }
} finally {
    screen.destroy();
}
`, "utf8");
    const result = await Bun.build({
        entrypoints: [entrypoint],
        outdir: temporaryRoot,
        naming: "blessed-runtime-check.bundle.mjs",
        target: "bun",
        format: "esm",
        minify: true,
        plugins: [await createBlessedRuntimePlugin(join(installedPackageRoot, "package.json"))],
    });
    if (!result.success) {
        throw new Error(`blessed runtime smoke构建失败：${result.logs.map(String).join("\n")}`);
    }
    await run(["bun", "--no-install", "--no-env-file", outfile], temporaryRoot);
}

function containsPath(source, path) {
    const normalized = path.replaceAll("\\", "/");
    const escaped = JSON.stringify(path).slice(1, -1);
    return source.includes(path) || source.includes(normalized) || source.includes(escaped);
}

function isPathInside(parent, child) {
    const remainder = relative(parent, child);
    return remainder === "" || !isAbsolute(remainder) && remainder !== ".." && !remainder.startsWith(`..${sep}`);
}
