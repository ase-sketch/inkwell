<script setup lang="ts">
import type {PlotPreviewFocus} from "nbook/app/components/novel-ide/plot/plot-preview.types";

const props = defineProps<{
    focus: PlotPreviewFocus | null;
}>();
</script>

<template>
    <!-- 当前选中对象检查器 -->
    <aside class="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[0_18px_50px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]">
        <div class="border-b border-[var(--border-color)] px-4 py-3">
            <div class="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Inspector</div>
            <div class="mt-1 text-sm font-semibold text-[var(--text-main)]">当前对象详情</div>
        </div>

        <div v-if="focus" class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-4">
                <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{{ focus.kind }}</div>
                <div class="mt-2 text-lg font-semibold text-[var(--text-main)]">{{ focus.title }}</div>
                <div class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{{ focus.summary }}</div>
            </div>

            <div v-if="focus.meta.length > 0" class="mt-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-4">
                <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Meta</div>
                <div class="mt-3 flex flex-wrap gap-2">
                    <span
                        v-for="meta in focus.meta"
                        :key="meta"
                        class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
                    >
                        {{ meta }}
                    </span>
                </div>
            </div>

            <div v-if="focus.writingTip" class="mt-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-4">
                <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Writing Tip</div>
                <div class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{{ focus.writingTip }}</div>
            </div>

            <div v-if="focus.refs.length > 0" class="mt-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-4">
                <div class="flex items-center justify-between gap-3">
                    <div class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Refs</div>
                    <div class="text-[11px] text-[var(--text-muted)]">{{ focus.refs.length }} 条</div>
                </div>
                <div class="mt-3 space-y-2">
                    <div
                        v-for="refItem in focus.refs"
                        :key="refItem.id"
                        class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2.5"
                    >
                        <div class="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                            <span class="rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[var(--accent-text)]">{{ refItem.relation }}</span>
                            <span>{{ refItem.visibility }}</span>
                        </div>
                        <div class="mt-1 text-sm text-[var(--text-main)]">{{ refItem.target }}</div>
                        <div v-if="refItem.note" class="mt-1 text-xs leading-6 text-[var(--text-secondary)]">{{ refItem.note }}</div>
                    </div>
                </div>
            </div>
        </div>

        <div v-else class="flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-center">
            <div class="max-w-[240px]">
                <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)]">
                    <span class="i-lucide-mouse-pointer-square-dashed h-6 w-6"></span>
                </div>
                <div class="mt-4 text-sm font-semibold text-[var(--text-main)]">尚未选中对象</div>
                <div class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">从左侧或中间主视图选择一个 Thread、Scene、Chapter 或 Plot 后，这里会显示当前详情。</div>
            </div>
        </div>
    </aside>
</template>
