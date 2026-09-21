<script setup lang="ts">
import {onMounted, ref} from "vue";
import PlotWorkbenchPreviewWorkspace from "nbook/app/components/novel-ide/plot/workbench/PlotWorkbenchPreviewWorkspace.vue";
import {useIdeTheme} from "nbook/app/composables/useIdeTheme";
import type {IdeTheme} from "nbook/app/utils/theme/theme-tokens";

const theme = ref<IdeTheme>("sepia");
const themeHostRef = ref<HTMLElement | null>(null);

const {mountThemeHost, setTheme} = useIdeTheme(theme);

const themeOptions: Array<{value: IdeTheme; label: string}> = [
    {value: "sepia", label: "羊皮纸"},
    {value: "light", label: "浅色"},
    {value: "dark", label: "暗色"},
];

onMounted(() => {
    mountThemeHost(themeHostRef.value);
});
</script>

<template>
    <!-- 剧情工作台 Dialog 独立预览页 -->
    <div ref="themeHostRef" class="plot-workbench-preview-page min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
        <!-- 页面头部 -->
        <header class="border-b border-[var(--border-color)] bg-[var(--toolbar-bg)]/95 backdrop-blur">
            <div class="mx-auto flex max-w-[1600px] flex-col gap-5 px-5 py-5 xl:flex-row xl:items-end xl:justify-between">
                <div class="max-w-[920px]">
                    <div class="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Plot Workbench Preview</div>
                    <h1 class="mt-2 text-2xl font-semibold text-[var(--text-main)]">剧本工作台 Dialog 预览</h1>
                    <p class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        这个页面用于验证新的剧情工作台 UI。现有剧情大纲侧边栏保持可见，截图风格的工作台以 Dialog 呈现，全部使用 mock 数据与本地选中态。
                    </p>
                    <div class="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Route /plot-workbench.preview</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Dialog 工作台</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Mock 数据</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">保留剧情大纲侧边栏</span>
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
                </div>
            </div>
        </header>

        <!-- 页面主体 -->
        <main class="mx-auto max-w-[1600px] px-5 py-6">
            <PlotWorkbenchPreviewWorkspace />
        </main>
    </div>
</template>

<style scoped>
.plot-workbench-preview-page {
    background-image:
        radial-gradient(circle at top left, color-mix(in srgb, var(--accent-main) 9%, transparent), transparent 26%),
        linear-gradient(180deg, color-mix(in srgb, var(--bg-main) 96%, white), var(--bg-main));
}
</style>
