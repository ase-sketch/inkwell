<script setup lang="ts">
import {computed, ref} from "vue";
import {labComponents, type LabComponentId} from "./registry";

const props = defineProps<{
    componentId: LabComponentId;
}>();

const emit = defineEmits<{
    (event: "select", id: LabComponentId): void;
}>();

const searchQuery = ref("");

const filteredComponents = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return labComponents;
    return labComponents.filter((c) =>
        c.label.toLowerCase().includes(q) ||
        c.labelZh.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q),
    );
});

const groups = computed(() => {
    const seen = new Map<string, typeof labComponents>();
    for (const component of filteredComponents.value) {
        const list = seen.get(component.group) ?? [];
        list.push(component);
        seen.set(component.group, list);
    }
    return [...seen.entries()].map(([label, components]) => ({label, components}));
});
</script>

<template>
    <nav class="lab-nav lab-glass flex flex-col h-full select-none" aria-label="组件列表">
        <!-- 顶部搜索栏与计数 -->
        <div class="lab-nav__header sticky top-0 z-20 pb-3 border-b border-[var(--divider)] bg-[var(--sidebar-surface)] backdrop-blur-md">
            <div class="flex items-center justify-between gap-2 mb-2 px-1">
                <span class="text-xs font-bold text-[var(--text-main)] tracking-wide flex items-center gap-1.5">
                    <span class="i-lucide-boxes h-4 w-4 text-[var(--accent-main)]" aria-hidden="true" />
                    组件库
                </span>
                <span class="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--text-secondary)]">
                    {{ filteredComponents.length }} / {{ labComponents.length }}
                </span>
            </div>

            <!-- 搜索框 -->
            <div class="relative flex items-center">
                <span class="i-lucide-search absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" aria-hidden="true" />
                <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="搜索组件 (如 date, 树, 菜单)..."
                    class="nb-ui-focus-ring w-full rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--border-color)_70%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_80%,transparent)] pl-8 pr-7 py-1 text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none transition-colors [transition-duration:var(--motion-fast)] hover:border-[var(--accent-main)]"
                />
                <button
                    v-if="searchQuery"
                    type="button"
                    class="absolute right-2 flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] cursor-pointer"
                    aria-label="清空搜索"
                    @click="searchQuery = ''"
                >
                    <span class="i-lucide-x h-3 w-3" aria-hidden="true" />
                </button>
            </div>
        </div>

        <!-- 列表内容区 -->
        <div class="lab-nav__body flex-1 overflow-y-auto pt-3 space-y-4 pr-1">
            <div v-if="groups.length === 0" class="py-8 text-center text-xs text-[var(--text-muted)]">
                <span class="i-lucide-search-x mx-auto block h-6 w-6 mb-1 opacity-60" aria-hidden="true" />
                未找到匹配「{{ searchQuery }}」的组件
            </div>

            <div v-for="group in groups" :key="group.label" class="lab-nav__group space-y-1">
                <div class="lab-nav__group-label flex items-center justify-between px-2 text-[11px] font-semibold text-[var(--text-muted)] tracking-wider">
                    <span>{{ group.label }}</span>
                    <span class="font-mono text-[10px] opacity-70">{{ group.components.length }}</span>
                </div>

                <button
                    v-for="component in group.components"
                    :key="component.id"
                    type="button"
                    class="lab-nav__item group relative flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 text-left transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_8%,transparent)] cursor-pointer"
                    :class="{'is-active': props.componentId === component.id}"
                    :aria-pressed="props.componentId === component.id"
                    :title="component.description"
                    @click="emit('select', component.id)"
                >
                    <div class="flex items-center gap-2 truncate">
                        <span class="lab-nav__item-zh truncate text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-main)] group-[.is-active]:font-semibold group-[.is-active]:text-[var(--accent-main)]">
                            {{ component.labelZh }}
                        </span>
                    </div>

                    <span class="lab-nav__item-en shrink-0 font-mono text-[11px] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] group-[.is-active]:text-[var(--accent-main)]">
                        {{ component.label }}
                    </span>
                </button>
            </div>
        </div>
    </nav>
</template>
