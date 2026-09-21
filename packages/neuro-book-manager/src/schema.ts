import {Type} from "typebox";
import type {Static, TSchema} from "typebox";
import {Value} from "typebox/value";
import {isAbsolute, join, resolve} from "node:path";

import {
    InstallationManifestSchema,
    InstallationRootLocatorsSchema,
    parseInstallationManifest,
    type InstallationManifest,
    type InstallationRootLocators,
} from "@notnotype/neuro-book-contracts/installation";
import {installationPaths} from "#manager/paths";
import type {OperationJournal} from "#manager/types";
import {assertAbsolutePathWithin, installationRelativePath} from "#manager/installation-path";
import {
    INSTALLED_WINDOWS_ROOT_LOCATORS,
    INSTALLED_MACOS_ROOT_LOCATORS,
    INSTALLATION_SCOPED_ROOT_LOCATORS,
    PORTABLE_ROOT_LOCATORS,
    rootLocatorsEqual,
} from "@notnotype/neuro-book-contracts/installation";
import {resolveInstallationRoots} from "#manager/root-locators";
import {sourceDockerImageName, sourceDockerImageSuffix} from "#manager/source-docker-image";
import {resolveAppSqliteLocation} from "#manager/app-sqlite-location";

const ISO_DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const RelativePathSchema = Type.String({minLength: 1});
const RevisionSchema = Type.String({pattern: "^[a-f0-9]{40}$"});
const ContainerEngineSchema = Type.Union([Type.Literal("docker"), Type.Literal("podman")]);
const OperationPhaseSchema = Type.Union([
    Type.Literal("planned"),
    Type.Literal("staged"),
    Type.Literal("validated"),
    Type.Literal("switched"),
    Type.Literal("migrated"),
    Type.Literal("healthy"),
    Type.Literal("committed"),
]);

const OperationEffectStateSchema = Type.Union([Type.Literal("planned"), Type.Literal("applied")]);
const OperationEffectSchema = Type.Union([
    Type.Object({
        kind: Type.Literal("path-create"),
        state: OperationEffectStateSchema,
        owner: Type.Union([
            Type.Literal("staging"), Type.Literal("backup"), Type.Literal("source"), Type.Literal("runtime"), Type.Literal("tool"),
            Type.Literal("manager"), Type.Literal("wrapper"), Type.Literal("state"), Type.Literal("portable-launcher"),
        ]),
        path: RelativePathSchema,
        cleanupError: Type.Optional(Type.String({minLength: 1})),
    }, {additionalProperties: false}),
    Type.Object({
        kind: Type.Literal("path-retire"),
        state: OperationEffectStateSchema,
        owner: Type.Union([Type.Literal("runtime"), Type.Literal("tool")]),
        path: RelativePathSchema,
        cleanupError: Type.Optional(Type.String({minLength: 1})),
    }, {additionalProperties: false}),
    Type.Object({
        kind: Type.Literal("component-switch"),
        state: OperationEffectStateSchema,
        owner: Type.Union([Type.Literal("source"), Type.Literal("product"), Type.Literal("managed-assets")]),
    }, {additionalProperties: false}),
    Type.Object({
        kind: Type.Literal("wrapper-switch"),
        state: OperationEffectStateSchema,
        owner: Type.Literal("wrapper"),
        previousState: Type.Union([Type.Literal("present"), Type.Literal("missing")]),
        backupPath: Type.Optional(Type.String({minLength: 1})),
    }, {additionalProperties: false}),
    Type.Object({kind: Type.Literal("manifest-switch"), state: OperationEffectStateSchema, owner: Type.Literal("manifest")}, {additionalProperties: false}),
    Type.Object({
        kind: Type.Literal("receipt-switch"),
        state: OperationEffectStateSchema,
        owner: Type.Literal("receipt"),
        path: Type.Literal(".deploy/product-runtime-receipt.json"),
        previousState: Type.Union([Type.Literal("present"), Type.Literal("missing")]),
        backupPath: Type.Optional(Type.String({minLength: 1})),
        cleanupError: Type.Optional(Type.String({minLength: 1})),
    }, {additionalProperties: false}),
    Type.Object({kind: Type.Literal("git-checkout"), state: OperationEffectStateSchema, owner: Type.Literal("source")}, {additionalProperties: false}),
    Type.Object({
        kind: Type.Literal("git-fast-forward"),
        state: OperationEffectStateSchema,
        owner: Type.Literal("source"),
        previousRevision: RevisionSchema,
        targetRevision: RevisionSchema,
        dependenciesInstalled: Type.Optional(Type.Boolean()),
    }, {additionalProperties: false}),
    Type.Object({
        kind: Type.Literal("docker-image"),
        state: OperationEffectStateSchema,
        owner: Type.Literal("product"),
        image: Type.String({minLength: 1}),
        previousImage: Type.Optional(Type.String({minLength: 1})),
        previousImageRetired: Type.Optional(Type.Boolean()),
        cleanupError: Type.Optional(Type.String({minLength: 1})),
    }, {additionalProperties: false}),
    Type.Object({
        kind: Type.Literal("compose"),
        state: OperationEffectStateSchema,
        owner: Type.Literal("compose"),
        previousState: Type.Union([Type.Literal("running"), Type.Literal("stopped"), Type.Literal("missing")]),
        stopped: Type.Boolean(),
        previousCompose: Type.Optional(Type.String({minLength: 1})),
        created: Type.Boolean(),
        previousImage: Type.Optional(Type.String({minLength: 1})),
        targetImage: Type.Optional(Type.String({minLength: 1})),
    }, {additionalProperties: false}),
    Type.Object({
        kind: Type.Literal("candidate-container"),
        state: OperationEffectStateSchema,
        owner: Type.Literal("application"),
        containerId: Type.Optional(Type.String({pattern: "^[a-f0-9]{12,64}$"})),
        stopped: Type.Boolean(),
    }, {additionalProperties: false}),
    Type.Object({
        kind: Type.Literal("sqlite-backup"),
        state: OperationEffectStateSchema,
        owner: Type.Literal("app-sqlite"),
        configuredUrl: Type.String({minLength: 1}),
        stateRoot: Type.String({minLength: 1}),
        hostPath: Type.String({minLength: 1}),
        backupPath: Type.String({minLength: 1}),
        checkpoint: Type.Object({
            busy: Type.Integer({minimum: 0}),
            log: Type.Integer({minimum: -1}),
            checkpointed: Type.Integer({minimum: -1}),
        }, {additionalProperties: false}),
    }, {additionalProperties: false}),
]);

const OperationJournalV5Schema = Type.Object({
    schemaVersion: Type.Literal(5),
    id: Type.String({minLength: 1}),
    action: Type.Union([Type.Literal("install"), Type.Literal("update"), Type.Literal("start")]),
    phase: OperationPhaseSchema,
    root: Type.String({minLength: 1}),
    containerEngine: Type.Union([ContainerEngineSchema, Type.Null()]),
    effects: Type.Array(OperationEffectSchema),
    backupRoot: Type.String({minLength: 1}),
    previousManifest: Type.Union([InstallationManifestSchema, Type.Null()]),
    nextManifest: Type.Union([InstallationManifestSchema, Type.Null()]),
    migrationRoot: Type.Optional(Type.String({minLength: 1})),
    applicationStateMigration: Type.Optional(Type.Object({
        runId: Type.String({pattern: "^[A-Za-z0-9_-]+$"}),
        state: Type.Union([
            Type.Literal("planned"),
            Type.Literal("applying"),
            Type.Literal("applied"),
            Type.Literal("rolled_back"),
        ]),
    }, {additionalProperties: false})),
    outcome: Type.Optional(Type.Union([Type.Literal("success"), Type.Literal("rolled-back")])),
    createdAt: Type.String({pattern: ISO_DATE_PATTERN}),
    updatedAt: Type.String({pattern: ISO_DATE_PATTERN}),
}, {additionalProperties: false});

export const OperationJournalSchema = Type.Object({
    ...OperationJournalV5Schema.properties,
    schemaVersion: Type.Literal(6),
    roots: InstallationRootLocatorsSchema,
}, {additionalProperties: false});

/** v4 已使用统一 Application State operation，但尚未表达 start action。 */
const OperationJournalV4Schema = Type.Object({
    schemaVersion: Type.Literal(4),
    id: Type.String({minLength: 1}),
    action: Type.Union([Type.Literal("install"), Type.Literal("update")]),
    phase: OperationPhaseSchema,
    root: Type.String({minLength: 1}),
    containerEngine: Type.Union([ContainerEngineSchema, Type.Null()]),
    effects: Type.Array(OperationEffectSchema),
    backupRoot: Type.String({minLength: 1}),
    previousManifest: Type.Union([InstallationManifestSchema, Type.Null()]),
    nextManifest: Type.Union([InstallationManifestSchema, Type.Null()]),
    migrationRoot: Type.Optional(Type.String({minLength: 1})),
    applicationStateMigration: Type.Optional(Type.Object({
        runId: Type.String({pattern: "^[A-Za-z0-9_-]+$"}),
        state: Type.Union([Type.Literal("planned"), Type.Literal("applying"), Type.Literal("applied"), Type.Literal("rolled_back")]),
    }, {additionalProperties: false})),
    outcome: Type.Optional(Type.Union([Type.Literal("success"), Type.Literal("rolled-back")])),
    createdAt: Type.String({pattern: ISO_DATE_PATTERN}),
    updatedAt: Type.String({pattern: ISO_DATE_PATTERN}),
}, {additionalProperties: false});

/** v3 只用于 Manager 首次读取时转换旧 Attachment 专用 operation。 */
const OperationJournalV3Schema = Type.Object({
    schemaVersion: Type.Literal(3),
    id: Type.String({minLength: 1}),
    action: Type.Union([Type.Literal("install"), Type.Literal("update")]),
    phase: OperationPhaseSchema,
    root: Type.String({minLength: 1}),
    containerEngine: Type.Union([ContainerEngineSchema, Type.Null()]),
    effects: Type.Array(OperationEffectSchema),
    backupRoot: Type.String({minLength: 1}),
    previousManifest: Type.Union([InstallationManifestSchema, Type.Null()]),
    nextManifest: Type.Union([InstallationManifestSchema, Type.Null()]),
    migrationRoot: Type.Optional(Type.String({minLength: 1})),
    attachmentMigration: Type.Optional(Type.Object({
        runId: Type.String({pattern: "^[A-Za-z0-9_-]+-attachment$"}),
        state: Type.Union([Type.Literal("planned"), Type.Literal("applied"), Type.Literal("rolled_back")]),
        migratedSessions: Type.Integer({minimum: 1}),
        sessions: Type.Array(Type.Object({
            sessionId: Type.Union([Type.Integer(), Type.Null()]),
            sourcePath: Type.String({minLength: 1}),
            sourceHash: Type.String({pattern: "^[a-f0-9]{64}$"}),
            targetHash: Type.String({pattern: "^[a-f0-9]{64}$"}),
            backupPath: Type.Optional(Type.String({minLength: 1})),
        }, {additionalProperties: false}), {minItems: 1}),
    }, {additionalProperties: false})),
    outcome: Type.Optional(Type.Union([Type.Literal("success"), Type.Literal("rolled-back")])),
    createdAt: Type.String({pattern: ISO_DATE_PATTERN}),
    updatedAt: Type.String({pattern: ISO_DATE_PATTERN}),
}, {additionalProperties: false});



/** 严格解析崩溃恢复账本，禁止未经校验的路径和 Manifest 进入回滚流程。 */
export function parseOperationJournal(value: unknown, path: string): OperationJournal {
    assertSchema(OperationJournalSchema, value, `Operation journal 不符合 schema：${path}`);
    const journal = value as OperationJournal;
    if (!isAbsolute(journal.root)) {
        throw new Error(`Operation root必须是绝对路径：${journal.root}`);
    }
    const journalRoot = resolve(journal.root);
    assertOperationRootLocators(journal.roots);
    if (journal.previousManifest) parseInstallationManifest(journal.previousManifest);
    if (journal.nextManifest) parseInstallationManifest(journal.nextManifest);
    for (const manifest of [journal.previousManifest, journal.nextManifest]) {
        if (manifest && !rootLocatorsEqual(journal.roots, manifest.roots)) {
            throw new Error(`Operation journal与Installation Manifest的Root Locator不一致：${path}`);
        }
    }
    const paths = installationPaths(journalRoot, journal.roots);
    assertAbsolutePathWithin(paths.backups, journal.backupRoot, "Operation backupRoot");
    const effectIdentities = new Set<string>();
    for (const effect of journal.effects) {
        assertOperationEffect(journal, effect, path);
        const identity = operationEffectIdentity(effect);
        if (effectIdentities.has(identity)) throw new Error(`Operation effect重复：${identity}`);
        effectIdentities.add(identity);
    }
    if (journal.nextManifest) {
        const referencedPaths = componentPaths(journal.nextManifest);
        for (const effect of journal.effects) {
            if (effect.kind !== "path-retire") continue;
            const normalized = effect.path.replaceAll("\\", "/").replace(/\/$/u, "");
            if (referencedPaths.some((componentPath) => componentPath === normalized || componentPath.startsWith(`${normalized}/`))) {
                throw new Error(`Operation path-retire仍包含nextManifest引用的组件目录：${effect.path}`);
            }
        }
    }
    if (journal.applicationStateMigration && !journal.nextManifest) {
        throw new Error(`Application State migration Operation journal缺少nextManifest：${path}`);
    }
    if (journal.migrationRoot) {
        assertAbsolutePathWithin(journalRoot, journal.migrationRoot, "Operation migrationRoot", {allowRoot: true});
    }
    for (const manifest of [journal.previousManifest, journal.nextManifest]) {
        if (manifest && manifest.containerEngine !== journal.containerEngine) {
            throw new Error(`Operation journal与Installation Manifest的Container Engine不一致：${path}`);
        }
    }
    const containerState = journal.effects.some((effect) => effect.kind === "compose" || effect.kind === "docker-image")
        || [journal.previousManifest, journal.nextManifest].some((manifest) => manifest?.profile === "ghcr" || manifest?.profile === "source-docker");
    if (containerState && !journal.containerEngine) {
        throw new Error(`包含容器状态的Operation journal缺少Container Engine：${path}`);
    }
    return journal;
}

/** 验证单条Effect的ownership、路径布局和恢复所需字段。 */
function assertOperationEffect(journal: OperationJournal, effect: OperationJournal["effects"][number], journalPath: string): void {
    if (effect.kind === "path-create" || effect.kind === "path-retire") {
        const relativePath = installationRelativePath(effect.path);
        assertOwnedEffectPath(journal, effect.owner, relativePath, effect.kind);
    }
    if (effect.kind === "wrapper-switch" && effect.backupPath) {
        assertAbsolutePathWithin(journal.backupRoot, effect.backupPath, "Manager wrapper backup");
    }
    if (effect.kind === "wrapper-switch" && effect.previousState === "present" && !effect.backupPath) {
        throw new Error(`已有Manager wrapper的切换Effect必须预先记录backupPath：${journalPath}`);
    }
    if (effect.kind === "wrapper-switch" && effect.previousState === "missing" && effect.backupPath) {
        throw new Error(`原本不存在Manager wrapper时不能记录backupPath：${journalPath}`);
    }
    if (effect.kind === "receipt-switch") {
        const committedBackupAlreadyRemoved = journal.phase === "committed"
            && effect.state === "applied"
            && !effect.cleanupError;
        if (effect.previousState === "present" && !effect.backupPath && !committedBackupAlreadyRemoved) {
            throw new Error(`已有Product回执的切换Effect必须预先记录backupPath：${journalPath}`);
        }
        if (effect.previousState === "missing" && effect.backupPath) {
            throw new Error(`原本不存在Product回执时不能记录backupPath：${journalPath}`);
        }
        if (effect.backupPath) assertAbsolutePathWithin(journal.backupRoot, effect.backupPath, "Product receipt backup");
    }
    if (effect.kind === "compose" && effect.previousCompose) {
        assertAbsolutePathWithin(journal.backupRoot, effect.previousCompose, "Docker previousCompose");
    }
    if (effect.kind === "candidate-container") {
        if (effect.state === "planned" && effect.containerId) {
            throw new Error(`planned candidate-container不能提前声明容器ID：${journalPath}`);
        }
        if (effect.state === "applied" && !effect.containerId) {
            throw new Error(`applied candidate-container缺少容器ID：${journalPath}`);
        }
        if (effect.state === "planned" && effect.stopped) {
            throw new Error(`未确认身份的candidate-container不能标记为已停止：${journalPath}`);
        }
        const manifest = journal.nextManifest ?? journal.previousManifest;
        if (!manifest || manifest.profile !== "ghcr" && manifest.profile !== "source-docker") {
            throw new Error(`candidate-container只能用于容器Profile：${journalPath}`);
        }
    }
    if (effect.kind === "sqlite-backup") {
        if (!isAbsolute(effect.stateRoot) || !isAbsolute(effect.hostPath)) {
            throw new Error(`App SQLite effect必须保存绝对stateRoot/hostPath：${journalPath}`);
        }
        assertAbsolutePathWithin(journal.backupRoot, effect.backupPath, "App SQLite backup");
        const manifest = journal.previousManifest ?? journal.nextManifest;
        if (!manifest) throw new Error(`App SQLite Operation journal缺少Manifest身份：${journalPath}`);
        const expectedStateRoot = resolveInstallationRoots(journal.root, manifest.roots).state;
        if (resolve(effect.stateRoot) !== expectedStateRoot) {
            throw new Error(`App SQLite effect的stateRoot与Manifest不一致：${effect.stateRoot}`);
        }
        const location = resolveAppSqliteLocation(effect.configuredUrl, effect.stateRoot);
        if (resolve(location.hostPath) !== resolve(effect.hostPath)) {
            throw new Error(`App SQLite configuredUrl与物理path不一致：${effect.configuredUrl} / ${effect.hostPath}`);
        }
        if ((manifest.profile === "ghcr" || manifest.profile === "source-docker") && location.scope !== "state-root") {
            throw new Error(`Docker Profile的App SQLite必须位于State Root内：${effect.hostPath}`);
        }
    }
    if (effect.kind === "docker-image") {
        const operationSuffix = `-${sourceDockerImageSuffix(journal.id)}`;
        if (!effect.image.startsWith("neuro-book-source:") || !effect.image.endsWith(operationSuffix)) {
            throw new Error(`Source Docker镜像不属于当前Operation：${effect.image}`);
        }
        const product = journal.nextManifest?.components.product;
        if (journal.nextManifest?.profile === "source-docker" && product?.provider === "container"
            && effect.image !== sourceDockerImageName(journal.nextManifest.sourceRevision, journal.id)) {
            throw new Error(`Source Docker镜像与nextManifest revision不一致：${effect.image}`);
        }
        const previousProduct = journal.previousManifest?.components.product;
        if (effect.previousImage && (journal.previousManifest?.profile !== "source-docker"
            || previousProduct?.provider !== "container" || previousProduct.image !== effect.previousImage)) {
            throw new Error(`Source Docker previousImage不属于previousManifest：${effect.previousImage}`);
        }
        if (effect.previousImage === effect.image) {
            throw new Error(`Source Docker新旧镜像代次不能相同：${effect.image}`);
        }
        if (effect.previousImageRetired && !effect.previousImage) {
            throw new Error(`Source Docker镜像没有previousImage却标记为已退役：${journalPath}`);
        }
    }
}

/** owner决定Effect可触达的固定Installation Root布局。 */
function assertOwnedEffectPath(journal: OperationJournal, owner: string, input: string, kind: "path-create" | "path-retire"): void {
    const path = input.replaceAll("\\", "/");
    if (owner === "staging" && path.startsWith(".deploy/staging/")) return;
    if (owner === "backup" && (
        path.startsWith(".deploy/backups/")
        || path.startsWith("manager-state/backups/")
    )) return;
    if (owner === "source" && path === "node_modules") return;
    if (owner === "runtime" && path.startsWith(".runtime/bun/")) return;
    if (owner === "tool" && path.startsWith(".runtime/tools/")) return;
    if (owner === "manager" && path.startsWith(".runtime/manager/")) return;
    if (owner === "wrapper" && path === ".runtime/bin") return;
    if (owner === "portable-launcher" && new Set([
        "Start Neuro Book.cmd", "Start Neuro Book.ps1",
        "Update Neuro Book.cmd", "Update Neuro Book.ps1",
        "Create Admin.cmd", "Create Admin.ps1",
    ]).has(path)) return;
    if (owner === "state" && kind === "path-create") {
        const manifest = journal.nextManifest ?? journal.previousManifest;
        const stateLocator = manifest?.roots.state;
        const statePrefix = stateLocator?.base === "installation-root" ? `${stateLocator.path.replaceAll("\\", "/")}/` : null;
        if (statePrefix && new Set([
            `${statePrefix}workspace`, `${statePrefix}logs`, `${statePrefix}.env`, `${statePrefix}config.yaml`,
            `${statePrefix}workspace/.nbook/config.json`,
        ]).has(path)) return;
    }
    throw new Error(`Operation ${kind}的${owner} owner不拥有路径：${input}`);
}

/** Effect identity用于防止同一物理动作在Journal中出现互相矛盾的重复状态。 */
function operationEffectIdentity(effect: OperationJournal["effects"][number]): string {
    if (effect.kind === "path-create" || effect.kind === "path-retire") return `${effect.kind}:${effect.path}`;
    if (effect.kind === "component-switch") return `${effect.kind}:${effect.owner}`;
    return effect.kind;
}


/** 把旧 Attachment 专用 journal 一次性转换为 Product-owned operation 记录。 */
export function migrateOperationJournal(
    value: unknown,
    path: string,
    fallbackRoots: InstallationRootLocators = INSTALLATION_SCOPED_ROOT_LOCATORS,
): OperationJournal {
    if (typeof value !== "object" || value === null || !("schemaVersion" in value)) {
        return parseOperationJournal(value, path);
    }
    if (value.schemaVersion === 5) {
        assertSchema(OperationJournalV5Schema, value, `Operation journal v5 不符合可迁移 schema：${path}`);
        return parseOperationJournal({
            ...value,
            schemaVersion: 6,
            roots: legacyOperationRoots(value as Static<typeof OperationJournalV5Schema>, fallbackRoots),
        }, path);
    }
    if (value.schemaVersion === 4) {
        assertSchema(OperationJournalV4Schema, value, `Operation journal v4 不符合可迁移 schema：${path}`);
        return parseOperationJournal({
            ...value,
            schemaVersion: 6,
            roots: legacyOperationRoots(value as Static<typeof OperationJournalV4Schema>, fallbackRoots),
        }, path);
    }
    if (value.schemaVersion !== 3) return parseOperationJournal(value, path);
    assertSchema(OperationJournalV3Schema, value, `Operation journal v3 不符合可迁移 schema：${path}`);
    const legacy = value as Static<typeof OperationJournalV3Schema>;
    const {attachmentMigration, ...base} = legacy;
    const converted: OperationJournal = {
        ...base,
        schemaVersion: 6,
        roots: legacyOperationRoots(legacy, fallbackRoots),
        ...(attachmentMigration ? {
            applicationStateMigration: {
                runId: attachmentMigration.runId.slice(0, -"-attachment".length),
                state: attachmentMigration.state,
            },
        } : {}),
    };
    return parseOperationJournal(converted, path);
}

function legacyOperationRoots(value: {
    previousManifest: InstallationManifest | null;
    nextManifest: InstallationManifest | null;
}, fallbackRoots: InstallationRootLocators): InstallationRootLocators {
    return value.nextManifest?.roots ?? value.previousManifest?.roots ?? fallbackRoots;
}

function assertOperationRootLocators(roots: InstallationRootLocators): void {
    const supported = [
        INSTALLATION_SCOPED_ROOT_LOCATORS,
        PORTABLE_ROOT_LOCATORS,
        INSTALLED_WINDOWS_ROOT_LOCATORS,
        INSTALLED_MACOS_ROOT_LOCATORS,
    ];
    if (!supported.some((candidate) => rootLocatorsEqual(roots, candidate))) {
        throw new Error("Operation journal的Root Locator布局非法。");
    }
}


function assertSchema(schema: TSchema, value: unknown, message: string): void {
    if (!Value.Check(schema, value)) throw new Error(message);
}

function componentPaths(manifest: InstallationManifest): string[] {
    return [
        manifest.components.manager.path,
        manifest.components.managerRuntime.provider === "managed" ? manifest.components.managerRuntime.path : null,
        manifest.components.applicationRuntime.provider === "managed" ? manifest.components.applicationRuntime.path : null,
        manifest.components.tools.rg?.provider === "managed" ? manifest.components.tools.rg.path : null,
        manifest.components.tools.git?.provider === "managed" ? manifest.components.tools.git.path : null,
        manifest.components.tools.git?.provider === "managed" ? manifest.components.tools.git.bashPath : null,
        manifest.components.product && manifest.components.product.provider !== "container" ? manifest.components.product.path : null,
        ...Object.values(manifest.roots).filter((locator) => locator.base === "installation-root").map((locator) => locator.path),
        manifest.profile === "ghcr" || manifest.profile === "source-docker" ? ".deploy/docker-compose.generated.yml" : null,
        ".runtime/bin",
        ...(manifest.components.source.provider === "release" ? manifest.components.source.files : []),
    ].filter((path): path is string => Boolean(path)).map((path) => path.replaceAll("\\", "/"));
}
