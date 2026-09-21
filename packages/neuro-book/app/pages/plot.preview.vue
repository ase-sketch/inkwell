<script setup lang="ts">
import {onMounted, ref} from "vue";
import PlotWorkspacePreview from "nbook/app/components/novel-ide/plot/PlotWorkspacePreview.vue";
import {useIdeTheme} from "nbook/app/composables/useIdeTheme";
import type {IdeTheme} from "nbook/app/utils/theme/theme-tokens";

const theme = ref<IdeTheme>("sepia");
const themeHostRef = ref<HTMLElement | null>(null);
const workspaceRevision = ref(0);

const {mountThemeHost, setTheme} = useIdeTheme(theme);

const themeOptions: Array<{value: IdeTheme; label: string}> = [
    {value: "sepia", label: "羊皮纸"},
    {value: "light", label: "浅色"},
    {value: "dark", label: "暗色"},
];

/**
 * 重置剧情测试页状态。
 * 通过重建工作区组件回到默认 mock 选中态。
 */
const resetPreviewState = (): void => {
    workspaceRevision.value += 1;
};

onMounted(() => {
    mountThemeHost(themeHostRef.value);
});
</script>

<template>
    <!-- 剧情模块预览页 -->
    <div
        ref="themeHostRef"
        class="plot-preview-page min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]"
    >
        <!-- 页面头部 -->
        <header class="border-b border-[var(--border-color)] bg-[var(--toolbar-bg)]/95 backdrop-blur">
            <div class="mx-auto flex max-w-[1800px] flex-col gap-5 px-5 py-5 xl:flex-row xl:items-end xl:justify-between">
                <div class="max-w-[980px]">
                    <div class="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Plot Module Preview</div>
                    <h1 class="mt-2 text-2xl font-semibold text-[var(--text-main)]">剧情模块独立测试页</h1>
                    <p class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        这里先挂载剧情模块的四视图骨架，专门用于调 UI/UX。底层使用内存 mock 数据，重点验证信息架构、共享选中态、视图切换和整体视觉密度。
                    </p>
                    <div class="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Route /plot.preview</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">真实组件骨架</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">内存 mock 数据</span>
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
            <PlotWorkspacePreview :key="workspaceRevision" />
        </main>
    </div>
</template>

<style scoped>
.plot-preview-page {
    background-image:
        radial-gradient(circle at top left, color-mix(in srgb, var(--accent-main) 10%, transparent), transparent 26%),
        radial-gradient(circle at top right, color-mix(in srgb, var(--accent-main) 7%, transparent), transparent 22%),
        linear-gradient(180deg, color-mix(in srgb, var(--bg-main) 94%, white), var(--bg-main));
}
</style>
