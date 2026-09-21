<script setup lang="ts">
import {computed, ref} from "vue";
import {
    ListboxContent,
    ListboxFilter,
    ListboxGroup,
    ListboxGroupLabel,
    ListboxItem,
    ListboxItemIndicator,
    ListboxRoot,
} from "reka-ui";

export type ListboxVariant = "compact" | "card";
export type ListboxSize = "sm" | "md" | "lg";

export interface ListboxOptionData {
    value: string;
    label: string;
    description?: string;
    iconClass?: string;
    badge?: string;
    badgeTone?: "accent" | "success" | "warning" | "danger" | "neutral";
    disabled?: boolean;
    group?: string;
}

export interface ListboxGroupData {
    id: string;
    label: string;
    options: ListboxOptionData[];
}

const props = withDefaults(defineProps<{
    modelValue?: string | string[];
    defaultValue?: string | string[];
    options?: ListboxOptionData[];
    groups?: ListboxGroupData[];
    variant?: ListboxVariant;
    size?: ListboxSize;
    multiple?: boolean;
    disabled?: boolean;
    showFilter?: boolean;
    filterPlaceholder?: string;
    showActionBar?: boolean;
    maxHeight?: string;
    emptyText?: string;
}>(), {
    modelValue: undefined,
    defaultValue: undefined,
    options: () => [],
    groups: undefined,
    variant: "compact",
    size: "md",
    multiple: false,
    disabled: false,
    showFilter: false,
    filterPlaceholder: "搜索选项...",
    showActionBar: false,
    maxHeight: "280px",
    emptyText: "未找到匹配选项",
});

const emit = defineEmits<{
    (e: "update:modelValue", value: any): void;
}>();

const searchTerm = ref("");

// 统一将 options / groups 整理为渲染列表
const normalizedGroups = computed<ListboxGroupData[]>(() => {
    const term = searchTerm.value.trim().toLowerCase();

    const matchesTerm = (opt: ListboxOptionData) => {
        if (!term) return true;
        return (
            opt.label.toLowerCase().includes(term) ||
            opt.description?.toLowerCase().includes(term) ||
            opt.badge?.toLowerCase().includes(term) ||
            opt.value.toLowerCase().includes(term)
        );
    };

    if (props.groups && props.groups.length > 0) {
        return props.groups
            .map((g) => ({
                id: g.id,
                label: g.label,
                options: g.options.filter(matchesTerm),
            }))
            .filter((g) => g.options.length > 0);
    }

    // 从 options 的 group 字段自动分组或扁平化
    const hasGroupField = props.options.some((opt) => Boolean(opt.group));
    if (hasGroupField) {
        const groupMap = new Map<string, ListboxOptionData[]>();
        for (const opt of props.options) {
            if (!matchesTerm(opt)) continue;
            const gName = opt.group || "其他";
            const list = groupMap.get(gName) ?? [];
            list.push(opt);
            groupMap.set(gName, list);
        }
        return [...groupMap.entries()].map(([label, opts], idx) => ({
            id: `grp-${idx}`,
            label,
            options: opts,
        }));
    }

    const filtered = props.options.filter(matchesTerm);
    return filtered.length > 0 ? [{id: "default", label: "", options: filtered}] : [];
});

const totalVisibleOptions = computed(() => {
    return normalizedGroups.value.reduce((acc, g) => acc + g.options.length, 0);
});

const selectedCount = computed(() => {
    const current = props.modelValue ?? props.defaultValue;
    if (Array.isArray(current)) return current.length;
    return current ? 1 : 0;
});

function isSelected(val: string): boolean {
    const current = props.modelValue ?? props.defaultValue;
    if (Array.isArray(current)) return current.includes(val);
    return current === val;
}

function handleSelectAll(): void {
    if (!props.multiple) return;
    const allValues = normalizedGroups.value.flatMap((g) => g.options.filter((o) => !o.disabled).map((o) => o.value));
    emit("update:modelValue", allValues);
}

function handleClear(): void {
    if (props.multiple) {
        emit("update:modelValue", []);
    } else {
        emit("update:modelValue", undefined);
    }
}

function handleInvert(): void {
    if (!props.multiple) return;
    const currentVal = props.modelValue ?? props.defaultValue;
    const current = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
    const allVisible = normalizedGroups.value.flatMap((g) => g.options.filter((o) => !o.disabled).map((o) => o.value));
    const inverted = allVisible.filter((v) => !current.includes(v));
    emit("update:modelValue", inverted);
}

function handleGroupSelectAll(group: ListboxGroupData): void {
    if (!props.multiple) return;
    const currentVal = props.modelValue ?? props.defaultValue;
    const current = Array.isArray(currentVal) ? [...currentVal] : (currentVal ? [currentVal] : []);
    const groupValues = group.options.filter((o) => !o.disabled).map((o) => o.value);
    const allGroupSelected = groupValues.every((v) => current.includes(v));

    if (allGroupSelected) {
        // 取消该组
        const next = current.filter((v) => !groupValues.includes(v));
        emit("update:modelValue", next);
    } else {
        // 全选该组
        const set = new Set([...current, ...groupValues]);
        emit("update:modelValue", [...set]);
    }
}

function badgeClass(tone?: string): string {
    switch (tone) {
        case "accent":
            return "bg-[color-mix(in_srgb,var(--accent-main)_16%,transparent)] text-[var(--accent-main)] border-[color-mix(in_srgb,var(--accent-main)_30%,transparent)]";
        case "success":
            return "bg-[color-mix(in_srgb,var(--status-success)_16%,transparent)] text-[var(--status-success)] border-[color-mix(in_srgb,var(--status-success)_30%,transparent)]";
        case "warning":
            return "bg-[color-mix(in_srgb,var(--status-warning)_16%,transparent)] text-[var(--status-warning)] border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)]";
        case "danger":
            return "bg-[color-mix(in_srgb,var(--status-danger)_16%,transparent)] text-[var(--status-danger)] border-[color-mix(in_srgb,var(--status-danger)_30%,transparent)]";
        default:
            return "bg-[color-mix(in_srgb,var(--text-main)_8%,transparent)] text-[var(--text-secondary)] border-[color-mix(in_srgb,var(--text-main)_14%,transparent)]";
    }
}
</script>

<template>
    <ListboxRoot
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :multiple="props.multiple"
        :disabled="props.disabled"
        class="w-full rounded-[var(--radius-panel)] border border-[color-mix(in_srgb,var(--border-color)_70%,transparent)] bg-[var(--bg-panel)] shadow-sm select-none flex flex-col overflow-hidden"
        @update:model-value="(val) => emit('update:modelValue', val)"
    >
        <!-- 顶部搜索过滤条 -->
        <div v-if="props.showFilter" class="p-2 border-b border-[var(--divider)] bg-[color-mix(in_srgb,var(--bg-panel)_90%,transparent)]">
            <div class="relative flex items-center">
                <span class="i-lucide-search absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" aria-hidden="true" />
                <ListboxFilter
                    v-model="searchTerm"
                    :placeholder="props.filterPlaceholder"
                    class="nb-ui-control nb-ui-control-h-sm w-full rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--border-color)_60%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_4%,transparent)] pl-8 pr-7 text-xs text-[var(--text-main)] outline-none transition-colors [transition-duration:var(--motion-fast)] hover:border-[var(--accent-main)] focus:border-[var(--accent-main)]"
                />
                <button
                    v-if="searchTerm"
                    type="button"
                    class="absolute right-2 flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                    aria-label="清空"
                    @click="searchTerm = ''"
                >
                    <span class="i-lucide-x h-3 w-3" aria-hidden="true" />
                </button>
            </div>
        </div>

        <!-- 列表内容视口 -->
        <ListboxContent
            class="p-1.5 overflow-y-auto space-y-1"
            :style="{maxHeight: props.maxHeight}"
        >
            <div v-if="normalizedGroups.length === 0" class="py-8 text-center text-xs text-[var(--text-muted)]">
                <span class="i-lucide-search-x mx-auto block h-6 w-6 mb-1 opacity-60" aria-hidden="true" />
                {{ props.emptyText }}
            </div>

            <ListboxGroup
                v-for="group in normalizedGroups"
                :key="group.id"
                class="space-y-1"
            >
                <!-- 分组标题（如果存在） -->
                <ListboxGroupLabel
                    v-if="group.label"
                    class="sticky top-0 z-10 flex items-center justify-between rounded-[calc(var(--radius-control)*0.5)] bg-[color-mix(in_srgb,var(--bg-panel)_94%,transparent)] backdrop-blur-md px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)] tracking-wider border-b border-[color-mix(in_srgb,var(--divider)_50%,transparent)]"
                >
                    <span>{{ group.label }}</span>
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-[10px] opacity-70">{{ group.options.length }}</span>
                        <button
                            v-if="props.multiple"
                            type="button"
                            class="text-[10px] text-[var(--accent-main)] hover:underline cursor-pointer"
                            @click.stop="handleGroupSelectAll(group)"
                        >
                            切换全选
                        </button>
                    </div>
                </ListboxGroupLabel>

                <!-- 选项渲染 -->
                <ListboxItem
                    v-for="option in group.options"
                    :key="option.value"
                    :value="option.value"
                    :disabled="option.disabled || props.disabled"
                    class="nb-ui-focus-ring group relative flex items-center justify-between gap-2.5 rounded-[calc(var(--radius-control)*0.75)] text-left cursor-pointer select-none transition-[background-color,border-color,color,box-shadow] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-40"
                    :class="[
                        props.variant === 'card'
                            ? 'p-2.5 border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] data-[state=checked]:border-[var(--accent-main)] data-[state=checked]:bg-[color-mix(in_srgb,var(--accent-main)_10%,transparent)] data-[state=checked]:shadow-[0_0_0_1px_var(--accent-main)]'
                            : props.multiple
                                ? 'px-2.5 py-1.5 hover:bg-[color-mix(in_srgb,var(--text-main)_8%,transparent)] data-[state=checked]:bg-[color-mix(in_srgb,var(--accent-main)_14%,transparent)] data-[state=checked]:text-[var(--accent-main)]'
                                : 'px-2.5 py-1.5 hover:bg-[color-mix(in_srgb,var(--text-main)_8%,transparent)] data-[state=checked]:bg-[var(--accent-main)] data-[state=checked]:text-[var(--text-inverse)] data-[state=checked]:shadow-[0_1px_3px_color-mix(in_srgb,var(--accent-main)_35%,transparent)]',
                        props.size === 'sm' ? 'text-xs py-1' : props.size === 'lg' ? 'text-sm p-3' : 'text-xs',
                    ]"
                >
                    <!-- 左侧：图标 / 复选框指示器 / 标题与描述 -->
                    <div class="flex items-center gap-2.5 min-w-0 flex-1">
                        <!-- 卡片模式下的左侧大图标/头像 -->
                        <div
                            v-if="props.variant === 'card'"
                            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--border-color)_60%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] group-data-[state=checked]:border-[var(--accent-main)] group-data-[state=checked]:bg-[color-mix(in_srgb,var(--accent-main)_18%,transparent)]"
                        >
                            <span v-if="option.iconClass" :class="[option.iconClass, 'h-4 w-4 text-[var(--text-secondary)] group-data-[state=checked]:text-[var(--accent-main)]']" aria-hidden="true" />
                            <span v-else class="i-lucide-bookmark h-4 w-4 text-[var(--text-muted)] group-data-[state=checked]:text-[var(--accent-main)]" aria-hidden="true" />
                        </div>

                        <!-- 紧凑模式下多选的左侧勾选盒 -->
                        <div
                            v-else-if="props.multiple"
                            class="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-[color-mix(in_srgb,var(--text-main)_25%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] group-data-[state=checked]:border-[var(--accent-main)] group-data-[state=checked]:bg-[var(--accent-main)] group-data-[state=checked]:text-[var(--text-inverse)]"
                        >
                            <ListboxItemIndicator class="flex items-center justify-center text-[var(--text-inverse)]">
                                <span class="i-lucide-check h-3 w-3" aria-hidden="true" />
                            </ListboxItemIndicator>
                        </div>

                        <!-- 普通图标 -->
                        <span
                            v-else-if="option.iconClass"
                            :class="[
                                option.iconClass,
                                'h-4 w-4 shrink-0 transition-colors [transition-duration:var(--motion-fast)]',
                                !props.multiple && props.variant === 'compact'
                                    ? 'text-[var(--text-muted)] group-data-[state=checked]:text-[var(--text-inverse)]'
                                    : 'text-[var(--text-muted)] group-data-[state=checked]:text-[var(--accent-main)]',
                            ]"
                            aria-hidden="true"
                        />

                        <!-- 文字主体 -->
                        <div class="flex flex-col min-w-0 flex-1 truncate">
                            <div class="flex items-center gap-1.5">
                                <span
                                    class="truncate"
                                    :class="[
                                        !props.multiple && props.variant === 'compact'
                                            ? 'font-medium text-[var(--text-main)] group-data-[state=checked]:text-[var(--text-inverse)] group-data-[state=checked]:font-semibold'
                                            : 'font-medium text-[var(--text-main)] group-data-[state=checked]:text-[var(--accent-main)]',
                                    ]"
                                >
                                    {{ option.label }}
                                </span>
                                <span
                                    v-if="option.badge"
                                    class="inline-flex items-center rounded-[var(--radius-control)] border px-1.5 py-0.2 text-[10px] font-medium transition-colors"
                                    :class="badgeClass(option.badgeTone)"
                                >
                                    {{ option.badge }}
                                </span>
                            </div>
                            <span
                                v-if="option.description"
                                class="text-[11px] truncate leading-normal transition-colors"
                                :class="[
                                    !props.multiple && props.variant === 'compact'
                                        ? 'text-[var(--text-muted)] group-data-[state=checked]:text-[color-mix(in_srgb,var(--text-inverse)_85%,transparent)]'
                                        : 'text-[var(--text-muted)]',
                                ]"
                            >
                                {{ option.description }}
                            </span>
                        </div>
                    </div>

                    <!-- 右侧：单选模式下的对勾，或卡片模式下的选中状态 -->
                    <div v-if="!props.multiple && props.variant === 'compact'" class="flex items-center shrink-0">
                        <ListboxItemIndicator class="flex h-4 w-4 items-center justify-center text-[var(--text-inverse)]">
                            <span class="i-lucide-check h-3.5 w-3.5 font-bold" aria-hidden="true" />
                        </ListboxItemIndicator>
                    </div>
                    <div v-else-if="props.variant === 'card'" class="flex items-center shrink-0">
                        <ListboxItemIndicator class="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-main)] text-[var(--text-inverse)] shadow-sm">
                            <span class="i-lucide-check h-3.5 w-3.5" aria-hidden="true" />
                        </ListboxItemIndicator>
                    </div>
                </ListboxItem>
            </ListboxGroup>
        </ListboxContent>

        <!-- 底部状态操作栏 -->
        <div
            v-if="props.showActionBar"
            class="flex items-center justify-between border-t border-[var(--divider)] bg-[color-mix(in_srgb,var(--bg-panel)_90%,transparent)] px-3 py-1.5 text-xs text-[var(--text-muted)] select-none"
        >
            <div class="flex items-center gap-1.5">
                <span class="font-mono font-medium text-[var(--text-main)]">{{ selectedCount }}</span>
                <span>/ {{ totalVisibleOptions }} 项已选</span>
            </div>

            <div v-if="props.multiple" class="flex items-center gap-2">
                <button
                    type="button"
                    class="nb-ui-focus-ring rounded px-1.5 py-0.5 text-xs text-[var(--accent-main)] hover:bg-[color-mix(in_srgb,var(--accent-main)_12%,transparent)] transition-colors [transition-duration:var(--motion-fast)] cursor-pointer"
                    @click="handleSelectAll"
                >
                    全选
                </button>
                <span class="text-[var(--divider)]">|</span>
                <button
                    type="button"
                    class="nb-ui-focus-ring rounded px-1.5 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] transition-colors [transition-duration:var(--motion-fast)] cursor-pointer"
                    @click="handleInvert"
                >
                    反选
                </button>
                <span class="text-[var(--divider)]">|</span>
                <button
                    type="button"
                    class="nb-ui-focus-ring rounded px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[color-mix(in_srgb,var(--status-danger)_12%,transparent)] transition-colors [transition-duration:var(--motion-fast)] cursor-pointer"
                    @click="handleClear"
                >
                    清空
                </button>
            </div>
            <button
                v-else-if="selectedCount > 0"
                type="button"
                class="nb-ui-focus-ring rounded px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] transition-colors [transition-duration:var(--motion-fast)] cursor-pointer"
                @click="handleClear"
            >
                清除选择
            </button>
        </div>
    </ListboxRoot>
</template>
