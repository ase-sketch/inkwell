<script setup lang="ts">
import type {WorldMutationOp} from "nbook/app/utils/world-engine-preview";

type PreviewSubject = {
    id: string;
    type: string;
    name: string;
};

type PreviewSliceMutation = {
    subjectId: string;
    path: string;
    op: WorldMutationOp;
    value?: unknown;
    summary?: string;
};

type PreviewSlice = {
    id: string;
    time: string;
    title: string;
    kind: string;
    patches?: PreviewSliceMutation[];
    issues?: PreviewIssue[];
};

type PreviewIssue = {
    code: "broken-relative" | "dangling-ref" | "base-shifted" | "masked" | "invalid-path" | "cross-ref" | "embedding-whole-replace";
    label: "E1" | "E2" | "E3" | "E4" | "E5" | "A1" | "A2";
    severity: "error" | "advisory";
    sliceId?: string;
    patchId?: string;
    subjectId: string;
    attr: string;
    path?: string;
    op?: PreviewSliceMutation["op"];
    title: string;
    message: string;
    explanation: {
        whatHappened: string;
        whyItMatters: string;
        suggestedAction: string;
    };
};

defineProps<{
    subjects: PreviewSubject[];
    slices: PreviewSlice[];
    latestSliceTime: string;
    stateJson: string;
    stateIssues: PreviewIssue[];
    actionIssues: PreviewIssue[];
    error: string;
    notice: string;
    loadingWorld: boolean;
    projectReady: boolean;
    actionBusy: boolean;
    editingSliceId: string;
}>();

const emit = defineEmits<{
    (e: "refresh"): void;
    (e: "load-subject", subject: PreviewSubject): void;
    (e: "load-slice", sliceId: string): void;
    (e: "delete-slice", sliceId: string): void;
}>();

function formatSlicePatches(patches: PreviewSliceMutation[] | undefined): string {
    return JSON.stringify(patches ?? [], null, 2);
}
</script>

<template>
    <!-- Preview 世界状态与 timeline -->
    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div class="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
            <h2 class="text-sm font-semibold">World State</h2>
            <div class="text-xs text-[var(--text-muted)]">{{ subjects.length }} subjects · {{ slices.length }} slices</div>
        </div>
        <div v-if="error" class="border-b border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-2 text-sm text-[var(--status-danger)]">{{ error }}</div>
        <div v-if="notice" class="border-b border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-2 text-sm text-[var(--status-success)]">{{ notice }}</div>
        <div v-if="actionIssues.length" class="border-b border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3">
            <div class="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--status-warning)]">
                <span class="i-lucide-triangle-alert h-4 w-4"></span>
                本次操作 issues · {{ actionIssues.length }}
            </div>
            <div class="grid gap-1.5">
                <div v-for="issue in actionIssues" :key="`preview-action-issue:${issue.code}:${issue.sliceId}:${issue.subjectId}:${issue.attr}:${issue.message}`" class="rounded-md border border-[var(--status-warning-border)] bg-[var(--bg-panel)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                    <span class="font-mono text-[var(--status-warning)]">{{ issue.code }}</span>
                    <span class="mx-1 text-[var(--text-muted)]">·</span>
                    <span class="font-mono">{{ issue.subjectId }}.{{ issue.attr }}</span>
                    <span v-if="issue.sliceId" class="ml-1 text-[var(--text-muted)]">slice {{ issue.sliceId }}</span>
                    <div class="mt-1 text-[var(--text-main)]">{{ issue.message }}</div>
                </div>
            </div>
        </div>
        <div v-if="stateIssues.length" class="border-b border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3">
            <div class="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--status-warning)]">
                <span class="i-lucide-triangle-alert h-4 w-4"></span>
                State Query issues · {{ stateIssues.length }}
            </div>
            <div class="grid gap-1.5">
                <div v-for="issue in stateIssues" :key="`preview-state-issue:${issue.code}:${issue.sliceId}:${issue.subjectId}:${issue.attr}:${issue.message}`" class="rounded-md border border-[var(--status-warning-border)] bg-[var(--bg-panel)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                    <span class="font-mono text-[var(--status-warning)]">{{ issue.code }}</span>
                    <span class="mx-1 text-[var(--text-muted)]">·</span>
                    <span class="font-mono">{{ issue.subjectId }}.{{ issue.attr }}</span>
                    <span v-if="issue.sliceId" class="ml-1 text-[var(--text-muted)]">slice {{ issue.sliceId }}</span>
                    <div class="mt-1 text-[var(--text-main)]">{{ issue.message }}</div>
                </div>
            </div>
        </div>

        <div class="grid min-h-[760px] lg:grid-cols-[260px_minmax(0,1fr)]">
            <!-- Subject 列表 -->
            <div class="border-b border-[var(--border-color)] lg:border-b-0 lg:border-r">
                <div class="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
                    <div class="text-xs font-semibold uppercase text-[var(--text-secondary)]">Subjects</div>
                    <button type="button" class="rounded p-1 hover:bg-[var(--bg-hover)] disabled:opacity-50" :disabled="loadingWorld || actionBusy || !projectReady" title="刷新" @click="emit('refresh')">
                        <span :class="loadingWorld ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-refresh-cw'" class="h-4 w-4"></span>
                    </button>
                </div>
                <div class="max-h-[700px] overflow-auto p-2">
                    <button v-for="subject in subjects" :key="subject.id" type="button" class="mb-2 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] p-3 text-left hover:bg-[var(--bg-hover)] disabled:opacity-50" :disabled="loadingWorld || actionBusy || !projectReady" @click="emit('load-subject', subject)">
                        <div class="truncate text-sm font-medium">{{ subject.name || subject.id }}</div>
                        <div class="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                            <span>{{ subject.id }}</span>
                            <span>{{ subject.type }}</span>
                        </div>
                    </button>
                    <div v-if="subjects.length === 0" class="px-3 py-8 text-center text-sm text-[var(--text-muted)]">暂无 subject</div>
                </div>
            </div>

            <!-- Timeline 和查询结果 -->
            <div class="min-w-0">
                <div class="border-b border-[var(--border-color)] px-4 py-3">
                    <div class="flex items-center justify-between">
                        <div class="text-xs font-semibold uppercase text-[var(--text-secondary)]">Timeline</div>
                        <div class="text-xs text-[var(--text-muted)]">{{ latestSliceTime || "无切面" }}</div>
                    </div>
                </div>
                <div class="max-h-[360px] overflow-auto">
                    <div v-for="slice in slices" :key="slice.id" class="border-b border-[var(--border-color)] px-4 py-3" :class="editingSliceId === slice.id ? 'bg-[var(--accent-bg)]/60' : ''">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="truncate text-sm font-medium">{{ slice.title || slice.id }}</div>
                                <div class="mt-1 text-xs text-[var(--text-muted)]">{{ slice.time }} · {{ slice.kind }}</div>
                            </div>
                            <div class="flex shrink-0 items-center gap-2">
                                <div v-if="slice.issues?.length" class="inline-flex items-center gap-1 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-1 text-xs text-[var(--status-warning)]">
                                    <span class="i-lucide-triangle-alert h-3.5 w-3.5"></span>
                                    {{ slice.issues.length }}
                                </div>
                                <div class="text-xs text-[var(--text-muted)]">{{ slice.patches?.length ?? 0 }} patches</div>
                                <button type="button" class="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border-color)] px-2 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:opacity-50" :disabled="loadingWorld || actionBusy || !projectReady" title="载入编辑" aria-label="载入编辑 slice" @click="emit('load-slice', slice.id)">
                                    <span class="i-lucide-pencil h-3.5 w-3.5"></span>
                                    编辑
                                </button>
                                <button type="button" class="inline-flex h-7 items-center gap-1 rounded-md border border-transparent px-2 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger)] disabled:opacity-50" :disabled="loadingWorld || actionBusy || !projectReady" title="删除 slice" aria-label="删除 slice" @click="emit('delete-slice', slice.id)">
                                    <span class="i-lucide-trash-2 h-3.5 w-3.5"></span>
                                    删除
                                </button>
                            </div>
                        </div>
                        <div v-if="slice.issues?.length" class="mt-2 space-y-1.5">
                            <div v-for="issue in slice.issues" :key="`preview-slice-issue:${slice.id}:${issue.code}:${issue.subjectId}:${issue.attr}:${issue.message}`" class="rounded border border-[var(--status-warning-border)] bg-[var(--bg-input)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)]">
                                <span class="font-mono text-[var(--status-warning)]">{{ issue.code }}</span>
                                <span class="mx-1 text-[var(--text-muted)]">·</span>
                                <span class="font-mono">{{ issue.subjectId }}.{{ issue.attr }}</span>
                                <div class="mt-0.5 text-[var(--text-main)]">{{ issue.message }}</div>
                            </div>
                        </div>
                        <pre v-if="slice.patches?.length" class="mt-2 max-h-28 overflow-auto rounded bg-[var(--bg-input)] p-2 text-[11px] leading-5">{{ formatSlicePatches(slice.patches) }}</pre>
                    </div>
                    <div v-if="slices.length === 0" class="px-4 py-8 text-center text-sm text-[var(--text-muted)]">暂无 slice</div>
                </div>

                <div class="border-b border-t border-[var(--border-color)] px-4 py-3">
                    <div class="text-xs font-semibold uppercase text-[var(--text-secondary)]">State Query</div>
                </div>
                <pre class="min-h-[280px] overflow-auto p-4 text-xs leading-5">{{ stateJson }}</pre>
            </div>
        </div>
    </section>
</template>
