<script setup lang="ts">
import {computed, ref, watch} from "vue";
import SharedDiffEditor from "nbook/app/components/common/diff/SharedDiffEditor.vue";
import {
    evolutionRows,
    type EvolutionActor,
    type EvolutionRow,
    type EvolutionTranslate,
} from "nbook/app/components/novel-ide/knowledge/knowledge-evolution";
import {useWorkspaceHistoryTimeline} from "nbook/app/composables/useWorkspaceHistoryTimeline";
import type {IdeTheme} from "nbook/app/utils/theme/theme-tokens";

/**
 * 条目详情「演进」区块：这条设定一路怎么变成今天这样。
 *
 * 只做渲染：一行一变（人话时间 + 人话归因 + 人话操作），点行展开该次前后对比，
 * 点归因跳到那次访谈／对话。所有措辞与可点判断都在 knowledge-evolution.ts，
 * 组件不自己拼文案、也不自己判断「这场会话还在不在」。
 */

const props = defineProps<{
    /** 当前 Project Root；为空（用户资产模式）时整块不渲染。 */
    projectRoot: string | null;
    /** 条目路径（相对 Project Workspace），后端按它授权并取历史。 */
    entryPath: string | null;
    theme?: IdeTheme;
}>();

const emit = defineEmits<{
    /** 请求跳到某场对话看全程。 */
    (event: "jump-session", sessionId: number): void;
}>();

const {t} = useI18n();

/** 把 vue-i18n 的 t 适配成投影模块要求的形状。 */
const translate: EvolutionTranslate = (key, params) => params ? t(key, params) : t(key);

const {entries, loading, loaded, error, load, loadDiff, diffState} = useWorkspaceHistoryTimeline(
    () => props.projectRoot,
    () => props.entryPath,
);

/** 「现在」只在每次取数后定一次，避免同一屏里的相对时间各算各的。 */
const now = ref(new Date());
const rows = computed<EvolutionRow[]>(() => evolutionRows(entries.value, translate, now.value));

/** 展开的是哪一条；同时只展开一条，避免详情栏被多个对比撑爆。 */
const expandedEntryId = ref<number | null>(null);

const empty = computed(() => loaded.value && !error.value && rows.value.length === 0);

/** 读取某条变更的展示状态。模板里一次读进局部变量再判分支，判别联合才收得窄。 */
function stateOf(entryId: number) {
    return diffState(entryId);
}

/** 展开/收起：首次展开时才去取这次的前后对比。 */
async function toggle(row: EvolutionRow): Promise<void> {
    if (!row.expandable) {
        return;
    }
    if (expandedEntryId.value === row.entryId) {
        expandedEntryId.value = null;
        return;
    }
    expandedEntryId.value = row.entryId;
    await loadDiff(row.entryId, t("ide.knowledge.evolution.diffFailed"));
}

/** 只有还在的会话才给跳转入口；已删除的会话是纯文本。 */
function jump(actor: EvolutionActor): void {
    if (actor.sessionId !== null) {
        emit("jump-session", actor.sessionId);
    }
}

/** 收起时清掉展开态，别让下一条设定的行号撞上残留的展开。 */
watch(() => props.entryPath, () => {
    expandedEntryId.value = null;
    now.value = new Date();
    void load(t("ide.knowledge.evolution.loadFailed"));
}, {immediate: true});
</script>

<template>
    <section data-role="ide-knowledge-evolution">
        <div class="mb-1">
            <h3 class="text-[14px] font-semibold text-[var(--text-main)]">{{ t("ide.knowledge.evolution.title") }}</h3>
            <p class="font-ui-sans mt-0.5 text-[11px] leading-5 text-[var(--text-muted)]">{{ t("ide.knowledge.evolution.subtitle") }}</p>
        </div>

        <!-- 读不到就明说一句，不留一块空白让作者以为「没改过」。 -->
        <p
            v-if="error"
            class="mt-2 rounded-md border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-[12px] text-[var(--status-danger)]"
            data-role="ide-knowledge-evolution-error"
        >{{ error }}</p>

        <p
            v-else-if="loading && rows.length === 0"
            class="font-ui-sans mt-2 text-[12px] text-[var(--text-muted)]"
        >{{ t("ide.knowledge.evolution.loading") }}</p>

        <p
            v-else-if="empty"
            class="mt-2 rounded-md border border-dashed border-[var(--border-color)] px-3 py-5 text-center text-[12px] leading-relaxed text-[var(--text-muted)]"
            data-role="ide-knowledge-evolution-empty"
        >{{ t("ide.knowledge.evolution.empty") }}</p>

        <ol v-else class="mt-2 space-y-1" data-role="ide-knowledge-evolution-list">
            <li v-for="row in rows" :key="row.key" class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)]">
                <div class="flex items-center gap-2 px-3 py-2">
                    <span class="font-ui-sans shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]" data-role="ide-knowledge-evolution-time">{{ row.time }}</span>

                    <!-- 归因还在时是可点的按钮，会话已删除时退回纯文本。 -->
                    <button
                        v-if="row.actor.clickable"
                        type="button"
                        class="min-w-0 truncate text-left text-[12px] text-[var(--accent-text)] transition-colors hover:underline"
                        :title="t('ide.knowledge.evolution.jumpHint')"
                        data-role="ide-knowledge-evolution-actor"
                        @click="jump(row.actor)"
                    >{{ row.actor.label }}</button>
                    <span
                        v-else
                        class="min-w-0 truncate text-[12px] text-[var(--text-secondary)]"
                        data-role="ide-knowledge-evolution-actor-static"
                    >{{ row.actor.label }}</span>

                    <span class="font-ui-sans shrink-0 rounded border border-[var(--border-color)] bg-[var(--bg-subtle)] px-1.5 py-px text-[10px] text-[var(--text-secondary)]" data-role="ide-knowledge-evolution-operation">{{ row.operation }}</span>

                    <button
                        v-if="row.expandable"
                        type="button"
                        class="font-ui-sans ml-auto flex shrink-0 items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
                        data-role="ide-knowledge-evolution-toggle"
                        @click="void toggle(row)"
                    >
                        <span :class="expandedEntryId === row.entryId ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="h-3 w-3"></span>
                        {{ expandedEntryId === row.entryId ? t("ide.knowledge.evolution.collapse") : t("ide.knowledge.evolution.expand") }}
                    </button>
                </div>

                <div v-if="expandedEntryId === row.entryId" class="border-t border-[var(--border-color)]" data-role="ide-knowledge-evolution-diff">
                    <template v-for="state in [stateOf(row.entryId)]" :key="row.key">
                        <p v-if="state.loading" class="font-ui-sans px-3 py-3 text-[12px] text-[var(--text-muted)]">{{ t("ide.knowledge.evolution.diffLoading") }}</p>
                        <p v-else-if="state.error" class="px-3 py-3 text-[12px] text-[var(--status-danger)]">{{ state.error }}</p>
                        <p v-else-if="state.result?.status === 'too_large'" class="px-3 py-3 text-[12px] text-[var(--status-warning)]">{{ t("ide.knowledge.evolution.diffTooLarge") }}</p>
                        <p v-else-if="state.result?.status === 'blocked'" class="px-3 py-3 text-[12px] text-[var(--status-warning)]">{{ t("ide.knowledge.evolution.diffBlocked") }}</p>
                        <p v-else-if="state.result && state.result.status !== 'available'" class="font-ui-sans px-3 py-3 text-[12px] text-[var(--text-muted)]">{{ t("ide.knowledge.evolution.diffUnavailable") }}</p>
                        <!-- 确定高度给包裹层：SharedDiffEditor 自带的 height:100% 特异性高于工具类，
                             直接在它身上写 h-[320px] 会被压掉，父层又没高度，最终塌成 0。
                             与收件箱差异区的用法一致：包裹层定高，编辑器用 flex-1 填满。 -->
                        <div
                            v-else-if="state.result?.status === 'available'"
                            class="flex h-[320px] min-h-0 flex-col"
                            data-role="ide-knowledge-evolution-diff-viewport"
                        >
                            <SharedDiffEditor
                                class="min-h-0 flex-1"
                                :model-key="`evolution:${String(props.entryPath)}:${String(row.entryId)}`"
                                :original-content="state.result.original"
                                :modified-content="state.result.modified"
                                :original-label="t('ide.knowledge.evolution.diffBefore')"
                                :modified-label="t('ide.knowledge.evolution.diffAfter')"
                                :theme="props.theme"
                            />
                        </div>
                    </template>
                </div>
            </li>
        </ol>
    </section>
</template>
