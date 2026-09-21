import type {ResolvedProjectWorkspace} from "nbook/server/workspace-files/project-identity";

/** 谁发起了Project open；用于日志归因、presence与删除占用报告。 */
export type ProjectOpener =
    | {kind: "user"}
    | {kind: "agent"; sessionId: number}
    | {kind: "job"; source: string};

/** 已完成全部required最低ready门禁的ProjectSession generation引用。 */
export type ReadyProjectSessionRef = {
    readonly workspace: ResolvedProjectWorkspace;
    readonly generation: number;
};
