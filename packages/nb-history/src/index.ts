/**
 * @notnotype/nb-history 公开面。
 *
 * 用法:
 *   const history = await WorkspaceHistory.open({databasePath});
 *   await history.registerObservedWrite({kind: "agent", sessionId: "s1"}, "manuscript/ch1.md", "正文…");
 *   const inbox = await history.inbox("user-1");
 *   await history.close();
 */
export {WorkspaceHistory} from "./workspace-history";
export {
    DEFAULT_HISTORY_CONFIG,
    HistoryError,
    HistoryInboxMutationError,
    afterStateHash,
    beforeStateHash,
    operationPath,
} from "./types";
export type {
    DeletedFileInfo,
    FileOperation,
    HistoryConfig,
    HistoryInboxMutationErrorCode,
    InboxGroup,
    OpenOptions,
    OperationActor,
    OperationLogEntry,
    PathPurgeReport,
    PruneReport,
    TextDiffResult,
    TimelineEntry,
    UnseenGroup,
} from "./types";
