<script setup lang="ts">
import {onMounted, ref} from "vue";
import PlotTimelinePreviewWorkspace from "nbook/app/components/novel-ide/plot/timeline/PlotTimelinePreviewWorkspace.vue";
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
    <!-- PlotTimeline 独立测试页 -->
    <div ref="themeHostRef" class="plot-timeline-preview-page min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
        <!-- 页面头部 -->
        <header class="border-b border-[var(--border-color)] bg-[var(--toolbar-bg)]/95 backdrop-blur">
            <div class="mx-auto flex max-w-[1900px] flex-col gap-5 px-5 py-5 xl:flex-row xl:items-end xl:justify-between">
                <div class="max-w-[980px]">
                    <div class="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Plot Timeline Preview</div>
                    <h1 class="mt-2 text-2xl font-semibold text-[var(--text-main)]">剧情时间轴独立测试页</h1>
                    <p class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        这个页面只用于验证“正文顺序时间轴”视角。当前版本聚焦单个 StoryPhase，每条横向泳道代表一条 Thread，横轴按 Scene 槽位展开，并用章节背景分段承载正文展示顺序。
                    </p>
                    <div class="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Route /plot-timeline.preview</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">单 StoryPhase</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">章节背景分段</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">草稿尾区</span>
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
            <PlotTimelinePreviewWorkspace />
        </main>
    </div>
</template>

<style scoped>
.plot-timeline-preview-page {
    background-image:
        radial-gradient(circle at top left, color-mix(in srgb, var(--accent-main) 10%, transparent), transparent 26%),
        radial-gradient(circle at bottom right, color-mix(in srgb, var(--accent-main) 8%, transparent), transparent 24%),
        linear-gradient(180deg, color-mix(in srgb, var(--bg-main) 94%, white), var(--bg-main));
}
</style>
