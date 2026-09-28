<script setup lang="ts">
import {inject, onMounted, ref, watch} from "vue";
import type {AgentToolCall} from "nbook/app/components/novel-ide/agent/agent-message";
import {AGENT_SESSION_MESSAGE_CONTEXT_KEY} from "nbook/app/components/novel-ide/agent/agent-session-message-context";
import {
    applyLorebookCardAction,
    formatLorebookDraftAliases,
    lorebookCardStorageKey,
    lorebookDraftCategoryOptions,
    lorebookDraftFields,
    parseLorebookDraftAliases,
    parseLorebookDraftInput,
    readLorebookCardState,
    resolveLorebookDraftSlug,
    writeLorebookCardState,
    LOREBOOK_DRAFT_CARD_SCHEMA,
    type LorebookCardState,
    type LorebookDraftFields,
} from "nbook/app/components/novel-ide/agent/lorebook-draft-card";
import {useNotification} from "nbook/app/composables/useNotification";
import {useNovelIdeStore} from "nbook/app/stores/novel-ide";
import {agentSessionScopeKey} from "nbook/app/utils/agent-session-scope-key";
import {LOREBOOK_DRAFT_CATEGORY_LABELS, type LorebookDraftCategory} from "nbook/shared/lorebook-draft";

/**
 * 设定卡确认卡（M6-T-B）。
 *
 * 挂载点：主聊天流的按工具名特化渲染（tool-render-registry 里 submit_lorebook_draft
 * 走 mode "message"）——卡要常驻可见、字段要能就地改，确认动作不该藏在折叠头后面。
 *
 * 数据来自 tool call 的参数文本（runtime 是原始 args，durable 历史里由公开投影重建）。
 * 类目是下拉（九个登记值，显示中文说法），其余字段是输入框；确认以卡上当前值为准，
 * 组装成一条结构化消息发进当前会话，由会话里的 AI 走既有写工具落盘。
 * 取消零副作用：只把卡标成已取消，不发任何消息、不写任何文件。
 * 卡片状态只存本机浏览器（不写项目文件），同一会话再打开时原样回来。
 */

const props = defineProps<{
    toolCall: AgentToolCall;
    /** 当前 durable session；live 阶段可能还没有，拿不到就先只记内存。 */
    sessionId?: number | null;
}>();

const {t} = useI18n();
const notification = useNotification();
const ideStore = useNovelIdeStore();
const sessionMessage = inject(AGENT_SESSION_MESSAGE_CONTEXT_KEY, null);

/** 存储作用域只按 Project 身份分区，与会话记忆同一口径。 */
const scopeKey = computed(() => agentSessionScopeKey(ideStore.workspaceKind, ideStore.currentProjectRoot));
const storageKey = computed(() => lorebookCardStorageKey(
    scopeKey.value,
    props.sessionId ?? null,
    props.toolCall.id,
));

const collapsed = ref(false);
const submitting = ref(false);
const status = ref<LorebookCardState["status"]>("pending");
/** 卡上字段；作者改一下就地生效，确认时用的就是这里的值。 */
const fields = ref<LorebookDraftFields | null>(null);

const categoryOptions = lorebookDraftCategoryOptions();
const draftInput = computed(() => parseLorebookDraftInput(props.toolCall.argsJson ?? props.toolCall.argsText));

/** 别名在卡上是顿号分隔的一段文本，改动写回数组。 */
const aliasText = computed({
    get: () => formatLorebookDraftAliases(fields.value?.aliases ?? []),
    set: (value: string) => {
        if (fields.value) {
            fields.value = {...fields.value, aliases: parseLorebookDraftAliases(value)};
        }
    },
});

/** 这一条目会落到哪个目录名；算不出来时按「落盘时再定」显示。 */
const slugLabel = computed(() => {
    const resolved = fields.value ? resolveLorebookDraftSlug(fields.value) : "";
    return resolved || t("ide.lorebookDraft.card.slugPending");
});

function persist(next: LorebookCardState): void {
    if (import.meta.server) {
        return;
    }
    try {
        writeLorebookCardState(window.localStorage, storageKey.value, next);
    } catch {
        // 存不进去只影响下次回看的记忆，不打断这次确认。
    }
}

function readStored(): LorebookCardState | null {
    if (import.meta.server) {
        return null;
    }
    try {
        return readLorebookCardState(window.localStorage, storageKey.value);
    } catch {
        return null;
    }
}

/** 把初始字段灌进卡里：只看草稿解析结果，作者手里没动过就一直是它。 */
function applyDraftFields(): void {
    const input = draftInput.value;
    fields.value = input ? lorebookDraftFields(input) : null;
}

onMounted(() => {
    const stored = readStored();
    if (stored) {
        // 作者之前改过或已经确认/取消过：原样回放，不覆盖成草稿初始值。
        fields.value = stored.fields;
        status.value = stored.status;
        return;
    }
    applyDraftFields();
});

/**
 * 会话身份是后到的：live 阶段拿不到 durable session id，键里先写 none，拿到后再换成真 id。
 * 换键时把当前卡上状态带过去（同一条草稿不会被「换了个键」洗掉），
 * 再把合并结果落到新键上，旧键自然作废。
 */
watch(storageKey, () => {
    const carried: LorebookCardState | null = fields.value
        ? {schema: LOREBOOK_DRAFT_CARD_SCHEMA, status: status.value, fields: fields.value}
        : null;
    const stored = readStored();
    const merged = carried ?? stored;
    if (!merged) {
        return;
    }
    fields.value = merged.fields;
    status.value = merged.status;
    persist({schema: LOREBOOK_DRAFT_CARD_SCHEMA, status: merged.status, fields: merged.fields});
});

// 流式阶段草稿还没成型：字段先留空，等完整参数到了再灌一次（不覆盖作者已改过的值）。
watch(draftInput, (input) => {
    if (fields.value || !input) {
        return;
    }
    applyDraftFields();
});

function updateField(key: "title" | "summary" | "body", value: string): void {
    if (fields.value) {
        fields.value = {...fields.value, [key]: value};
    }
}

function updateCategory(value: string): void {
    if (fields.value) {
        fields.value = {...fields.value, category: value as LorebookDraftCategory};
    }
}

/** 确认：组装卡上最终字段的结构化消息发进当前会话；发出去了才把卡落到已确认。 */
async function confirmDraft(): Promise<void> {
    if (submitting.value || !fields.value) {
        return;
    }
    const outcome = applyLorebookCardAction({action: "confirm", status: status.value, fields: fields.value});
    if (outcome.kind === "ignored") {
        return;
    }
    if (outcome.kind === "invalid") {
        notification.warning(t(`ide.lorebookDraft.card.missing.${outcome.issue}`), {title: t("ide.lorebookDraft.card.title")});
        return;
    }
    if (outcome.kind !== "confirm") {
        return;
    }
    if (!sessionMessage) {
        notification.warning(t("ide.lorebookDraft.card.noChannel"), {title: t("ide.lorebookDraft.card.title")});
        return;
    }
    submitting.value = true;
    try {
        await sessionMessage.sendMessage(outcome.message);
    } catch {
        // 发不出去就留在待确认：作者能改完再点一次，卡不会假装已经确认。
        notification.error(t("ide.lorebookDraft.card.confirmFailed"), {title: t("ide.lorebookDraft.card.title")});
        return;
    } finally {
        submitting.value = false;
    }
    status.value = outcome.status;
    persist({schema: LOREBOOK_DRAFT_CARD_SCHEMA, status: outcome.status, fields: outcome.fields});
}

/** 取消：零副作用——只标状态，不发消息、不写文件。 */
function cancelDraft(): void {
    if (submitting.value || !fields.value) {
        return;
    }
    const outcome = applyLorebookCardAction({action: "cancel", status: status.value, fields: fields.value});
    if (outcome.kind !== "cancelled") {
        return;
    }
    status.value = outcome.status;
    persist({schema: LOREBOOK_DRAFT_CARD_SCHEMA, status: outcome.status, fields: outcome.fields});
}

/** 卡头的一句话状态：待确认时可改可确认可取消，落定之后只说结果。 */
const statusLabel = computed(() => {
    switch (status.value) {
        case "confirmed":
            return t("ide.lorebookDraft.card.statusConfirmed");
        case "cancelled":
            return t("ide.lorebookDraft.card.statusCancelled");
        default:
            return t("ide.lorebookDraft.card.statusPending");
    }
});

const statusClass = computed(() => {
    switch (status.value) {
        case "confirmed":
            return "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success)]";
        case "cancelled":
            return "border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)]";
        default:
            return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]";
    }
});

const categoryLabel = computed(() => fields.value ? LOREBOOK_DRAFT_CATEGORY_LABELS[fields.value.category] : "");
</script>

<template>
    <div
        v-if="fields"
        class="mt-2 min-w-0 w-full max-w-full overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] shadow-sm"
    >
        <!-- 卡头：标题 + 类目 + 状态 -->
        <div class="flex items-start justify-between gap-2 border-b border-[var(--border-color)] px-3 py-2">
            <div class="flex min-w-0 items-start gap-2">
                <div class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--accent-main)]/30 bg-[var(--accent-bg)] text-[var(--accent-text)]">
                    <span class="i-lucide-book-marked h-3.5 w-3.5"></span>
                </div>
                <div class="min-w-0">
                    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="shrink-0 text-xs font-medium text-[var(--text-main)]">{{ t("ide.lorebookDraft.card.title") }}</span>
                        <span class="max-w-[260px] truncate rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                            {{ fields.title }}
                        </span>
                        <span class="shrink-0 rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                            {{ categoryLabel }}
                        </span>
                    </div>
                    <div class="mt-1 break-words text-[11px] leading-5 text-[var(--text-muted)]">
                        {{ t("ide.lorebookDraft.card.hint") }}
                    </div>
                </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
                <span class="rounded border px-1.5 py-0.5 text-[10px] font-medium" :class="statusClass">
                    {{ statusLabel }}
                </span>
                <button
                    type="button"
                    class="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                    :title="collapsed ? t('ide.lorebookDraft.card.expand') : t('ide.lorebookDraft.card.collapse')"
                    @click="collapsed = !collapsed"
                >
                    <span :class="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="h-3.5 w-3.5"></span>
                </button>
            </div>
        </div>

        <div v-if="!collapsed" class="space-y-2.5 p-3">
            <!-- 名称 -->
            <label class="block">
                <span class="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">{{ t("ide.lorebookDraft.card.titleLabel") }}</span>
                <input
                    :value="fields.title"
                    type="text"
                    :disabled="status !== 'pending'"
                    :placeholder="t('ide.lorebookDraft.card.titlePlaceholder')"
                    class="w-full rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-main)] outline-none transition-colors focus:border-[var(--border-strong)] disabled:opacity-70"
                    @input="updateField('title', ($event.target as HTMLInputElement).value)"
                />
            </label>

            <!-- 类目 -->
            <label class="block">
                <span class="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">{{ t("ide.lorebookDraft.card.categoryLabel") }}</span>
                <select
                    :value="fields.category"
                    :disabled="status !== 'pending'"
                    class="w-full rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-main)] outline-none transition-colors focus:border-[var(--border-strong)] disabled:opacity-70"
                    @change="updateCategory(($event.target as HTMLSelectElement).value)"
                >
                    <option v-for="option in categoryOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
            </label>

            <!-- 别名 -->
            <label class="block">
                <span class="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">{{ t("ide.lorebookDraft.card.aliasesLabel") }}</span>
                <input
                    v-model="aliasText"
                    type="text"
                    :disabled="status !== 'pending'"
                    :placeholder="t('ide.lorebookDraft.card.aliasesPlaceholder')"
                    class="w-full rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-main)] outline-none transition-colors focus:border-[var(--border-strong)] disabled:opacity-70"
                />
                <span class="mt-1 block text-[10px] text-[var(--text-muted)]">{{ t("ide.lorebookDraft.card.aliasesHint") }}</span>
            </label>

            <!-- 一句话摘要 -->
            <label class="block">
                <span class="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">{{ t("ide.lorebookDraft.card.summaryLabel") }}</span>
                <input
                    :value="fields.summary"
                    type="text"
                    :disabled="status !== 'pending'"
                    :placeholder="t('ide.lorebookDraft.card.summaryPlaceholder')"
                    class="w-full rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-main)] outline-none transition-colors focus:border-[var(--border-strong)] disabled:opacity-70"
                    @input="updateField('summary', ($event.target as HTMLInputElement).value)"
                />
            </label>

            <!-- 条目正文 -->
            <label class="block">
                <span class="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">{{ t("ide.lorebookDraft.card.bodyLabel") }}</span>
                <textarea
                    :value="fields.body"
                    rows="6"
                    :disabled="status !== 'pending'"
                    :placeholder="t('ide.lorebookDraft.card.bodyPlaceholder')"
                    class="w-full resize-y rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-xs leading-5 text-[var(--text-main)] outline-none transition-colors focus:border-[var(--border-strong)] disabled:opacity-70"
                    @input="updateField('body', ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
            </label>

            <!-- 原文摘录：只读，说明这条设定是从哪段讨论里提出来的 -->
            <div>
                <span class="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">{{ t("ide.lorebookDraft.card.excerptLabel") }}</span>
                <div class="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded border border-[var(--border-color)]/60 bg-[var(--bg-subtle)] px-2 py-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">
                    {{ fields.sourceExcerpt }}
                </div>
            </div>

            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--text-muted)]">
                <span>{{ t("ide.lorebookDraft.card.slugLine", {path: slugLabel}) }}</span>
            </div>
        </div>

        <!-- 底部动作：待确认时可确认可取消；落定之后只留结果 -->
        <div
            v-if="status === 'pending'"
            class="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-color)] px-3 py-2"
        >
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-[var(--border-color)] bg-[var(--bg-panel)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:opacity-60"
                :disabled="submitting"
                @click="cancelDraft"
            >
                <span class="i-lucide-x h-3 w-3"></span>
                <span>{{ t("ide.lorebookDraft.card.cancel") }}</span>
            </button>
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded border border-[var(--accent-main)] bg-[var(--accent-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-text)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-60"
                :disabled="submitting"
                @click="confirmDraft"
            >
                <span class="i-lucide-check h-3 w-3"></span>
                <span>{{ t("ide.lorebookDraft.card.confirm") }}</span>
            </button>
        </div>
        <div
            v-else
            class="border-t px-3 py-1.5 text-[11px]"
            :class="status === 'confirmed' ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success)]' : 'border-[var(--border-color)] bg-[var(--bg-subtle)] text-[var(--text-muted)]'"
        >
            {{ status === "confirmed" ? t("ide.lorebookDraft.card.confirmedNote") : t("ide.lorebookDraft.card.cancelledNote") }}
        </div>

        <div v-if="toolCall.error" class="border-t border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-[11px] text-[var(--status-danger)]">
            {{ toolCall.error }}
        </div>
    </div>
</template>
