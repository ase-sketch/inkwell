<script setup lang="ts">
import Tooltip from "nbook/app/components/common/Tooltip.vue";
import type {WorkspaceEditorTab} from "nbook/app/stores/novel-ide";

const props = defineProps<{
    tabs: readonly WorkspaceEditorTab[];
    activePath: string;
}>();

const emit = defineEmits<{
    (event: "select-tab", path: string): void;
    (event: "close-tab", path: string): void;
}>();

const {t} = useI18n();

/** 只展出正文标签：作者不需要在标签条上分辨编辑器类型。 */
const visibleTabs = computed(() => props.tabs);
</script>

<template>
    <!-- 轻量正文标签条：只有文件名、未保存圆点与关闭，没有视图切换/分屏等编辑器控件 -->
    <header
        class="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-2 custom-scrollbar"
        data-role="ide-document-tabs"
    >
        <Tooltip
            v-for="tab in visibleTabs"
            :key="tab.path"
            :text="tab.path"
            placement="bottom"
        >
            <div
                class="group flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors"
                :class="tab.path === props.activePath
                    ? 'bg-[var(--bg-hover)] font-medium text-[var(--text-main)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                :data-document-tab="tab.path"
                role="button"
                tabindex="0"
                @click="emit('select-tab', tab.path)"
                @keydown.enter.prevent="emit('select-tab', tab.path)"
                @keydown.space.prevent="emit('select-tab', tab.path)"
            >
                <span class="min-w-0 flex-1 truncate">{{ tab.title }}</span>
                <span v-if="tab.dirty" class="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-warning)]" :title="t('ide.documentTabs.unsaved')"></span>
                <button
                    type="button"
                    class="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-[var(--bg-input)] group-hover:opacity-100"
                    :title="t('ide.documentTabs.close')"
                    :data-document-tab-close="tab.path"
                    @click.stop="emit('close-tab', tab.path)"
                >
                    <span class="i-lucide-x h-3 w-3"></span>
                </button>
            </div>
        </Tooltip>
    </header>
</template>
