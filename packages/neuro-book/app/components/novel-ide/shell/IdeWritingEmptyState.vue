<script setup lang="ts">
const emit = defineEmits<{
    (event: "create-chapter"): void;
    (event: "start-interview"): void;
}>();

const {t} = useI18n();
</script>

<template>
    <!-- 还没有文稿：温和引导，不甩内部文件树 -->
    <div class="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10" data-role="ide-writing-empty">
        <div class="flex max-w-[420px] flex-col items-center gap-6 text-center">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-accent)] bg-[var(--accent-bg)]">
                <span class="i-lucide-feather h-7 w-7 text-[var(--accent-text)]"></span>
            </div>

            <div class="space-y-2">
                <h1 class="text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-main)]">{{ t("ide.writing.emptyTitle") }}</h1>
                <p class="text-[13px] leading-relaxed text-[var(--text-secondary)]">{{ t("ide.writing.emptyDescription") }}</p>
            </div>

            <div class="flex w-full flex-col items-stretch gap-2">
                <button
                    type="button"
                    class="flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-main)] px-4 py-2.5 text-[13px] font-medium text-[var(--text-inverse)] transition-opacity hover:opacity-90"
                    data-role="ide-writing-create-chapter"
                    @click="emit('create-chapter')"
                >
                    <span class="i-lucide-plus h-4 w-4"></span>
                    <span>{{ t("ide.writing.createChapter") }}</span>
                </button>
                <button
                    type="button"
                    class="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                    data-role="ide-writing-start-interview"
                    @click="emit('start-interview')"
                >
                    <span class="i-lucide-message-square h-4 w-4"></span>
                    <span>{{ t("ide.writing.startInterview") }}</span>
                </button>
            </div>

            <p class="text-[12px] leading-relaxed text-[var(--text-muted)]">{{ t("ide.writing.emptyHint") }}</p>
        </div>
    </div>
</template>
