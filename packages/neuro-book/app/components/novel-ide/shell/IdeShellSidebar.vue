<script setup lang="ts">
import NovelIdeAccountMenu from "nbook/app/components/novel-ide/NovelIdeAccountMenu.vue";
import Tooltip from "nbook/app/components/common/Tooltip.vue";
import {useResizablePanel} from "nbook/app/composables/useResizablePanel";
import {useNovelIdeStore} from "nbook/app/stores/novel-ide";
import {groupSessionsByRecency, type IdeRailEntryId} from "nbook/app/utils/ide-shell-layout";
import type {AuthUserDto} from "nbook/shared/dto/auth.dto";
import type {AgentSessionSummaryDto} from "nbook/shared/dto/agent-session.dto";

type SidebarProjectItem = Readonly<{
    label: string;
    value: string;
    active: boolean;
}>;

const props = defineProps<{
    activeEntry: IdeRailEntryId;
    lorebookOpen: boolean;
    outlineOpen: boolean;
    currentUser: AuthUserDto | null;
    /** 顶部品牌位：当前 Project 或工作区名。 */
    workspaceTitle: string;
    projects: readonly SidebarProjectItem[];
    /** 当前 Project 是否是一个真实作品（user-assets 时为 false）。 */
    projectScope: boolean;
    sessions: AgentSessionSummaryDto[];
    activeSessionId: number | null;
    sessionLoading: boolean;
    sessionRunning: boolean;
    sessionActionId: number | null;
    width: number;
}>();

const emit = defineEmits<{
    (event: "select-entry", value: IdeRailEntryId): void;
    (event: "start-interview"): void;
    (event: "select-project", value: string): void;
    (event: "select-session", value: number): void;
    (event: "create-session"): void;
    (event: "rename-session", session: AgentSessionSummaryDto): void;
    (event: "archive-session", session: AgentSessionSummaryDto): void;
    (event: "toggle-lorebook"): void;
    (event: "toggle-outline"): void;
    (event: "update:width", value: number): void;
    (event: "open-profile"): void;
    (event: "open-admin"): void;
    (event: "logout"): void;
}>();

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 260;

const {t} = useI18n();
const store = useNovelIdeStore();
const resizeHandleRef = ref<HTMLElement | null>(null);
const searchQuery = ref("");

const {isResizing, panelStyle} = useResizablePanel(resizeHandleRef, {
    size: computed(() => props.width),
    minSize: MIN_SIDEBAR_WIDTH,
    maxSize: MAX_SIDEBAR_WIDTH,
    edge: "right",
    enabled: true,
    onResizeEnd: (width) => emit("update:width", width),
});

/** 一级导航（图标 + 文字）。 */
const primaryEntries = computed<Array<{id: IdeRailEntryId; icon: string; label: string}>>(() => [
    {id: "chat", icon: "i-lucide-message-square", label: t("ide.rail.chat")},
    {id: "write", icon: "i-lucide-square-pen", label: t("ide.rail.write")},
    {id: "outline", icon: "i-lucide-list-tree", label: t("ide.rail.outline")},
    {id: "lorebook", icon: "i-lucide-book-open-text", label: t("ide.rail.lorebook")},
]);

/** 「最近」区可先搜索，再取前若干条，避免长列表把左栏撑满。 */
const matchedSessions = computed(() => {
    const keyword = searchQuery.value.trim().toLowerCase();
    const sorted = [...props.sessions].sort((left, right) => right.updatedAt - left.updatedAt);
    const matched = keyword
        ? sorted.filter((session) => sessionTitle(session).toLowerCase().includes(keyword)
            || sessionPreview(session).toLowerCase().includes(keyword)
            || String(session.sessionId).includes(keyword))
        : sorted;
    return matched.slice(0, 12);
});

const searching = computed(() => searchQuery.value.trim() !== "");

type SidebarSessionRow =
    | {kind: "header"; id: string}
    | {kind: "session"; session: AgentSessionSummaryDto};

/**
 * 渲染行模型：搜索态扁平展示结果；平时按「今天/昨天/近 7 天/更早」分组，
 * 单本书会话多了以后不至于一长串平铺。
 */
const sessionRows = computed<SidebarSessionRow[]>(() => {
    if (searching.value) {
        return matchedSessions.value.map((session) => ({kind: "session", session}));
    }
    return groupSessionsByRecency(matchedSessions.value, Date.now()).flatMap((group): SidebarSessionRow[] => [
        {kind: "header", id: group.id},
        ...group.sessions.map((session): SidebarSessionRow => ({kind: "session", session})),
    ]);
});

/** 返回 session 展示标题。 */
function sessionTitle(session: AgentSessionSummaryDto): string {
    return session.title || t("agent.session.unnamed");
}

/** 返回 session 预览文本。 */
function sessionPreview(session: AgentSessionSummaryDto): string {
    return session.summary || session.lastMessagePreview || t("agent.session.noRecentMessages");
}

/** 运行中或等待输入的会话不可归档（与旧侧栏 AgentModeSessionSidebar 同一规则）。 */
function canArchiveSession(session: AgentSessionSummaryDto): boolean {
    return session.status !== "running" && session.status !== "waiting";
}

/** 状态点：只表达「在跑 / 等输入 / 其它」。 */
function sessionDotClass(session: AgentSessionSummaryDto): string {
    switch (session.status) {
        case "running": return "bg-[var(--status-info)]";
        case "waiting": return "bg-[var(--status-warning)]";
        case "interrupted": return "bg-[var(--status-danger)]";
        default: return "bg-[var(--text-muted)]/50";
    }
}

</script>

<template>
    <!-- 左栏：品牌位 + 一级导航 + 项目列表 + 最近会话 + 底部用户/设置 -->
    <aside
        class="ide-shell-sidebar relative z-20 flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--border-color)] bg-[var(--bg-sidebar)]"
        :class="isResizing ? 'select-none' : ''"
        :style="panelStyle"
        data-role="ide-shell-sidebar"
        aria-label="Inkwell navigation"
    >
        <div ref="resizeHandleRef" class="group absolute -right-1 top-0 z-30 h-full w-2 cursor-col-resize">
            <div class="ml-0.5 h-full w-[2px] bg-[var(--accent-main)] opacity-0 transition-all duration-150 group-hover:opacity-100" :class="isResizing ? 'opacity-100 shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-main)_28%,transparent)]' : ''"></div>
        </div>

        <!-- 品牌 / 当前作品位 -->
        <header class="flex shrink-0 items-center gap-2 px-4 pb-3 pt-4">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-bg)] text-[var(--accent-text)]">
                <span class="i-lucide-feather h-4 w-4"></span>
            </span>
            <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-main)]" :title="workspaceTitle">{{ workspaceTitle }}</span>
        </header>

        <!-- 一级导航 -->
        <nav class="flex shrink-0 flex-col gap-0.5 px-2.5" aria-label="Primary">
            <button
                v-for="entry in primaryEntries"
                :key="entry.id"
                type="button"
                class="flex h-9 w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 text-left text-[13px] transition-colors"
                :class="activeEntry === entry.id ? 'bg-[var(--bg-hover)] font-medium text-[var(--text-main)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                :aria-pressed="activeEntry === entry.id"
                :data-rail-entry="entry.id"
                @click="emit('select-entry', entry.id)"
            >
                <span :class="entry.icon" class="h-4 w-4 shrink-0" :style="activeEntry === entry.id ? {color: 'var(--accent-text)'} : undefined"></span>
                <span class="min-w-0 flex-1 truncate">{{ entry.label }}</span>
                <span v-if="(entry.id === 'lorebook' && lorebookOpen) || (entry.id === 'outline' && outlineOpen)" class="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-main)]" :data-rail-drawer-open="entry.id"></span>
            </button>

            <button
                type="button"
                class="flex h-9 w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                data-rail-entry="new-interview"
                @click="emit('start-interview')"
            >
                <span class="i-lucide-plus h-4 w-4 shrink-0"></span>
                <span class="min-w-0 flex-1 truncate">{{ t("ide.rail.newInterview") }}</span>
            </button>
        </nav>

        <!-- 滚动区：项目 + 最近 -->
        <div class="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 custom-scrollbar">
            <section v-if="projectScope" class="shrink-0">
                <h2 class="font-ui-sans px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{{ t("ide.rail.projectsGroup") }}</h2>
                <button
                    v-for="project in projects"
                    :key="project.value"
                    type="button"
                    class="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] transition-colors"
                    :class="project.active ? 'bg-[var(--bg-hover)] font-medium text-[var(--text-main)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                    :data-project-root="project.value"
                    @click="emit('select-project', project.value)"
                >
                    <span class="i-lucide-book-marked h-3.5 w-3.5 shrink-0"></span>
                    <span class="min-w-0 flex-1 truncate">{{ project.label }}</span>
                </button>
            </section>

            <section class="mt-4 flex min-h-0 flex-1 flex-col">
                <h2 class="font-ui-sans px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{{ t("ide.rail.recentGroup") }}</h2>

                <div class="mb-1 flex h-8 items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5">
                    <span class="i-lucide-search h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"></span>
                    <input v-model="searchQuery" type="text" :placeholder="t('ide.rail.searchSessions')" class="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]">
                </div>

                <template v-for="row in sessionRows" :key="row.kind === 'header' ? row.id : row.session.sessionId">
                    <h3 v-if="row.kind === 'header'" class="font-ui-sans px-2.5 pb-0.5 pt-2 text-[10px] font-medium text-[var(--text-muted)]">
                        {{ t("ide.rail.sessionGroup_" + row.id) }}
                    </h3>
                    <div
                        v-else
                        class="group flex h-8 w-full items-center rounded-md transition-colors"
                        :class="row.session.sessionId === activeSessionId ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'"
                    >
                        <button
                            type="button"
                            class="flex h-full min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-[12px]"
                            :class="row.session.sessionId === activeSessionId ? 'font-medium text-[var(--text-main)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'"
                            :data-session-id="row.session.sessionId"
                            :title="sessionTitle(row.session)"
                            @click="emit('select-session', row.session.sessionId)"
                        >
                            <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="sessionDotClass(row.session)"></span>
                            <span class="min-w-0 flex-1 truncate">{{ sessionTitle(row.session) }}</span>
                        </button>
                        <span class="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <button
                                type="button"
                                class="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--accent-text)] disabled:opacity-40"
                                :title="t('agent.session.rename')"
                                :disabled="sessionLoading || sessionActionId === row.session.sessionId"
                                :data-session-action="'rename-' + row.session.sessionId"
                                @click.stop="emit('rename-session', row.session)"
                            >
                                <span class="i-lucide-pencil-line h-3 w-3"></span>
                            </button>
                            <button
                                type="button"
                                class="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger)] disabled:opacity-40"
                                :title="t('agent.session.archive')"
                                :disabled="sessionLoading || sessionActionId === row.session.sessionId || !canArchiveSession(row.session)"
                                :data-session-action="'archive-' + row.session.sessionId"
                                @click.stop="emit('archive-session', row.session)"
                            >
                                <span v-if="sessionActionId === row.session.sessionId" class="i-lucide-loader-circle h-3 w-3 animate-spin"></span>
                                <span v-else class="i-lucide-archive h-3 w-3"></span>
                            </button>
                        </span>
                    </div>
                </template>

                <button
                    type="button"
                    class="mt-0.5 flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:opacity-40"
                    data-rail-entry="new-session"
                    :disabled="sessionLoading || Boolean(sessionActionId)"
                    @click="emit('create-session')"
                >
                    <span class="i-lucide-plus h-3.5 w-3.5 shrink-0"></span>
                    <span class="min-w-0 flex-1 truncate">{{ t("ide.rail.newSession") }}</span>
                </button>

                <p v-if="sessionRows.length === 0" class="px-2.5 py-2 text-[11px] text-[var(--text-muted)]">{{ t("ide.rail.noSessions") }}</p>
            </section>
        </div>

        <!-- 底部：用户 + 设置一步达 -->
        <footer class="flex shrink-0 items-center gap-1 border-t border-[var(--border-color)] px-2.5 py-2">
            <NovelIdeAccountMenu
                variant="row"
                :current-user="currentUser"
                root-class="relative w-full"
                menu-class="left-0 bottom-full mb-2 w-52"
                @open-profile="emit('open-profile')"
                @open-admin="emit('open-admin')"
                @logout="emit('logout')"
            />
            <Tooltip :text="t('ide.rail.settings')" placement="right">
                <button
                    type="button"
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
                    :aria-pressed="activeEntry === 'settings'"
                    data-rail-entry="settings"
                    @click="emit('select-entry', 'settings')"
                >
                    <span class="i-lucide-settings h-4 w-4"></span>
                </button>
            </Tooltip>
        </footer>
    </aside>
</template>
