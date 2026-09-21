<script setup lang="ts">
import {onMounted, ref} from "vue";
import WorkflowMermaid from "nbook/app/components/workflow-preview/WorkflowMermaid.vue";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";

/** 参与者 session 的真实树视图 + mock session 直聊入口（RP 轮间对话演示） */
const props = defineProps<{sessionId: number}>();

type TreeDto = {
    sessionId: number;
    profileKey: string;
    kind: string;
    tags: string[];
    archived: boolean;
    title?: string;
    mermaid: string;
    entryCount: number;
};

const tree = ref<TreeDto | null>(null);
const error = ref("");
const chatInput = ref("");
const chatReply = ref("");
const chatBusy = ref(false);

async function refresh() {
    error.value = "";
    try {
        tree.value = await $fetch<TreeDto>(`/api/agent/workflow-demo/sessions/${props.sessionId}/tree`);
    } catch (e) {
        error.value = resolveApiErrorMessage(e, "读取 session 树失败");
    }
}

async function sendChat() {
    if (!chatInput.value.trim() || chatBusy.value) return;
    chatBusy.value = true;
    error.value = "";
    try {
        const result = await $fetch<{reply: string}>("/api/agent/workflow-demo/direct-chat", {
            method: "POST",
            body: {sessionId: props.sessionId, message: chatInput.value},
        });
        chatReply.value = result.reply;
        chatInput.value = "";
        await refresh();
    } catch (e) {
        error.value = resolveApiErrorMessage(e, "直聊失败");
    } finally {
        chatBusy.value = false;
    }
}

onMounted(refresh);
</script>

<template>
    <!-- 单个参与者 session 树卡片 -->
    <div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
        <div v-if="tree" class="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span class="font-semibold text-[var(--text-main)]">session {{ tree.sessionId }}</span>
            <span class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[var(--text-secondary)]">{{ tree.profileKey }}</span>
            <span class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[var(--text-muted)]">kind:{{ tree.kind }}</span>
            <span v-for="tag in tree.tags" :key="tag" class="rounded-full border border-[var(--accent-main)] px-2 py-0.5 text-[var(--accent-text)]">{{ tag }}</span>
            <span v-if="tree.archived" class="rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 text-[var(--status-warning)]">已归档</span>
            <span class="text-[var(--text-muted)]">{{ tree.entryCount }} entries（真实 JSONL）</span>
            <button class="ml-auto rounded border border-[var(--border-color)] px-2 py-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]" @click="refresh">刷新</button>
        </div>
        <div v-if="error" class="mb-2 text-xs text-[var(--status-danger)]">{{ error }}</div>
        <WorkflowMermaid v-if="tree" :code="tree.mermaid" />
        <!-- mock session 直聊入口：workflow 蓝 / 直聊黄，双入口共存一棵主线 -->
        <div v-if="tree?.profileKey.startsWith('workflow.demo.')" class="mt-2 flex items-center gap-2">
            <input v-model="chatInput" placeholder="轮间直聊这个 session（如：聊：酒保是谁？）" class="flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1 text-xs text-[var(--text-main)]" @keydown.enter="sendChat">
            <button :disabled="chatBusy" class="rounded border border-[var(--accent-main)] bg-[var(--accent-bg)] px-3 py-1 text-xs text-[var(--accent-text)] disabled:opacity-40" @click="sendChat">发送</button>
        </div>
        <div v-if="chatReply" class="mt-1 text-xs text-[var(--text-secondary)]">回复：{{ chatReply }}</div>
    </div>
</template>
