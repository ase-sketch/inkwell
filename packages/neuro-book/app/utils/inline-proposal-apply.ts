/**
 * M2.5b 提案卡确认制：原文锚点应用到草稿的纯函数工具。
 *
 * 核心规则：
 * 1. 只有 accepted === true 的条目才会被应用。
 * 2. 严格对齐 server 侧校验口径：original 必须精确匹配当前草稿中唯一的锚点。
 *    - 若出现 0 次：报 anchor_not_found，跳过并提示。
 *    - 若出现 > 1 次：报 anchor_ambiguous，跳过并提示，绝不进行模糊猜测替换。
 * 3. 多条修改如果区间重叠：报 anchor_overlap，绝不串行误伤。
 * 4. 替换时按文档中起始偏移由大到小（从后向前）执行替换，确保各条目位置互不干扰。
 */

export interface ApplyProposalEditCandidate {
    original: string;
    replacement: string;
    accepted: boolean;
}

export interface FailedProposalEdit {
    index: number;
    original: string;
    reason: "anchor_not_found" | "anchor_ambiguous" | "anchor_overlap" | "empty_original";
    message: string;
}

export interface ApplyProposalResult {
    content: string;
    appliedCount: number;
    skippedCount: number;
    failedEdits: FailedProposalEdit[];
}

/**
 * 统计子串在主串中出现的次数（非重叠）。
 */
export function countOccurrences(text: string, searchStr: string): number {
    if (!searchStr || !text) return 0;
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(searchStr, pos)) !== -1) {
        count++;
        pos += searchStr.length;
    }
    return count;
}

interface ValidatedMatch {
    index: number;
    start: number;
    end: number;
    original: string;
    replacement: string;
}

/**
 * 将已采纳的修改条目应用到文档内容中。
 */
export function applyAcceptedEdits(
    documentContent: string,
    edits: ApplyProposalEditCandidate[],
): ApplyProposalResult {
    let skippedCount = 0;
    const failedEdits: FailedProposalEdit[] = [];
    const validMatches: ValidatedMatch[] = [];

    for (let i = 0; i < edits.length; i++) {
        const edit = edits[i]!;
        if (!edit.accepted) {
            skippedCount++;
            continue;
        }

        if (!edit.original) {
            failedEdits.push({
                index: i,
                original: edit.original,
                reason: "empty_original",
                message: "原文锚点不能为空",
            });
            continue;
        }

        const occurrences = countOccurrences(documentContent, edit.original);
        if (occurrences === 0) {
            failedEdits.push({
                index: i,
                original: edit.original,
                reason: "anchor_not_found",
                message: "未在文档中找到原文锚点",
            });
            continue;
        }

        if (occurrences > 1) {
            failedEdits.push({
                index: i,
                original: edit.original,
                reason: "anchor_ambiguous",
                message: "原文锚点在文档中出现多次，无法唯一定位",
            });
            continue;
        }

        const start = documentContent.indexOf(edit.original);
        const end = start + edit.original.length;
        validMatches.push({
            index: i,
            start,
            end,
            original: edit.original,
            replacement: edit.replacement,
        });
    }

    // 检查有效匹配之间是否有重叠
    // 先按 start 升序排序
    const sortedForOverlap = [...validMatches].sort((a, b) => a.start - b.start);
    const overlappingIndices = new Set<number>();

    for (let j = 0; j < sortedForOverlap.length - 1; j++) {
        const current = sortedForOverlap[j]!;
        const next = sortedForOverlap[j + 1]!;
        if (current.end > next.start) {
            overlappingIndices.add(current.index);
            overlappingIndices.add(next.index);
        }
    }

    if (overlappingIndices.size > 0) {
        for (const index of overlappingIndices) {
            const edit = edits[index]!;
            failedEdits.push({
                index,
                original: edit.original,
                reason: "anchor_overlap",
                message: "与其他采纳条目修改区域重叠",
            });
        }
    }

    // 剔除重叠项
    const executableMatches = sortedForOverlap.filter((m) => !overlappingIndices.has(m.index));

    if (executableMatches.length === 0) {
        return {
            content: documentContent,
            appliedCount: 0,
            skippedCount,
            failedEdits,
        };
    }

    // 从后向前替换，防止位置偏移
    const sortedDescending = [...executableMatches].sort((a, b) => b.start - a.start);
    let currentContent = documentContent;

    for (const match of sortedDescending) {
        const before = currentContent.slice(0, match.start);
        const after = currentContent.slice(match.end);
        currentContent = before + match.replacement + after;
    }

    return {
        content: currentContent,
        appliedCount: executableMatches.length,
        skippedCount,
        failedEdits,
    };
}
