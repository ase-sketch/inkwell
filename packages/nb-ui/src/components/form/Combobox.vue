<script setup lang="ts">
import {computed, nextTick, ref, useId, watch} from "vue";
import {onClickOutside} from "@vueuse/core";
import {NB_Z_INDEX} from "../../theme/z-index";
import {moveHighlight, type HighlightAction} from "./option-highlight";
import {useFormFieldContext} from "./form-field-context";
import type {FormSelectOption} from "./FormSelect.vue";

// 可搜索下拉选择：触发器是可输入框，输入即过滤，选项以浮层列出。
// 相比原生 <select> 的 FormSelect，支持搜索、自绘选项、勾选态与浮层定位。
export type ComboboxSize = "default" | "sm";

const props = withDefaults(defineProps<{
    modelValue?: string | null;
    options: (string | FormSelectOption)[];
    id?: string;
    name?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    size?: ComboboxSize;
}>(), {
    modelValue: null,
    id: "",
    name: "",
    placeholder: "",
    disabled: false,
    required: false,
    size: "default",
});

const emit = defineEmits<{
    (e: "update:modelValue", value: string | null): void;
}>();

const field = useFormFieldContext();
const open = ref(false);
const rootRef = ref<HTMLDivElement | null>(null);
const listboxId = `nb-combobox-${useId()}`;

onClickOutside(rootRef, () => {
    open.value = false;
});

// 归一化选项为 {value,label} 结构
const normalizedOptions = computed(() => props.options.map((opt) => (typeof opt === "string" ? {value: opt, label: opt} : opt)));

// 按当前输入过滤（匹配 label 或 value）；未输入时展示全部
const filteredOptions = computed(() => {
    if (!props.modelValue) {
        return normalizedOptions.value;
    }
    const lower = props.modelValue.toLowerCase();
    return normalizedOptions.value.filter((o) => o.label.toLowerCase().includes(lower) || o.value.toLowerCase().includes(lower));
});

// 输入框展示值：命中选项时显示其 label，否则回落到原始 modelValue
const displayValue = computed(() => {
    if (!props.modelValue) {
        return "";
    }
    const opt = normalizedOptions.value.find((o) => o.value === props.modelValue);
    return opt ? opt.label : props.modelValue;
});

function focusOpen(): void {
    if (props.disabled) {
        return;
    }
    open.value = true;
    syncHighlightToSelected();
}

function toggle(): void {
    if (props.disabled) {
        return;
    }
    open.value = !open.value;
    if (open.value) {
        syncHighlightToSelected();
    }
}

function handleInput(event: Event): void {
    if (props.disabled) {
        return;
    }
    const value = (event.target as HTMLInputElement).value;
    emit("update:modelValue", value || null);
    open.value = true;
}

function selectOption(opt: FormSelectOption): void {
    if (props.disabled || opt.disabled) {
        return;
    }
    emit("update:modelValue", opt.value);
    open.value = false;
}

// ---- 键盘导航：方向键移动高亮、Enter 选中、Esc 关闭 ----

const listRef = ref<HTMLUListElement | null>(null);
const highlightedIndex = ref(-1);

// 过滤结果变化时把高亮重置到当前选中项（不在结果中则清空）
watch(filteredOptions, (options) => {
    highlightedIndex.value = options.findIndex((o) => o.value === props.modelValue);
});

function syncHighlightToSelected(): void {
    highlightedIndex.value = filteredOptions.value.findIndex((o) => o.value === props.modelValue);
}

/** 高亮项 id，供 aria-activedescendant 关联 */
const activeDescendantId = computed(() => {
    if (!open.value || highlightedIndex.value < 0) {
        return undefined;
    }
    return `${listboxId}-opt-${highlightedIndex.value}`;
});

function scrollHighlightIntoView(): void {
    void nextTick(() => {
        listRef.value?.children[highlightedIndex.value]?.scrollIntoView({block: "nearest"});
    });
}

/** 移动高亮（计算在 option-highlight.ts 纯函数中），并让高亮项滚入视野 */
function highlight(action: HighlightAction): void {
    highlightedIndex.value = moveHighlight(filteredOptions.value, highlightedIndex.value, action);
    scrollHighlightIntoView();
}

function handleKeydown(event: KeyboardEvent): void {
    if (props.disabled) {
        return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!open.value) {
            focusOpen();
        }
        highlight(event.key === "ArrowDown" ? "next" : "prev");
        return;
    }
    if ((event.key === "Home" || event.key === "End") && open.value) {
        event.preventDefault();
        highlight(event.key === "Home" ? "first" : "last");
        return;
    }
    if (event.key === "Enter") {
        const highlighted = filteredOptions.value[highlightedIndex.value];
        if (open.value && highlighted) {
            event.preventDefault();
            selectOption(highlighted);
        }
        return;
    }
    if (event.key === "Escape" && open.value) {
        // 只拦截"关浮层"这一层，避免同一次 Esc 把外层 Dialog 也关掉
        event.preventDefault();
        event.stopPropagation();
        open.value = false;
    }
}

// 尺寸：default 对齐 nb-ui 表单控件（h-9 / text-sm），sm 为紧凑变体
const controlSizeClass = computed(() => (props.size === "sm" ? "h-7 rounded-[var(--radius-control)]" : "h-9 rounded-[var(--radius-control)]"));
const inputSizeClass = computed(() => (props.size === "sm" ? "px-2 text-xs rounded-l-[var(--radius-control)]" : "px-3 text-sm rounded-l-[var(--radius-control)]"));
const optionSizeClass = computed(() => (props.size === "sm" ? "px-2 py-1.5 text-xs" : "px-2.5 py-2 text-sm"));
</script>

<template>
    <div ref="rootRef" class="relative min-w-0">
        <!-- 触发器：输入框 + 展开箭头 -->
        <div
            class="nb-ui-control flex items-center border bg-[var(--control-surface)] transition-colors hover:border-[var(--border-strong)]"
            :class="[
                controlSizeClass,
                props.disabled ? 'cursor-not-allowed opacity-60' : '',
                field?.invalid.value ? 'nb-ui-control-invalid' : '',
            ]"
        >
            <input
                :value="displayValue"
                :id="props.id || field?.inputId.value || undefined"
                :name="props.name || undefined"
                type="text"
                role="combobox"
                autocomplete="off"
                aria-autocomplete="list"
                :aria-activedescendant="activeDescendantId"
                :placeholder="props.placeholder"
                :disabled="props.disabled"
                :aria-expanded="open"
                :aria-controls="listboxId"
                :aria-required="props.required || field?.required.value || undefined"
                :aria-describedby="field?.ariaDescribedby.value"
                :aria-invalid="field?.invalid.value || undefined"
                class="h-full w-full min-w-0 bg-transparent text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed"
                :class="inputSizeClass"
                @input="handleInput"
                @focus="focusOpen"
                @click="focusOpen"
                @keydown="handleKeydown"
            >
            <button
                type="button"
                class="flex shrink-0 items-center justify-center px-2 text-[var(--text-muted)] outline-none transition-colors hover:text-[var(--text-main)] disabled:cursor-not-allowed"
                :disabled="props.disabled"
                tabindex="-1"
                aria-label="展开选项"
                @click.stop="toggle"
            >
                <span class="i-lucide-chevron-down h-4 w-4 transition-transform [transition-duration:var(--motion-fast)]" :class="open ? '-rotate-180' : ''"></span>
            </button>
        </div>

        <!-- 浮层选项列表 -->
        <transition name="nb-combobox">
            <!--
                外框 / 滚动区分两层：外框只管外观（描边、圆角、面色、阴影、磨砂全走
                .nb-ui-popover-surface），滚动挂在里面那层 <ul> 上。
                挂在外框上会同时坏两件事——滚动条画进圆角里被削掉两头、首尾两项贴着弧线被横切，
                判据见 styles.css 的 .nb-ui-popover-scroll。
                listbox 的语义与 id 仍在 <ul> 上，所以 aria-controls / aria-activedescendant 不变。
            -->
            <div
                v-if="open && filteredOptions.length > 0 && !props.disabled"
                :style="{zIndex: NB_Z_INDEX.popover}"
                class="nb-ui-popover-surface nb-ui-menu-surface absolute left-0 right-0 top-full mt-1 overflow-hidden p-1.5"
            >
                <ul
                    :id="listboxId"
                    ref="listRef"
                    role="listbox"
                    class="nb-ui-popover-scroll max-h-56"
                    :style="{borderRadius: 'var(--nb-popover-inner-radius)'}"
                >
                    <li
                        v-for="(opt, index) in filteredOptions"
                        :key="opt.value"
                        :id="`${listboxId}-opt-${index}`"
                        role="option"
                        :aria-selected="opt.value === props.modelValue"
                        class="nb-ui-popover-item mb-1 flex cursor-pointer items-center gap-2 transition-colors last:mb-0"
                        :class="[
                            optionSizeClass,
                            opt.value === props.modelValue ? 'bg-[var(--overlay-item-active)] font-medium text-[var(--text-main)]' : 'text-[var(--text-secondary)]',
                            index === highlightedIndex ? 'bg-[var(--overlay-item-active)] text-[var(--text-main)]' : '',
                            opt.disabled ? 'cursor-not-allowed opacity-45' : '',
                        ]"
                        @mouseenter="highlightedIndex = index"
                        @click.stop="selectOption(opt)"
                    >
                        <span class="min-w-0 flex-1 truncate">{{ opt.label }}</span>
                        <span v-if="opt.value === props.modelValue" class="i-lucide-check h-3.5 w-3.5 shrink-0 text-[var(--accent-main)]"></span>
                    </li>
                </ul>
            </div>
        </transition>
    </div>
</template>

<style scoped>
.nb-combobox-enter-active {
    transition:
        opacity var(--motion-enter) var(--ease-standard),
        transform var(--motion-enter) var(--ease-standard);
    transform-origin: top center;
}

.nb-combobox-leave-active {
    transition:
        opacity var(--motion-fast) var(--ease-standard),
        transform var(--motion-fast) var(--ease-standard);
    transform-origin: top center;
}

.nb-combobox-enter-from,
.nb-combobox-leave-to {
    opacity: 0;
    transform: scale(0.96);
}
</style>
