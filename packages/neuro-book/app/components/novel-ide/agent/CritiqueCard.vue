<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";
import type {AgentToolCall} from "nbook/app/components/novel-ide/agent/agent-message";
import {
    CRITIQUE_CATEGORY_ORDER,
    applyCritiqueDisposition,
    buildCritiqueCardView,
    clearCritiqueDisposition,
    critiqueCategoryLabelKey,
    critiqueChapterBody,
    critiqueChapterLabel,
    critiqueDispositionClass,
    critiqueDispositionLabelKey,
    critiqueItemHasFootnote,
    critiqueOutcomeMapFromList,
    critiqueOutcomeStorageKey,
    critiqueProgress,
    critiqueSeverityClass,
    critiqueSeverityLabelKey,
    parseChapterCritiqueInput,
    readCritiqueOutcomes,
    resolveCritiqueChapterNode,
    resolveCritiqueJumpTarget,
    writeCritiqueOutcomes,
    type CritiqueOutcomeMap,
} from "nbook/app/components/novel-ide/agent/critique-card";
import {dispatchEditorJumpToLine} from "nbook/app/components/markdown-studio/editor-line-position";
import {useNotification} from "nbook/app/composables/useNotification";
import {useNovelIdeStore} from "nbook/app/stores/novel-ide";
import type {CritiqueCategory, CritiqueDisposition} from "nbook/shared/chapter-critique";
import {agentSessionScopeKey} from "nbook/app/utils/agent-session-scope-key";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";

/**
 * 审稿质疑卡（M3-T-C1）。
 *
 * 挂载点：主聊天流的按工具名特化渲染（tool-render-registry 里 submit_critiques 走
 * mode "message"）——卡片常驻可见、自带折叠，逐条处置不该藏在折叠头后面。
 *
 * 数据来自 tool call 的参数文本（runtime 是原始 args，durable 历史里由公开投影重建）。
 * 处置逐条 认可 / 驳回 / 记下，状态只存本机浏览器（不写项目文件），同一会话再打开
 * 时原样回来。点原文引用会跳到章节正文里那段话；章节没打开就先打开。
 */

const props = defineProps<{
    toolCall: AgentToolCall;
    /** 当前 durable session；live 阶段可能还没有，拿不到就先只记内存。 */
    sessionId?: number | null;
}>();

const {t} = useI18n();
const notification = useNotification();
const ideStore = useNovelIdeStore();

/** 存储作用域只按 Project 身份分区，与会话记忆同一口径。 */
const scopeKey = computed(() => agentSessionScopeKey(ideStore.workspaceKind, ideStore.currentProjectRoot));
const storageKey = computed(() => critiqueOutcomeStorageKey(
    scopeKey.value,
    props.sessionId ?? null,
    props.toolCall.id,
));

const collapsed = ref(false);
/** 逐条处置状态；挂载后从本机存储回读，读到什么算什么。 */
const outcomes = ref<CritiqueOutcomeMap>({});

const critiqueInput = computed(() => parseChapterCritiqueInput(props.toolCall.argsJson ?? props.toolCall.argsText));
const cardView = computed(() => buildCritiqueCardView(critiqueInput.value, outcomes.value));
const progress = computed(() => critiqueProgress(critiqueInput.value?.items ?? [], outcomes.value));

/** 三轴计数按契约顺序展示，空轴也占位，卡头不会跳来跳去。 */
const axisChips = computed(() => CRITIQUE_CATEGORY_ORDER.map((category) => ({
    category,
    label: t(critiqueCategoryLabelKey(category)),
    count: cardView.value?.axes[category] ?? 0,
})));

const dispositionActions: ReadonlyArray<{disposition: CritiqueDisposition; icon: string}> = [
    {disposition: "accepted", icon: "i-lucide-check"},
    {disposition: "rejected", icon: "i-lucide-x"},
    {disposition: "noted", icon: "i-lucide-bookmark"},
];

function persist(next: CritiqueOutcomeMap): void {
    if (import.meta.server) {
        return;
    }
    try {
        writeCritiqueOutcomes(window.localStorage, storageKey.value, next);
    } catch {
        // 存不进去只影响下次回看的记忆，不打断这次处置。
    }
}

function readStored(): CritiqueOutcomeMap {
    if (import.meta.server) {
        return {};
    }
    try {
        return critiqueOutcomeMapFromList(readCritiqueOutcomes(window.localStorage, storageKey.value));
    } catch {
        return {};
    }
}

onMounted(() => {
    outcomes.value = readStored();
});

/**
 * 会话身份是后到的：live 阶段拿不到 durable session id，键里先写 none，拿到后再换成真 id。
 * 换键时把当前内存里的处置带过去（同一条质疑不会被「换了个键」洗掉），
 * 再把合并结果落到新键上，旧键自然作废。
 */
watch(storageKey, () => {
    const carried = outcomes.value;
    outcomes.value = {...readStored(), ...carried};
    persist(outcomes.value);
});

/** 处置一条：点已经选中的那个按钮就是撤销，改判直接点另一个按钮。 */
function dispose(index: number, disposition: CritiqueDisposition): void {
    const current = outcomes.value[index];
    const next = current?.disposition === disposition
        ? clearCritiqueDisposition(outcomes.value, index)
        : applyCritiqueDisposition(outcomes.value, index, disposition);
    outcomes.value = next;
    persist(next);
}

/**
 * 点原文引用：在章节正文里把 quote 定位到行号，然后跳过去。
 *
 * quote 是唯一锚点——行号会随编辑漂移。章节正文没打开就先打开；quote 在正文里
 * 找不到了（作者改过稿）才退回模型给的提示行号，两者都没有就直说找不到，不猜。
 */
async function jumpToQuote(index: number): Promise<void> {
    const entry = cardView.value?.items[index];
    const chapter = cardView.value?.chapter ?? "";
    if (!entry || !chapter) {
        return;
    }
    const node = resolveCritiqueChapterNode(ideStore.workspaceTree, chapter);
    if (!node) {
        notification.warning(t("ide.critique.card.chapterNotFound"), {title: critiqueChapterLabel(chapter)});
        return;
    }

    const normalize = (value: string): string => String(value ?? "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
    if (normalize(ideStore.selectedFilePath) !== normalize(node.path)) {
        try {
            await ideStore.openWorkspaceNode(node, "permanent");
        } catch (error) {
            notification.error(resolveApiErrorMessage(error, t("ide.critique.card.chapterNotFound")));
            return;
        }
    }

    const target = resolveCritiqueJumpTarget(critiqueChapterBody(ideStore.selectedFileContent ?? ""), entry.item.evidence);
    if (!target) {
        notification.warning(t("ide.critique.card.quoteNotFound"), {title: critiqueChapterLabel(chapter)});
        return;
    }
    dispatchEditorJumpToLine(target.line);
}

/** 类别徽标配色：三轴各认一种已有语义色，不引入新色板。 */
function categoryClass(category: CritiqueCategory): string {
    switch (category) {
        case "motivation":
            return "border-[var(--accent-main)]/40 bg-[var(--accent-bg)] text-[var(--accent-text)]";
        case "foreshadowing":
            return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info)]";
        case "ai-flavor":
            return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]";
    }
}

function dispositionButtonClass(active: boolean): string {
    return active
        ? "border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]"
        : "border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]";
}
</script>

<template>
    <div
        v-if="cardView"
        class="mt-2 min-w-0 w-full max-w-full overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] shadow-sm"
    >
        <!-- 卡头：章节名 + 三轴计数 + 小结 -->
        <div class="flex items-start justify-between gap-2 border-b border-[var(--border-color)] px-3 py-2">
            <div class="flex min-w-0 items-start gap-2">
                <div class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--accent-main)]/30 bg-[var(--accent-bg)] text-[var(--accent-text)]">
                    <span class="i-lucide-message-circle-question-mark h-3.5 w-3.5"></span>
                </div>
                <div class="min-w-0">
                    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="shrink-0 text-xs font-medium text-[var(--text-main)]">{{ t("ide.critique.card.title") }}</span>
                        <span class="max-w-[260px] truncate rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                            {{ cardView.chapter }}
                        </span>
                        <span
                            v-for="chip in axisChips"
                            :key="chip.category"
                            class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium"
                            :class="categoryClass(chip.category)"
                        >
                            {{ chip.label }} {{ chip.count }}
                        </span>
                    </div>
                    <div v-if="cardView.summary" class="mt-1 break-words text-[11px] leading-5 text-[var(--text-muted)]">
                        {{ cardView.summary }}
                    </div>
                </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
                <span class="rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                    {{ t("ide.critique.card.progress", {resolved: progress.resolved, total: progress.total}) }}
                </span>
                <button
                    type="button"
                    class="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                    :title="collapsed ? t('ide.critique.card.expand') : t('ide.critique.card.collapse')"
                    @click="collapsed = !collapsed"
                >
                    <span :class="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="h-3.5 w-3.5"></span>
                </button>
            </div>
        </div>

        <!-- 全部处置完的汇总态 -->
        <div
            v-if="progress.allResolved && !collapsed"
            class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-1.5 text-[11px] text-[var(--status-success)]"
        >
            <span class="i-lucide-check-circle-2 h-3.5 w-3.5"></span>
            <span>{{ t("ide.critique.card.doneSummary", {accepted: progress.accepted, rejected: progress.rejected, noted: progress.noted}) }}</span>
        </div>

        <!-- 逐条质疑 -->
        <div v-if="!collapsed" class="max-h-[420px] space-y-2 overflow-y-auto p-2.5">
            <div
                v-for="entry in cardView.items"
                :key="entry.index"
                class="rounded-lg border p-2.5 transition-colors"
                :class="critiqueDispositionClass(entry.disposition)"
            >
                <div class="flex items-start justify-between gap-2">
                    <div class="flex min-w-0 items-start gap-2">
                        <span class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] text-[10px] font-bold text-[var(--text-secondary)]">
                            {{ entry.index + 1 }}
                        </span>
                        <div class="min-w-0">
                            <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium" :class="categoryClass(entry.item.category)">
                                    {{ t(critiqueCategoryLabelKey(entry.item.category)) }}
                                </span>
                                <span class="shrink-0 rounded border px-1.5 py-0.5 text-[10px]" :class="critiqueSeverityClass(entry.item.severity)">
                                    {{ t(critiqueSeverityLabelKey(entry.item.severity)) }}
                                </span>
                                <span
                                    v-if="entry.disposition"
                                    class="shrink-0 rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                                >
                                    {{ t(critiqueDispositionLabelKey(entry.disposition)) }}
                                </span>
                            </div>
                            <p class="mt-1.5 break-words text-xs leading-5 text-[var(--text-main)]">{{ entry.item.question }}</p>
                        </div>
                    </div>

                    <!-- 三个处置按钮：已处置的那个高亮，再点一次撤销 -->
                    <div class="flex shrink-0 items-center gap-1">
                        <button
                            v-for="action in dispositionActions"
                            :key="action.disposition"
                            type="button"
                            class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors"
                            :class="dispositionButtonClass(entry.disposition === action.disposition)"
                            :title="t(critiqueDispositionLabelKey(action.disposition))"
                            @click="dispose(entry.index, action.disposition)"
                        >
                            <span :class="action.icon" class="h-3 w-3"></span>
                            <span>{{ t(critiqueDispositionLabelKey(action.disposition)) }}</span>
                        </button>
                    </div>
                </div>

                <!-- 原文证据：点一下就跳到章节正文里这段话 -->
                <button
                    type="button"
                    class="mt-2 w-full rounded border border-[var(--border-color)]/60 bg-[var(--bg-subtle)] px-2 py-1.5 text-left transition-colors hover:border-[var(--accent-main)]/50 hover:bg-[var(--bg-hover)]"
                    :title="t('ide.critique.card.jumpToQuote')"
                    @click="jumpToQuote(entry.index)"
                >
                    <span class="flex items-start gap-1.5">
                        <span class="mt-0.5 i-lucide-quote h-3 w-3 shrink-0 text-[var(--text-muted)]"></span>
                        <span class="min-w-0 break-words text-[11px] leading-5 text-[var(--text-secondary)]">{{ entry.item.evidence.quote }}</span>
                    </span>
                </button>

                <!-- 脚注：AI 味的文风规则 / 伏笔 -->
                <div v-if="critiqueItemHasFootnote(entry.item)" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--text-muted)]">
                    <span v-if="entry.item.llmLintRuleId">{{ t("ide.critique.card.ruleFootnote", {rule: entry.item.llmLintRuleId}) }}</span>
                    <span v-if="typeof entry.item.promiseId === 'number'">{{ t("ide.critique.card.promiseFootnote", {id: entry.item.promiseId}) }}</span>
                </div>

                <div v-if="entry.note" class="mt-1 break-words text-[10px] text-[var(--text-muted)]">
                    {{ t("ide.critique.card.noteFootnote", {note: entry.note}) }}
                </div>
            </div>
        </div>

        <div v-if="toolCall.error" class="border-t border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-[11px] text-[var(--status-danger)]">
            {{ toolCall.error }}
        </div>
    </div>
</template>
