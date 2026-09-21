<script setup lang="ts">
import {computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useDraggable, useWindowSize} from "@vueuse/core";
import {NB_Z_INDEX} from "../../theme/z-index";
import IconButton from "../controls/IconButton.vue";

/**
 * 通用浮动窗口组件（非模态）。
 *
 * 与 Dialog 的区别：没有遮罩层，页面其余部分保持可见、可交互；
 * 窗口本体毛玻璃底、可通过标题栏拖动。适合"边调整边看页面实时变化"
 * 的工具面板场景。模态确认类交互请继续用 Dialog。
 * 注意：与模态 Dialog 同开时两者都监听 Esc，需要错开时把本组件 closeOnEsc 设为 false。
 */

const props = withDefaults(defineProps<{
    /** 控制窗口显隐 */
    modelValue: boolean;
    /** 标题栏文字 */
    title?: string;
    /** 窗口宽度（px），拖动边界按此值收敛 */
    width?: number;
    /** 窗口高度，默认按内容自适应 */
    height?: string;
    /** 窗口最大高度 */
    maxHeight?: string;
    /** 是否显示关闭按钮 */
    closable?: boolean;
    /** Esc 键是否关闭 */
    closeOnEsc?: boolean;
    /** 是否处于忙碌态，忙碌时不允许关闭 */
    busy?: boolean;
    /** 自定义 body 区域 class，用于接管内部滚动的场景 */
    bodyClass?: string;
    /** Teleport 目标 */
    teleportTarget?: string;
}>(), {
    title: "",
    width: 560,
    height: "auto",
    maxHeight: "calc(100vh - 32px)",
    closable: true,
    closeOnEsc: true,
    busy: false,
    bodyClass: "overflow-y-auto px-4 py-3",
    teleportTarget: "body",
});

const emit = defineEmits<{
    (e: "update:modelValue", value: boolean): void;
    (e: "request-close", reason: "close-button" | "esc"): void;
}>();

const instance = getCurrentInstance();
const windowRef = ref<HTMLElement | null>(null);
const dragHandleRef = ref<HTMLElement | null>(null);
/** 是否已经计算过首次弹出位置；组件存活期间保留用户拖动后的位置 */
const positioned = ref(false);

const {width: viewportWidth, height: viewportHeight} = useWindowSize();
const {x, y} = useDraggable(windowRef, {
    handle: dragHandleRef,
    preventDefault: true,
    initialValue: {x: 24, y: 24},
});

/** 拖动边界收敛：窗口至少保留一角在视口内，标题栏始终可再次抓取 */
const clampedX = computed(() => {
    const minX = 16 - props.width + 72;
    const maxX = Math.max(viewportWidth.value - 72, minX);
    return Math.min(Math.max(x.value, minX), maxX);
});
const clampedY = computed(() => {
    const maxY = Math.max(viewportHeight.value - 48, 8);
    return Math.min(Math.max(y.value, 8), maxY);
});

const windowStyle = computed(() => ({
    left: `${clampedX.value}px`,
    top: `${clampedY.value}px`,
    width: `${props.width}px`,
    height: props.height,
    maxHeight: props.maxHeight,
    zIndex: NB_Z_INDEX.dialogWindow,
}));

/** 判断父组件是否监听了 request-close，用于决定默认关闭行为 */
const hasRequestCloseListener = computed(() => {
    return Boolean(instance?.vnode.props && "onRequestClose" in instance.vnode.props);
});

/** 请求关闭窗口，若外部未拦截则直接关闭 */
function requestClose(reason: "close-button" | "esc"): void {
    if (props.busy) {
        return;
    }
    emit("request-close", reason);
    if (!hasRequestCloseListener.value) {
        emit("update:modelValue", false);
    }
}

function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && props.closeOnEsc) {
        requestClose("esc");
    }
}

watch(() => props.modelValue, (visible) => {
    if (typeof document === "undefined") {
        return;
    }
    if (visible) {
        // 首次打开时停靠视口右上，之后保留用户拖过的位置
        if (!positioned.value) {
            x.value = Math.max(viewportWidth.value - props.width - 28, 16);
            y.value = 64;
            positioned.value = true;
        }
        document.addEventListener("keydown", handleKeydown);
    } else {
        document.removeEventListener("keydown", handleKeydown);
    }
});

onBeforeUnmount(() => {
    if (typeof document !== "undefined") {
        document.removeEventListener("keydown", handleKeydown);
    }
});

const isMounted = ref(false);
onMounted(() => {
    isMounted.value = true;
});
</script>

<template>
    <!-- 浮动窗口（无遮罩，页面保持可交互） -->
    <Teleport v-if="isMounted" :to="props.teleportTarget">
        <Transition name="nb-dialog-window">
            <div v-if="modelValue" ref="windowRef" class="nb-dialog-window nb-ui-surface-rim fixed flex flex-col overflow-hidden rounded-xl border border-[var(--panel-outline)] text-[var(--text-main)]" :style="windowStyle">
                <!-- 标题栏（拖动手柄） -->
                <div class="flex shrink-0 items-center gap-2 border-b border-[var(--divider)] pr-2">
                    <div ref="dragHandleRef" class="flex min-w-0 flex-1 cursor-move touch-none select-none items-center gap-2 py-2 pl-4">
                        <span class="i-lucide-grip-vertical h-4 w-4 shrink-0 text-[var(--text-muted)]"></span>
                        <slot name="header">
                            <span class="min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-[var(--text-main)]">{{ title }}</span>
                        </slot>
                    </div>
                    <IconButton v-if="closable" title="关闭" :disabled="busy" @click="requestClose('close-button')">
                        <span class="i-lucide-x h-4 w-4"></span>
                    </IconButton>
                </div>

                <!-- body 区域 -->
                <div class="flex min-h-0 flex-1 flex-col text-sm leading-relaxed text-[var(--text-secondary)]" :class="bodyClass">
                    <slot />
                </div>

                <!-- footer 区域 -->
                <div v-if="$slots.footer" class="flex shrink-0 items-center justify-end gap-2.5 border-t border-[var(--divider)] px-4 py-2">
                    <slot name="footer"></slot>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
/* 毛玻璃窗体：透出后方页面，保证"实时看页面变化"的观感。
   仍保留独立窗口配方，不把非模态窗口误当作模态 Dialog。 */
.nb-dialog-window {
    background-color: color-mix(in srgb, var(--bg-panel) 86%, transparent);
    backdrop-filter: blur(14px);
    box-shadow: var(--elevation-popover);
}

/* 对话框进出走 --motion-base（控件形变档）；缓动统一 --ease-standard，
   回弹曲线已归并（见 design-language.md 动效节）。 */
.nb-dialog-window-enter-active {
    transition:
        opacity var(--motion-base) var(--ease-standard),
        transform var(--motion-base) var(--ease-standard);
}

.nb-dialog-window-leave-active {
    transition:
        opacity var(--motion-fast) var(--ease-standard),
        transform var(--motion-fast) var(--ease-standard);
}

.nb-dialog-window-enter-from,
.nb-dialog-window-leave-to {
    opacity: 0;
    transform: scale(0.96);
}
</style>
