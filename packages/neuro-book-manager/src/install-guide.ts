import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

import * as p from "@clack/prompts";

import {pathExists} from "#manager/files";
import {
    inspectInstallEnvironment,
    inspectInstallPreflight,
    recommendedInstallProfile,
} from "#manager/install-preflight";
import {installPlan, installWithPreflight, type InstallOptions} from "#manager/installer";
import {readManagerConfig, registerManagerInstance} from "#manager/manager-config";
import {supportedProfiles} from "#manager/platform";
import type {InstallPreflightReport} from "#manager/types";
import type {InstallProfile, ReleaseChannel} from "@notnotype/neuro-book-contracts/installation";

export type InstallGuideDefaults = {
    profile?: InstallProfile;
    root?: string;
    channel?: ReleaseChannel;
    version?: string;
    releaseManifest?: string;
    port?: number;
    authEnabled?: boolean;
    dryRun?: boolean;
    managerExecutable?: string;
};

/** 运行面向首次用户的完整安装向导，并在成功后注册实例。 */
export async function runInstallGuide(defaults: InstallGuideDefaults = {}): Promise<void> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("无参数安装向导需要交互终端；自动化安装请使用 neuro-book install --profile <profile> --yes。" );
    }
    let environment = await inspectInstallEnvironment(defaults.profile);
    const managerConfig = await readManagerConfig();
    const recommended = defaults.profile ?? recommendedInstallProfile(environment);
    const suggestedRoot = defaults.root ?? await nextInstallDirectory(
        managerConfig.preferences.installDirectory,
        managerConfig.instances.map((instance) => instance.root),
    );
    p.intro("NeuroBook 安装向导");
    if (process.platform === "darwin") {
        p.note("macOS x64/ARM64支持原生Product与全部Source Profile；有Docker或Podman时仍默认推荐GHCR。", "macOS 平台");
    }
    p.note([
        "NeuroBook Manager 会安装、更新并管理一个独立的 NeuroBook 实例。",
        "用户数据保存在实例的 State Root；更新不会覆盖 workspace、配置或日志。",
        "稍后可运行 neuro-book manage，在 TUI 中管理所有已注册实例。",
    ].join("\n"), "开始之前");

    const profile = await promptValue(p.select<InstallProfile>({
        message: "你希望怎样运行 NeuroBook？",
        initialValue: recommended,
        options: profileOptions(),
    }));
    const root = resolve(await promptValue(p.text({
        message: "安装到哪个目录？",
        initialValue: suggestedRoot,
        validate: (value) => value?.trim() ? undefined : "安装目录不能为空。",
    })));
    const instanceName = await promptValue(p.text({
        message: "给这个实例起一个名称",
        initialValue: root.split(/[\\/]/u).filter(Boolean).at(-1) ?? "NeuroBook",
        validate: (value) => value?.trim() ? undefined : "实例名称不能为空。",
    }));
    const channel = await promptValue(p.select<ReleaseChannel>({
        message: "选择更新通道",
        initialValue: defaults.channel ?? managerConfig.preferences.channel,
        options: [
            {value: "stable", label: "Stable", hint: "推荐日常使用；只接收稳定版本"},
            {value: "canary", label: "Canary", hint: "提前体验新功能，可能包含未完成改动"},
        ],
    }));
    const portText = await promptValue(p.text({
        message: "Web 服务端口",
        initialValue: String(defaults.port ?? 3000),
        validate: (value) => validPort(value) ? undefined : "端口必须是 1-65535。",
    }));
    const defaultAuth = defaults.authEnabled ?? profile !== "windows-portable";
    const authEnabled = await promptValue(p.select<boolean>({
        message: "是否启用登录鉴权？",
        initialValue: defaultAuth,
        options: [
            {value: true, label: "启用", hint: "服务器和多人可访问环境推荐"},
            {value: false, label: "暂不启用", hint: "仅建议本机首次体验；之后可创建管理员并启用"},
        ],
    }));

    environment = await inspectInstallEnvironment(profile, environment);
    const options: InstallOptions = {
        root,
        profile,
        channel,
        version: defaults.version,
        releaseManifest: defaults.releaseManifest,
        port: Number(portText),
        authEnabled,
        dryRun: defaults.dryRun ?? false,
        managerExecutable: defaults.managerExecutable ?? fileURLToPath(import.meta.url),
    };
    const preflight = await inspectInstallPreflight(options, environment);

    p.note([
        `实例：${instanceName.trim()}`,
        `目录：${root}`,
        `方式：${profileLabel(profile)}`,
        `通道：${channel}`,
        `端口：${portText}`,
        `鉴权：${authEnabled ? "启用" : "关闭"}`,
    ].join("\n"), "安装摘要");
    p.note(formatPreflight(preflight.report), "环境预检");
    if (preflight.report.blockers.length && !options.dryRun) {
        throw new Error(`安装预检未通过：\n${preflight.report.blockers.map((item) => `- ${item.message}${item.remediation ? `\n  ${item.remediation}` : ""}`).join("\n")}`);
    }
    const confirmed = await promptValue(p.confirm({message: defaults.dryRun ? "生成安装计划？" : "开始安装？", initialValue: true}));
    if (!confirmed) {
        p.cancel("已取消安装，没有修改目标目录。" );
        return;
    }

    if (options.dryRun) {
        p.note(JSON.stringify({preflight: preflight.report, plan: installPlan(options)}, null, 4), "安装计划");
        p.outro("仅生成计划，没有修改目标目录。" );
        return;
    }
    const spinner = p.spinner();
    spinner.start("正在准备 NeuroBook 实例");
    try {
        const manifest = await installWithPreflight(options, preflight);
        await registerManagerInstance({
            root,
            name: instanceName,
            makeDefault: true,
            preferences: {channel, installDirectory: root},
        });
        spinner.stop("安装与实例注册完成");
        p.note([
            `启动：cd "${root}" && neuro-book start`,
            "管理所有实例：neuro-book manage",
            "检查安装：neuro-book doctor",
        ].join("\n"), "下一步");
        p.outro(`NeuroBook ${manifest.appVersion} 已安装到 ${root}`);
    } catch (error) {
        spinner.stop("安装未完成");
        throw error;
    }
}

/** 构造带场景说明的安装 Profile 选项；不支持的在当前平台禁用。 */
function profileOptions(): Array<{value: InstallProfile; label: string; hint: string; disabled?: boolean}> {
    const supported = new Set<InstallProfile>(supportedProfiles());
    const isDarwin = process.platform === "darwin";
    return [
        {
            value: "windows-portable",
            label: "Windows Portable",
            hint: process.platform === "win32" ? "Windows 推荐；解压即用，Runtime 与工具全部托管" : "仅支持 Windows x64",
            disabled: !supported.has("windows-portable"),
        },
        {value: "ghcr", label: "Docker / GHCR", hint: isDarwin ? "macOS 推荐；直接运行官方预构建镜像" : "Linux 服务器推荐；直接运行官方预构建镜像", disabled: !supported.has("ghcr")},
        {value: "product-bun", label: "Product Bun", hint: "不使用容器；下载匹配宿主平台的预构建 Product", disabled: !supported.has("product-bun")},
        {value: "source-dev", label: "Source Dev", hint: "开发 NeuroBook；Git 源码、依赖与 dev server", disabled: !supported.has("source-dev")},
        {value: "source-product", label: "Source Product", hint: "从 Git 源码在本机完成生产构建", disabled: !supported.has("source-product")},
        {value: "source-docker", label: "Source Docker", hint: "以 Git 源码为 context，在容器内安装和构建", disabled: !supported.has("source-docker")},
    ];
}

/** 将结构化预检压缩为Clack最终确认前的用户摘要。 */
function formatPreflight(report: InstallPreflightReport): string {
    return [
        `平台：${report.host.productPlatform}（原生${report.host.nativeArch} / 进程${report.host.processArch}）`,
        `Container Engine：${report.containerEngine ?? "不使用"}`,
        ...report.commands.map((command) => `${command.id}：${command.available ? command.version ?? "可用" : command.required ? "缺失（阻断）" : "缺失"}`),
        ...report.sources.map((source) => `${source.component}：${source.source} - ${source.detail}`),
        ...report.warnings.map((warning) => `警告：${warning.message}`),
        ...report.blockers.map((blocker) => `阻断：${blocker.message}`),
    ].join("\n");
}

/** 为重复或已存在的默认目录生成下一个安全候选目录。 */
async function nextInstallDirectory(preferred: string, registeredRoots: string[]): Promise<string> {
    const absolutePreferred = resolve(preferred);
    const normalizedRoots = new Set(registeredRoots.map((root) => normalizedRoot(root)));
    if (!normalizedRoots.has(normalizedRoot(absolutePreferred)) && !await pathExists(absolutePreferred)) return absolutePreferred;
    let suffix = 2;
    while (
        normalizedRoots.has(normalizedRoot(`${absolutePreferred}-${suffix}`))
        || await pathExists(`${absolutePreferred}-${suffix}`)
    ) suffix += 1;
    return `${absolutePreferred}-${suffix}`;
}

/** 生成跨平台可比较的 Installation Root 键。 */
function normalizedRoot(path: string): string {
    const absolute = resolve(path);
    return process.platform === "win32" ? absolute.toLocaleLowerCase("en-US") : absolute;
}

/** 返回面向用户展示的 Profile 名称。 */
function profileLabel(profile: InstallProfile): string {
    return profileOptions().find((option) => option.value === profile)?.label ?? profile;
}

/** 校验交互输入的 TCP 端口。 */
function validPort(value: string | undefined): boolean {
    const port = Number(value);
    return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** 将 Clack cancel symbol 转换为统一的安装取消错误。 */
async function promptValue<T>(result: Promise<T | symbol>): Promise<T> {
    const value = await result;
    if (p.isCancel(value)) throw new Error("已取消安装。" );
    return value as T;
}
