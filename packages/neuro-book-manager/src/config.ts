import {randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {parse, stringify} from "yaml";

import {ensureDirectory, pathExists, writeJsonAtomic, writeTextAtomic} from "#manager/files";
import {selectAppSqliteUrl} from "#manager/app-sqlite-location";

/** 初始化 State Root，并返回本次新建的路径供事务回滚。 */
export async function ensureStateFiles(
    stateRoot: string,
    port: number,
    authEnabled: boolean,
    recordCreated?: (path: string) => Promise<void>,
): Promise<string[]> {
    const created: string[] = [];
    const workspaceRoot = join(stateRoot, "workspace");
    if (!await pathExists(workspaceRoot)) {
        created.push(workspaceRoot);
        await recordCreated?.(workspaceRoot);
    }
    await ensureDirectory(join(workspaceRoot, ".nbook"));
    if (!await pathExists(join(stateRoot, "logs"))) {
        created.push(join(stateRoot, "logs"));
        await recordCreated?.(join(stateRoot, "logs"));
    }
    await ensureDirectory(join(stateRoot, "logs"));
    const envPath = join(stateRoot, ".env");
    if (!await pathExists(envPath)) {
        created.push(envPath);
        await recordCreated?.(envPath);
        await writeTextAtomic(envPath, [
            `NUXT_PORT=${port}`,
            `PORT=${port}`,
            "DATABASE_KIND=sqlite",
            "DATABASE_URL=file:./workspace/.nbook/neuro-book.sqlite",
            `NUXT_SESSION_PASSWORD=${randomBytes(32).toString("hex")}`,
            "",
        ].join("\n"));
    }
    const bootConfigPath = join(stateRoot, "config.yaml");
    if (!await pathExists(bootConfigPath)) {
        created.push(bootConfigPath);
        await recordCreated?.(bootConfigPath);
        await writeTextAtomic(bootConfigPath, stringify({
            server: {host: "0.0.0.0", port},
            database: {kind: "${DATABASE_KIND}", url: "${DATABASE_URL}"},
            auth: {enabled: authEnabled},
        }));
    }
    const globalConfigPath = join(workspaceRoot, ".nbook", "config.json");
    if (!await pathExists(globalConfigPath)) {
        created.push(globalConfigPath);
        await recordCreated?.(globalConfigPath);
        await writeJsonAtomic(globalConfigPath, {models: {default: null, providers: []}});
    }
    return created;
}

/**
 * 在任何 Product 进程或容器启动前建立可写的运行目录。
 *
 * Container Engine 会以 root 创建不存在的 bind source，导致随后以宿主用户运行的
 * Product 无法写入；因此这些目录必须由 Manager 宿主进程负责创建。目录内容均属于
 * 可删除缓存或持久工具状态，调用方无需在每次启动时重新初始化其中内容。
 */
export async function ensureWritableRuntimeRoots(stateRoot: string, cacheRoot: string): Promise<void> {
    await ensureDirectory(join(stateRoot, "tool-state"));
    await ensureDirectory(cacheRoot);
}

/** 读取简单 KEY=VALUE 环境文件。 */
export async function loadStateEnv(stateRoot: string): Promise<NodeJS.ProcessEnv> {
    const content = await readFile(join(stateRoot, ".env"), "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return "";
        }
        throw error;
    });
    const result: NodeJS.ProcessEnv = {};
    for (const line of content.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }
        const separator = trimmed.indexOf("=");
        if (separator > 0) {
            result[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
        }
    }
    return result;
}

/** 按Product相同优先级读取State Root中的App SQLite逻辑URL。 */
export async function resolveStateDatabaseUrl(stateRoot: string): Promise<string> {
    const environment = await loadStateEnv(stateRoot);
    const bootConfigPath = join(stateRoot, "config.yaml");
    const bootText = await readFile(bootConfigPath, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "";
        throw error;
    });
    const expanded = bootText.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-(.*?))?\}/gu, (_match, name: string, fallback: string | undefined) => {
        const value = environment[name] ?? process.env[name];
        return value !== undefined && value !== "" ? value : fallback ?? "";
    });
    const boot = expanded ? parse(expanded) as {database?: {url?: unknown}} | null : null;
    const bootUrl = typeof boot?.database?.url === "string" ? boot.database.url : undefined;
    return selectAppSqliteUrl(environment.DATABASE_URL, bootUrl);
}

/** 仅供 Windows Portable 创建管理员成功后启用鉴权。 */
export async function enableAuthentication(stateRoot: string): Promise<void> {
    const path = join(stateRoot, "config.yaml");
    const config = parse(await readFile(path, "utf8")) as {
        server?: {host?: string; port?: number};
        database?: {kind?: string; url?: string};
        auth?: {enabled?: boolean};
    };
    config.auth = {...config.auth, enabled: true};
    await writeTextAtomic(path, stringify(config));
}
