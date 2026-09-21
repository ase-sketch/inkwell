export type DesktopDelegatedUninstallReceipt =
    | {status: "completed"}
    | {status: "scheduled"; resultPath: string};

export const DESKTOP_UNINSTALL_HOST_TIMEOUT_MS = 6 * 60_000;

/** 解析 Manager CLI 的最终卸载事件；其它阶段事件返回 null。 */
export function parseDesktopDelegatedUninstallReceipt(
    value: unknown,
): DesktopDelegatedUninstallReceipt | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value as {kind?: unknown; action?: unknown; status?: unknown; resultPath?: unknown};
    if (record.kind !== "complete" || record.action !== "uninstall") return null;
    if (record.status === "completed") return {status: "completed"};
    if (record.status === "scheduled" && typeof record.resultPath === "string" && record.resultPath.length > 0) {
        return {status: "scheduled", resultPath: record.resultPath};
    }
    throw new Error("Desktop uninstall CLI 回执无效。");
}
