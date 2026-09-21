<script setup lang="ts">
import {onMounted, ref} from "vue";
import NovelIdeModelSettingsPanel from "nbook/app/components/novel-ide/settings/NovelIdeModelSettingsPanel.vue";
import {useIdeTheme} from "nbook/app/composables/useIdeTheme";
import type {IdeTheme} from "nbook/app/utils/theme/theme-tokens";

const theme = ref<IdeTheme>("sepia");
const themeHostRef = ref<HTMLElement | null>(null);
const panelRevision = ref(0);

const {mountThemeHost, setTheme} = useIdeTheme(theme);

const themeOptions: Array<{value: IdeTheme; label: string}> = [
    {value: "sepia", label: "羊皮纸"},
    {value: "light", label: "浅色"},
    {value: "dark", label: "暗色"},
];

/**
 * 重置预览页组件状态。
 */
function resetPreviewState(): void {
    panelRevision.value += 1;
}

onMounted(() => {
    mountThemeHost(themeHostRef.value);
});
</script>

<template>
    <!-- 模型设置预览页 -->
    <div
        ref="themeHostRef"
        class="model-settings-preview-page min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]"
    >
        <!-- 页面头部 -->
        <header class="border-b border-[var(--border-color)] bg-[var(--toolbar-bg)]/95 backdrop-blur">
            <div class="mx-auto flex max-w-[1800px] flex-col gap-5 px-5 py-5 xl:flex-row xl:items-end xl:justify-between">
                <div class="max-w-[980px]">
                    <div class="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Model Settings Preview</div>
                    <h1 class="mt-2 text-2xl font-semibold text-[var(--text-main)]">模型设置独立预览页</h1>
                    <p class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        这里直接挂载真实的模型设置模块，专门用来调试 Provider 表单、模型分组列表、远程发现和健康检查交互。底层直接走真实 `/api/config` 接口，不使用 mock 数据。
                    </p>
                    <div class="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Route /model-settings.preview</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">真实组件</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">真实设置接口</span>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                    <button
                        v-for="option in themeOptions"
                        :key="option.value"
                        type="button"
                        class="rounded-md border px-3 py-1.5 text-xs transition-colors"
                        :class="theme === option.value
                            ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                        @click="setTheme(option.value)"
                    >
                        {{ option.label }}
                    </button>
                    <button
                        type="button"
                        class="rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                        @click="resetPreviewState"
                    >
                        重置预览状态
                    </button>
                </div>
            </div>
        </header>

        <!-- 页面主体 -->
        <main class="mx-auto max-w-[1800px] px-5 py-4">
            <section class="rounded-[28px] border border-[var(--border-color)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_94%,transparent),color-mix(in_srgb,var(--bg-sidebar)_90%,transparent))] px-5 py-5 shadow-[0_24px_80px_color-mix(in_srgb,var(--shadow-color)_10%,transparent)]">
                <NovelIdeModelSettingsPanel :key="panelRevision" />
            </section>
        </main>
    </div>
</template>

<style scoped>
.model-settings-preview-page {
    background-image:
        radial-gradient(circle at top left, color-mix(in srgb, var(--accent-main) 10%, transparent), transparent 28%),
        radial-gradient(circle at top right, color-mix(in srgb, var(--accent-main) 8%, transparent), transparent 24%),
        linear-gradient(180deg, color-mix(in srgb, var(--bg-main) 94%, white), var(--bg-main));
}
</style>
