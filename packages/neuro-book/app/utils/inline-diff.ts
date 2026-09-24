import {diffWordsWithSpace} from "diff";

export interface InlineDiffPart {
    value: string;
    added?: boolean;
    removed?: boolean;
}

/**
 * 计算原文与改后文本的词/字符级轻量 diff 分块。
 */
export function computeInlineDiff(original?: string | null, replacement?: string | null): InlineDiffPart[] {
    const orig = typeof original === "string" ? original : "";
    const rep = typeof replacement === "string" ? replacement : "";
    if (!orig && !rep) return [];
    if (!orig) {
        return [{value: rep, added: true}];
    }
    if (!rep) {
        return [{value: orig, removed: true}];
    }
    return diffWordsWithSpace(orig, rep);
}

/**
 * 判断修改条目是否属于多行或长文本大改，用于决定是否展示「展开对比」按钮。
 * 防御非 string 入参，按空串安全处理，永不抛错。
 */
export function isLargeDiff(original?: string | null, replacement?: string | null): boolean {
    const orig = typeof original === "string" ? original : "";
    const rep = typeof replacement === "string" ? replacement : "";
    if (!orig && !rep) return false;
    const lineThreshold = 3;
    const charThreshold = 150;
    const origLines = orig.split("\n").length;
    const repLines = rep.split("\n").length;
    return origLines > lineThreshold || repLines > lineThreshold || orig.length > charThreshold || rep.length > charThreshold;
}
