import {existsSync} from "node:fs";
import {readdir, readFile, realpath} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";

import {pathExists} from "#manager/files";
import {DEFAULT_REPOSITORY} from "#manager/git";
import {resolveContainerEngine} from "#manager/docker";
import {readInstallationManifest} from "#manager/manifest-store";
import {installationPaths} from "#manager/paths";
import {commandAvailable, runCapture} from "#manager/process";
import {verifyInstalledProductRuntimeControlPlane} from "#manager/product";
import type {CommandInspection, EnvironmentInspection, GitInspection, InstanceDiscovery, InspectionIssue, ManagerConfig, OfflineInspection} from "#manager/types";

const SKIPPED_DIRECTORIES = new Set([".git", ".output", ".runtime", ".deploy", "node_modules", ".cache", ".nuxt"]);

/** 只读判定目录身份与离线接管条件；不探测服务或宿主工具。 */
export async function inspectInstance(input: string): Promise<OfflineInspection> {
    const requested = resolve(input);
    const root = await nearestCandidateRoot(requested);
    const manifestPath = installationPaths(root).manifest;
    const manifestExists = await pathExists(manifestPath);
    const blockers: InspectionIssue[] = [];
    const warnings: InspectionIssue[] = [];
    let manifest: OfflineInspection["manifest"];
    if (manifestExists) {
        try {
            manifest = await readInstallationManifest(manifestPath) ?? undefined;
        } catch (error) {
            blockers.push({code: "manifest.invalid", message: error instanceof Error ? error.message : String(error), remediation: "重新安装该实例；Windows Portable只复用完整data目录。"});
        }
    }
    const previousAttempt = !manifestExists && await inspectRolledBackAdoption(root);
    const git = await inspectNeuroBookGit(root, blockers, previousAttempt ? [".deploy", ".runtime"] : []);
    const portableState = !manifestExists && await pathExists(join(root, "data", "config.yaml")) && await pathExists(join(root, "data", "workspace"));
    const kind = manifestExists
        ? manifest ? "managed-installation" : "invalid-installation"
        : git ? "neuro-book-checkout"
            : portableState ? "portable-state" : "unrelated";
    if (kind === "neuro-book-checkout") {
        if (previousAttempt) warnings.push({code: "manager.rolled-back-attempt", message: "发现已完整回滚的接管记录；再次接管会复用Manager-owned目录。"});
        if (!previousAttempt && await pathExists(join(root, ".runtime"))) blockers.push({code: "manager.unknown-runtime", message: "发现没有Manifest所有权记录的.runtime目录；请移走或人工确认后再接管。"});
        if (!previousAttempt && await pathExists(join(root, ".deploy"))) blockers.push({code: "manager.unknown-deploy", message: "发现没有有效Manifest的.deploy目录；拒绝覆盖未知Manager状态。"});
    }
    const statePath = manifest
        ? installationPaths(root, manifest.roots).state
        : resolve(root, portableState ? "data" : ".");
    const product = manifest?.components.product;
    const productExists = product?.provider === "container"
        ? true
        : await pathExists(join(root, ".output"));
    const productTrusted = product?.provider === "container"
        ? true
        : product
            ? await verifyInstalledProductRuntimeControlPlane(root, product).then(() => true).catch(() => false)
            : false;
    if (productExists && !manifest) warnings.push({code: "product.untrusted", message: "发现无法证明revision/checksum的历史.output；接管Product Profile时必须事务重建。"});
    if (kind === "portable-state") blockers.push({code: "portable.incomplete", message: "data目录只能作为Windows Portable用户状态复用，不能单独接管为实例。"});
    return {
        root,
        kind,
        manifest,
        git,
        product: {exists: productExists, trusted: productTrusted, revision: product?.revision},
        state: {
            root: statePath,
            configExists: await pathExists(join(statePath, "config.yaml")),
            workspaceExists: await pathExists(join(statePath, "workspace")),
            databaseExists: await pathExists(join(statePath, "workspace", ".nbook", "neuro-book.sqlite")),
        },
        blockers,
        warnings,
    };
}

/** 廉价扫描有限搜索根；只有确认的NeuroBook或Installation目录进入结果。 */
export async function discoverInstances(roots: string[], registeredRoots: string[] = [], maxDepth = 3): Promise<InstanceDiscovery> {
    if (roots.length === 0) return {candidates: [], warnings: []};
    const candidates = new Map<string, OfflineInspection>();
    const warnings: InspectionIssue[] = [];
    const registered = new Set<string>();
    for (const root of registeredRoots) registered.add(rootKey(await realpath(root).catch(() => resolve(root))));
    const visited = new Set<string>();
    const visit = async (directory: string, depth: number): Promise<void> => {
        let canonical: string;
        try { canonical = await realpath(directory); }
        catch (error) { warnings.push({code: "scan.unreadable", message: `无法读取搜索目录：${directory} (${error instanceof Error ? error.message : String(error)})`}); return; }
        const key = rootKey(canonical);
        if (visited.has(key) || registered.has(key)) return;
        visited.add(key);
        const hasManifest = existsSync(join(canonical, ".deploy", "installation.json"));
        const hasGit = existsSync(join(canonical, ".git"));
        const hasPortableState = existsSync(join(canonical, "data", "config.yaml")) && existsSync(join(canonical, "data", "workspace"));
        if (hasManifest || hasPortableState || hasGit && await cheapNeuroBookIdentity(canonical)) {
            const inspection = await inspectInstance(canonical);
            if (inspection.kind !== "unrelated") candidates.set(rootKey(inspection.root), inspection);
            return;
        }
        if (depth >= maxDepth) return;
        let entries;
        try { entries = await readdir(canonical, {withFileTypes: true}); }
        catch (error) { warnings.push({code: "scan.unreadable", message: `无法扫描目录：${canonical} (${error instanceof Error ? error.message : String(error)})`}); return; }
        for (const entry of entries) {
            if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) continue;
            await visit(join(canonical, entry.name), depth + 1);
        }
    };
    for (const root of [...new Set(roots.map((item) => resolve(item)))]) await visit(root, 0);
    return {candidates: [...candidates.values()], warnings};
}

/** 一次用户操作共享的宿主环境检查。 */
export async function inspectEnvironment(): Promise<EnvironmentInspection> {
    const engine = await resolveContainerEngine().catch(() => null);
    return {
        bun: await inspectCommand("bun"),
        git: await inspectCommand("git"),
        containerEngine: engine,
        container: engine ? await inspectCommand(engine) : {available: false},
        compose: engine ? await inspectCommand(engine, ["compose", "version"]) : {available: false},
    };
}

export function configuredDiscoveryRoots(config: ManagerConfig): string[] {
    return (config.preferences.discoveryRoots ?? [resolve(config.preferences.installDirectory, "..")]).map((item) => resolve(item));
}

async function nearestCandidateRoot(start: string): Promise<string> {
    let current = start;
    while (true) {
        if (existsSync(join(current, ".deploy", "installation.json")) || existsSync(join(current, ".git"))) return current;
        const parent = dirname(current);
        if (parent === current) return start;
        current = parent;
    }
}

async function inspectNeuroBookGit(root: string, blockers: InspectionIssue[], allowedUntracked: string[] = []): Promise<GitInspection | undefined> {
    if (!await pathExists(join(root, ".git")) || !await cheapNeuroBookIdentity(root)) return undefined;
    const repository = await runCapture("git", ["remote", "get-url", "origin"], {cwd: root}).then((value) => value.trim()).catch(() => "");
    if (normalizeRepository(repository) !== normalizeRepository(DEFAULT_REPOSITORY)) return undefined;
    const branch = (await runCapture("git", ["branch", "--show-current"], {cwd: root})).trim();
    if (branch !== "master") blockers.push({code: "git.branch", message: `Git branch必须是master，当前为${branch || "detached HEAD"}`});
    const upstream = await runCapture("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {cwd: root}).then((value) => value.trim()).catch(() => undefined);
    if (upstream !== "origin/master") blockers.push({code: "git.upstream", message: `Git upstream必须是origin/master，当前为${upstream ?? "<missing>"}`});
    const revision = (await runCapture("git", ["rev-parse", "HEAD"], {cwd: root})).trim();
    const status = (await runCapture("git", ["status", "--porcelain"], {cwd: root})).split(/\r?\n/u).filter(Boolean);
    const dirty = status.some((line) => {
        if (!line.startsWith("?? ")) return true;
        const path = line.slice(3).replaceAll("\\", "/");
        return !allowedUntracked.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
    });
    if (dirty) blockers.push({code: "git.dirty", message: "Git worktree存在未提交或未跟踪改动；Manager不会自动stash、restore或reset。"});
    return {repository, branch, upstream, revision, dirty};
}

async function cheapNeuroBookIdentity(root: string): Promise<boolean> {
    try { return (JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {name?: string}).name === "neuro-book"; }
    catch { return false; }
}

/** 识别由Operation Journal证明已完整回滚、可以安全重试的Manager-owned空壳。 */
async function inspectRolledBackAdoption(root: string): Promise<boolean> {
    const deploy = join(root, ".deploy");
    if (!await pathExists(deploy)) return false;
    const runtime = join(root, ".runtime");
    if (await pathExists(runtime)) {
        const runtimeEntries = await readdir(runtime, {recursive: true});
        if (runtimeEntries.some((entry) => !entry.endsWith("manager"))) return false;
    }
    const deployEntries = await readdir(deploy, {recursive: true});
    const journalPaths = deployEntries.filter((entry) => /^operations[\\/].+\.json$/u.test(entry));
    const unexpectedFiles = deployEntries.filter((entry) => entry.includes(".") && !/^operations[\\/].+\.json$/u.test(entry));
    if (journalPaths.length === 0 || unexpectedFiles.length > 0) return false;
    for (const entry of journalPaths) {
        try {
            const journal = JSON.parse(await readFile(join(deploy, entry), "utf8")) as {phase?: string; outcome?: string};
            if (journal.phase !== "committed" || journal.outcome !== "rolled-back") return false;
        } catch {
            return false;
        }
    }
    return true;
}

async function inspectCommand(command: string, args = ["--version"]): Promise<CommandInspection> {
    if (!await commandAvailable(command, args)) return {available: false};
    const version = await runCapture(command, args).then((value) => value.split(/\r?\n/u)[0]?.trim()).catch(() => undefined);
    return {available: true, version};
}

function rootKey(path: string): string { const absolute = resolve(path); return process.platform === "win32" ? absolute.toLocaleLowerCase("en-US") : absolute; }
function normalizeRepository(repository: string): string { return repository.trim().replace(/^git@github\.com:/u, "https://github.com/").replace(/^ssh:\/\/git@github\.com\//u, "https://github.com/").replace(/\.git$/u, "").replace(/\/$/u, "").toLowerCase(); }
