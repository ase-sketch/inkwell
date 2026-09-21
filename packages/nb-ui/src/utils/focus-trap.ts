/**
 * 轻量焦点陷阱工具：供模态 Dialog 使用。
 *
 * 不引入 focus-trap/@vueuse/integrations 依赖——模态框场景只需要
 * "找出可聚焦元素 + Tab 首尾循环"两个原语，自实现约 40 行。
 */

const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not(:disabled)",
    "input:not(:disabled)",
    "select:not(:disabled)",
    "textarea:not(:disabled)",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * 返回容器内当前可聚焦的元素（按 DOM 顺序）。
 * 可见性过滤基于 offsetParent / fixed 定位；happy-dom 等测试环境
 * offsetParent 恒为 null，此时放行全部匹配项（防御性降级）。
 */
export function getFocusable(root: HTMLElement): HTMLElement[] {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    return candidates.filter((el) => {
        if (typeof el.getClientRects !== "function") {
            return true;
        }
        // offsetParent 为 null 的两种合法情况：fixed 定位、测试环境；用 getClientRects 兜底判断可见
        return el.offsetParent !== null || el.getClientRects().length > 0;
    });
}

/**
 * 处理 Tab 键使焦点在容器内首尾循环。仅在 event 是 Tab 时生效。
 */
export function trapTabKey(event: KeyboardEvent, root: HTMLElement): void {
    if (event.key !== "Tab") {
        return;
    }
    const focusable = getFocusable(root);
    if (focusable.length === 0) {
        // 容器内无可聚焦元素：留在容器本身
        event.preventDefault();
        root.focus();
        return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
            event.preventDefault();
            last.focus();
        }
        return;
    }
    if (active === last || !root.contains(active)) {
        event.preventDefault();
        first.focus();
    }
}
