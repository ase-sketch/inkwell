<script setup lang="ts">
import {computed, onBeforeUnmount, ref} from "vue";
import {NB_Z_INDEX} from "../../theme/z-index";

// 悬停提示：hover 延迟显示、focus 即时显示、Esc 关闭。
// 定位基于触发器的包裹元素做绝对定位（无碰撞翻转）；需要避让边界时由消费方换 placement。
export type TooltipPlacement = "top" | "bottom" | "left" | "right";

const props = withDefaults(defineProps<{
    /** 提示文本；富内容用 content 插槽覆盖 */
    text?: string;
    placement?: TooltipPlacement;
    /** hover 到显示的延迟毫秒数 */
    delay?: number;
    disabled?: boolean;
}>(), {
    text: "",
    placement: "top",
    delay: 300,
    disabled: false,
});

const visible = ref(false);
let showTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

function clearTimer(): void {
    if (showTimer !== null) {
        globalThis.clearTimeout(showTimer);
        showTimer = null;
    }
}

function scheduleShow(): void {
    if (props.disabled) {
        return;
    }
    clearTimer();
    showTimer = globalThis.setTimeout(() => {
        visible.value = true;
    }, props.delay);
}

function showNow(): void {
    if (props.disabled) {
        return;
    }
    clearTimer();
    visible.value = true;
}

function hide(): void {
    clearTimer();
    visible.value = false;
}

const placementClass = computed(() => {
    if (props.placement === "bottom") {
        return "top-full left-1/2 mt-1.5 -translate-x-1/2";
    }
    if (props.placement === "left") {
        return "right-full top-1/2 mr-1.5 -translate-y-1/2";
    }
    if (props.placement === "right") {
        return "left-full top-1/2 ml-1.5 -translate-y-1/2";
    }
    return "bottom-full left-1/2 mb-1.5 -translate-x-1/2";
});

onBeforeUnmount(clearTimer);
</script>

<template>
    <!-- 触发器包裹层：tooltip 相对它定位 -->
    <span class="relative inline-flex" @mouseenter="scheduleShow" @mouseleave="hide" @focusin="showNow" @focusout="hide" @keydown.esc="hide">
        <slot />
        <Transition name="nb-tooltip">
            <!-- 圆角走 inline style 而不是原子类：.nb-ui-popover-surface 排在 utilities 之后，
                 rounded-md 会被它压掉。提示气泡是所有浮层里最小的一个，套面板圆角会显得太圆。 -->
            <span v-if="visible" role="tooltip" :style="{zIndex: NB_Z_INDEX.tooltip, borderRadius: 'var(--radius-control)'}" class="nb-ui-popover-surface pointer-events-none absolute w-max max-w-64 px-2.5 py-1.5 text-xs leading-relaxed text-[var(--text-main)]" :class="placementClass">
                <slot name="content">{{ props.text }}</slot>
            </span>
        </Transition>
    </span>
</template>

<style scoped>
/* Tooltip 跟随 macOS 行为只淡入淡出，不做缩放（见 design-language.md 动效节）。 */
.nb-tooltip-enter-active {
    transition: opacity var(--motion-enter) var(--ease-standard);
}

.nb-tooltip-leave-active {
    transition: opacity var(--motion-fast) var(--ease-standard);
}

.nb-tooltip-enter-from,
.nb-tooltip-leave-to {
    opacity: 0;
}
</style>
