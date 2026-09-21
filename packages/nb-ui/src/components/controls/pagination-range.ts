/**
 * 分页页码序列计算。
 *
 * 规则：始终显示第 1 页和最后一页，当前页两侧各保留 siblingCount 个页码，
 * 与首尾不连续的区间折叠为省略号。当总页数不超过“全显槽位”时不折叠。
 */
export type PaginationRangeItem = number | "ellipsis-start" | "ellipsis-end";

export function paginationRange(page: number, pageCount: number, siblingCount = 1): PaginationRangeItem[] {
    if (pageCount <= 0) {
        return [];
    }
    // 全显槽位 = 首 + 尾 + 当前 + 两侧 sibling + 两个省略位；不超过时全部平铺
    const totalSlots = siblingCount * 2 + 5;
    if (pageCount <= totalSlots) {
        return numberRange(1, pageCount);
    }

    const current = Math.min(Math.max(page, 1), pageCount);
    const leftSibling = Math.max(current - siblingCount, 1);
    const rightSibling = Math.min(current + siblingCount, pageCount);
    // 与首/尾之间至少空出 2 页才值得折叠，否则直接平铺到边界
    const showLeftEllipsis = leftSibling > 2;
    const showRightEllipsis = rightSibling < pageCount - 1;

    if (!showLeftEllipsis && showRightEllipsis) {
        const leftCount = 3 + siblingCount * 2;
        return [...numberRange(1, leftCount), "ellipsis-end", pageCount];
    }
    if (showLeftEllipsis && !showRightEllipsis) {
        const rightCount = 3 + siblingCount * 2;
        return [1, "ellipsis-start", ...numberRange(pageCount - rightCount + 1, pageCount)];
    }
    return [1, "ellipsis-start", ...numberRange(leftSibling, rightSibling), "ellipsis-end", pageCount];
}

function numberRange(from: number, to: number): number[] {
    const result: number[] = [];
    for (let value = from; value <= to; value += 1) {
        result.push(value);
    }
    return result;
}
