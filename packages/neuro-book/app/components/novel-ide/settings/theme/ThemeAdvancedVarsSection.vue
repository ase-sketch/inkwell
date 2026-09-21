<script setup lang="ts">
import FormColorField from "nbook/app/components/common/form/FormColorField.vue";
import type {CustomThemeDto, ThemeVarName} from "nbook/shared/theme/theme-vars";

type ThemeVarGroup = {
    id: string;
    labelKey: string;
    keys: readonly ThemeVarName[];
};

const THEME_VAR_GROUPS = [
    {id: "surface", labelKey: "settings.themeVarGroups.surface", keys: ["bg-main", "bg-panel", "bg-sidebar", "bg-subtle", "bg-input", "bg-hover"]},
    {id: "text", labelKey: "settings.themeVarGroups.text", keys: ["text-main", "text-secondary", "text-muted", "text-inverse"]},
    {id: "accent", labelKey: "settings.themeVarGroups.accent", keys: ["border-color", "border-strong", "border-accent", "accent-main", "accent-bg", "accent-text"]},
    {id: "info", labelKey: "settings.themeVarGroups.info", keys: ["status-info", "status-info-bg", "status-info-border"]},
    {id: "success", labelKey: "settings.themeVarGroups.success", keys: ["status-success", "status-success-bg", "status-success-border"]},
    {id: "warning", labelKey: "settings.themeVarGroups.warning", keys: ["status-warning", "status-warning-bg", "status-warning-border"]},
    {id: "danger", labelKey: "settings.themeVarGroups.danger", keys: ["status-danger", "status-danger-bg", "status-danger-border"]},
    {id: "editor", labelKey: "settings.themeVarGroups.editor", keys: ["editor-bg", "source-bg", "source-text", "source-muted", "shadow-color", "selection-bg", "toolbar-bg", "chat-ai-bg"]},
] as const satisfies readonly ThemeVarGroup[];

const props = defineProps<{
    modelValue: CustomThemeDto["vars"];
    /** 调色盘弹层配色，跟随被编辑主题的明暗模式 */
    pickerTheme?: "white" | "black";
    disabled?: boolean;
}>();

const emit = defineEmits<{
    (event: "update:modelValue", value: CustomThemeDto["vars"]): void;
    (event: "valid-change", key: ThemeVarName, value: boolean): void;
}>();

const {t} = useI18n();
const notification = useNotification();
const openGroupIds = ref<string[]>(["surface", "text", "accent"]);

/**
 * 更新单个高级变量。
 */
function updateVar(key: ThemeVarName, value: string): void {
    emit("update:modelValue", {
        ...props.modelValue,
        [key]: value,
    });
}

/**
 * 切换高级变量分组折叠状态。
 */
function toggleGroup(groupId: string): void {
    openGroupIds.value = openGroupIds.value.includes(groupId)
        ? openGroupIds.value.filter((id) => id !== groupId)
        : [...openGroupIds.value, groupId];
}

/**
 * 判断分组是否展开。
 */
function isGroupOpen(groupId: string): boolean {
    return openGroupIds.value.includes(groupId);
}

/**
 * 复制当前变量值，方便调试和文档对账。
 */
async function copyColorValue(value: string): Promise<void> {
    if (!import.meta.client || !navigator.clipboard) {
        return;
    }
    await navigator.clipboard.writeText(value);
    notification.success(t("settings.themeEditor.copied"));
}

/**
 * 把变量名转换为 i18n key。
 */
function themeVarLabelKey(key: ThemeVarName): string {
    return `settings.themeVars.${key.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase())}`;
}
</script>

<template>
    <!-- 高级主题变量 -->
    <section>
        <p class="mb-3 text-xs text-[var(--text-secondary)]">{{ t("settings.themeEditor.advancedDescription") }}</p>

        <div class="space-y-2">
            <div v-for="group in THEME_VAR_GROUPS" :key="group.id" class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)]">
                <button type="button" class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-medium text-[var(--text-main)]" @click="toggleGroup(group.id)">
                    <span>{{ t(group.labelKey) }}</span>
                    <span class="i-lucide-chevron-down h-4 w-4 text-[var(--text-muted)] transition-transform" :class="isGroupOpen(group.id) ? 'rotate-180' : ''"></span>
                </button>

                <div v-if="isGroupOpen(group.id)" class="grid gap-3 border-t border-[var(--border-color)] p-3 sm:grid-cols-2">
                    <div v-for="key in group.keys" :key="key" class="min-w-0">
                        <div class="mb-1 flex items-center justify-between gap-2">
                            <span class="truncate text-[11px] text-[var(--text-muted)]">{{ t(themeVarLabelKey(key)) }}</span>
                            <button type="button" class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--border-color)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]" :title="t('settings.themeEditor.copyValue')" @click="copyColorValue(modelValue[key] ?? '')">
                                <span class="i-lucide-copy h-3.5 w-3.5"></span>
                            </button>
                        </div>
                        <FormColorField
                            :model-value="modelValue[key] ?? ''"
                            :variable-name="`--${key}`"
                            :picker-theme="pickerTheme"
                            :disabled="disabled"
                            @update:model-value="updateVar(key, $event)"
                            @valid-change="emit('valid-change', key, $event)"
                        />
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>
