<script setup lang="ts">
import DiffWorkbench from "nbook/app/components/common/diff/DiffWorkbench.vue";
import type {DiffWorkbenchDocument, DiffWorkbenchMode} from "nbook/app/components/common/diff/diff-workbench.types";
import {useIdeTheme} from "nbook/app/composables/useIdeTheme";
import type {IdeTheme} from "nbook/app/utils/theme/theme-tokens";

const theme = ref<IdeTheme>("sepia");
const themeHostRef = ref<HTMLElement | null>(null);
const selectedId = ref("markdown");
const mode = ref<DiffWorkbenchMode>("diff");
const renderSideBySide = ref(true);
const showWhitespace = ref(false);
const mergeReadonly = ref(false);
const languageOverride = ref("");
const resultContentById = ref<Record<string, string>>({});
const {mountThemeHost, setTheme} = useIdeTheme(theme);

const samples: DiffWorkbenchDocument[] = [{
    id: "markdown",
    title: "Markdown 章节保存冲突",
    path: "silver-dragon-hime/manuscript/001-volume/013-chapter/index.md",
    language: "markdown",
    baseLabel: "共同基线",
    currentLabel: "网页编辑",
    incomingLabel: "真实文件",
    resultLabel: "合并结果",
    baseContent: "# 第十三章 退潮\n\n茶杯放在桌边。\n\n明日奈笑着说，老师今天也很忙呢。\n",
    currentContent: "# 第十三章 退潮\n\n茶杯放在桌边，水汽已经散了。\n\n明日奈笑着说，老师今天也很忙呢。\n\n她把手藏进袖口。\n",
    incomingContent: "# 第十三章 退潮\n\n茶杯放在桌边。\n\n明日奈停在茶几旁，声音轻了一点。\n\n老师把药膏放在桌上。\n",
    resultContent: "# 第十三章 退潮\n\n茶杯放在桌边，水汽已经散了。\n\n明日奈停在茶几旁，声音轻了一点。\n\n老师把药膏放在桌上。\n",
}, {
    id: "profile",
    title: "TSX Profile 用户覆盖",
    path: "workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx",
    language: "typescript",
    currentLabel: "用户覆盖",
    incomingLabel: "系统版本",
    resultLabel: "合并结果",
    currentContent: "export const profileKey = \"leader.default\";\n\nconst prompt = `Use manuscript/... paths.`;\n",
    incomingContent: "export const profileKey = \"leader.default\";\n\nconst prompt = `Use project-slug/manuscript/... paths.`;\n",
    resultContent: "export const profileKey = \"leader.default\";\n\nconst prompt = `Use project-slug/manuscript/... paths.`;\n",
}, {
    id: "json",
    title: "JSON Config 冲突",
    path: "workspace/.nbook/config.json",
    language: "json",
    currentLabel: "用户配置",
    incomingLabel: "系统建议",
    resultLabel: "合并结果",
    baseContent: "{\n  \"editor\": {\n    \"theme\": \"sepia\"\n  }\n}\n",
    currentContent: "{\n  \"editor\": {\n    \"theme\": \"dark\",\n    \"monaco\": {\n      \"fontSize\": 15\n    }\n  }\n}\n",
    incomingContent: "{\n  \"editor\": {\n    \"theme\": \"sepia\",\n    \"monaco\": {\n      \"wordWrap\": true\n    }\n  }\n}\n",
    resultContent: "{\n  \"editor\": {\n    \"theme\": \"dark\",\n    \"monaco\": {\n      \"fontSize\": 15,\n      \"wordWrap\": true\n    }\n  }\n}\n",
}, {
    id: "deleted",
    title: "真实文件已删除",
    path: "project/lorebook/character/foo/index.md",
    language: "markdown",
    currentLabel: "网页编辑",
    incomingLabel: "真实文件",
    resultLabel: "保留内容",
    currentContent: "---\ntitle: Foo\n---\n\n网页中仍有未保存内容。\n",
    incomingContent: "",
    resultContent: "---\ntitle: Foo\n---\n\n网页中仍有未保存内容。\n",
}, {
    id: "markers",
    title: "冲突 Marker",
    path: "workspace/.nbook/agent/profiles/builtin/leader.default.profile.tsx",
    language: "typescript",
    currentLabel: "网页编辑",
    incomingLabel: "Agent 写入",
    resultLabel: "手动整理结果",
    currentContent: "export const prompt = `\n<<<<<<< current\nUse concise language.\n=======\nUse vivid language.\n>>>>>>> incoming\n`;\n",
    incomingContent: "export const prompt = `\nUse vivid language.\nRemember workspace rules.\n`;\n",
    resultContent: "export const prompt = `\nUse vivid but concise language.\nRemember workspace rules.\n`;\n",
}, {
    id: "long",
    title: "长文本 Diff",
    path: "project/manuscript/long/index.md",
    language: "markdown",
    currentLabel: "Current",
    incomingLabel: "Incoming",
    resultLabel: "Result",
    currentContent: Array.from({length: 120}, (_, index) => `- line ${index + 1}: current text`).join("\n"),
    incomingContent: Array.from({length: 120}, (_, index) => `- line ${index + 1}: ${index % 9 === 0 ? "incoming changed text" : "current text"}`).join("\n"),
}, {
    id: "binary",
    title: "不可 Diff 的二进制文件",
    path: "workspace/.nbook/agent/avatar.png",
    language: "plaintext",
    diffable: false,
    unavailableReason: "binary",
    notice: "该文件是二进制内容，组件只展示摘要信息，不初始化 Monaco。",
    metadata: {
        currentBytes: 182044,
        incomingBytes: 184012,
        currentSha256: "0b4f28e83ef8a7d3f9a6a3a3f1ac7b1a",
        incomingSha256: "a8400d2f1db377ba9f21cbb61c9a447d",
    },
    currentLabel: "用户覆盖",
    incomingLabel: "系统版本",
    currentContent: "",
    incomingContent: "",
}];

const selectedDocument = computed<DiffWorkbenchDocument>(() => {
    const sample = samples.find((item) => item.id === selectedId.value) ?? samples[0]!;
    return {
        ...sample,
        language: languageOverride.value || sample.language,
        resultContent: resultContentById.value[sample.id] ?? sample.resultContent ?? sample.currentContent,
    };
});

const themeOptions: Array<{value: IdeTheme; label: string}> = [
    {value: "sepia", label: "羊皮纸"},
    {value: "light", label: "浅色"},
    {value: "dark", label: "暗色"},
];

function updateResultContent(value: string): void {
    resultContentById.value = {
        ...resultContentById.value,
        [selectedDocument.value.id]: value,
    };
}

watch(selectedId, () => {
    languageOverride.value = "";
});

onMounted(() => {
    mountThemeHost(themeHostRef.value);
});
</script>

<template>
    <div ref="themeHostRef" class="diff-preview-page min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
        <header class="border-b border-[var(--border-color)] bg-[var(--toolbar-bg)]/95 backdrop-blur">
            <div class="mx-auto flex max-w-[1800px] flex-col gap-5 px-5 py-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <div class="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Diff Workbench Preview</div>
                    <h1 class="mt-2 text-2xl font-semibold">通用 Diff Workbench</h1>
                    <p class="mt-3 max-w-[920px] text-sm leading-7 text-[var(--text-secondary)]">
                        独立调试通用 diff / merge 组件。这里使用 mock 数据，不访问真实 workspace。
                    </p>
                    <div class="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Route /diff-workbench.preview</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Monaco DiffEditor</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Mock Data</span>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <button
                        v-for="option in themeOptions"
                        :key="option.value"
                        type="button"
                        class="rounded-md border px-3 py-1.5 text-xs transition-colors"
                        :class="theme === option.value ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                        @click="setTheme(option.value)"
                    >
                        {{ option.label }}
                    </button>
                    <label class="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                        <input v-model="renderSideBySide" type="checkbox">
                        Side by side
                    </label>
                    <label class="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                        <input v-model="showWhitespace" type="checkbox">
                        Whitespace
                    </label>
                    <label class="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                        <input v-model="mergeReadonly" type="checkbox">
                        Merge readonly
                    </label>
                    <select v-model="languageOverride" class="h-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 text-xs text-[var(--text-secondary)]">
                        <option value="">Auto language</option>
                        <option value="markdown">Markdown</option>
                        <option value="typescript">TypeScript</option>
                        <option value="json">JSON</option>
                        <option value="yaml">YAML</option>
                    </select>
                </div>
            </div>
        </header>

        <main class="mx-auto grid h-[calc(100vh-142px)] max-w-[1800px] grid-cols-[280px_minmax(0,1fr)] gap-4 px-5 py-4">
            <aside class="min-h-0 overflow-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-2">
                <button
                    v-for="sample in samples"
                    :key="sample.id"
                    type="button"
                    class="mb-1 flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors"
                    :class="selectedId === sample.id ? 'bg-[var(--accent-bg)] text-[var(--accent-main)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                    @click="selectedId = sample.id"
                >
                    <span class="text-sm font-medium">{{ sample.title }}</span>
                    <span class="mt-1 truncate font-mono text-[11px] opacity-70">{{ sample.path }}</span>
                </button>
            </aside>
            <section class="grid min-h-0 grid-rows-[minmax(0,1fr)_120px] gap-3">
                <div class="flex min-h-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                    <DiffWorkbench
                        :document="selectedDocument"
                        :theme="theme"
                        :mode="mode"
                        :available-modes="selectedDocument.diffable === false ? ['diff'] : undefined"
                        initial-mode="diff"
                        :merge-readonly="mergeReadonly"
                        :render-side-by-side="renderSideBySide"
                        :show-whitespace="showWhitespace"
                        @update:mode="mode = $event"
                        @update:result-content="updateResultContent"
                    />
                </div>
                <div class="min-h-0 overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)]">
                    <div class="border-b border-[var(--border-color)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">当前 Merge Result</div>
                    <pre class="m-0 h-[82px] overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-5 text-[var(--text-muted)]">{{ selectedDocument.resultContent }}</pre>
                </div>
            </section>
        </main>
    </div>
</template>

<style scoped>
.diff-preview-page {
    background-image:
        radial-gradient(circle at top left, color-mix(in srgb, var(--accent-main) 10%, transparent), transparent 28%),
        linear-gradient(180deg, color-mix(in srgb, var(--bg-main) 94%, white), var(--bg-main));
}
</style>
