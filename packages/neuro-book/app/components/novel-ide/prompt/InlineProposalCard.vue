<script setup lang="ts">
import {computed, ref} from "vue";
import DiffWorkbenchDialog from "nbook/app/components/common/diff/DiffWorkbenchDialog.vue";
import type {DiffWorkbenchActionPayload, DiffWorkbenchDocument} from "nbook/app/components/common/diff/diff-workbench.types";
import type {InlineProposalItemState, InlineProposalState} from "./inline-proposal.types";
import {computeInlineDiff, isLargeDiff, type InlineDiffPart} from "nbook/app/utils/inline-diff";

const props = defineProps<{
    proposal: InlineProposalState | null;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    (e: "accept-edit", index: number): void;
    (e: "reject-edit", index: number, note?: string): void;
    (e: "accept-all"): void;
    (e: "reject-all", note?: string): void;
    (e: "request-revision", note: string): void;
    (e: "close"): void;
}>();

// 附言状态
const revisionInputOpen = ref(false);
const revisionNote = ref("");
const rejectNoteMap = ref<Record<number, string>>({});
const activeRejectInputIndex = ref<number | null>(null);

// Monaco 对比弹窗状态
const diffDialogOpen = ref(false);
const activeDiffItemIndex = ref<number | null>(null);

const items = computed<InlineProposalItemState[]>(() => props.proposal?.items ?? []);
const totalCount = computed(() => items.value.length);
const acceptedCount = computed(() => items.value.filter((i) => i.status === "accepted").length);
const rejectedCount = computed(() => items.value.filter((i) => i.status === "rejected").length);
const pendingCount = computed(() => items.value.filter((i) => i.status === "pending").length);
const allResolved = computed(() => totalCount.value > 0 && pendingCount.value === 0);

function getDiffParts(item: InlineProposalItemState): InlineDiffPart[] {
    return computeInlineDiff(item.original, item.replacement);
}

function openDiffDialog(index: number): void {
    activeDiffItemIndex.value = index;
    diffDialogOpen.value = true;
}

const activeDiffDocument = computed<DiffWorkbenchDocument | null>(() => {
    if (activeDiffItemIndex.value === null || !items.value[activeDiffItemIndex.value]) {
        return null;
    }
    const item = items.value[activeDiffItemIndex.value]!;
    return {
        id: `proposal-diff-${activeDiffItemIndex.value}`,
        path: props.proposal?.targetPath ?? "manuscript",
        title: `修改条目 #${activeDiffItemIndex.value + 1}`,
        currentContent: item.original,
        incomingContent: item.replacement,
        resultContent: item.replacement,
    };
});

function handleDiffAction(payload: DiffWorkbenchActionPayload): void {
    if (payload.actionId === "use-incoming" || payload.actionId === "save-result") {
        if (activeDiffItemIndex.value !== null) {
            emit("accept-edit", activeDiffItemIndex.value);
        }
        diffDialogOpen.value = false;
    } else if (payload.actionId === "cancel") {
        diffDialogOpen.value = false;
    }
}

function toggleRejectInput(index: number): void {
    if (activeRejectInputIndex.value === index) {
        activeRejectInputIndex.value = null;
    } else {
        activeRejectInputIndex.value = index;
    }
}

function confirmReject(index: number): void {
    const note = (rejectNoteMap.value[index] ?? "").trim();
    emit("reject-edit", index, note || undefined);
    activeRejectInputIndex.value = null;
}

function handleAcceptAll(): void {
    emit("accept-all");
}

function handleRejectAll(): void {
    emit("reject-all");
}

function handleRequestRevision(): void {
    emit("request-revision", revisionNote.value.trim());
    revisionNote.value = "";
    revisionInputOpen.value = false;
}
</script>

<template>
    <div
        v-if="props.proposal"
        class="inline-proposal-card relative mb-3 w-full overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-xl transition-all"
    >
        <!-- 提案卡顶栏 -->
        <div class="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-sidebar)] px-4 py-2 text-xs">
            <div class="flex min-w-0 items-center gap-2">
                <span class="i-lucide-sparkles h-4 w-4 shrink-0 text-[var(--accent-text)]"></span>
                <span class="truncate font-semibold text-[var(--text-main)]">{{ props.proposal.summary || "AI 编辑提案" }}</span>
                <span class="shrink-0 rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                    {{ props.proposal.targetPath }}
                </span>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-[11px] text-[var(--text-secondary)]">
                    已采纳 {{ acceptedCount }}/{{ totalCount }}
                    <template v-if="rejectedCount > 0">（已拒绝 {{ rejectedCount }}）</template>
                </span>
                <button
                    type="button"
                    class="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                    title="收起提案卡"
                    @click="emit('close')"
                >
                    <span class="i-lucide-x h-3.5 w-3.5"></span>
                </button>
            </div>
        </div>

        <!-- 全部处理完毕横幅 -->
        <div
            v-if="allResolved"
            class="flex items-center justify-between bg-[var(--status-success-bg)] px-4 py-2 text-xs text-[var(--status-success)] border-b border-[var(--status-success-border)]"
        >
            <div class="flex items-center gap-1.5">
                <span class="i-lucide-check-circle-2 h-4 w-4"></span>
                <span>提案已全部处理完毕（采纳 {{ acceptedCount }} 条，拒绝 {{ rejectedCount }} 条）</span>
            </div>
        </div>

        <!-- 修改条目列表 -->
        <div class="max-h-72 space-y-2.5 overflow-y-auto p-3.5">
            <div
                v-for="(item, idx) in items"
                :key="item.index"
                class="rounded-lg border p-3 transition-colors text-xs"
                :class="{
                    'border-[var(--border-color)] bg-[var(--bg-subtle)]': item.status === 'pending',
                    'border-[var(--status-success-border)] bg-[var(--status-success-bg)]/25': item.status === 'accepted',
                    'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)]/15 opacity-70': item.status === 'rejected',
                }"
            >
                <!-- 条目头部 -->
                <div class="mb-2 flex items-center justify-between gap-2">
                    <div class="flex min-w-0 items-center gap-2">
                        <span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-input)] font-mono text-[10px] font-bold text-[var(--text-secondary)] border border-[var(--border-color)]">
                            {{ idx + 1 }}
                        </span>
                        <span class="truncate font-medium text-[var(--text-secondary)] italic">
                            {{ item.rationale || "优化表达" }}
                        </span>
                    </div>

                    <div class="flex shrink-0 items-center gap-2">
                        <!-- 大改对比按钮 -->
                        <button
                            v-if="isLargeDiff(item.original, item.replacement)"
                            type="button"
                            class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-bg)]"
                            title="点开完整对比查看"
                            @click="openDiffDialog(idx)"
                        >
                            <span class="i-lucide-git-compare h-3 w-3"></span>
                            <span>展开对比</span>
                        </button>

                        <!-- 状态标签 / 操作按钮 -->
                        <template v-if="item.status === 'accepted'">
                            <span class="inline-flex items-center gap-1 rounded bg-[var(--status-success-bg)] px-2 py-0.5 font-medium text-[var(--status-success)] border border-[var(--status-success-border)]">
                                <span class="i-lucide-check h-3 w-3"></span>已采纳
                            </span>
                        </template>
                        <template v-else-if="item.status === 'rejected'">
                            <span class="inline-flex items-center gap-1 rounded bg-[var(--status-danger-bg)] px-2 py-0.5 font-medium text-[var(--status-danger)] border border-[var(--status-danger-border)]">
                                <span class="i-lucide-x h-3 w-3"></span>已拒绝
                                <span v-if="item.note" class="max-w-[8rem] truncate opacity-80">({{ item.note }})</span>
                            </span>
                        </template>
                        <template v-else>
                            <button
                                type="button"
                                :disabled="props.disabled"
                                class="inline-flex items-center gap-1 rounded border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2.5 py-1 font-medium text-[var(--status-success)] transition-colors hover:bg-[var(--status-success)] hover:text-white disabled:opacity-50"
                                @click="emit('accept-edit', item.index)"
                            >
                                <span class="i-lucide-check h-3 w-3"></span>采纳
                            </button>
                            <button
                                type="button"
                                :disabled="props.disabled"
                                class="inline-flex items-center gap-1 rounded border border-[var(--border-color)] bg-[var(--bg-panel)] px-2.5 py-1 text-[var(--text-secondary)] transition-colors hover:border-[var(--status-danger-border)] hover:text-[var(--status-danger)] disabled:opacity-50"
                                @click="toggleRejectInput(idx)"
                            >
                                <span class="i-lucide-x h-3 w-3"></span>拒绝
                            </button>
                        </template>
                    </div>
                </div>

                <!-- 附言输入框（当点击拒绝展开附言时） -->
                <div v-if="activeRejectInputIndex === idx && item.status === 'pending'" class="mb-2 flex items-center gap-1.5 rounded bg-[var(--bg-panel)] p-1.5 border border-[var(--border-color)]">
                    <input
                        v-model="rejectNoteMap[item.index]"
                        type="text"
                        placeholder="拒绝理由附言（可选）..."
                        class="min-w-0 flex-1 bg-transparent px-1.5 text-xs text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                        @keydown.enter="confirmReject(item.index)"
                    />
                    <button
                        type="button"
                        class="rounded bg-[var(--status-danger)] px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90"
                        @click="confirmReject(item.index)"
                    >
                        确认拒绝
                    </button>
                    <button
                        type="button"
                        class="rounded px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                        @click="activeRejectInputIndex = null"
                    >
                        取消
                    </button>
                </div>

                <!-- 词/字符级 Diff 着色呈现 -->
                <div class="rounded border border-[var(--border-color)]/60 bg-[var(--bg-panel)] p-2 font-mono text-[11px] leading-relaxed">
                    <span
                        v-for="(part, pIdx) in getDiffParts(item)"
                        :key="pIdx"
                        :class="{
                            'rounded-sm bg-[var(--status-danger-bg)] text-[var(--status-danger)] line-through px-0.5 border border-[var(--status-danger-border)]/50': part.removed,
                            'rounded-sm bg-[var(--status-success-bg)] text-[var(--status-success)] font-semibold px-0.5 border border-[var(--status-success-border)]/50': part.added,
                            'text-[var(--text-main)]': !part.added && !part.removed,
                        }"
                    >{{ part.value }}</span>
                </div>
            </div>
        </div>

        <!-- 卡底操作栏 -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] bg-[var(--bg-sidebar)] px-3.5 py-2.5">
            <!-- 批量采纳/拒绝 -->
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    :disabled="props.disabled || pendingCount === 0"
                    class="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent-main)] px-3 text-xs font-medium text-[var(--accent-contrast)] shadow-sm transition-all hover:opacity-90 disabled:opacity-40"
                    @click="handleAcceptAll"
                >
                    <span class="i-lucide-check-check h-3.5 w-3.5"></span>
                    <span>全部采纳</span>
                </button>
                <button
                    type="button"
                    :disabled="props.disabled || pendingCount === 0"
                    class="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--status-danger)] disabled:opacity-40"
                    @click="handleRejectAll"
                >
                    <span class="i-lucide-x-circle h-3.5 w-3.5"></span>
                    <span>全部拒绝</span>
                </button>
            </div>

            <!-- 再改一版 -->
            <div class="flex items-center gap-2">
                <template v-if="revisionInputOpen">
                    <input
                        v-model="revisionNote"
                        type="text"
                        placeholder="输入反馈附言（如：节奏放缓一点）..."
                        class="h-7 w-56 rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-2 text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-main)] focus:outline-none"
                        @keydown.enter="handleRequestRevision"
                    />
                    <button
                        type="button"
                        :disabled="props.disabled"
                        class="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--accent-main)] px-2.5 text-xs font-medium text-[var(--accent-contrast)] hover:opacity-90 disabled:opacity-40"
                        @click="handleRequestRevision"
                    >
                        发送
                    </button>
                    <button
                        type="button"
                        class="inline-flex h-7 items-center rounded px-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)]"
                        @click="revisionInputOpen = false"
                    >
                        取消
                    </button>
                </template>
                <template v-else>
                    <button
                        type="button"
                        :disabled="props.disabled"
                        class="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2.5 text-xs text-[var(--text-main)] transition-colors hover:border-[var(--accent-main)] hover:text-[var(--accent-text)] disabled:opacity-40"
                        @click="revisionInputOpen = true"
                    >
                        <span class="i-lucide-rotate-ccw h-3.5 w-3.5"></span>
                        <span>再改一版</span>
                    </button>
                </template>
            </div>
        </div>

        <!-- 既有 Monaco Diff 对比弹窗 -->
        <DiffWorkbenchDialog
            v-if="diffDialogOpen"
            v-model="diffDialogOpen"
            :document="activeDiffDocument"
            :title="`修改对比（第 ${(activeDiffItemIndex ?? 0) + 1} 条）`"
            :subtitle="props.proposal.targetPath"
            :actions="[
                {id: 'cancel', label: '关闭'},
                {id: 'use-incoming', label: '采纳此修改', tone: 'primary'},
            ]"
            @action="handleDiffAction"
        />
    </div>
</template>
