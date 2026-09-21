<script setup lang="ts">
import {onMounted, ref} from "vue";
import PlotTreePreviewWorkspace from "nbook/app/components/novel-ide/plot/tree/PlotTreePreviewWorkspace.vue";
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
    <!-- PlotTree 独立测试页 -->
    <div ref="themeHostRef" class="plot-tree-preview-page min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
        <!-- 页面头部 -->
        <header class="border-b border-[var(--border-color)] bg-[var(--toolbar-bg)]/95 backdrop-blur">
            <div class="mx-auto flex max-w-[1900px] flex-col gap-5 px-5 py-5 xl:flex-row xl:items-end xl:justify-between">
                <div class="max-w-[980px]">
                    <div class="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Plot Tree Preview</div>
                    <h1 class="mt-2 text-2xl font-semibold text-[var(--text-main)]">剧情树图独立测试页</h1>
                    <p class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        这个页面只用于验证 `PlotTreeView`。当前版本只做 `Thread / Scene` 级别的树图，默认从左向右延伸，允许游离 Scene 不连线，并把 Thread 内 Scene 收紧为单链。
                    </p>
                    <div class="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Route /plot-tree.preview</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Vue Flow</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">主线 / fork / 支线 / 游离 Scene</span>
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
        <main class="mx-auto max-w-[1900px] px-5 py-4">
            <PlotTreePreviewWorkspace />
        </main>
    </div>
</template>

<style scoped>
.plot-tree-preview-page {
    background-image:
        radial-gradient(circle at top left, color-mix(in srgb, var(--accent-main) 10%, transparent), transparent 26%),
        radial-gradient(circle at top right, color-mix(in srgb, var(--accent-main) 7%, transparent), transparent 22%),
        linear-gradient(180deg, color-mix(in srgb, var(--bg-main) 94%, white), var(--bg-main));
}
</style>
