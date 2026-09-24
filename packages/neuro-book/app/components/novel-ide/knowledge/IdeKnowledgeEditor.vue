<script setup lang="ts">
import {onBeforeUnmount, onMounted} from "vue";
import {storeToRefs} from "pinia";
import FormSelect, {type SelectOption} from "nbook/app/components/common/form/FormSelect.vue";
import TagInput from "nbook/app/components/common/form/TagInput.vue";
import Tooltip from "nbook/app/components/common/Tooltip.vue";
import {
    applyAnchorRows,
    applySubtypeSelection,
    applyTypeSelection,
    buildKnowledgeWritePayload,
    createKnowledgeEditorState,
    isKnowledgeContentDirty,
    isKnowledgeWriteConflict,
    knowledgeCategoryOf,
    resolveSubtypeSelection,
    resolveTypeSelection,
    validateAnchorRows,
    KNOWLEDGE_SUBTYPE_OTHER,
    type KnowledgeEditorState,
} from "nbook/app/components/novel-ide/knowledge/knowledge-editor-save";
import {useDialog} from "nbook/app/composables/useDialog";
import {useNotification} from "nbook/app/composables/useNotification";
import {useNovelIdeStore, type WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {apiFetch} from "nbook/app/utils/api-fetch";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import {renderLorebookDraft, type LorebookFileDraft} from "nbook/app/components/novel-ide/workspace/workspace-lorebook-draft";
import {LOREBOOK_CATEGORIES} from "nbook/app/utils/ide-shell-layout";

const props = defineProps<{
    node: WorkspaceFileNode;
}>();

const emit = defineEmits<{
    (e: "saved"): void;
    (e: "cancel"): void;
}>();

const store = useNovelIdeStore();
const {t} = useI18n();
const {confirm} = useDialog();
const notify = useNotification();
const {currentProjectRoot, workspaceKind} = storeToRefs(store);

const state = ref<KnowledgeEditorState | null>(null);
/** 打开时读到的原文；脏检查与乐观锁都以它为基准。 */
const loadedContent = ref("");
const loadedMtimeMs = ref<number | null>(null);
const loading = ref(false);
const saving = ref(false);
const loadError = ref("");

/** 戏份分级下拉里的五档，与既有详情面板口径一致。 */
const SUBTYPE_LABEL_KEYS: Array<{value: string; key: string}> = [
    {value: "person", key: "subtypePerson"},
    {value: "important", key: "subtypeImportant"},
    {value: "background", key: "subtypeBackground"},
    {value: "unknown", key: "subtypeUnknown"},
    {value: "group", key: "subtypeGroup"},
];

const draft = computed<LorebookFileDraft | null>(() => state.value?.draft ?? null);
const parseError = computed(() => state.value?.parseError ?? "");

/** 锚点表单的校验结果：chapter 与 quote 必填。 */
const anchorIssues = computed(() => validateAnchorRows(state.value?.anchors ?? []));
const hasAnchorIssues = computed(() => anchorIssues.value.length > 0);

/**
 * 界面上的改动是否还没落盘。
 *
 * 用「当前会写成什么」与「打开时读到的原文」比较，而不是逐字段记 dirty 标记——
 * 作者改回原样时脏标记自动消失。
 */
const renderedContent = computed(() => {
    const composed = composeDraft();
    return composed ? renderLorebookDraft(composed) : "";
});
const dirty = computed(() => state.value !== null && isKnowledgeContentDirty(renderedContent.value, loadedContent.value));
const canSave = computed(() => dirty.value && !saving.value && !hasAnchorIssues.value && !parseError.value);

/**
 * 类目下拉：九个作者类目，选中项由文件所在目录决定。
 *
 * 选项里只有这九类——frontmatter 里认不出的 type 不参与下拉，只在下方以原值提示，
 * 避免作者选出一个与文件所在目录不符的类目。
 */
const typeOptions = computed<SelectOption[]>(() => LOREBOOK_CATEGORIES.map((category) => ({
    value: category.id,
    label: t(`ide.shell.lorebookCategory_${category.id}`),
    iconClass: category.icon,
})));

/** 认不出的原值提示；认得出（或没写）时为 null。 */
const unknownTypeHint = computed(() => {
    const rawType = draft.value?.rawType;
    return rawType ? t("ide.knowledge.editor.categoryUnknownHint", {value: rawType}) : "";
});

/** 下拉里显示不出当前取值时（路径不在 lorebook 下），退回草稿的 type 以免显示空白。 */
const typeFallbackHint = computed(() => {
    const current = draft.value;
    if (!current || knowledgeCategoryOf(current)) {
        return "";
    }
    return t("ide.knowledge.editor.categoryUnknownHint", {value: resolveTypeSelection(current)});
});

/**
 * 戏份分级下拉只在人物档案里出现。
 *
 * 别的类目也有 subtype（物品的 equipment、地点的 building 等），但那些不是「戏份分级」，
 * 不该挂在同一个标签下。它们不进界面，由草稿层原样往返，保存时不会被动过。
 */
const showSubtypeField = computed(() => {
    const current = draft.value;
    return current ? knowledgeCategoryOf(current) === "character" : false;
});

const subtypeOptions = computed<SelectOption[]>(() => {
    const options: SelectOption[] = SUBTYPE_LABEL_KEYS.map((item) => ({
        value: item.value,
        label: t(`ide.knowledge.detail.${item.key}`),
    }));
    const subtype = draft.value?.subtype;
    if (subtype && resolveSubtypeSelection(subtype) === KNOWLEDGE_SUBTYPE_OTHER) {
        options.push({
            value: KNOWLEDGE_SUBTYPE_OTHER,
            label: t("ide.knowledge.editor.subtypeOtherHint", {value: subtype}),
        });
    }
    return options;
});

const subtypeSelection = computed(() => resolveSubtypeSelection(draft.value?.subtype ?? null));
const typeSelection = computed(() => (draft.value ? resolveTypeSelection(draft.value) : ""));

/**
 * 合成待落盘的草稿：锚点以表单为准，其余字段原样。
 *
 * 复制一份再动，避免在 computed 里改到 state 上的草稿。
 */
function composeDraft(): LorebookFileDraft | null {
    if (!state.value) {
        return null;
    }
    return applyAnchorRows({...state.value.draft}, state.value.anchors);
}

/** 取某一行某个字段的校验结果，用于就地标红。 */
function anchorIssueAt(index: number, field: "chapter" | "quote"): boolean {
    return anchorIssues.value.some((issue) => issue.index === index && issue.field === field);
}

/** 校验提示文案：逐条列出第几行缺什么。 */
const anchorIssueMessages = computed(() => anchorIssues.value.map((issue) => t(
    issue.field === "chapter" ? "ide.knowledge.editor.anchorChapterRequired" : "ide.knowledge.editor.anchorQuoteRequired",
    {index: issue.index + 1},
)));

/**
 * 读取条目全文并建出编辑器状态。
 *
 * 用节点自己的路径与 mtime 作为乐观锁基准；节点没有 mtime 时补一次 stat，
 * 写通道只有在收到 expectedMtimeMs 时才会真正做冲突检测。
 */
async function load(): Promise<void> {
    loading.value = true;
    loadError.value = "";
    try {
        const content = await store.readWorkspaceFileContent(props.node.path);
        state.value = createKnowledgeEditorState(props.node, content ?? "");
        loadedContent.value = content ?? "";
        loadedMtimeMs.value = typeof props.node.mtimeMs === "number" ? props.node.mtimeMs : await readMtimeMs();
    } catch (error) {
        state.value = null;
        loadError.value = resolveApiErrorMessage(error, t("ide.knowledge.editor.loadFailed"));
    } finally {
        loading.value = false;
    }
}

/** 补读一次节点 mtime；读不到就退化成只带 baseContent。 */
async function readMtimeMs(): Promise<number | null> {
    try {
        const queried = workspaceQuery();
        const node = await apiFetch<WorkspaceFileNode>("/api/workspace-files/stat", {
            query: {...queried, path: props.node.path},
        });
        return typeof node.mtimeMs === "number" ? node.mtimeMs : null;
    } catch {
        return null;
    }
}

/** 与 store 的读写口径保持一致：按当前工作区类型带查询参数。 */
function workspaceQuery(): Record<string, string> {
    if (workspaceKind.value === "user-assets") {
        return {workspaceKind: "user-assets"};
    }
    return {projectRoot: currentProjectRoot.value};
}

/**
 * 写回条目文件。
 *
 * 409 说明真实文件已被别的地方改过：就地提示并让作者重新读取，
 * 不做自动合并、不静默覆盖（与面板既有的冲突口径一致）。
 */
async function save(): Promise<void> {
    const composed = composeDraft();
    if (!composed || !canSave.value) {
        return;
    }
    saving.value = true;
    try {
        // 写回成功后必须把乐观锁基准换成新 mtime，否则第二次保存会拿旧时间戳撞自己的 409。
        const written = await apiFetch<WorkspaceFileNode>("/api/workspace-files/write", {
            method: "PUT",
            body: {
                ...workspaceQuery(),
                ...buildKnowledgeWritePayload(composed, {
                    baseContent: loadedContent.value,
                    expectedMtimeMs: loadedMtimeMs.value,
                }),
            },
        });
        loadedContent.value = renderLorebookDraft(composed);
        loadedMtimeMs.value = typeof written?.mtimeMs === "number" ? written.mtimeMs : loadedMtimeMs.value;
        // 用写回后的全文重建草稿：extra 与不可编辑字段的归属按文件真实内容重新算一遍。
        state.value = createKnowledgeEditorState(props.node, loadedContent.value);
        notify.success(t("ide.knowledge.editor.saved"));
        emit("saved");
    } catch (error) {
        if (isKnowledgeWriteConflict(error)) {
            notify.warning(t("ide.knowledge.editor.conflict"), {title: t("ide.knowledge.editor.conflictTitle")});
        } else {
            notify.error(resolveApiErrorMessage(error, t("ide.knowledge.editor.saveFailed")));
        }
    } finally {
        saving.value = false;
    }
}

/** 重新读取：丢弃界面上的改动，回到磁盘上的版本。 */
async function reload(): Promise<void> {
    await load();
}

/** 关闭前的脏检查；确认放弃才交还给外层。 */
async function requestClose(): Promise<void> {
    if (dirty.value) {
        const discard = await confirm(t("ide.knowledge.editor.discardConfirm"), t("ide.knowledge.editor.discardConfirmTitle"));
        if (!discard) {
            return;
        }
    }
    emit("cancel");
}

function addAnchor(): void {
    state.value?.anchors.push({chapter: "", quote: "", note: ""});
}

function removeAnchor(index: number): void {
    state.value?.anchors.splice(index, 1);
}

function selectType(value: string): void {
    if (draft.value) {
        applyTypeSelection(draft.value, value);
    }
}

function selectSubtype(value: string): void {
    if (draft.value) {
        applySubtypeSelection(draft.value, value);
    }
}

/**
 * 关标签页/刷新前的脏提醒。
 *
 * 组件内的关闭走 requestClose 的确认框；这里兜住浏览器层面的退出。
 * 只提示不写入——条目编辑不做自动保存，作者永远点得到「保存」。
 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!dirty.value) {
        return;
    }
    event.preventDefault();
    event.returnValue = "";
}

onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));

watch(() => [props.node.path, props.node.mtimeMs] as const, () => void load(), {immediate: true});
</script>

<template>
    <!-- 条目编辑器：作者纠偏入口。只暴露标题/别名/分级/摘要/锚点/正文，
         状态、治理、检索、引用与扩展对象的原样往返由草稿层保证，界面不出现技术状态词。 -->
    <section
        class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-main)]"
        data-role="ide-knowledge-editor"
        :aria-label="t('ide.knowledge.editor.title')"
    >
        <header class="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
            <div class="flex min-w-0 items-center gap-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border-accent)] bg-[var(--accent-bg)]">
                    <span class="i-lucide-book-marked h-4 w-4 text-[var(--accent-text)]"></span>
                </span>
                <div class="min-w-0">
                    <div class="flex items-center gap-2">
                        <h1 class="truncate font-serif text-[15px] font-semibold text-[var(--text-main)]">{{ draft?.title || t("ide.knowledge.editor.title") }}</h1>
                        <span v-if="dirty" class="shrink-0 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 text-[10px] text-[var(--status-warning)]">{{ t("ide.knowledge.editor.dirty") }}</span>
                    </div>
                    <div class="truncate text-[11px] text-[var(--text-muted)]">{{ props.node.path }}</div>
                </div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
                <Tooltip :text="t('ide.knowledge.editor.reload')" placement="bottom">
                    <button type="button" class="icon-action" :disabled="loading || saving" @click="void reload()"><span class="i-lucide-refresh-cw h-4 w-4"></span></button>
                </Tooltip>
                <Tooltip :text="t('ide.knowledge.editor.close')" placement="bottom">
                    <button type="button" class="icon-action" data-role="ide-knowledge-editor-close" @click="void requestClose()"><span class="i-lucide-x h-4 w-4"></span></button>
                </Tooltip>
            </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
            <p v-if="loading" class="text-[12px] text-[var(--text-muted)]">{{ t("ide.knowledge.editor.loading") }}</p>
            <p v-else-if="loadError" class="rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-[12px] text-[var(--status-danger)]">{{ loadError }}</p>

            <div v-else-if="draft && state" class="mx-auto flex w-full max-w-[760px] flex-col gap-4 text-[12px]" :class="saving ? 'pointer-events-none opacity-80' : ''">
                <p v-if="parseError" class="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 leading-5 text-[var(--status-warning)]">{{ t("ide.knowledge.editor.parseFailed") }}</p>

                <!-- 条目信息 -->
                <section class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
                    <h2 class="mb-3 font-serif text-[13px] font-semibold text-[var(--text-main)]">{{ t("ide.knowledge.editor.basicsTitle") }}</h2>
                    <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
                        <label class="flex flex-col gap-1">
                            <span class="text-[var(--text-secondary)]">{{ t("ide.knowledge.editor.titleLabel") }}</span>
                            <input v-model="draft.title" class="field" :placeholder="t('ide.knowledge.editor.titlePlaceholder')" data-role="ide-knowledge-editor-title">
                        </label>
                        <label class="flex flex-col gap-1">
                            <span class="text-[var(--text-secondary)]">{{ t("ide.knowledge.editor.categoryLabel") }}</span>
                            <FormSelect :model-value="typeSelection" :options="typeOptions" :placeholder="typeFallbackHint" @update:model-value="selectType" />
                            <span v-if="unknownTypeHint" class="text-[10px] leading-4 text-[var(--text-muted)]">{{ unknownTypeHint }}</span>
                        </label>
                        <label v-if="showSubtypeField" class="flex flex-col gap-1">
                            <span class="text-[var(--text-secondary)]">{{ t("ide.knowledge.editor.subtypeLabel") }}</span>
                            <FormSelect :model-value="subtypeSelection" :options="subtypeOptions" @update:model-value="selectSubtype" />
                        </label>
                    </div>
                    <div class="mt-3 flex flex-col gap-1">
                        <span class="text-[var(--text-secondary)]">{{ t("ide.knowledge.editor.aliasesLabel") }}</span>
                        <TagInput v-model="draft.aliases" :placeholder="t('ide.knowledge.editor.aliasesPlaceholder')" />
                    </div>
                    <label class="mt-3 flex flex-col gap-1">
                        <span class="text-[var(--text-secondary)]">{{ t("ide.knowledge.editor.summaryLabel") }}</span>
                        <textarea v-model="draft.summary" rows="2" class="textarea" :placeholder="t('ide.knowledge.editor.summaryPlaceholder')"></textarea>
                    </label>
                </section>

                <!-- 登场与履历 -->
                <section class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
                    <div class="mb-1 flex items-center gap-2">
                        <span class="i-lucide-book-marked h-4 w-4 text-[var(--accent-text)]"></span>
                        <h2 class="font-serif text-[13px] font-semibold text-[var(--text-main)]">{{ t("ide.knowledge.editor.anchorsTitle") }}</h2>
                    </div>
                    <p class="mb-3 leading-5 text-[var(--text-muted)]">{{ t("ide.knowledge.editor.anchorsSubtitle") }}</p>

                    <p v-if="state.anchors.length === 0" class="rounded-lg border border-dashed border-[var(--border-color)] px-3 py-4 text-center text-[var(--text-muted)]">{{ t("ide.knowledge.editor.anchorsEmpty") }}</p>

                    <div v-for="(anchor, index) in state.anchors" :key="index" class="mb-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)]/40 p-3" :data-role="`ide-knowledge-editor-anchor-${index}`">
                        <div class="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,180px)_auto] items-end gap-2">
                            <label class="flex flex-col gap-1">
                                <span class="text-[var(--text-secondary)]">{{ t("ide.knowledge.editor.anchorChapterLabel") }}</span>
                                <input v-model="anchor.chapter" class="field" :class="anchorIssueAt(index, 'chapter') ? 'border-[var(--status-danger)]' : ''" :placeholder="t('ide.knowledge.editor.anchorChapterPlaceholder')">
                            </label>
                            <label class="flex flex-col gap-1">
                                <span class="text-[var(--text-secondary)]">{{ t("ide.knowledge.editor.anchorQuoteLabel") }}</span>
                                <input v-model="anchor.quote" class="field" :class="anchorIssueAt(index, 'quote') ? 'border-[var(--status-danger)]' : ''" :placeholder="t('ide.knowledge.editor.anchorQuotePlaceholder')">
                            </label>
                            <label class="flex flex-col gap-1">
                                <span class="text-[var(--text-secondary)]">{{ t("ide.knowledge.editor.anchorNoteLabel") }}</span>
                                <input v-model="anchor.note" class="field" :placeholder="t('ide.knowledge.editor.anchorNotePlaceholder')">
                            </label>
                            <Tooltip :text="t('ide.knowledge.editor.anchorRemove')" placement="right">
                                <button type="button" class="icon-action h-7 w-7" @click="removeAnchor(index)"><span class="i-lucide-trash-2 h-3.5 w-3.5"></span></button>
                            </Tooltip>
                        </div>
                    </div>

                    <ul v-if="hasAnchorIssues" class="mt-2 space-y-1" data-role="ide-knowledge-editor-anchor-errors">
                        <li v-for="message in anchorIssueMessages" :key="message" class="rounded-md border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-1.5 text-[var(--status-danger)]">{{ message }}</li>
                    </ul>

                    <button type="button" class="mt-2 flex items-center gap-1 text-[11px] font-medium text-[var(--accent-text)] transition-colors hover:text-[var(--text-main)]" data-role="ide-knowledge-editor-add-anchor" @click="addAnchor">
                        <span class="i-lucide-plus h-3.5 w-3.5"></span>{{ t("ide.knowledge.editor.anchorAdd") }}
                    </button>
                </section>

                <!-- 正文 -->
                <section class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
                    <h2 class="mb-3 font-serif text-[13px] font-semibold text-[var(--text-main)]">{{ t("ide.knowledge.editor.contentTitle") }}</h2>
                    <textarea v-model="draft.content" rows="14" class="textarea font-serif leading-6" :placeholder="t('ide.knowledge.editor.contentPlaceholder')"></textarea>
                </section>
            </div>
        </div>

        <footer class="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-color)] bg-[var(--bg-sidebar)] px-4 py-3">
            <button type="button" class="action-secondary" @click="void requestClose()">{{ t("ide.knowledge.editor.cancel") }}</button>
            <button type="button" class="action-primary" :disabled="!canSave" data-role="ide-knowledge-editor-save" @click="void save()">
                {{ saving ? t("ide.knowledge.editor.saving") : t("ide.knowledge.editor.save") }}
            </button>
        </footer>
    </section>
</template>

<style scoped>
.field {
    height: 1.75rem;
    width: 100%;
    border-radius: 0.375rem;
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    padding: 0 0.5rem;
    color: var(--text-main);
    outline: none;
}

.textarea {
    width: 100%;
    resize: vertical;
    border-radius: 0.375rem;
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    padding: 0.375rem 0.5rem;
    line-height: 1.25rem;
    color: var(--text-main);
    outline: none;
}

.field:focus,
.textarea:focus {
    border-color: var(--accent-main);
}

.icon-action {
    display: inline-flex;
    height: 2rem;
    width: 2rem;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    color: var(--text-muted);
}

.icon-action:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-main);
}

.action-primary,
.action-secondary {
    display: inline-flex;
    height: 1.75rem;
    align-items: center;
    border-radius: 0.375rem;
    padding: 0 0.75rem;
    font-size: 12px;
    transition: opacity 0.15s ease, background-color 0.15s ease;
}

.action-primary {
    background: var(--accent-main);
    color: var(--text-inverse);
}

.action-primary:disabled {
    opacity: 0.45;
}

.action-secondary {
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-main);
}

.action-secondary:hover {
    background: var(--bg-hover);
}
</style>