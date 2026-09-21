<script setup lang="ts">
import type {CSSProperties} from "vue";
import type {ThemeVars} from "nbook/app/utils/theme/theme-tokens";
import type {ThemeAppearance} from "nbook/shared/theme/theme-vars";

const props = defineProps<{
    name: string;
    appearance: ThemeAppearance;
    vars: ThemeVars;
}>();

const {t} = useI18n();
const previewStyle = computed<CSSProperties>(() => ({...props.vars}));
</script>

<template>
    <!-- 主题预览卡：四个场景覆盖全部 36 个主题变量 -->
    <section>
        <div class="mb-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-[var(--text-main)]">{{ t("settings.themeEditor.previewTitle") }}</div>
                <div class="mt-0.5 text-xs text-[var(--text-secondary)]">{{ name || t("settings.themeEditor.unnamed") }} · {{ appearance === "dark" ? t("settings.themeEditor.dark") : t("settings.themeEditor.light") }}</div>
            </div>
            <span class="h-5 w-5 shrink-0 rounded-md border border-[var(--border-color)]" :style="{background: vars['--accent-main']}"></span>
        </div>

        <div class="space-y-3" :style="previewStyle">
            <!-- 场景：工作台（bg-* / text-* / border-* / accent-* / status-* / toolbar-bg / shadow-color） -->
            <div>
                <div class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{{ t("settings.themePreview.sceneWorkbench") }}</div>
                <div class="overflow-hidden rounded-lg border border-[var(--border-color)]">
                    <!-- 顶部工具栏：底层 bg-main，工具条 pill 展示半透明 --toolbar-bg -->
                    <div class="flex items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-1.5">
                        <div class="flex items-center gap-2 rounded bg-[var(--toolbar-bg)] px-2 py-0.5">
                            <span class="h-2 w-2 rounded-full bg-[var(--accent-main)]"></span>
                            <span class="text-[10px] text-[var(--text-secondary)]">{{ t("settings.themePreview.toolbarTitle") }}</span>
                        </div>
                        <span class="text-[10px] text-[var(--text-muted)]">{{ t("settings.themePreview.panelMeta") }}</span>
                    </div>
                    <div class="flex bg-[var(--bg-main)] text-[var(--text-main)]">
                        <!-- 侧栏：选中态 border-accent/accent-bg/accent-text，悬停态 bg-hover -->
                        <aside class="w-28 shrink-0 space-y-1 border-r border-[var(--border-color)] bg-[var(--bg-sidebar)] p-2">
                            <div class="rounded border border-[var(--border-accent)] bg-[var(--accent-bg)] px-1.5 py-1 text-[10px] text-[var(--accent-text)]">{{ t("settings.themePreview.sidebarItem1") }}</div>
                            <div class="rounded bg-[var(--bg-hover)] px-1.5 py-1 text-[10px] text-[var(--text-main)]">{{ t("settings.themePreview.sidebarItem2") }}</div>
                            <div class="px-1.5 py-1 text-[10px] text-[var(--text-secondary)]">{{ t("settings.themePreview.sidebarItem3") }}</div>
                        </aside>

                        <main class="min-w-0 flex-1 space-y-2 p-2.5">
                            <!-- 面板卡：--bg-panel + --shadow-color 投影 + --bg-subtle 附注条 -->
                            <div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-2.5" style="box-shadow: 0 6px 18px color-mix(in srgb, var(--shadow-color) 18%, transparent);">
                                <div class="text-xs font-semibold text-[var(--text-main)]">{{ t("settings.themePreview.panelTitle") }}</div>
                                <div class="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{{ t("settings.themePreview.panelBody") }}</div>
                                <div class="mt-2 rounded bg-[var(--bg-subtle)] px-2 py-1 text-[10px] text-[var(--text-muted)]">{{ t("settings.themePreview.panelMeta") }}</div>
                            </div>

                            <!-- 输入框（--bg-input / --border-strong）+ 主按钮（--accent-main / --text-inverse） -->
                            <div class="flex items-center gap-2">
                                <div class="flex h-7 min-w-0 flex-1 items-center rounded border border-[var(--border-strong)] bg-[var(--bg-input)] px-2 text-[10px] text-[var(--text-muted)]">{{ t("settings.themePreview.inputPlaceholder") }}</div>
                                <button type="button" class="h-7 shrink-0 rounded bg-[var(--accent-main)] px-3 text-[10px] font-medium text-[var(--text-inverse)]">{{ t("common.save") }}</button>
                            </div>

                            <!-- 状态徽标：四组主色/-bg/-border 三件套 -->
                            <div class="grid grid-cols-4 gap-1.5">
                                <span class="rounded border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-1 py-1 text-center text-[10px] text-[var(--status-info)]">{{ t("settings.themeEditor.statusInfo") }}</span>
                                <span class="rounded border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-1 py-1 text-center text-[10px] text-[var(--status-success)]">{{ t("settings.themeEditor.statusSuccess") }}</span>
                                <span class="rounded border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-1 py-1 text-center text-[10px] text-[var(--status-warning)]">{{ t("settings.themeEditor.statusWarning") }}</span>
                                <span class="rounded border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-1 py-1 text-center text-[10px] text-[var(--status-danger)]">{{ t("settings.themeEditor.statusDanger") }}</span>
                            </div>
                        </main>
                    </div>
                </div>
            </div>

            <!-- 场景：编辑器（--editor-bg / --selection-bg / 正文文字层级） -->
            <div>
                <div class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{{ t("settings.themePreview.sceneEditor") }}</div>
                <div class="rounded-lg border border-[var(--border-color)] bg-[var(--editor-bg)] px-3 py-2.5">
                    <p class="text-xs leading-relaxed text-[var(--text-main)]">
                        {{ t("settings.themePreview.editorLine1") }}<span class="rounded-sm px-0.5" :style="{background: vars['--selection-bg']}">{{ t("settings.themePreview.editorSelected") }}</span>{{ t("settings.themePreview.editorLine2") }}
                    </p>
                    <p class="mt-1.5 text-[10px] text-[var(--text-muted)]">{{ t("settings.themePreview.editorMeta") }}</p>
                </div>
            </div>

            <!-- 场景：源码（--source-bg / --source-text / --source-muted / --accent-text） -->
            <div>
                <div class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{{ t("settings.themePreview.sceneSource") }}</div>
                <div class="space-y-1 rounded-lg border border-[var(--border-color)] bg-[var(--source-bg)] px-3 py-2.5 font-mono text-[11px]">
                    <div class="text-[var(--source-muted)]">{{ t("settings.themePreview.sourceComment") }}</div>
                    <div class="text-[var(--source-text)]"><span class="text-[var(--accent-text)]">const</span> scene = loadScene(<span class="text-[var(--status-info)]">"chapter-01"</span>);</div>
                </div>
            </div>

            <!-- 场景：对话（--chat-ai-bg / accent 用户气泡） -->
            <div>
                <div class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{{ t("settings.themePreview.sceneChat") }}</div>
                <div class="space-y-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-2.5">
                    <div class="flex justify-end">
                        <div class="max-w-[80%] rounded-lg rounded-br-sm border border-[var(--border-accent)] bg-[var(--accent-bg)] px-2.5 py-1.5 text-[11px] text-[var(--accent-text)]">{{ t("settings.themePreview.chatUser") }}</div>
                    </div>
                    <div class="flex justify-start">
                        <div class="max-w-[85%] rounded-lg rounded-bl-sm border border-[var(--border-color)] bg-[var(--chat-ai-bg)] px-2.5 py-1.5 text-[11px] text-[var(--text-main)]">{{ t("settings.themePreview.chatAi") }}</div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>
