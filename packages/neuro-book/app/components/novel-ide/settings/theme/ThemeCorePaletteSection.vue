<script setup lang="ts">
import FormColorField from "nbook/app/components/common/form/FormColorField.vue";
import {CORE_VAR_KEYS, type CoreThemeVarName} from "nbook/app/utils/theme/derive";
import {regenerateDerivedVars} from "nbook/app/utils/theme/theme-editor";
import type {CustomThemeDto, ThemeAppearance, ThemeVarName} from "nbook/shared/theme/theme-vars";

const props = defineProps<{
    modelValue: CustomThemeDto["vars"];
    appearance: ThemeAppearance;
    /** 调色盘弹层配色，跟随被编辑主题的明暗模式 */
    pickerTheme?: "white" | "black";
    disabled?: boolean;
}>();

const emit = defineEmits<{
    (event: "update:modelValue", value: CustomThemeDto["vars"]): void;
    (event: "valid-change", key: ThemeVarName, value: boolean): void;
}>();

const {t} = useI18n();

/**
 * 核心色变化时同步重算派生变量，保证实时预览完整。
 */
function updateCoreColor(key: CoreThemeVarName, value: string): void {
    const nextVars = regenerateDerivedVars({
        ...props.modelValue,
        [key]: value,
    }, props.appearance);
    emit("update:modelValue", nextVars);
}

/**
 * 把变量名转换为 i18n key。
 */
function themeVarLabelKey(key: ThemeVarName): string {
    return `settings.themeVars.${key.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase())}`;
}
</script>

<template>
    <!-- 核心主题变量 -->
    <section>
        <p class="mb-3 text-xs text-[var(--text-secondary)]">{{ t("settings.themeEditor.coreDescription") }}</p>

        <div class="grid gap-3 sm:grid-cols-2">
            <FormColorField
                v-for="key in CORE_VAR_KEYS"
                :key="key"
                :model-value="modelValue[key] ?? ''"
                :label="t(themeVarLabelKey(key))"
                :variable-name="`--${key}`"
                :picker-theme="pickerTheme"
                :disabled="disabled"
                @update:model-value="updateCoreColor(key, $event)"
                @valid-change="emit('valid-change', key, $event)"
            />
        </div>
    </section>
</template>
