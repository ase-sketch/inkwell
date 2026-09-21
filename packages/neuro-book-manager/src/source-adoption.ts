import {basename} from "node:path";

import {inspectInstallEnvironment, inspectPortAvailable, type InstallEnvironmentInspection} from "#manager/install-preflight";
import {inspectInstance} from "#manager/instance-discovery";
import {installSourceAdoption, type AdoptSourceOptions} from "#manager/installer";
import {registerManagerInstance} from "#manager/manager-config";
import {assertProfileSupported} from "#manager/platform";
import type {InspectionIssue, ManagerInstance, OfflineInspection} from "#manager/types";
import type {InstallationManifest} from "@notnotype/neuro-book-contracts/installation";

export type AdoptionProfile = "source-dev" | "source-product" | "source-docker";

/** CLI与TUI共享的Source Adoption只读门禁。 */
export type AdoptionPreflight = {
    inspection: OfflineInspection;
    report: {
        root: string;
        profile: AdoptionProfile;
        port: number;
        blockers: InspectionIssue[];
        warnings: InspectionIssue[];
    };
};

/**
 * 检查接管候选的离线身份、宿主Profile和外部命令。
 * 该函数不创建目录、不下载资产，也不写用户实例索引。
 */
export async function inspectAdoptionPreflight(
    input: {root: string; profile: AdoptionProfile; port: number},
    environment?: InstallEnvironmentInspection,
): Promise<AdoptionPreflight> {
    const inspection = await inspectInstance(input.root);
    const checkedEnvironment = await inspectInstallEnvironment(input.profile, environment);
    const blockers = [...inspection.blockers];
    const warnings = [...inspection.warnings];
    if (inspection.kind !== "neuro-book-checkout" || !inspection.git) {
        blockers.push({code: "adoption.identity", message: "adopt只接受没有Manifest的受支持NeuroBook Git checkout。"});
    }
    try {
        assertProfileSupported(input.profile, checkedEnvironment.host);
    } catch (error) {
        blockers.push({code: "host.profile", message: error instanceof Error ? error.message : String(error)});
    }
    if (!checkedEnvironment.git?.available) {
        blockers.push({code: "command.git", message: `${input.profile}接管需要可用的Git。`, remediation: "安装Git并确保git --version可执行。"});
    }
    if (input.profile === "source-docker" && !checkedEnvironment.containers?.engine) {
        blockers.push({
            code: "container.engine",
            message: checkedEnvironment.containers?.error ?? "Source Docker接管需要可用的Docker或Podman Compose。",
            remediation: "启动Docker/Podman daemon或machine，并确认Compose子命令可用。",
        });
    }
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
        blockers.push({code: "network.port", message: `端口必须是1-65535：${input.port}`});
    } else if (!await inspectPortAvailable(input.port)) {
        blockers.push({code: "network.port", message: `端口${input.port}已被占用。`, remediation: "选择其他端口，或停止当前占用该端口的服务。"});
    }
    return {
        inspection,
        report: {root: inspection.root, profile: input.profile, port: input.port, blockers, warnings},
    };
}

/** 所有接管入口必须消费同一预检blocker。 */
export function assertAdoptionPreflight(preflight: AdoptionPreflight): void {
    if (!preflight.report.blockers.length) return;
    throw new Error(preflight.report.blockers.map((issue) => [issue.message, issue.remediation].filter(Boolean).join("\n")).join("\n"));
}

/** 检查并事务接管NeuroBook Source checkout，成功后登记用户实例索引。 */
export async function adoptSourceInstallation(
    options: AdoptSourceOptions & {name?: string; makeDefault?: boolean; configPath?: string},
    existingPreflight?: AdoptionPreflight,
): Promise<{manifest: InstallationManifest; instance: ManagerInstance}> {
    const preflight = existingPreflight ?? await inspectAdoptionPreflight({root: options.root, profile: options.profile, port: options.port});
    assertAdoptionPreflight(preflight);
    const inspection = preflight.inspection;
    const manifest = await installSourceAdoption(options);
    const instance = await registerManagerInstance({root: inspection.root, name: options.name ?? basename(inspection.root), makeDefault: options.makeDefault ?? true, configPath: options.configPath});
    return {manifest, instance};
}
