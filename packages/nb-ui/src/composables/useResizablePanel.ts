import {computed, onScopeDispose, ref, toValue, type MaybeRefOrGetter, type Ref} from "vue";
import {useDraggable} from "@vueuse/core";

export type ResizablePanelEdge = "left" | "right" | "top" | "bottom";

export type UseResizablePanelOptions = {
    /** 当前面板尺寸，由宿主组件或设置提供。 */
    size: MaybeRefOrGetter<number>;
    /** 面板允许的最小尺寸。 */
    minSize: MaybeRefOrGetter<number>;
    /** 面板允许的最大尺寸。 */
    maxSize: MaybeRefOrGetter<number>;
    /** 拖拽手柄所在边，决定尺寸跟随指针变化的方向。 */
    edge: MaybeRefOrGetter<ResizablePanelEdge>;
    /** 是否允许拖拽。 */
    enabled?: MaybeRefOrGetter<boolean>;
    /** 是否在拖拽过程中同步回外部状态。 */
    syncDuringResize?: MaybeRefOrGetter<boolean>;
    /** 拖拽中的尺寸变化回调。 */
    onResize?: (value: number) => void;
    /** 拖拽结束回调，适合提交到持久化设置。 */
    onResizeEnd?: (value: number) => void;
};

/** 将面板尺寸限制在允许范围内。 */
export function clampResizablePanelSize(value: number, minSize: number, maxSize: number): number {
    const normalizedMin = Math.max(0, minSize);
    const normalizedMax = Math.max(normalizedMin, maxSize);
    return Math.max(normalizedMin, Math.min(value, normalizedMax));
}

/** 统一处理边缘拖拽调整面板尺寸。 */
export function useResizablePanel(handleRef: Ref<HTMLElement | null>, options: UseResizablePanelOptions) {
    const startSize = ref(0);
    const startPointer = ref(0);
    const previewSize = ref<number | null>(null);
    const pendingSize = ref<number | null>(null);
    const lastEmittedSize = ref<number | null>(null);
    const resizeFrame = ref<number | null>(null);
    const axis = edgeAxis(toValue(options.edge));

    const currentSize = computed(() => {
        return clampResizablePanelSize(toValue(options.size), toValue(options.minSize), toValue(options.maxSize));
    });
    const displaySize = computed(() => previewSize.value ?? currentSize.value);
    const panelStyle = computed(() => axis === "x" ? {width: `${displaySize.value}px`} : {height: `${displaySize.value}px`});

    function flushPendingResize(): void {
        resizeFrame.value = null;
        const nextSize = pendingSize.value;
        if (nextSize === null) {
            return;
        }
        pendingSize.value = null;
        if (previewSize.value !== null && Math.abs(nextSize - previewSize.value) < 1) {
            return;
        }
        previewSize.value = nextSize;
        if (toValue(options.syncDuringResize) && (lastEmittedSize.value === null || Math.abs(nextSize - lastEmittedSize.value) >= 1)) {
            options.onResize?.(nextSize);
            lastEmittedSize.value = nextSize;
        }
    }

    function scheduleResize(nextSize: number): void {
        pendingSize.value = nextSize;
        if (resizeFrame.value !== null || typeof window === "undefined") {
            if (typeof window === "undefined") {
                flushPendingResize();
            }
            return;
        }
        resizeFrame.value = window.requestAnimationFrame(flushPendingResize);
    }

    function commitResizeEnd(): void {
        if (resizeFrame.value !== null && typeof window !== "undefined") {
            window.cancelAnimationFrame(resizeFrame.value);
            flushPendingResize();
        }
        const finalSize = previewSize.value ?? currentSize.value;
        if (!toValue(options.syncDuringResize)) {
            options.onResize?.(finalSize);
        }
        options.onResizeEnd?.(finalSize);
        previewSize.value = null;
        pendingSize.value = null;
        lastEmittedSize.value = null;
    }

    const {isDragging} = useDraggable(handleRef, {
        axis,
        preventDefault: true,
        stopPropagation: true,
        disabled: computed(() => options.enabled !== undefined && !toValue(options.enabled)),
        onStart: (_position, event) => {
            startSize.value = currentSize.value;
            previewSize.value = currentSize.value;
            pendingSize.value = null;
            lastEmittedSize.value = currentSize.value;
            startPointer.value = pointerPosition(event, axis);
        },
        onMove: (_position, event) => {
            const nextPointer = pointerPosition(event, axis);
            const nextSize = startSize.value + (nextPointer - startPointer.value) * edgeDirection(toValue(options.edge));
            scheduleResize(clampResizablePanelSize(nextSize, toValue(options.minSize), toValue(options.maxSize)));
        },
        onEnd: commitResizeEnd,
    });

    onScopeDispose(() => {
        if (resizeFrame.value !== null && typeof window !== "undefined") {
            window.cancelAnimationFrame(resizeFrame.value);
        }
    });

    return {
        isResizing: isDragging,
        panelStyle,
    };
}

function edgeAxis(edge: ResizablePanelEdge): "x" | "y" {
    return edge === "left" || edge === "right" ? "x" : "y";
}

function edgeDirection(edge: ResizablePanelEdge): 1 | -1 {
    return edge === "right" || edge === "bottom" ? 1 : -1;
}

function pointerPosition(event: PointerEvent, axis: "x" | "y"): number {
    return axis === "x" ? event.clientX : event.clientY;
}
