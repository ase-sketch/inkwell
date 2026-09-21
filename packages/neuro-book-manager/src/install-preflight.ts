import {createServer} from "node:net";
import {readdir} from "node:fs/promises";
import {join, resolve} from "node:path";

import {inspectContainerEngines, type ContainerEngineSelection} from "#manager/docker";
import {pathExists} from "#manager/files";
import {resolveReleaseManifest} from "#manager/manifest-store";
import {assertProfileSupported, inspectHostPlatform} from "#manager/platform";
import {profileDefinition} from "#manager/profiles";
import {runCapture} from "#manager/process";
import type {
    CommandInspection,
    ComponentSourceSummary,
    InspectionIssue,
    InstallCommandInspection,
    InstallPreflightReport,
} from "#manager/types";
import type {InstallProfile, ReleaseChannel} from "@notnotype/neuro-book-contracts/installation";
import type {ReleaseManifest} from "@notnotype/neuro-book-contracts/release";
import type {HostPlatform} from "@notnotype/neuro-book-contracts/platform";
import {MANAGER_VERSION} from "#manager/version-info";

/** 预检所需的稳定安装输入；不包含任何执行开关。 */
export type InstallPreflightInput = {
    root: string;
    profile: InstallProfile;
    channel: ReleaseChannel;
    version?: string;
    releaseManifest?: string;
    port: number;
};

/** 一次安装操作共享的环境探测缓存。 */
export type InstallEnvironmentInspection = {
    host: HostPlatform;
    bun: CommandInspection;
    /** Source Profile需要时才探测。 */
    git?: CommandInspection;
    /** 推荐或Container Profile需要时才探测。 */
    containers?: ContainerEngineSelection;
};

/** installer消费的预检结果；完整Release不进入用户可见报告。 */
export type InstallPreflightResult = {
    report: InstallPreflightReport;
    release: ReleaseManifest | null;
};

/** 非交互安装必须显式确认；TTY缺失不能被解释为同意默认安装。 */
export function assertInstallConsent(yes: boolean, interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)): void {
    if (yes || interactive) return;
    throw new Error("非交互安装必须显式传入--yes；如需先审查计划，请使用--dry-run --yes --json。" );
}

/**
 * 探测一次安装操作需要的宿主命令；传入已有结果时只补充尚未检查的能力。
 *
 * Profile为空表示正在为POSIX用户选择推荐Profile，此时只额外检查Container Engine。
 */
export async function inspectInstallEnvironment(
    profile?: InstallProfile,
    existing?: InstallEnvironmentInspection,
): Promise<InstallEnvironmentInspection> {
    const host = existing?.host ?? inspectHostPlatform();
    const bun = existing?.bun ?? {available: true, version: process.versions.bun ?? "unknown"};
    const definition = profile ? profileDefinition(profile) : null;
    const needsGit = definition?.source === "git";
    const needsContainers = definition?.docker || (!profile && host.os !== "windows");
    return {
        host,
        bun,
        ...(needsGit ? {git: existing?.git ?? await inspectCommand("git", ["--version"])} : existing?.git ? {git: existing.git} : {}),
        ...(needsContainers
            ? {containers: existing?.containers ?? await inspectContainerEngines()}
            : existing?.containers ? {containers: existing.containers} : {}),
    };
}

/** 按宿主和真实Container Engine可用性返回普通用户推荐Profile。 */
export function recommendedInstallProfile(environment: InstallEnvironmentInspection): InstallProfile {
    if (environment.host.os === "windows") return "windows-portable";
    return environment.containers?.engine ? "ghcr" : "product-bun";
}

/** 执行只读安装预检；不会创建目标目录、下载资产或写Operation Journal。 */
export async function inspectInstallPreflight(
    input: InstallPreflightInput,
    environment?: InstallEnvironmentInspection,
): Promise<InstallPreflightResult> {
    const targetRoot = resolve(input.root);
    const checkedEnvironment = await inspectInstallEnvironment(input.profile, environment);
    const blockers: InspectionIssue[] = [];
    const warnings: InspectionIssue[] = [];
    const definition = profileDefinition(input.profile);
    try {
        assertProfileSupported(input.profile, checkedEnvironment.host);
    } catch (error) {
        blockers.push(issue("host.profile", error));
    }
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
        blockers.push({code: "network.port", message: `端口必须是1-65535：${input.port}`});
    } else if (!await inspectPortAvailable(input.port)) {
        blockers.push({code: "network.port", message: `端口${input.port}已被占用。`, remediation: "选择其他端口，或停止当前占用该端口的服务。"});
    }
    await inspectTargetRoot(targetRoot, input.profile, blockers, warnings);

    const commands: InstallCommandInspection[] = [{
        id: "bun",
        command: process.execPath,
        required: true,
        ...checkedEnvironment.bun,
    }];
    if (definition.source === "git") {
        const git = checkedEnvironment.git ?? {available: false};
        const managedGitAvailable = checkedEnvironment.host.os === "windows" && input.profile !== "source-docker";
        commands.push({id: "git", command: "git", required: !managedGitAvailable, ...git});
        if (!git.available && !managedGitAvailable) {
            blockers.push({code: "command.git", message: `${input.profile}需要可用的Git。`, remediation: "通过系统包管理器安装Git后重试。"});
        } else if (!git.available) {
            warnings.push({code: "command.git-managed", message: "未检测到系统Git，将使用受管PortableGit。"});
        }
    }

    let containerEngine = null as InstallPreflightReport["containerEngine"];
    if (definition.docker) {
        const containers = checkedEnvironment.containers;
        containerEngine = containers?.engine ?? null;
        const selected = containers?.inspections.find((inspection) => inspection.engine === containerEngine)
            ?? containers?.inspections.at(-1);
        commands.push({
            id: "container",
            command: selected?.engine ?? "docker/podman",
            required: true,
            ...(selected?.command ?? {available: false}),
        });
        commands.push({
            id: "compose",
            command: selected ? `${selected.engine} compose` : "docker/podman compose",
            required: true,
            ...(selected?.compose ?? {available: false}),
        });
        if (!containerEngine) blockers.push({
            code: "container.engine",
            message: containers?.error ?? "未检测到可用的Docker或Podman。",
            remediation: "启动Docker/Podman daemon或machine，并确认Compose子命令可用。",
        });
    }

    let release: ReleaseManifest | null = null;
    if (definition.source === "git") {
        if (input.version || input.releaseManifest) blockers.push({
            code: "release.unsupported",
            message: `Profile ${input.profile}使用Git Source，不接受--version或--release-manifest。`,
        });
    } else {
        try {
            release = await resolveReleaseManifest(input.channel, input.version, input.releaseManifest);
            if (release.stateMigration.policy === "manual") {
                throw new Error(`该版本需要先按迁移说明人工处理状态数据：${release.stateMigration.guide}`);
            }
        } catch (error) {
            blockers.push(issue("release.resolve", error, "确认Release已完成发布、网络可用且Manifest/资产checksum有效。"));
        }
    }

    const productPlatform = checkedEnvironment.host.productPlatform;
    const productAvailable = release?.products.some((product) => product.platform === productPlatform) ?? false;
    if (release && (definition.product === "release") && !productAvailable) {
        blockers.push({code: "release.product", message: `Release ${release.version}缺少${productPlatform} Product。`});
    }
    const report: InstallPreflightReport = {
        host: checkedEnvironment.host,
        profile: input.profile,
        targetRoot,
        port: input.port,
        containerEngine,
        commands,
        ...(release ? {release: {
            version: release.version,
            channel: release.channel,
            sourceRevision: release.sourceRevision,
            productPlatform,
            productAvailable,
            windowsPortableAvailable: Boolean(release.windowsPortable),
            ghcrDigest: release.ghcr.digest,
        }} : {}),
        blockers,
        warnings,
        sources: componentSources(input.profile, checkedEnvironment, release),
    };
    return {report, release};
}

/** 阻止任何入口绕过结构化预检blocker。 */
export function assertInstallPreflight(result: InstallPreflightResult): void {
    if (!result.report.blockers.length) return;
    throw new Error(result.report.blockers.map((blocker) => [blocker.message, blocker.remediation].filter(Boolean).join("\n")).join("\n"));
}

/** 生成用户可见组件来源，不泄漏内部物化步骤。 */
function componentSources(
    profile: InstallProfile,
    environment: InstallEnvironmentInspection,
    release: ReleaseManifest | null,
): ComponentSourceSummary[] {
    const definition = profileDefinition(profile);
    const stage0 = Boolean(process.env.NEURO_BOOK_STAGE0_BUN_PATH);
    return [
        {component: "manager", source: "current-manager", detail: `@notnotype/neuro-book-manager ${MANAGER_VERSION}`},
        {component: "manager-runtime", source: stage0 ? "stage0" : definition.applicationRuntime === "managed" ? "managed" : "system", detail: stage0 ? "Stage 0 Bun复制到版本目录" : definition.applicationRuntime === "managed" ? "Bun官方Release" : process.execPath},
        {component: "source", source: definition.source, detail: release ? `${release.version} / ${release.sourceRevision}` : "notnotype/neuro-book master"},
        {component: "product", source: definition.product === "none" ? "git" : definition.product, detail: definition.product === "none" ? "Source Dev不使用预构建Product" : definition.product === "release" ? environment.host.productPlatform : String(definition.product)},
        {component: "tools", source: definition.tools, detail: definition.tools === "managed" ? "Bun/ripgrep/PortableGit不可变版本目录" : definition.tools === "container" ? "由容器镜像提供" : "优先使用系统工具"},
    ];
}

/** 只读检查Fresh Install目标目录身份。 */
async function inspectTargetRoot(
    root: string,
    profile: InstallProfile,
    blockers: InspectionIssue[],
    warnings: InspectionIssue[],
): Promise<void> {
    try {
        if (!await pathExists(root)) return;
    } catch (error) {
        blockers.push(issue("target.unreadable", error, "选择可读写的空目录。"));
        return;
    }
    let entries: string[];
    try {
        entries = await readdir(root);
    } catch (error) {
        blockers.push(issue("target.unreadable", error, "选择可读写的空目录。"));
        return;
    }
    if (!entries.length) return;
    if (await pathExists(join(root, ".deploy", "installation.json"))) {
        blockers.push({code: "target.managed", message: "Installation Root已由NeuroBook Manager管理。", remediation: "使用neuro-book update，或选择新的安装目录。"});
        return;
    }
    if (entries.includes(".git")) {
        blockers.push({code: "target.checkout", message: "目录是已有Git checkout。", remediation: "使用neuro-book adopt显式接管。"});
        return;
    }
    const allowed = new Set([".deploy", ".runtime"]);
    if (profile === "windows-portable") allowed.add("data");
    const unknown = entries.filter((entry) => !allowed.has(entry));
    if (unknown.length) {
        blockers.push({code: "target.unknown", message: `Installation Root包含未知文件：${unknown.join(", ")}`, remediation: "选择空目录，或人工确认后移走这些文件。"});
        return;
    }
    warnings.push({code: "target.manager-owned", message: `目标目录包含上次操作留下的Manager-owned目录：${entries.join(", ")}`, remediation: "Manager会恢复未完成operation，并重建无法由Manifest证明的托管资产。"});
}

/** 单次读取命令版本。 */
async function inspectCommand(command: string, args: string[]): Promise<CommandInspection> {
    try {
        const version = (await runCapture(command, args)).split(/\r?\n/u)[0]?.trim();
        return {available: true, ...(version ? {version} : {})};
    } catch {
        return {available: false};
    }
}

/** 检查本地TCP端口是否尚未被监听。 */
export async function inspectPortAvailable(port: number): Promise<boolean> {
    return new Promise<boolean>((resolvePromise) => {
        const server = createServer();
        server.once("error", () => resolvePromise(false));
        server.listen(port, "127.0.0.1", () => server.close(() => resolvePromise(true)));
    });
}

/** 将未知错误收敛为稳定InspectionIssue。 */
function issue(code: string, error: unknown, remediation?: string): InspectionIssue {
    return {
        code,
        message: error instanceof Error ? error.message : String(error),
        ...(remediation ? {remediation} : {}),
    };
}
