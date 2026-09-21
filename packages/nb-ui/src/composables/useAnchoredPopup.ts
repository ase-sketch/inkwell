import {nextTick, onScopeDispose, ref, watch} from "vue";
import type {Ref} from "vue";

/**
 * 把弹出层钉在触发器下方，并配合 `<Teleport to="body">` 用。
 *
 * **为什么必须传送出去**：弹出层原地绝对定位，就会被任何一个 `overflow: hidden` 的祖先切掉。
 * 这不是理论风险——对照页的 `.sc-panel` 为了圆角本来就得 `overflow: hidden`，
 * 时间选择器摆进去只露出弹出层顶上一条边。同一个原因还会让它被祖先的 `backdrop-filter`
 * 圈成 backdrop root，自己的磨砂采不到页面背景，玻璃等于白加。
 *
 * **判据上的坑**：`getBoundingClientRect()` 不反映裁剪。被祖先切掉一半的弹出层，
 * 量出来的位置、尺寸、对齐全是完美的。所以「弹出层有没有被切」只能靠截图看，量不出来。
 *
 * 定位是自带的最小实现，不是 floating-ui：只做「下方放不下就翻到上方」和「别冲出右边缘」两件事，
 * 不做贴边翻转、箭头、自动更新监听链。需要更多的组件应该直接用 Reka 的 Popper 原语
 * （FormSelect 就是这么做的）；这里之所以不这么做，是因为时间选择器的键盘与焦点行为写在契约里，
 * 换成原语等于把契约交给原语去实现。
 */
export function useAnchoredPopup(
    anchor: Ref<HTMLElement | null>,
    popup: Ref<HTMLElement | null>,
    open: Ref<boolean>,
    options: {gap?: number; margin?: number} = {},
): Ref<Record<string, string>> {
    const gap = options.gap ?? 6;
    const margin = options.margin ?? 8;
    const style = ref<Record<string, string>>({});

    function measure(): void {
        const anchorElement = anchor.value;
        if (anchorElement == null || typeof window === "undefined") {
            return;
        }
        const rect = anchorElement.getBoundingClientRect();
        // 弹出层还没挂上时按 0 处理：这一帧先按「放在下方」落位，挂上之后 watch 会再量一次
        const height = popup.value?.offsetHeight ?? 0;
        const width = popup.value?.offsetWidth ?? rect.width;

        const below = rect.bottom + gap;
        const above = rect.top - gap - height;
        const flip = height > 0 && below + height > window.innerHeight && above >= margin;

        style.value = {
            position: "fixed",
            top: `${flip ? above : below}px`,
            left: `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`,
            minWidth: `${rect.width}px`,
        };
    }

    function listen(on: boolean): void {
        if (typeof window === "undefined") {
            return;
        }
        // scroll 用捕获：滚的可能是某个祖先容器，不是 window——不捕获就跟不上
        if (on) {
            window.addEventListener("scroll", measure, true);
            window.addEventListener("resize", measure);
        } else {
            window.removeEventListener("scroll", measure, true);
            window.removeEventListener("resize", measure);
        }
    }

    watch(open, async (isOpen) => {
        listen(isOpen);
        if (!isOpen) {
            return;
        }
        measure();
        // v-if 的 DOM 这时才挂上，第二次量才拿得到真实高度，才判断得了要不要翻到上方
        await nextTick();
        measure();
    });

    onScopeDispose(() => {
        listen(false);
    });

    return style;
}
