/**
 * 为Source Docker事务生成不可变本地镜像代次。
 * 完整Operation ID确保失败回滚不会删除事务前已存在的同revision镜像。
 */
export function sourceDockerImageName(revision: string, operationId: string): string {
    if (!/^[a-f0-9]{40}$/u.test(revision)) throw new Error(`Source Docker revision非法：${revision}`);
    return `neuro-book-source:${revision.slice(0, 12)}-${sourceDockerImageSuffix(operationId)}`;
}

/** 将任意非空Operation ID映射为Docker tag安全的完整身份摘要。 */
export function sourceDockerImageSuffix(operationId: string): string {
    if (!operationId) throw new Error("Source Docker Operation ID不能为空。" );
    return createHash("sha256").update(operationId).digest("hex");
}
import {createHash} from "node:crypto";
