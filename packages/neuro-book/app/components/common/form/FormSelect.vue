<script setup lang="ts">
import {computed, nextTick, ref, toRef} from "vue";
import {onClickOutside} from "@vueuse/core";
import {useFloatingPanelLayout, type FloatingPanelDirection} from "nbook/app/composables/useFloatingPanelLayout";

type SelectSize = "default" | "sm";

export interface SelectOption {
    value: string;
    label: string;
    description?: string;
    iconClass?: string;
    indicatorClass?: string;
}

const props = withDefaults(defineProps<{
    modelValue: string;
    options: SelectOption[];
    placeholder?: string;
    /** 语义尺寸，sm 用于表格、行内编辑器这类紧凑表单。 */
    size?: SelectSize;
    dropdownDirection?: FloatingPanelDirection;
    disabled?: boolean;
    hideCheckmark?: boolean;
}>(), {
    placeholder: "",
    size: "default",
    dropdownDirection: "auto",
    disabled: false,
    hideCheckmark: false,
});

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
    (e: "focus", event: FocusEvent): void;
}>();

const {t} = useI18n();
const open = ref(false);
const rootRef = ref<HTMLDivElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);
const {
    resolvedDirection,
    panelStyle,
    updateLayout,
} = useFloatingPanelLayout({
    open,
    anchorRef: rootRef,
    panelRef,
    direction: toRef(props, "dropdownDirection"),
});

onClickOutside(rootRef, () => {
    open.value = false;
});

const toggle = async () => {
    if (props.disabled) {
        return;
    }
    open.value = !open.value;
    if (open.value) {
        await nextTick();
        updateLayout();
    }
};

const selectOption = (opt: SelectOption) => {
    if (props.disabled) {
        return;
    }
    emit("update:modelValue", opt.value);
    open.value = false;
};

const controlSizeClass = computed(() => props.size === "sm"
    ? "h-7 px-2 text-[12px]"
    : "h-7 px-2.5 text-[12px]");
const optionSizeClass = computed(() => props.size === "sm"
    ? "min-h-7 px-2 py-1 text-[12px]"
    : "min-h-7 px-2.5 py-1 text-[12px]");

</script>

<template>
    <div ref="rootRef" class="relative">
        <div
            class="flex w-full items-center justify-between rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-main)] outline-none transition-colors select-none"
            :class="[controlSizeClass, open ? '!border-[var(--accent-main)] ring-1 ring-[var(--accent-main)]/30' : '', props.disabled ? 'cursor-default opacity-80' : 'cursor-pointer hover:bg-[var(--bg-hover)]']"
            :tabindex="props.disabled ? -1 : 0"
            :aria-disabled="props.disabled"
            @focus="emit('focus', $event)"
            @click="toggle"
        >
            <span class="flex items-center gap-1.5 min-w-0 pr-2">
                <template v-for="opt in options" :key="opt.value">
                    <template v-if="opt.value === modelValue">
                        <span v-if="opt.indicatorClass" class="h-1.5 w-1.5 rounded-full shrink-0 shadow-sm" :class="opt.indicatorClass"></span>
                        <span v-else-if="opt.iconClass" class="shrink-0 h-3 w-3 text-[var(--text-muted)]" :class="opt.iconClass"></span>
                        <span class="truncate">{{ opt.label }}</span>
                    </template>
                </template>
                <span v-if="!options.some(o => o.value === modelValue)" class="text-[var(--text-muted)] opacity-80">{{ placeholder || t("common.selectOption") }}</span>
            </span>
            <span class="i-lucide-chevron-down h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 transition-transform duration-200" :class="open ? '-rotate-180 text-[var(--text-main)]' : ''"></span>
        </div>

        <transition :name="resolvedDirection === 'up' ? 'dropdown-up' : 'dropdown-down'">
            <div
                v-if="open"
                ref="panelRef"
                class="absolute left-0 right-0 z-[9200] overflow-y-auto rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] p-1.5 shadow-xl custom-scrollbar"
                :class="resolvedDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'"
                :style="panelStyle"
            >
                <div
                    v-for="opt in options"
                    :key="opt.value"
                    class="mb-1 flex items-center gap-2 rounded-md cursor-pointer transition-colors last:mb-0 hover:bg-[var(--bg-hover)]"
                    :class="[optionSizeClass, opt.value === modelValue ? 'text-[var(--text-main)] font-medium bg-[var(--bg-input)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]']"
                    @click="selectOption(opt)"
                >
                    <span v-if="opt.indicatorClass" class="h-1.5 w-1.5 rounded-full shrink-0 shadow-sm" :class="opt.indicatorClass"></span>
                    <span v-else-if="opt.iconClass" class="shrink-0 h-3 w-3 opacity-70" :class="opt.iconClass"></span>
                    <span class="min-w-0 flex-1">
                        <span class="block truncate">{{ opt.label }}</span>
                        <span v-if="opt.description" class="mt-0.5 block truncate text-[10px] font-normal text-[var(--text-muted)]">{{ opt.description }}</span>
                    </span>
                    <span v-if="!props.hideCheckmark && opt.value === modelValue" class="i-lucide-check h-3 w-3 text-[var(--accent-main)] ml-auto shrink-0"></span>
                </div>
            </div>
        </transition>
    </div>
</template>

<style scoped>
.dropdown-down-enter-active,
.dropdown-down-leave-active,
.dropdown-up-enter-active,
.dropdown-up-leave-active {
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.dropdown-down-enter-from,
.dropdown-down-leave-to {
    opacity: 0;
    transform: translateY(-4px) scaleY(0.96);
}

.dropdown-up-enter-from,
.dropdown-up-leave-to {
    opacity: 0;
    transform: translateY(4px) scaleY(0.96);
}
</style>
