<script setup lang="ts">
import {onMounted, ref} from "vue";
import StructuredTextEditor from "nbook/app/components/common/form/StructuredTextEditor.vue";
import {useIdeTheme} from "nbook/app/composables/useIdeTheme";
import type {AgentTriggerMenuContext, AgentTriggerMenuState} from "nbook/app/components/novel-ide/agent/trigger-menu";
import type {WorkspaceReferencePreviewMeta} from "nbook/app/components/markdown-studio/tiptap/WorkspaceReference";
import type {IdeTheme} from "nbook/app/utils/theme/theme-tokens";

type StructuredTextMode = "rich" | "source";

const theme = ref<IdeTheme>("sepia");
const themeHostRef = ref<HTMLElement | null>(null);
const editorMode = ref<StructuredTextMode>("rich");
const editorSize = ref<"sm" | "md">("sm");
const showFormatToolbar = ref(true);
const markdown = ref([
    "# 场景摘要",
    "",
    "苏雪在[旧书房](lorebook/location/旧书房.md)里发现线索，并与[暗线场景](scene://scene-preview-1)形成呼应。",
    "",
    "这是 **粗体**、*斜体*、`inline code` 和 <inline-comment id=\"preview:1\" body=\"确认伏笔是否过早暴露\">带评论的文本</inline-comment>。",
].join("\n"));

const {mountThemeHost, setTheme} = useIdeTheme(theme);

const themeOptions: Array<{value: IdeTheme; label: string}> = [
    {value: "sepia", label: "羊皮纸"},
    {value: "light", label: "浅色"},
    {value: "dark", label: "暗色"},
];

const modeOptions: Array<{value: StructuredTextMode; label: string}> = [
    {value: "rich", label: "富文本"},
    {value: "source", label: "源码"},
];
const sizeOptions: Array<{value: "sm" | "md"; label: string}> = [
    {value: "sm", label: "小"},
    {value: "md", label: "中"},
];

/**
 * 预览页的本地引用解析，不依赖真实 workspace。
 */
function resolveReference(target: string): WorkspaceReferencePreviewMeta {
    const scheme = /^(chapter|volume|lorebook|thread|scene|plot|pending):\/\//i.exec(target)?.[1] ?? null;
    const normalized = target.replace(/\\/g, "/");
    const entryType = scheme
        ?? (normalized.includes("/character/") ? "character"
            : normalized.includes("/location/") ? "location"
                : normalized.endsWith("/") ? "folder"
                    : "file");

    return {
        target,
        resolvedPath: scheme ? null : normalized,
        entryType,
        icon: null,
        title: target.split("/").pop()?.replace(/\.md$/i, "") || target,
        status: null,
        broken: false,
        contentNode: entryType !== "file",
        isDirectory: normalized.endsWith("/"),
    };
}

/**
 * 预览页菜单覆盖 workspace 引用、剧情引用、skill 与 slash command。
 */
function resolveMenu(context: AgentTriggerMenuContext): AgentTriggerMenuState {
    if (context.kind === "reference-root") {
        return {
            title: "插入引用",
            prefix: "@",
            sections: [{
                id: "reference-root",
                items: [
                    {
                        id: "ref:location",
                        label: "旧书房",
                        description: "workspace 设定节点",
                        iconClass: "i-lucide-map-pin",
                        workspaceReference: {
                            label: "旧书房",
                            target: "lorebook/location/旧书房.md",
                            entryType: "location",
                        },
                    },
                    {
                        id: "ref:scene",
                        label: "暗线场景",
                        description: "剧情 scene scheme",
                        iconClass: "i-lucide-clapperboard",
                        reference: {
                            kind: "scene",
                            title: "暗线场景",
                            targetId: "scene-preview-1",
                        },
                    },
                    {
                        id: "ref:scene-setup",
                        label: "伏笔场景",
                        description: "剧情 scene scheme",
                        iconClass: "i-lucide-clapperboard",
                        reference: {
                            kind: "scene",
                            title: "伏笔场景",
                            targetId: "scene-preview-2",
                        },
                    },
                ],
            }],
        };
    }

    if (context.kind === "skill") {
        return {
            title: "调用技能",
            prefix: "$",
            sections: [{
                id: "skill",
                items: [{
                    id: "skill:plot-taxonomy",
                    label: "plot-taxonomy",
                    description: "预览 skill chip",
                    iconClass: "i-lucide-sparkles",
                    skill: {name: "plot-taxonomy"},
                }],
            }],
        };
    }

    if (context.kind === "command") {
        return {
            title: "命令",
            prefix: "/",
            sections: [{
                id: "command",
                items: [
                    {id: "cmd:heading", label: "Heading 2", description: "切换为二级标题", iconClass: "i-lucide-heading-2", markdownCommand: "heading-2"},
                    {id: "cmd:comment", label: "Comment", description: "插入 inline comment", iconClass: "i-lucide-message-square-plus", markdownCommand: "comment"},
                ],
            }],
        };
    }

    return {title: "", prefix: "", sections: []};
}

onMounted(() => {
    mountThemeHost(themeHostRef.value);
});
</script>

<template>
    <!-- 结构化文本编辑器独立预览页 -->
    <div ref="themeHostRef" class="structured-editor-preview-page min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
        <header class="border-b border-[var(--border-color)] bg-[var(--toolbar-bg)]/95 backdrop-blur">
            <div class="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <div class="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Structured Text Editor Preview</div>
                    <h1 class="mt-2 text-2xl font-semibold text-[var(--text-main)]">表单 Markdown 编辑器</h1>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                    <button
                        v-for="option in modeOptions"
                        :key="option.value"
                        type="button"
                        class="rounded-md border px-3 py-1.5 text-xs transition-colors"
                        :class="editorMode === option.value ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                        @click="editorMode = option.value"
                    >
                        {{ option.label }}
                    </button>
                    <button
                        v-for="option in sizeOptions"
                        :key="option.value"
                        type="button"
                        class="rounded-md border px-3 py-1.5 text-xs transition-colors"
                        :class="editorSize === option.value ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                        @click="editorSize = option.value"
                    >
                        {{ option.label }}
                    </button>
                    <button
                        type="button"
                        class="rounded-md border px-3 py-1.5 text-xs transition-colors"
                        :class="showFormatToolbar ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                        @click="showFormatToolbar = !showFormatToolbar"
                    >
                        格式工具
                    </button>
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
                </div>
            </div>
        </header>

        <main class="mx-auto grid max-w-[1440px] gap-4 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
                <StructuredTextEditor
                    v-model="markdown"
                    v-model:mode="editorMode"
                    :rows="5"
                    placeholder="输入 Markdown..."
                    :size="editorSize"
                    :show-format-toolbar="showFormatToolbar"
                    :resolve-menu="resolveMenu"
                    :resolve-reference="resolveReference"
                    :enable-quick-triggers="true"
                    :theme="theme"
                />
            </section>

            <aside class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
                <div class="mb-3 text-xs font-semibold text-[var(--text-secondary)]">Markdown</div>
                <pre class="max-h-[620px] overflow-auto rounded-md bg-[var(--source-bg)] p-3 text-xs leading-6 text-[var(--source-text)] custom-scrollbar">{{ markdown }}</pre>
            </aside>
        </main>
    </div>
</template>

<style scoped>
.structured-editor-preview-page {
    background-image:
        radial-gradient(circle at top left, color-mix(in srgb, var(--accent-main) 10%, transparent), transparent 26%),
        linear-gradient(180deg, color-mix(in srgb, var(--bg-main) 94%, white), var(--bg-main));
}
</style>
