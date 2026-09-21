import {openProjectControl} from "nbook/server/workspace-files/project-session";
import {withProjectHttpError} from "nbook/server/api/projects/project-http-error";
import {requireProjectRefBody} from "nbook/server/api/projects/project-control-plane";

/**
 * 显式打开 Project 会话（Task 94）。
 * openProject 内部完成目录校验（404）与数据库迁移收敛；未 open 前数据面接口会以 409 拒绝。
 */
export default defineEventHandler((event) => withProjectHttpError(async () => {
    const ref = await requireProjectRefBody(event);
    const opened = await openProjectControl(ref, {kind: "user"});
    return opened.publication;
}));
