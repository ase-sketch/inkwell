import {inspectInstance} from "#manager/instance-discovery";
import {inspectInstallationIntegrity} from "#manager/installation-health";
import {registerManagerInstance} from "#manager/manager-config";
import type {ImportInspection, InspectionIssue, ManagerInstance} from "#manager/types";

/** 对已有Manifest实例执行离线完整性门禁；不要求服务或容器正在运行。 */
export async function inspectImport(root: string): Promise<ImportInspection> {
    const inspection = await inspectInstance(root);
    const blockers = [...inspection.blockers];
    const warnings = [...inspection.warnings];
    if (inspection.kind !== "managed-installation" || !inspection.manifest) {
        blockers.push({code: "import.not-managed", message: "目录不是有效的Manifest v5实例。"});
        return {...inspection, blockers, warnings, importable: false};
    }
    const integrity = await inspectInstallationIntegrity(inspection.root, inspection.manifest);
    blockers.push(...integrity.checks.filter((check) => check.status === "fail").map(toIssue));
    warnings.push(...integrity.checks.filter((check) => check.status === "warn").map(toIssue));
    if (inspection.manifest.profile === "ghcr" || inspection.manifest.profile === "source-docker") warnings.push({code: "service.offline-unchecked", message: "导入不要求容器正在运行；导入后请执行start和doctor。"});
    else warnings.push({code: "service.offline-unchecked", message: "导入不要求服务正在运行；导入后请执行start和doctor。"});
    return {...inspection, blockers, warnings, importable: blockers.length === 0};
}

/** 通过离线门禁后只写用户级索引。 */
export async function importInstallation(options: {root: string; name?: string; makeDefault?: boolean; acceptWarnings?: boolean; configPath?: string}): Promise<{instance: ManagerInstance; inspection: ImportInspection}> {
    const inspection = await inspectImport(options.root);
    if (!inspection.importable) throw new Error(inspection.blockers.map((issue) => issue.message).join("\n"));
    if (inspection.warnings.length && !options.acceptWarnings) throw new Error(`导入检查包含warning；确认后使用--yes：\n${inspection.warnings.map((issue) => issue.message).join("\n")}`);
    const instance = await registerManagerInstance({root: inspection.root, name: options.name, makeDefault: options.makeDefault, configPath: options.configPath});
    return {instance, inspection};
}

function toIssue(check: {id: string; message: string; remediation?: string}): InspectionIssue {
    return {code: check.id, message: check.message, ...(check.remediation ? {remediation: check.remediation} : {})};
}
