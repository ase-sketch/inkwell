import {execFileSync} from "node:child_process";
import {existsSync, lstatSync, readFileSync, readdirSync} from "node:fs";
import {dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {resolveAgentAcceptanceRoot, resolveAgentCacheRoot, resolveAgentTempRoot, resolveAgentTestRoot, resolveAgentWorktreeRoot} from "@notnotype/neuro-book-test-support/paths";

export const GOVERNANCE_NON_EMPTY_LINE_LIMITS: Record<string, number> = {
    "AGENTS.md": 300,
    ".agents/AGENTS.md": 100,
    ".agents/README.md": 100,
    "packages/neuro-book/AGENTS.md": 100,
    "scripts/AGENTS.md": 100,
    "scripts/release/AGENTS.md": 100,
    "packages/AGENTS.md": 100,
};

export function defaultRepoRoot(moduleUrl: string): string {
    return resolve(fileURLToPath(moduleUrl), "../../..");
}

export function git(repoRoot: string, args: readonly string[]): string {
    return execFileSync("git", [...args], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();
}

export function gitRevision(repoRoot: string): string {
    return git(repoRoot, ["rev-parse", "HEAD"]);
}

export function gitBranch(repoRoot: string): string {
    return git(repoRoot, ["branch", "--show-current"]);
}

export function readRepoText(repoRoot: string, relativePath: string): string {
    return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

export function hasDirectory(repoRoot: string, relativePath: string): boolean {
    const path = resolve(repoRoot, relativePath);
    return existsSync(path) && lstatSync(path).isDirectory();
}

export function hasFile(repoRoot: string, relativePath: string): boolean {
    const path = resolve(repoRoot, relativePath);
    return existsSync(path) && lstatSync(path).isFile();
}

export function governanceRoots(repoRoot: string, env: NodeJS.ProcessEnv = process.env) {
    const agentRoot = resolveAgentTempRoot(env);
    return {
        agentRoot,
        testRoot: resolveAgentTestRoot(env.NBOOK_TEST_RUN_ID && /^[a-f0-9]{8}$/u.test(env.NBOOK_TEST_RUN_ID) ? env.NBOOK_TEST_RUN_ID : "00000000", env),
        acceptanceRoot: resolveAgentAcceptanceRoot(env),
        cacheRoot: resolveAgentCacheRoot("source-dev", env),
        worktreeRoot: resolveAgentWorktreeRoot(primaryCheckoutRoot(repoRoot), env),
    };
}

export function primaryCheckoutRoot(repoRoot: string): string {
    const commonDir = resolve(repoRoot, git(repoRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
    return dirname(commonDir);
}

export function verifyMonorepoWorktreeLayout(repoRoot: string): string[] {
    const failures: string[] = [];
    const primaryRoot = primaryCheckoutRoot(repoRoot);
    const canonicalRoot = resolve(primaryRoot, ".worktree");
    for (const entry of parseWorktreeEntries(git(repoRoot, ["worktree", "list", "--porcelain"]))) {
        const worktree = typeof entry.worktree === "string" ? entry.worktree : null;
        if (!worktree || samePath(worktree, primaryRoot)) continue;
        if (!isAbsoluteInside(worktree, canonicalRoot)) failures.push(`monorepo worktree 位置违规：${worktree}（应位于 ${canonicalRoot}）`);
    }
    if (!samePath(repoRoot, primaryRoot) && !isAbsoluteInside(repoRoot, canonicalRoot)) {
        failures.push(`当前 worktree 不在主 checkout 的 canonical 根下：${repoRoot}`);
    }
    return failures;
}

function parseWorktreeEntries(text: string): Array<Record<string, string | true>> {
    return text.split(/\n\n/u).filter(Boolean).map((block) => Object.fromEntries(block.split(/\r?\n/u).map((line) => {
        const separator = line.indexOf(" ");
        return separator < 0 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)];
    })));
}

function samePath(left: string, right: string): boolean {
    return normalizePath(left) === normalizePath(right);
}

function isAbsoluteInside(path: string, parent: string): boolean {
    const remainder = relative(normalizePath(parent), normalizePath(path));
    return remainder !== "" && !remainder.startsWith("..") && !remainder.startsWith("/") && !/^[A-Za-z]:/u.test(remainder);
}

function normalizePath(path: string): string {
    const normalized = resolve(path).replaceAll("\\", "/");
    return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function verifyGovernanceDocumentLimits(repoRoot: string): string[] {
    const failures: string[] = [];
    for (const [relativePath, limit] of Object.entries(GOVERNANCE_NON_EMPTY_LINE_LIMITS)) {
        if (!hasFile(repoRoot, relativePath)) continue;
        const actual = readRepoText(repoRoot, relativePath)
            .split(/\r?\n/u)
            .filter((line) => line.trim().length > 0)
            .length;
        if (actual > limit) failures.push(`治理入口超过非空行上限：${relativePath} ${String(actual)} > ${String(limit)}`);
    }
    return failures;
}

export function verifyMonorepoCutover(repoRoot: string): string[] {
    const failures: string[] = [];
    const tracked = new Set(git(repoRoot, ["ls-files"]).split(/\r?\n/u).filter(Boolean));
    for (const path of tracked) {
        if (/^(?:app|server|shared|profile-sdk|variable-sdk|world-engine|prisma)(?:\/|$)/u.test(path)) failures.push(`旧根应用路径重新出现：${path}`);
    }
    for (const path of [
        "nuxt.config.ts",
        "prisma.config.ts",
        "vitest.config.ts",
        "uno.config.ts",
        "docs/specs/architecture/monorepo-boundaries.md",
        "scripts/cli/sync-nb-history.ts",
        "scripts/cli/sync-nb-workflow.ts",
        "scripts/cli/sync-llmlint-skill.ts",
    ]) {
        if (tracked.has(path)) failures.push(`迁移前入口重新出现：${path}`);
    }
    const rootManifest = readJson<{version?: unknown; scripts?: Record<string, string>}>(resolve(repoRoot, "package.json"), failures, "package.json");
    if (!rootManifest) return failures;
    if (rootManifest.version !== undefined) failures.push("根 workspace orchestrator 不得声明产品 version");
    const forbiddenScripts = ["dev", "dev:runtime", "build", "typecheck", "test", "generate", "migration:check", "sync:nb-history", "sync:nb-workflow"];
    for (const name of forbiddenScripts) if (rootManifest.scripts?.[name]) failures.push(`根 workspace 保留应用或同步命令：${name}`);
    return failures;
}

export function verifyApplicationScriptBoundary(repoRoot: string): string[] {
    const failures: string[] = [];
    const applicationRoot = resolve(repoRoot, "packages", "neuro-book");
    const allowedPath = "scripts/cli/source-dev.ts";
    const allowedImport = "#scripts/utils/workspace-roots";
    for (const relativePath of walkSourceFiles(applicationRoot)) {
        const text = readFileSync(resolve(applicationRoot, relativePath), "utf8");
        const imports = [...text.matchAll(/["'](#scripts\/[^"']+)["']/gu)].map((match) => match[1]);
        if (imports.length === 0) continue;
        if (relativePath !== allowedPath || imports.some((specifier) => specifier !== allowedImport)) {
            failures.push(`应用跨根 #scripts 导入违规：packages/neuro-book/${relativePath} -> ${imports.join(", ")}`);
        }
    }
    return failures;
}

function walkSourceFiles(root: string, relativeRoot = ""): string[] {
    const absoluteRoot = resolve(root, relativeRoot);
    if (!existsSync(absoluteRoot)) return [];
    const files: string[] = [];
    for (const entry of readdirSync(absoluteRoot, {withFileTypes: true})) {
        const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if ([".nuxt", ".output", "node_modules", ".compiled", ".staging"].includes(entry.name)) continue;
            files.push(...walkSourceFiles(root, relativePath));
        } else if (/\.(?:ts|tsx|js|mjs|cjs)$/u.test(entry.name)) {
            files.push(relativePath);
        }
    }
    return files;
}

export function verifyWorkspacePackageGovernance(repoRoot: string): string[] {
    const failures: string[] = [];
    const packagesRoot = resolve(repoRoot, "packages");
    const packageNames = existsSync(packagesRoot)
        ? readdirSync(packagesRoot, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
        : [];
    const manifestNames = new Map<string, string>();
    const manifests = new Map<string, Record<string, unknown>>();

    for (const packageName of packageNames) {
        const packageRoot = resolve(packagesRoot, packageName);
        const manifest = readJson<Record<string, unknown>>(resolve(packageRoot, "package.json"), failures, `packages/${packageName}/package.json`);
        if (!manifest) continue;
        manifests.set(packageName, manifest);
        if (typeof manifest.name !== "string" || !manifest.name) failures.push(`workspace包 package.json 缺少 name：packages/${packageName}/package.json`);
        else if (manifestNames.has(manifest.name)) failures.push(`workspace包 package name 重复：${manifest.name}`);
        else manifestNames.set(manifest.name, packageName);
    }

    for (const packageName of packageNames) {
        const packageRoot = resolve(packagesRoot, packageName);
        const manifest = manifests.get(packageName);
        if (!manifest) continue;
        for (const runtimeName of [".agent", ".local", ".worktree"] as const) {
            const runtimePath = resolve(packageRoot, runtimeName);
            if (!pathEntryExists(runtimePath)) continue;
            const relativePath = `packages/${packageName}/${runtimeName}`;
            if (!isGitIgnored(repoRoot, `${relativePath}/placeholder`)) failures.push(`包级运行态未被忽略：${relativePath}`);
            if (trackedPathExists(repoRoot, relativePath)) failures.push(`包级运行态被 Git 跟踪：${relativePath}`);
            if (runtimeName === ".worktree") failures.push(`临时 package worktree 尚未清理：${relativePath}`);
        }

        for (const dependencyName of workspaceDependencies(manifest)) {
            if (!manifestNames.has(dependencyName)) failures.push(`workspace依赖未对应本地包：packages/${packageName} -> ${dependencyName}`);
        }
        if (packageName !== "neuro-book" && workspaceDependencies(manifest).includes("@notnotype/neuro-book")) {
            failures.push(`自治或内部包不得依赖主应用：packages/${packageName} -> @notnotype/neuro-book`);
        }
    }
    return failures;
}

function workspaceDependencies(manifest: Record<string, unknown>): string[] {
    const names = new Set<string>();
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const value = manifest[field];
        if (!isRecord(value)) continue;
        for (const [name, version] of Object.entries(value)) {
            if (typeof version === "string" && (version.startsWith("workspace:") || version === "*")) names.add(name);
        }
    }
    return [...names].sort();
}

function readJson<T>(absolutePath: string, failures: string[], label: string): T | null {
    if (!existsSync(absolutePath)) {
        failures.push(`缺少 JSON 文件：${label}`);
        return null;
    }
    try {
        return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
    } catch (error) {
        failures.push(`JSON 无法解析：${label}：${String(error)}`);
        return null;
    }
}

function pathEntryExists(absolutePath: string): boolean {
    return existsSync(absolutePath);
}

function isGitIgnored(repoRoot: string, relativePath: string): boolean {
    try {
        git(repoRoot, ["check-ignore", "--no-index", "-q", relativePath]);
        return true;
    } catch {
        return false;
    }
}

function trackedPathExists(repoRoot: string, relativePath: string): boolean {
    const output = git(repoRoot, ["ls-files", relativePath]);
    return output.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
