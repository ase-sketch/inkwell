<script setup lang="ts">
import {
    aliasChips,
    anchorTimeline,
    detailBadges,
    detailCategoryIcon,
    detailCategoryLabel,
    detailSummary,
    factionChips,
    type DetailBadgeKind,
    type DetailTranslate,
} from "nbook/app/components/novel-ide/knowledge/knowledge-detail-display";
import type {
    ChapterOrderLookup,
    KnowledgeEntry,
} from "nbook/app/components/novel-ide/knowledge/knowledge-projection";

/**
 * 知识库条目详情：只读展示。
 *
 * 这里只负责渲染，所有「怎么说话」的口径都在 knowledge-detail-display.ts；
 * 编辑与章节跳转自身不实现，交给外层容器接住事件。
 */

const props = defineProps<{
    entry: KnowledgeEntry;
    /** 阵营中文名，一般来自 collectFactionTitles。 */
    factionTitles?: Map<string, string>;
    /** 章序解析函数，一般来自大纲树。 */
    chapterOrder?: ChapterOrderLookup;
}>();

const emit = defineEmits<{
    (event: "jump-chapter", chapter: string): void;
    (event: "edit"): void;
}>();

const {t} = useI18n();

/** 把 vue-i18n 的 t 适配成投影模块要求的形状。 */
const translate: DetailTranslate = (key, params) => params ? t(key, params) : t(key);

/** 徽标色调：来源=说明、戏份=主线强调、首次登场=中性弱色。 */
const BADGE_CLASS: Record<DetailBadgeKind, string> = {
    source: "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info)]",
    subtype: "border-[var(--border-accent)] bg-[var(--accent-bg)] text-[var(--accent-text)]",
    firstAppearance: "border-[var(--border-color)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
};

const categoryLabel = computed(() => detailCategoryLabel(props.entry.category, translate));
const categoryIcon = computed(() => detailCategoryIcon(props.entry.category));
const aliases = computed(() => aliasChips(props.entry.aliases));
const factions = computed(() => factionChips(props.entry.factionPaths, props.factionTitles ?? null));
const badges = computed(() => detailBadges(props.entry, translate));
const summary = computed(() => detailSummary(props.entry));
const timeline = computed(() => anchorTimeline(props.entry.anchors, props.chapterOrder ?? null));

/** 原文摘句默认折叠，按展开状态存 key，刷新条目自然不会串台。 */
const expandedQuotes = ref<string[]>([]);

const isQuoteExpanded = (key: string): boolean => expandedQuotes.value.includes(key);

function toggleQuote(key: string): void {
    expandedQuotes.value = isQuoteExpanded(key)
        ? expandedQuotes.value.filter((item) => item !== key)
        : [...expandedQuotes.value, key];
}

function jumpToChapter(chapter: string): void {
    if (chapter) {
        emit("jump-chapter", chapter);
    }
}
</script>

<template>
    <article class="flex min-h-0 flex-col bg-[var(--bg-panel)]" data-role="ide-knowledge-detail">
        <header class="shrink-0 border-b border-[var(--border-color)] px-5 pb-4 pt-5">
            <div class="flex items-start gap-3">
                <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-accent)] bg-[var(--accent-bg)]">
                    <span :class="categoryIcon" class="h-5 w-5 text-[var(--accent-text)]"></span>
                </div>

                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h2 class="text-[19px] font-semibold leading-tight text-[var(--text-main)]" data-role="ide-knowledge-detail-title">{{ props.entry.title }}</h2>
                        <span v-if="categoryLabel" class="font-ui-sans text-[11px] text-[var(--text-muted)]" data-role="ide-knowledge-detail-category">{{ categoryLabel }}</span>
                    </div>

                    <div v-if="aliases.length > 0" class="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span class="font-ui-sans text-[10px] text-[var(--text-muted)]">{{ t("ide.knowledge.detail.aliasesLabel") }}</span>
                        <span
                            v-for="alias in aliases"
                            :key="alias"
                            class="font-ui-sans rounded border border-[var(--border-color)] bg-[var(--bg-subtle)] px-1.5 py-px text-[10px] text-[var(--text-secondary)]"
                            data-role="ide-knowledge-detail-alias"
                        >{{ alias }}</span>
                    </div>

                    <div v-if="badges.length > 0" class="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span
                            v-for="badge in badges"
                            :key="badge.kind"
                            class="font-ui-sans rounded border px-1.5 py-px text-[10px]"
                            :class="BADGE_CLASS[badge.kind]"
                            :data-detail-badge="badge.kind"
                        >{{ badge.label }}</span>
                    </div>
                </div>

                <button
                    type="button"
                    class="font-ui-sans flex h-7 shrink-0 items-center gap-1 rounded-md border border-[var(--border-color)] px-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                    data-role="ide-knowledge-detail-edit"
                    @click="emit('edit')"
                >
                    <span class="i-lucide-pen-line h-3.5 w-3.5"></span>
                    {{ t("ide.knowledge.detail.editAction") }}
                </button>
            </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
            <!-- 阵营：没有归属时整段不出现，「未分组」不是阵营。 -->
            <section v-if="factions.length > 0" class="mb-4" data-role="ide-knowledge-detail-factions">
                <div class="font-ui-sans mb-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{{ t("ide.knowledge.detail.factionLabel") }}</div>
                <div class="flex flex-wrap gap-1.5">
                    <span
                        v-for="faction in factions"
                        :key="faction"
                        class="font-ui-sans rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                        data-role="ide-knowledge-detail-faction"
                    >{{ faction }}</span>
                </div>
            </section>

            <!-- 摘要：作者写过的才显示。 -->
            <section v-if="summary" class="mb-4" data-role="ide-knowledge-detail-summary">
                <div class="font-ui-sans mb-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{{ t("ide.knowledge.detail.summaryLabel") }}</div>
                <p class="text-[13px] leading-relaxed text-[var(--text-secondary)]">{{ summary }}</p>
            </section>

            <section data-role="ide-knowledge-detail-history">
                <div class="mb-1">
                    <h3 class="text-[14px] font-semibold text-[var(--text-main)]">{{ t("ide.knowledge.detail.historyTitle") }}</h3>
                    <p class="font-ui-sans mt-0.5 text-[11px] leading-5 text-[var(--text-muted)]">{{ t("ide.knowledge.detail.historySubtitle") }}</p>
                </div>

                <ol v-if="timeline.length > 0" class="mt-2 space-y-0">
                    <li
                        v-for="(item, index) in timeline"
                        :key="item.key"
                        class="relative flex gap-3 pb-3"
                        data-role="ide-knowledge-detail-anchor"
                    >
                        <!-- 时间线轴：圆点 + 连接线 -->
                        <div class="relative flex w-3 shrink-0 justify-center">
                            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-main)]"></span>
                            <span v-if="index < timeline.length - 1" class="absolute left-1/2 top-4 h-[calc(100%-1rem)] w-px -translate-x-1/2 bg-[var(--border-color)]"></span>
                        </div>

                        <div class="min-w-0 flex-1">
                            <!-- 有备注时备注是标题、章名另起一行可点；没备注时章名自己就是标题。 -->
                            <button
                                v-if="!item.note"
                                type="button"
                                :title="t('ide.knowledge.detail.chapterJumpHint')"
                                class="block max-w-full truncate text-left text-[13px] font-medium text-[var(--accent-text)] transition-colors hover:underline"
                                data-role="ide-knowledge-detail-chapter"
                                @click="jumpToChapter(item.chapter)"
                            >{{ item.title }}</button>

                            <template v-else>
                                <div class="text-[13px] font-medium leading-snug text-[var(--text-main)]" data-role="ide-knowledge-detail-note">{{ item.title }}</div>
                                <button
                                    type="button"
                                    :title="t('ide.knowledge.detail.chapterJumpHint')"
                                    class="font-ui-sans mt-0.5 block max-w-full truncate text-left text-[11px] text-[var(--accent-text)] transition-colors hover:underline"
                                    data-role="ide-knowledge-detail-chapter"
                                    @click="jumpToChapter(item.chapter)"
                                >{{ item.chapter }}</button>
                            </template>

                            <template v-if="item.quote">
                                <button
                                    type="button"
                                    class="font-ui-sans mt-1 flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
                                    data-role="ide-knowledge-detail-quote-toggle"
                                    @click="toggleQuote(item.key)"
                                >
                                    <span :class="isQuoteExpanded(item.key) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="h-3 w-3"></span>
                                    {{ t("ide.knowledge.detail.quoteToggle") }}
                                </button>
                                <blockquote
                                    v-if="isQuoteExpanded(item.key)"
                                    class="mt-1.5 border-l-2 border-[var(--border-accent)] bg-[var(--bg-subtle)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)]"
                                    data-role="ide-knowledge-detail-quote"
                                >{{ item.quote }}</blockquote>
                            </template>
                        </div>
                    </li>
                </ol>

                <!-- 空态：告诉作者锚点会自己长出来，不留一块空白。 -->
                <p
                    v-else
                    class="mt-2 rounded-md border border-dashed border-[var(--border-color)] px-3 py-5 text-center text-[12px] leading-relaxed text-[var(--text-muted)]"
                    data-role="ide-knowledge-detail-history-empty"
                >{{ t("ide.knowledge.detail.historyEmpty") }}</p>
            </section>
        </div>
    </article>
</template>
