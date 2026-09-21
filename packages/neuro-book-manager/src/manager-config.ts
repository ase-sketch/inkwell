import {randomUUID} from "node:crypto";
import {homedir} from "node:os";
import {basename, join, resolve} from "node:path";

import {Type} from "typebox";
import {Value} from "typebox/value";
import {prerelease} from "semver";

import {readJson, writeJsonAtomic} from "#manager/files";
import {readInstallationManifest} from "#manager/manifest-store";
import {installationPaths} from "#manager/paths";
import {localAppDataRoot} from "#manager/root-locators";
import type {ManagerConfig, ManagerInstance, ManagerPreferences} from "#manager/types";
import type {ReleaseChannel} from "@notnotype/neuro-book-contracts/installation";
import {MANAGER_VERSION} from "#manager/version-info";

const ISO_DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";

const ManagerConfigSchema = Type.Object({
    schemaVersion: Type.Literal(1),
    defaultInstanceId: Type.Union([Type.String({minLength: 1}), Type.Null()]),
    preferences: Type.Object({
        channel: Type.Union([Type.Literal("stable"), Type.Literal("canary")]),
        installDirectory: Type.String({minLength: 1}),
        discoveryRoots: Type.Optional(Type.Array(Type.String({minLength: 1}))),
    }, {additionalProperties: false}),
    instances: Type.Array(Type.Object({
        id: Type.String({minLength: 1}),
        name: Type.String({minLength: 1}),
        root: Type.String({minLength: 1}),
        registeredAt: Type.String({pattern: ISO_DATE_PATTERN}),
        lastUsedAt: Type.String({pattern: ISO_DATE_PATTERN}),
    }, {additionalProperties: false})),
}, {additionalProperties: false});

/** 返回用户级 Manager 配置路径；测试和便携入口可通过环境变量隔离。 */
export function managerConfigPath(): string {
    return resolve(process.env.NEURO_BOOK_MANAGER_CONFIG ?? join(homedir(), ".neuro-book-manager", "config.json"));
}

/** 构造首次运行时的默认配置，但不会主动写盘。 */
export function defaultManagerConfig(): ManagerConfig {
    const installDirectory = process.platform === "win32"
        ? join(localAppDataRoot(), "Programs", "NeuroBook")
        : join(homedir(), "neuro-book");
    return {
        schemaVersion: 1,
        defaultInstanceId: null,
        preferences: {
            channel: prerelease(MANAGER_VERSION) ? "canary" : "stable",
            installDirectory,
            discoveryRoots: [process.platform === "win32" ? join(localAppDataRoot(), "Programs") : homedir()],
        },
        instances: [],
    };
}

/** 读取并严格校验用户级 Manager 配置。 */
export async function readManagerConfig(path = managerConfigPath()): Promise<ManagerConfig> {
    const value = await readJson(path);
    if (value === null) return defaultManagerConfig();
    if (!Value.Check(ManagerConfigSchema, value)) {
        throw new Error(`Manager 配置不符合 schema v1：${path}`);
    }
    const config = value as ManagerConfig;
    const ids = new Set<string>();
    const roots = new Set<string>();
    for (const instance of config.instances) {
        if (ids.has(instance.id)) throw new Error(`Manager 配置包含重复实例 ID：${instance.id}`);
        const rootKey = normalizeRootKey(instance.root);
        if (roots.has(rootKey)) throw new Error(`Manager 配置包含重复实例目录：${instance.root}`);
        ids.add(instance.id);
        roots.add(rootKey);
    }
    if (config.defaultInstanceId && !ids.has(config.defaultInstanceId)) {
        throw new Error(`Manager 默认实例不存在：${config.defaultInstanceId}`);
    }
    return {...config, preferences: {...config.preferences, discoveryRoots: normalizedDiscoveryRoots(config.preferences)}};
}

/** 注册一个已有 installation manifest 的实例，并可更新安装偏好。 */
export async function registerManagerInstance(options: {
    root: string;
    name?: string;
    preferences?: Partial<ManagerPreferences>;
    makeDefault?: boolean;
    configPath?: string;
}): Promise<ManagerInstance> {
    const root = resolve(options.root);
    const manifest = await readInstallationManifest(installationPaths(root).manifest);
    if (!manifest) throw new Error(`目录不是 NeuroBook Manager 实例：${root}`);
    const path = options.configPath ?? managerConfigPath();
    const config = await readManagerConfig(path);
    const now = new Date().toISOString();
    const existing = config.instances.find((instance) => normalizeRootKey(instance.root) === normalizeRootKey(root));
    const instance: ManagerInstance = existing
        ? {
            ...existing,
            name: uniqueInstanceName(config, normalizedName(options.name ?? existing.name), existing.id),
            root,
            lastUsedAt: now,
        }
        : {
            id: randomUUID(),
            name: uniqueInstanceName(config, normalizedName(options.name ?? (basename(root) || "NeuroBook"))),
            root,
            registeredAt: now,
            lastUsedAt: now,
        };
    const instances = existing
        ? config.instances.map((item) => item.id === existing.id ? instance : item)
        : [...config.instances, instance];
    const preferences: ManagerPreferences = {
        channel: options.preferences?.channel ?? config.preferences.channel,
        installDirectory: resolve(options.preferences?.installDirectory ?? config.preferences.installDirectory),
        discoveryRoots: normalizedDiscoveryRoots({
            installDirectory: options.preferences?.installDirectory ?? config.preferences.installDirectory,
            discoveryRoots: options.preferences?.discoveryRoots ?? config.preferences.discoveryRoots,
        }),
    };
    const makeDefault = options.makeDefault ?? config.defaultInstanceId === null;
    await writeJsonAtomic(path, {
        ...config,
        preferences,
        instances,
        defaultInstanceId: makeDefault ? instance.id : config.defaultInstanceId,
    });
    return instance;
}

/** 从用户级索引中删除实例记录，不删除 Installation Root。 */
export async function forgetManagerInstance(reference: string, path = managerConfigPath()): Promise<ManagerConfig> {
    const config = await readManagerConfig(path);
    const target = findManagerInstance(config, reference);
    if (!target) throw new Error(`找不到已注册实例：${reference}`);
    const instances = config.instances.filter((instance) => instance.id !== target.id);
    const next: ManagerConfig = {
        ...config,
        instances,
        defaultInstanceId: config.defaultInstanceId === target.id ? (instances[0]?.id ?? null) : config.defaultInstanceId,
    };
    await writeJsonAtomic(path, next);
    return next;
}

/** 设置默认实例，供目录外命令和 TUI 使用。 */
export async function setDefaultManagerInstance(reference: string, path = managerConfigPath()): Promise<ManagerInstance> {
    const config = await readManagerConfig(path);
    const target = findManagerInstance(config, reference);
    if (!target) throw new Error(`找不到已注册实例：${reference}`);
    await writeJsonAtomic(path, {...config, defaultInstanceId: target.id});
    return target;
}

/** 按 ID、名称或绝对目录查找已注册实例。 */
export function findManagerInstance(config: ManagerConfig, reference: string): ManagerInstance | null {
    const rootKey = normalizeRootKey(reference);
    return config.instances.find((instance) => (
        instance.id === reference
        || instance.name === reference
        || normalizeRootKey(instance.root) === rootKey
    )) ?? null;
}

/** 更新用户偏好，不改变任何实例或 Installation Root。 */
export async function updateManagerPreferences(preferences: {
    channel?: ReleaseChannel;
    installDirectory?: string;
}, path = managerConfigPath()): Promise<ManagerConfig> {
    const config = await readManagerConfig(path);
    const next: ManagerConfig = {
        ...config,
        preferences: {
            channel: preferences.channel ?? config.preferences.channel,
            installDirectory: resolve(preferences.installDirectory ?? config.preferences.installDirectory),
            discoveryRoots: normalizedDiscoveryRoots(config.preferences),
        },
    };
    await writeJsonAtomic(path, next);
    return next;
}

/** 增加有限实例搜索根。 */
export async function addDiscoveryRoot(root: string, path = managerConfigPath()): Promise<ManagerConfig> {
    const config = await readManagerConfig(path);
    const roots = normalizedDiscoveryRoots({...config.preferences, discoveryRoots: [...(config.preferences.discoveryRoots ?? []), root]});
    const next = {...config, preferences: {...config.preferences, discoveryRoots: roots}};
    await writeJsonAtomic(path, next);
    return next;
}

/** 删除有限实例搜索根。 */
export async function removeDiscoveryRoot(root: string, path = managerConfigPath()): Promise<ManagerConfig> {
    const config = await readManagerConfig(path);
    const key = normalizeRootKey(root);
    const roots = normalizedDiscoveryRoots(config.preferences).filter((item) => normalizeRootKey(item) !== key);
    const next = {...config, preferences: {...config.preferences, discoveryRoots: roots}};
    await writeJsonAtomic(path, next);
    return next;
}

/** 清理并验证用户可见实例名称。 */
function normalizedName(name: string): string {
    const value = name.trim();
    if (!value) throw new Error("实例名称不能为空。");
    return value;
}

/** 在保留人类可读名称的前提下生成唯一实例名。 */
function uniqueInstanceName(config: ManagerConfig, requested: string, exceptId?: string): string {
    if (!config.instances.some((instance) => instance.id !== exceptId && instance.name === requested)) return requested;
    let suffix = 2;
    while (config.instances.some((instance) => instance.id !== exceptId && instance.name === `${requested} ${suffix}`)) suffix += 1;
    return `${requested} ${suffix}`;
}

/** 生成可跨 Windows 大小写差异比较的绝对目录键。 */
function normalizeRootKey(path: string): string {
    const normalized = resolve(path);
    return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

function normalizedDiscoveryRoots(preferences: Pick<ManagerPreferences, "installDirectory" | "discoveryRoots">): string[] {
    const values = preferences.discoveryRoots ?? [resolve(preferences.installDirectory, "..")];
    const roots = new Map<string, string>();
    for (const value of values) roots.set(normalizeRootKey(value), resolve(value));
    return [...roots.values()];
}
