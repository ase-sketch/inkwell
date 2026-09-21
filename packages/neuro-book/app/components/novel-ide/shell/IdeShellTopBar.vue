<script setup lang="ts">
import IdeShellModePill from "nbook/app/components/novel-ide/shell/IdeShellModePill.vue";
import Tooltip from "nbook/app/components/common/Tooltip.vue";
import type {IdeShellSurface} from "nbook/app/utils/ide-shell-layout";

const props = defineProps<{
    surface: IdeShellSurface;
    canSwitch: boolean;
    /** 当前文稿标题；为空表示还没有打开文稿。 */
    documentTitle: string;
    /** 右侧设定抽屉是否展开。 */
    lorebookOpen: boolean;
    /** 右侧大纲抽屉是否展开。 */
    outlineOpen: boolean;
}>();

const emit = defineEmits<{
    (event: "select-surface", value: IdeShellSurface): void;
    (event: "toggle-lorebook"): void;
    (event: "toggle-outline"): void;
}>();

const {t} = useI18n();
</script>

<template>
    <header class="relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border-color)] bg-[var(--bg-main)] px-3">
        <!-- 左：当前文稿标题（没有文稿时留空，保持顶部干净） -->
        <div class="flex min-w-0 flex-1 items-center gap-2">
            <span v-if="props.documentTitle" class="min-w-0 truncate text-[12px] text-[var(--text-secondary)]" :title="props.documentTitle">{{ props.documentTitle }}</span>
        </div>

        <!-- 中：聊天 / 工作 胶囊 -->
        <IdeShellModePill class="shrink-0" :surface="props.surface" :can-switch="props.canSwitch" @select="emit('select-surface', $event)" />

        <!-- 右：大纲 / 设定抽屉开关（互斥，同一时刻只开一个） -->
        <div class="flex min-w-0 flex-1 items-center justify-end gap-1">
            <Tooltip :text="t('ide.outline.drawerTitle')" placement="bottom">
                <button
                    type="button"
                    class="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                    :class="props.outlineOpen ? 'bg-[var(--bg-hover)] text-[var(--accent-text)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                    :aria-pressed="props.outlineOpen"
                    data-role="ide-shell-outline-toggle"
                    @click="emit('toggle-outline')"
                >
                    <span class="i-lucide-list-tree h-4 w-4"></span>
                </button>
            </Tooltip>
            <Tooltip :text="props.lorebookOpen ? t('ide.shell.lorebookDrawerClose') : t('ide.shell.lorebookDrawerTitle')" placement="bottom">
                <button
                    type="button"
                    class="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                    :class="props.lorebookOpen ? 'bg-[var(--bg-hover)] text-[var(--accent-text)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                    :aria-pressed="props.lorebookOpen"
                    data-role="ide-shell-lorebook-toggle"
                    @click="emit('toggle-lorebook')"
                >
                    <span class="i-lucide-panel-right-open h-4 w-4"></span>
                </button>
            </Tooltip>
        </div>
    </header>
</template>
