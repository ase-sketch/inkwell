<script setup lang="ts">
import {nextTick, onMounted, onUnmounted, ref, watch} from "vue";
import type {ComponentPublicInstance} from "vue";
import {NB_Z_INDEX} from "../../theme/z-index";
import {clampMenuPosition, computeSubmenuPosition} from "./context-menu-position";
import type {ContextMenuItem} from "./context-menu.types";

// 右键菜单：固定定位浮层 + 一级子菜单，位置自动做视口边界收敛。
// 消费方持有 visible/x/y 状态（通常来自 @contextmenu.prevent 事件坐标），本组件只负责渲染与关闭时机。
const props = withDefaults(defineProps<{
    visible: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
    teleportTarget?: string;
}>(), {
    teleportTarget: "body",
});

const emit = defineEmits<{
    (e: "close"): void;
}>();

const menuRef = ref<HTMLElement | null>(null);
const submenuRef = ref<HTMLElement | null>(null);
const itemRefs = ref<Record<number, HTMLElement>>({});
const adjustedX = ref(props.x);
const adjustedY = ref(props.y);
const submenuLeft = ref(0);
const submenuTop = ref(0);
const activeSubmenuIndex = ref<number | null>(null);
const isMounted = ref(false);

/** 执行菜单动作并关闭菜单；有子菜单的项只负责展开 */
function handleItemClick(item: ContextMenuItem): void {
    if (item.disabled || item.children?.length) {
        return;
    }
    item.action?.();
    emit("close");
}

/** 菜单项外观：danger 走共享危险菜单项基座（is-active 表示子菜单展开中） */
function itemClass(item: ContextMenuItem, active: boolean): string {
    if (item.tone === "danger") {
        return active ? "nb-ui-menu-item-danger is-active" : "nb-ui-menu-item-danger";
    }
    return active
        ? "bg-[var(--overlay-item-active)] hover:bg-[var(--overlay-item-active)]"
        : "hover:bg-[var(--overlay-item-active)]";
}

/** 记录菜单项元素，用于计算子菜单锚点 */
function setItemRef(index: number, element: Element | ComponentPublicInstance | null): void {
    if (element instanceof HTMLElement) {
        itemRefs.value[index] = element;
        return;
    }
    delete itemRefs.value[index];
}

function setSubmenuRef(element: Element | ComponentPublicInstance | null): void {
    submenuRef.value = element instanceof HTMLElement ? element : null;
}

function openSubmenu(index: number, item: ContextMenuItem): void {
    if (item.disabled || !item.children?.length) {
        activeSubmenuIndex.value = null;
        return;
    }
    activeSubmenuIndex.value = index;
}

/** 子菜单渲染后按视口边界修正位置 */
async function adjustSubmenuPosition(): Promise<void> {
    await nextTick();
    if (activeSubmenuIndex.value === null || !submenuRef.value) {
        return;
    }
    const itemElement = itemRefs.value[activeSubmenuIndex.value];
    if (!itemElement) {
        return;
    }
    const itemRect = itemElement.getBoundingClientRect();
    const submenuRect = submenuRef.value.getBoundingClientRect();
    const position = computeSubmenuPosition(
        {top: itemRect.top, left: itemRect.left, right: itemRect.right},
        {width: submenuRect.width, height: submenuRect.height},
        {width: window.innerWidth, height: window.innerHeight},
    );
    submenuLeft.value = position.x;
    submenuTop.value = position.y;
}

/** 点击/右键菜单外部时关闭 */
function closeOnOutside(event: MouseEvent): void {
    if (!props.visible || menuRef.value?.contains(event.target as Node)) {
        return;
    }
    emit("close");
}

function handleKeydown(event: KeyboardEvent): void {
    if (props.visible && event.key === "Escape") {
        emit("close");
    }
}

onMounted(() => {
    isMounted.value = true;
    document.addEventListener("click", closeOnOutside, true);
    document.addEventListener("contextmenu", closeOnOutside, true);
    document.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
    document.removeEventListener("click", closeOnOutside, true);
    document.removeEventListener("contextmenu", closeOnOutside, true);
    document.removeEventListener("keydown", handleKeydown);
});

watch(() => [props.visible, props.x, props.y] as const, async ([visible, x, y]) => {
    activeSubmenuIndex.value = null;
    if (!visible) {
        return;
    }
    adjustedX.value = x;
    adjustedY.value = y;
    await nextTick();
    if (!menuRef.value) {
        return;
    }
    const rect = menuRef.value.getBoundingClientRect();
    const position = clampMenuPosition(x, y, {width: rect.width, height: rect.height}, {width: window.innerWidth, height: window.innerHeight});
    adjustedX.value = position.x;
    adjustedY.value = position.y;
});

watch(activeSubmenuIndex, () => {
    void adjustSubmenuPosition();
});
</script>

<template>
    <Teleport v-if="isMounted" :to="props.teleportTarget">
        <Transition name="nb-context-menu">
            <!-- 主菜单浮层 -->
            <div
                v-if="visible"
                ref="menuRef"
                role="menu"
                class="nb-ui-popover-surface nb-ui-menu-surface fixed min-w-[170px] p-1.5 text-[var(--text-main)]"
                :style="{top: `${adjustedY}px`, left: `${adjustedX}px`, zIndex: NB_Z_INDEX.contextMenu}"
                @click.stop
                @contextmenu.prevent
            >
                <template v-for="(item, index) in items" :key="index">
                    <div v-if="item.separator" role="separator" class="mx-1 my-1 h-px bg-[var(--border-color)]" @mouseenter="activeSubmenuIndex = null"></div>
                    <button
                        v-else
                        :ref="(element) => setItemRef(index, element)"
                        type="button"
                        role="menuitem"
                        class="nb-ui-popover-item flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                        :class="itemClass(item, activeSubmenuIndex === index)"
                        :disabled="item.disabled"
                        @mouseenter="openSubmenu(index, item)"
                        @focus="openSubmenu(index, item)"
                        @click="handleItemClick(item)"
                    >
                        <span v-if="item.iconClass" :class="item.iconClass" class="h-4 w-4 shrink-0"></span>
                        <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                        <span v-if="item.shortcut" class="ml-4 shrink-0 text-[11px] text-[var(--text-muted)]">{{ item.shortcut }}</span>
                        <span v-if="item.children?.length" class="i-lucide-chevron-right ml-2 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"></span>
                    </button>
                    <!-- 一级子菜单 -->
                    <div
                        v-if="item.children?.length && activeSubmenuIndex === index"
                        :ref="setSubmenuRef"
                        role="menu"
                        class="nb-ui-popover-surface nb-ui-menu-surface fixed min-w-[180px] p-1.5 text-[var(--text-main)]"
                        :style="{top: `${submenuTop}px`, left: `${submenuLeft}px`, zIndex: NB_Z_INDEX.contextMenu + 1}"
                    >
                        <template v-for="(child, childIndex) in item.children" :key="childIndex">
                            <div v-if="child.separator" role="separator" class="mx-1 my-1 h-px bg-[var(--border-color)]"></div>
                            <button
                                v-else
                                type="button"
                                role="menuitem"
                                class="nb-ui-popover-item flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                                :class="itemClass(child, false)"
                                :disabled="child.disabled"
                                @click="handleItemClick(child)"
                            >
                                <span v-if="child.iconClass" :class="child.iconClass" class="h-4 w-4 shrink-0"></span>
                                <span class="min-w-0 flex-1 truncate">{{ child.label }}</span>
                                <span v-if="child.shortcut" class="ml-4 shrink-0 text-[11px] text-[var(--text-muted)]">{{ child.shortcut }}</span>
                            </button>
                        </template>
                    </div>
                </template>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.nb-context-menu-enter-active {
    transition:
        opacity var(--motion-enter) var(--ease-standard),
        transform var(--motion-enter) var(--ease-standard);
    transform-origin: var(--reka-context-menu-content-transform-origin, top left);
}

.nb-context-menu-leave-active {
    transition:
        opacity var(--motion-fast) var(--ease-standard),
        transform var(--motion-fast) var(--ease-standard);
    transform-origin: var(--reka-context-menu-content-transform-origin, top left);
}

.nb-context-menu-enter-from,
.nb-context-menu-leave-to {
    opacity: 0;
    transform: scale(0.96);
}
</style>
