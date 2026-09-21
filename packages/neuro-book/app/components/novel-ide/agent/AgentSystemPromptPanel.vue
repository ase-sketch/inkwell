<script setup lang="ts">
import AgentMarkdownContent from "nbook/app/components/novel-ide/agent/AgentMarkdownContent.vue";
import {shouldLoadSystemPrompt} from "nbook/app/components/novel-ide/agent/agent-chat-history-ui";

const props = defineProps<{
    modelValue: boolean;
    /** 当前 session 已加载的 System Prompt；空字符串表示 prompt 本身为空。 */
    value: string | null;
    loading: boolean;
    error?: string;
    /** 打开 System Prompt 中的 workspace 引用。 */
    openReference?: (target: string) => void;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: boolean): void;
    (e: "load"): void;
    (e: "refresh"): void;
}>();

const {t} = useI18n();

/** 显式展开时才请求 System Prompt，普通 recovery 不触发。 */
watch(() => props.modelValue, (open) => {
    if (shouldLoadSystemPrompt({
        open,
        loading: props.loading,
        hasValue: props.value !== null,
    })) {
        emit("load");
    }
}, {immediate: true});
</script>

<template>
    <!-- System Prompt 独立于 durable history，不伪装成对话消息。 -->
    <section v-if="props.modelValue" class="shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-3">
        <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2 text-xs font-medium text-[var(--text-main)]">
                <span class="i-lucide-terminal-square h-4 w-4 shrink-0 text-[var(--accent-text)]"></span>
                <span>{{ t("agent.systemPrompt.title") }}</span>
            </div>
            <div class="flex shrink-0 items-center gap-1">
                <button type="button" class="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:cursor-wait disabled:opacity-50" :title="t('agent.systemPrompt.refresh')" :disabled="props.loading" @click="emit('refresh')">
                    <span class="i-lucide-refresh-cw h-3.5 w-3.5" :class="props.loading ? 'animate-spin' : ''"></span>
                </button>
                <button type="button" class="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]" :title="t('agent.systemPrompt.close')" @click="emit('update:modelValue', false)">
                    <span class="i-lucide-x h-3.5 w-3.5"></span>
                </button>
            </div>
        </div>

        <div class="mt-2 max-h-[min(42vh,420px)] overflow-y-auto rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
            <div v-if="props.loading" class="flex items-center gap-2 py-3 text-xs text-[var(--text-muted)]">
                <span class="i-lucide-loader-circle h-3.5 w-3.5 animate-spin"></span>
                {{ t("agent.systemPrompt.loading") }}
            </div>
            <div v-else-if="props.error" class="flex items-center justify-between gap-3 py-2 text-xs text-[var(--status-danger)]">
                <span class="min-w-0 break-words">{{ props.error }}</span>
                <button type="button" class="shrink-0 rounded border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-2 py-1 transition-opacity hover:opacity-80" @click="emit('load')">{{ t("agent.systemPrompt.retry") }}</button>
            </div>
            <AgentMarkdownContent v-else-if="props.value" :content="props.value" :open-reference="props.openReference" />
            <div v-else class="py-3 text-xs text-[var(--text-muted)]">{{ t("agent.systemPrompt.empty") }}</div>
        </div>
    </section>
</template>
