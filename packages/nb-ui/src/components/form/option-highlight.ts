/**
 * 浮层选项列表的高亮移动计算（纯函数，便于单测）。
 * Combobox 等"高亮 + 键盘导航"组件共用。
 */
export type HighlightAction = "next" | "prev" | "first" | "last";

/**
 * 在非 disabled 选项间移动高亮。
 * - next/prev 循环回绕；current 不在可用集合时，next 从第一个、prev 从最后一个开始。
 * - 无可用选项时返回 -1。
 */
export function moveHighlight(options: {disabled?: boolean}[], current: number, action: HighlightAction): number {
    const enabledIndexes = options.map((opt, index) => (opt.disabled ? -1 : index)).filter((index) => index >= 0);
    if (enabledIndexes.length === 0) {
        return -1;
    }
    if (action === "first") {
        return enabledIndexes[0]!;
    }
    if (action === "last") {
        return enabledIndexes[enabledIndexes.length - 1]!;
    }
    const position = enabledIndexes.indexOf(current);
    if (position === -1) {
        return action === "next" ? enabledIndexes[0]! : enabledIndexes[enabledIndexes.length - 1]!;
    }
    const delta = action === "next" ? 1 : -1;
    return enabledIndexes[(position + delta + enabledIndexes.length) % enabledIndexes.length]!;
}
