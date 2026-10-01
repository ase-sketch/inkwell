import {createError} from "h3";
import type {ProjectDataPlaneHandles} from "nbook/server/workspace-files/project-open-guard";
import {isHistoryTrackedRelativePath} from "nbook/server/workspace-history/history-paths";

/**
 * 章节快照路由的共享守卫（M7）。
 *
 * 快照指向的是正文的历史版本，因此入口路径必须和记账面说的是同一件事：
 * 该路径得真的被文件历史纳管，否则打出来的快照指向一个根本不存在的版本。
 * 判定直接复用 Project handles 上的 pathPolicy（projectWorkspacePathPolicy 口径）
 * 与既有记账谓词，与写入口、watcher 对账保持一致，不在本层另发明一套排除规则。
 */
export function assertHistoryTrackedPath(
    projectHandles: ProjectDataPlaneHandles,
    path: string,
): void {
    if (!isHistoryTrackedRelativePath(path)) {
        throw createError({statusCode: 400, message: "这个位置不支持打快照"});
    }
    if (projectHandles.history.pathPolicy(path).disposition !== "consume") {
        throw createError({statusCode: 400, message: "这个位置不支持打快照"});
    }
}

/** 文件历史未启用：作者要的存档点没能留下，如实报错而不是假装打好了。 */
export function historyDisabledError(): ReturnType<typeof createError> {
    return createError({statusCode: 400, message: "文件历史未启用，暂时无法使用章节快照"});
}
