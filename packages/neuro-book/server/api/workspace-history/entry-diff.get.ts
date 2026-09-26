import {getQuery} from "h3";
import {z} from "zod";
import {ProjectRootDtoSchema} from "nbook/shared/dto/project.dto";
import {withProjectHandlesOperation} from "nbook/server/workspace-files/project-open-guard";
import {readWorkspaceHistoryEntryDiff} from "nbook/server/workspace-history/history-timeline";
import type {WorkspaceHistoryDiffMode} from "nbook/server/workspace-history/history-diff";
import type {WorkspaceHistoryDiffDto} from "nbook/shared/dto/workspace-history.dto";

/**
 * 按条目读一条历史变更的「修改前 → 修改后」安全 diff。
 *
 * 授权边界是路径 + 条目编号：entryId 必须出现在该 path 的时间线里（服务端反查），
 * 不接受裸 snapshot hash，外部无法用 hash 换取正文。敏感路径、超限与正文不可取的
 * 安全分支沿用收件箱 diff 的同一份实现，安全分支绝不携带正文。
 */
export default defineEventHandler(async (event): Promise<WorkspaceHistoryDiffDto> => {
    const query = z.object({
        projectRoot: ProjectRootDtoSchema,
        path: z.string().trim().min(1, "path 不能为空"),
        entryId: z.coerce.number().int().positive("entryId 必须是正整数"),
        mode: z.enum(["inline", "full"]),
    }).parse(getQuery(event));
    const mode: WorkspaceHistoryDiffMode = query.mode;
    return withProjectHandlesOperation(query.projectRoot, async (projectHandles) => {
        await projectHandles.history.waitForWarmup();
        const history = await projectHandles.history.history;
        if (!history) {
            return {status: "unavailable", reason: "history_disabled"};
        }
        return readWorkspaceHistoryEntryDiff({
            history,
            path: query.path,
            entryId: query.entryId,
            mode,
        });
    });
});
