<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {storeToRefs} from "pinia";
import Dialog from "nbook/app/components/common/Dialog.vue";
import Tooltip from "nbook/app/components/common/Tooltip.vue";
import {useNovelIdeStore} from "nbook/app/stores/novel-ide";
import {renderMarkdown} from "nbook/app/utils/markdown/render";
import {resolveWritingNodeDisplayLabel} from "nbook/app/utils/writing-assets";
import {splitMarkdownFrontmatter} from "nbook/shared/editor-workbench";
import {filterChapterNodes, normalizePath} from "nbook/app/utils/chapter-export";

const props = defineProps<{
    modelValue: boolean;
    currentPath: string;
}>();

const emit = defineEmits<{
    (event: "update:modelValue", value: boolean): void;
    (event: "select-chapter", path: string): void;
}>();

const {t, te} = useI18n();
const tt = (key: string, fallback: string): string => (te(key) ? t(key) : fallback);
const store = useNovelIdeStore();
const {
    markdownEditorPreferences,
    selectedFileContent,
    selectedFilePath,
    workspaceBuffers,
    workspaceTree,
} = storeToRefs(store);

const activeReadingPath = ref(props.currentPath);
const chapterContent = ref("");
const loading = ref(false);

/** 字体大小调节（可在阅读弹窗内临时微调） */
const customFontSize = ref(18);
/** 段落首行缩进开关（默认优先读取既有编辑器首行缩进偏好） */
const indentEnabled = ref(markdownEditorPreferences.value.paragraphIndentEnabled);

/** 所有可供阅读切换的章节列表（按字典序排布） */
const chapterList = computed(() => {
    return filterChapterNodes(workspaceTree.value, activeReadingPath.value, "book");
});

const currentChapterIndex = computed(() => {
    const target = normalizePath(activeReadingPath.value);
    return chapterList.value.findIndex((ch) => normalizePath(ch.path) === target);
});

const currentChapterNode = computed(() => {
    return chapterList.value[currentChapterIndex.value]
        ?? workspaceTree.value.find((n) => normalizePath(n.path) === normalizePath(activeReadingPath.value));
});

const displayTitle = computed(() => {
    if (currentChapterNode.value) {
        return resolveWritingNodeDisplayLabel(currentChapterNode.value);
    }
    const filename = activeReadingPath.value.split("/").pop() ?? "";
    return filename.replace(/\.[^.]+$/, "") || tt("ide.reading.untitledChapter", "未命名章节");
});

const hasPrev = computed(() => currentChapterIndex.value > 0);
const hasNext = computed(() => currentChapterIndex.value >= 0 && currentChapterIndex.value < chapterList.value.length - 1);
const prevChapter = computed(() => hasPrev.value ? chapterList.value[currentChapterIndex.value - 1] : null);
const nextChapter = computed(() => hasNext.value ? chapterList.value[currentChapterIndex.value + 1] : null);

/** 统计字数（去除空白与 frontmatter） */
const wordCount = computed(() => {
    const {body} = splitMarkdownFrontmatter(chapterContent.value);
    return body.replace(/\s+/g, "").length;
});

/** 渲染为 Newsprint 阅读 HTML */
const renderedHtml = computed(() => {
    const {body} = splitMarkdownFrontmatter(chapterContent.value);
    let bodyText = body.trim();

    // 若首行为重复的 # Markdown 标题则清洗
    const firstLine = bodyText.split("\n")[0]?.trim() ?? "";
    if (firstLine.startsWith("#")) {
        const headingText = firstLine.replace(/^#+\s*/, "").trim();
        if (headingText === displayTitle.value || displayTitle.value.includes(headingText)) {
            bodyText = bodyText.slice(firstLine.length).trim();
        }
    }

    return renderMarkdown(bodyText);
});

/** 首行缩进样式（以 em 为单位，保持 2 个全角字符的中式排版习惯） */
const paragraphIndentValue = computed(() => {
    if (!indentEnabled.value) {
        return "0em";
    }
    const em = markdownEditorPreferences.value.paragraphIndentEm ?? 2;
    return `${em}em`;
});

/** 加载指定章节正文：优先使用活动缓冲区以呈现作者最新编辑 */
async function loadChapterContent(path: string): Promise<void> {
    if (!path) {
        chapterContent.value = "";
        return;
    }
    const normalized = normalizePath(path);
    if (selectedFilePath.value && normalizePath(selectedFilePath.value) === normalized) {
        chapterContent.value = selectedFileContent.value;
        return;
    }
    const buffer = workspaceBuffers.value[path] ?? workspaceBuffers.value[normalized];
    if (buffer) {
        chapterContent.value = buffer.content;
        return;
    }
    loading.value = true;
    try {
        chapterContent.value = await store.readWorkspaceFileContent(path);
    } catch {
        chapterContent.value = "";
    } finally {
        loading.value = false;
    }
}

function navigateTo(path: string): void {
    activeReadingPath.value = path;
    emit("select-chapter", path);
}

function handlePrev(): void {
    if (prevChapter.value) {
        navigateTo(prevChapter.value.path);
    }
}

function handleNext(): void {
    if (nextChapter.value) {
        navigateTo(nextChapter.value.path);
    }
}

function handleChapterSelect(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (target.value) {
        navigateTo(target.value);
    }
}

function adjustFontSize(delta: number): void {
    customFontSize.value = Math.max(14, Math.min(28, customFontSize.value + delta));
}

function toggleIndent(): void {
    indentEnabled.value = !indentEnabled.value;
}

watch(() => props.currentPath, (newPath) => {
    if (newPath) {
        activeReadingPath.value = newPath;
    }
}, {immediate: true});

watch(() => props.modelValue, (isOpen) => {
    if (isOpen && activeReadingPath.value) {
        void loadChapterContent(activeReadingPath.value);
    }
});

watch(activeReadingPath, (newPath) => {
    if (props.modelValue && newPath) {
        void loadChapterContent(newPath);
    }
});
</script>

<template>
    <Dialog
        :model-value="props.modelValue"
        size="full"
        width="min(1160px, calc(100vw - 32px))"
        height="calc(100dvh - 48px)"
        max-height="calc(100dvh - 48px)"
        :show-header="false"
        :show-footer="false"
        body-class="flex flex-col min-h-0 h-full p-0 overflow-hidden bg-[var(--bg-panel)]"
        @update:model-value="emit('update:modelValue', $event)"
    >
        <!-- 阅读器顶部沉浸式工具栏 -->
        <header class="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-4">
            <!-- 左侧：章节选择下拉与章节名 -->
            <div class="flex min-w-0 items-center gap-3">
                <span class="i-lucide-book-open h-4.5 w-4.5 shrink-0 text-[var(--accent-main)]"></span>
                <span class="max-w-[240px] truncate font-serif text-[15px] font-semibold text-[var(--text-main)]">
                    {{ displayTitle }}
                </span>

                <!-- 章节快速切换器 -->
                <div v-if="chapterList.length > 1" class="relative">
                    <select
                        class="h-7 cursor-pointer rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text-main)] outline-none hover:bg-[var(--bg-hover)] focus:border-[var(--accent-main)]"
                        :value="activeReadingPath"
                        @change="handleChapterSelect"
                    >
                        <option
                            v-for="ch in chapterList"
                            :key="ch.path"
                            :value="ch.path"
                        >
                            {{ resolveWritingNodeDisplayLabel(ch) }}
                        </option>
                    </select>
                </div>
            </div>

            <!-- 中间：翻章控制器 -->
            <div class="flex items-center gap-1">
                <button
                    type="button"
                    class="flex h-7 items-center gap-1 rounded px-2.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="!hasPrev"
                    :title="prevChapter ? resolveWritingNodeDisplayLabel(prevChapter) : ''"
                    @click="handlePrev"
                >
                    <span class="i-lucide-chevron-left h-3.5 w-3.5"></span>
                    <span>{{ tt("ide.reading.prevChapter", "上一章") }}</span>
                </button>
                <span class="text-xs text-[var(--text-muted)]">
                    {{ currentChapterIndex >= 0 ? `${currentChapterIndex + 1} / ${chapterList.length}` : "" }}
                </span>
                <button
                    type="button"
                    class="flex h-7 items-center gap-1 rounded px-2.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="!hasNext"
                    :title="nextChapter ? resolveWritingNodeDisplayLabel(nextChapter) : ''"
                    @click="handleNext"
                >
                    <span>{{ tt("ide.reading.nextChapter", "下一章") }}</span>
                    <span class="i-lucide-chevron-right h-3.5 w-3.5"></span>
                </button>
            </div>

            <!-- 右侧：字数、排版微调与退出 -->
            <div class="flex items-center gap-2">
                <span class="text-xs text-[var(--text-muted)]">
                    {{ tt("ide.reading.wordCount", `${wordCount} 字`) }}
                </span>

                <div class="h-3 w-px bg-[var(--border-color)]"></div>

                <!-- 首行缩进切换 -->
                <Tooltip :text="indentEnabled ? tt('ide.reading.indentEnabled', '首行缩进已开启') : tt('ide.reading.indentDisabled', '首行缩进已关闭')" placement="bottom">
                    <button
                        type="button"
                        class="flex h-7 items-center justify-center rounded px-2 text-xs transition-colors"
                        :class="indentEnabled ? 'bg-[var(--accent-main)]/10 text-[var(--accent-main)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                        @click="toggleIndent"
                    >
                        <span class="i-lucide-indent h-3.5 w-3.5"></span>
                    </button>
                </Tooltip>

                <!-- 字号增减 -->
                <div class="flex items-center rounded border border-[var(--border-color)] bg-[var(--bg-input)]">
                    <button
                        type="button"
                        class="flex h-6 w-6 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)]"
                        title="缩小字号"
                        @click="adjustFontSize(-1)"
                    >
                        <span class="i-lucide-minus h-3 w-3"></span>
                    </button>
                    <span class="px-1 text-[11px] text-[var(--text-muted)]">{{ customFontSize }}</span>
                    <button
                        type="button"
                        class="flex h-6 w-6 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)]"
                        title="放大字号"
                        @click="adjustFontSize(1)"
                    >
                        <span class="i-lucide-plus h-3 w-3"></span>
                    </button>
                </div>

                <div class="h-3 w-px bg-[var(--border-color)]"></div>

                <!-- 关闭 -->
                <button
                    type="button"
                    class="flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                    :title="t('common.close')"
                    @click="emit('update:modelValue', false)"
                >
                    <span class="i-lucide-x h-4 w-4"></span>
                </button>
            </div>
        </header>

        <!-- 正文阅读区：居中单栏排版 -->
        <main
            class="flex-1 overflow-y-auto px-6 py-10 custom-scrollbar"
            data-role="chapter-reading-view"
            :style="{
                '--reading-font-size': `${customFontSize}px`,
                '--reading-paragraph-indent': paragraphIndentValue,
            }"
        >
            <div class="mx-auto max-w-[780px]">
                <!-- 章节大标题 -->
                <h1 class="mb-10 text-center font-serif text-2xl font-bold tracking-wider text-[var(--text-main)] sm:text-3xl">
                    {{ displayTitle }}
                </h1>

                <!-- 正文内容 -->
                <div v-if="loading" class="flex h-40 items-center justify-center text-sm text-[var(--text-muted)]">
                    <span class="i-lucide-loader-2 mr-2 h-4 w-4 animate-spin"></span>
                    <span>{{ t("common.loading") }}</span>
                </div>
                <article
                    v-else
                    class="reading-content theme-newsprint"
                    v-html="renderedHtml"
                ></article>

                <!-- 章节末尾翻页栏 -->
                <footer class="mt-16 flex items-center justify-between border-t border-[var(--border-color)] pt-6 text-sm">
                    <div>
                        <button
                            v-if="hasPrev"
                            type="button"
                            class="flex items-center gap-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--accent-main)]"
                            @click="handlePrev"
                        >
                            <span class="i-lucide-arrow-left h-4 w-4"></span>
                            <span>{{ prevChapter ? resolveWritingNodeDisplayLabel(prevChapter) : tt("ide.reading.prevChapter", "上一章") }}</span>
                        </button>
                    </div>
                    <div>
                        <button
                            v-if="hasNext"
                            type="button"
                            class="flex items-center gap-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--accent-main)]"
                            @click="handleNext"
                        >
                            <span>{{ nextChapter ? resolveWritingNodeDisplayLabel(nextChapter) : tt("ide.reading.nextChapter", "下一章") }}</span>
                            <span class="i-lucide-arrow-right h-4 w-4"></span>
                        </button>
                    </div>
                </footer>
            </div>
        </main>
    </Dialog>
</template>

<style>
@import "nbook/app/styles/markdown-themes.css";
</style>

<style scoped>
.reading-content.theme-newsprint {
    font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", Georgia, "Times New Roman", serif;
    color: var(--text-main);
    line-height: 1.85;
}

.reading-content.theme-newsprint :deep(p) {
    font-size: var(--reading-font-size, 18px);
    line-height: 1.85;
    text-indent: var(--reading-paragraph-indent, 2em);
    margin-bottom: 1.25em;
    word-break: break-word;
    overflow-wrap: anywhere;
}

.reading-content.theme-newsprint :deep(h1),
.reading-content.theme-newsprint :deep(h2),
.reading-content.theme-newsprint :deep(h3) {
    font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
    font-weight: 700;
    color: var(--text-main);
    margin-top: 2em;
    margin-bottom: 1em;
}

.reading-content.theme-newsprint :deep(blockquote) {
    border-left: 3px solid var(--accent-main);
    padding-left: 1rem;
    margin: 1.5em 0;
    color: var(--text-secondary);
    font-style: italic;
}
</style>
