import type {ProjectCreateResponseDto} from "nbook/shared/dto/project.dto";
import type {ProjectMutationCommitState} from "nbook/app/utils/project-mutation-error";

/** Preview 刷新 Catalog 并尝试激活目标 Project 后的事实。 */
export interface PreviewCreateRefresh {
    readonly selectedProjectRoot: string;
    readonly activated: boolean;
}

/** 无回执或已提交错误后的本地恢复门禁。 */
export interface PreviewCreateRecovery {
    readonly commitState: Exclude<ProjectMutationCommitState, false>;
    /** POST 成功返回时已知；无 HTTP 回执时为空，禁止客户端猜测。 */
    readonly preferredProjectRoot?: string;
}

/** Preview 创建链需要的三个页面能力。 */
export interface PreviewCreateActions {
    readonly request: () => Promise<ProjectCreateResponseDto>;
    readonly refresh: (preferredProjectRoot?: string) => Promise<PreviewCreateRefresh>;
    readonly classifyCommit: (error: unknown) => ProjectMutationCommitState | null;
}

/** 创建请求未提交或无法证明已经提交。 */
export interface PreviewCreateRejected {
    readonly status: "rejected";
    /** 外部 HTTP 错误保持原样，交给页面统一解析为用户文案。 */
    readonly error: unknown;
}

/** 创建事实已经由完整 Catalog 刷新结算。 */
export interface PreviewCreateSettled extends PreviewCreateRecovery {
    readonly status: "settled";
    readonly refresh: PreviewCreateRefresh;
}

/** 创建可能或确定已提交，但完整 Catalog 暂时无法读取。 */
export interface PreviewCreateRefreshFailed extends PreviewCreateRecovery {
    readonly status: "refresh_failed";
    /** 外部 Catalog 错误保持原样，供页面显示持久恢复错误。 */
    readonly error: unknown;
}

export type PreviewCreateResult = PreviewCreateRejected | PreviewCreateSettled | PreviewCreateRefreshFailed;
export type PreviewCreateRecoveryResult = PreviewCreateSettled | PreviewCreateRefreshFailed;

/**
 * 执行一次 Preview Project 创建，并在提交事实可能成立时读取一次完整 Catalog。
 * 普通业务失败不会读取 Catalog；任何分支都不会自动重放 POST。
 */
export async function runPreviewProjectCreate(actions: PreviewCreateActions): Promise<PreviewCreateResult> {
    let recovery: PreviewCreateRecovery;
    try {
        const created = await actions.request();
        recovery = {
            commitState: true,
            preferredProjectRoot: created.project.projectRoot,
        };
    } catch (error) {
        const commitState = actions.classifyCommit(error);
        if (commitState !== true && commitState !== "unknown") {
            return {status: "rejected", error};
        }
        recovery = {commitState};
    }

    return refreshPreviewProjectCreate(recovery, actions.refresh);
}

/**
 * 只刷新已有创建恢复记录。该接口不接收 POST 能力，恢复重试无法重放 mutation。
 */
export async function refreshPreviewProjectCreate(
    recovery: PreviewCreateRecovery,
    refresh: (preferredProjectRoot?: string) => Promise<PreviewCreateRefresh>,
): Promise<PreviewCreateRecoveryResult> {
    try {
        return {
            status: "settled",
            ...recovery,
            refresh: await refresh(recovery.preferredProjectRoot),
        };
    } catch (error) {
        return {
            status: "refresh_failed",
            ...recovery,
            error,
        };
    }
}
