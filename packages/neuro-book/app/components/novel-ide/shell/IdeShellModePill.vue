<script setup lang="ts">
import type {IdeShellSurface} from "nbook/app/utils/ide-shell-layout";

const props = defineProps<{
    /** 主区现在居中显示谁。 */
    surface: IdeShellSurface;
    /** 对方情境此刻是否真的可达（写作面始终可达；对话在无文稿 + 未进码字态时不可达）。 */
    canSwitch: boolean;
}>();

const emit = defineEmits<{
    (event: "select", value: IdeShellSurface): void;
}>();

const {t} = useI18n();

const options = computed<Array<{id: IdeShellSurface; icon: string; label: string}>>(() => [
    {id: "chat", icon: "i-lucide-message-square", label: t("ide.shell.pillChat")},
    {id: "editor", icon: "i-lucide-square-pen", label: t("ide.shell.pillWrite")},
]);
</script>

<template>
    <!-- 顶部居中胶囊：主区情境互换的唯一入口 -->
    <div
        class="inline-flex items-center gap-0.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] p-0.5"
        role="tablist"
        :aria-label="t('ide.shell.pillLabel')"
        data-role="ide-shell-mode-pill"
    >
        <button
            v-for="option in options"
            :key="option.id"
            type="button"
            role="tab"
            class="flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :class="props.surface === option.id
                ? 'bg-[var(--bg-hover)] font-medium text-[var(--text-main)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'"
            :aria-selected="props.surface === option.id"
            :disabled="props.surface !== option.id && !props.canSwitch"
            :data-pill-option="option.id"
            @click="emit('select', option.id)"
        >
            <span :class="option.icon" class="h-3.5 w-3.5 shrink-0"></span>
            <span>{{ option.label }}</span>
        </button>
    </div>
</template>
