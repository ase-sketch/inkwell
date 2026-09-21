<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from "vue";
import {storeToRefs} from "pinia";
import Dialog from "nbook/app/components/common/Dialog.vue";
import {useNotification} from "nbook/app/composables/useNotification";
import {useNovelIdeStore} from "nbook/app/stores/novel-ide";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import type {
    ProjectRagEventDto,
    ProjectRagEventWriteRequestDto,
    ProjectRagMemoryDto,
    ProjectRagMemoryWriteRequestDto,
    ProjectRagOverviewDto,
    ProjectRagRebuildResultDto,
    ProjectRagSearchResultDto,
    ProjectRagSourceStatusDto,
    ProjectRagSubjectDto,
    ProjectRagSubjectSummaryDto,
} from "nbook/shared/dto/project-rag.dto";

type RagTab = "events" | "memory" | "search";
type EventEditorMode = "create" | "edit";
type MemoryEditorMode = "create" | "edit";

const novelIdeStore = useNovelIdeStore();
const {currentProjectRoot} = storeToRefs(novelIdeStore);
const notification = useNotification();

const overview = ref<ProjectRagOverviewDto | null>(null);
const selectedSubjectPath = ref("");
const subjectDetail = ref<ProjectRagSubjectDto | null>(null);
const activeTab = ref<RagTab>("events");
const loadingOverview = ref(false);
const loadingSubject = ref(false);
const actionBusy = ref(false);
const error = ref("");
const searchQuery = ref("");
const searching = ref(false);
const searchError = ref("");
const searchResult = ref<ProjectRagSearchResultDto | null>(null);
const eventDialogOpen = ref(false);
const eventEditorMode = ref<EventEditorMode>("create");
const eventEditIndex = ref<number | null>(null);
const eventForm = reactive({
    tick: "",
    time: "",
    text: "",
});
const memoryDialogOpen = ref(false);
const memoryEditorMode = ref<MemoryEditorMode>("create");
const memoryEditTopic = ref<string | null>(null);
const memoryForm = reactive({
    topic: "",
    aliases: "",
    view: "",
});
const deleteConfirmOpen = ref(false);
const deleteTarget = ref<{kind: "event"; index: number; label: string} | {kind: "memory"; topic: string; label: string} | null>(null);

const subjects = computed(() => overview.value?.subjects ?? []);
const selectedSubject = computed(() => subjects.value.find((subject) => subject.subjectPath === selectedSubjectPath.value) ?? null);
const selectedSubjectHasEventError = computed(() => subjectDetail.value?.errors.some((item) => item.source === "events") ?? false);
const selectedSubjectHasMemoryError = computed(() => subjectDetail.value?.errors.some((item) => item.source === "memory") ?? false);
const totalEvents = computed(() => subjects.value.reduce((sum, subject) => sum + subject.eventCount, 0));
const totalMemories = computed(() => subjects.value.reduce((sum, subject) => sum + subject.memoryCount, 0));
const currentStatusLabel = computed(() => formatSourceStatus(subjectDetail.value?.sourceStatuses));

/**
 * RAG API 的 Project query。
 */
function projectQuery(): {projectRoot: string} {
    if (!currentProjectRoot.value) {
        throw new Error("当前没有 Project Workspace");
    }
    return {projectRoot: currentProjectRoot.value};
}

/**
 * 读取当前 Project 的 RAG 概览。
 */
async function loadOverview(): Promise<void> {
    if (!currentProjectRoot.value) {
        overview.value = null;
        selectedSubjectPath.value = "";
        subjectDetail.value = null;
        searchResult.value = null;
        searchError.value = "";
        return;
    }
    loadingOverview.value = true;
    error.value = "";
    try {
        const next = await $fetch<ProjectRagOverviewDto>("/api/projects/rag/overview", {
            query: projectQuery(),
        });
        overview.value = next;
        error.value = "";
        if (!next.subjects.some((subject) => subject.subjectPath === selectedSubjectPath.value)) {
            selectedSubjectPath.value = next.subjects.find((subject) => subject.errors.length === 0)?.subjectPath ?? next.subjects[0]?.subjectPath ?? "";
        }
        if (selectedSubjectPath.value) {
            await loadSubject(selectedSubjectPath.value);
        } else {
            subjectDetail.value = null;
            searchResult.value = null;
            searchError.value = "";
        }
    } catch (loadError) {
        overview.value = null;
        selectedSubjectPath.value = "";
        subjectDetail.value = null;
        searchResult.value = null;
        searchError.value = "";
        error.value = resolveApiErrorMessage(loadError, "读取 RAG 概览失败");
    } finally {
        loadingOverview.value = false;
    }
}

/**
 * 读取选中 subject 的 events / memory。
 */
async function loadSubject(subjectPath: string): Promise<void> {
    if (!subjectPath || !currentProjectRoot.value) {
        subjectDetail.value = null;
        searchResult.value = null;
        searchError.value = "";
        return;
    }
    loadingSubject.value = true;
    subjectDetail.value = null;
    searchResult.value = null;
    searchError.value = "";
    try {
        subjectDetail.value = await $fetch<ProjectRagSubjectDto>("/api/projects/rag/subject", {
            query: {
                ...projectQuery(),
                subjectPath,
            },
        });
        error.value = "";
    } catch (loadError) {
        subjectDetail.value = null;
        searchResult.value = null;
        searchError.value = "";
        error.value = resolveApiErrorMessage(loadError, "读取 subject RAG 数据失败");
    } finally {
        loadingSubject.value = false;
    }
}

function selectSubject(subjectPath: string): void {
    if (selectedSubjectPath.value === subjectPath) {
        return;
    }
    selectedSubjectPath.value = subjectPath;
    searchResult.value = null;
    searchError.value = "";
    void loadSubject(subjectPath);
}

function openCreateEvent(): void {
    eventEditorMode.value = "create";
    eventEditIndex.value = null;
    eventForm.tick = "";
    eventForm.time = "";
    eventForm.text = "";
    eventDialogOpen.value = true;
}

function openEditEvent(event: ProjectRagEventDto, index: number): void {
    eventEditorMode.value = "edit";
    eventEditIndex.value = index;
    eventForm.tick = event.tick ?? "";
    eventForm.time = event.time ?? "";
    eventForm.text = event.text;
    eventDialogOpen.value = true;
}

function toEventPayload(): ProjectRagEventWriteRequestDto {
    return {
        subjectPath: selectedSubjectPath.value,
        ...(eventEditorMode.value === "edit" && eventEditIndex.value !== null ? {index: eventEditIndex.value} : {}),
        event: {
            ...(eventForm.tick.trim() ? {tick: eventForm.tick.trim()} : {}),
            ...(eventForm.time.trim() ? {time: eventForm.time.trim()} : {}),
            text: eventForm.text.trim(),
        },
    };
}

async function saveEvent(): Promise<void> {
    if (!eventForm.text.trim()) {
        notification.error("event text 不能为空");
        return;
    }
    actionBusy.value = true;
    try {
        subjectDetail.value = await $fetch<ProjectRagSubjectDto>("/api/projects/rag/events", {
            method: eventEditorMode.value === "create" ? "POST" : "PATCH",
            query: projectQuery(),
            body: toEventPayload(),
        });
        eventDialogOpen.value = false;
        await loadOverview();
        notification.success("event 已保存，索引已标记待更新。");
    } catch (saveError) {
        notification.error(resolveApiErrorMessage(saveError, "保存 event 失败"));
    } finally {
        actionBusy.value = false;
    }
}

async function reorderEvent(index: number, direction: -1 | 1): Promise<void> {
    const toIndex = index + direction;
    if (!subjectDetail.value || toIndex < 0 || toIndex >= subjectDetail.value.events.length) {
        return;
    }
    actionBusy.value = true;
    try {
        subjectDetail.value = await $fetch<ProjectRagSubjectDto>("/api/projects/rag/events/reorder", {
            method: "POST",
            query: projectQuery(),
            body: {
                subjectPath: selectedSubjectPath.value,
                fromIndex: index,
                toIndex,
            },
        });
        await loadOverview();
    } catch (reorderError) {
        notification.error(resolveApiErrorMessage(reorderError, "重排 event 失败"));
    } finally {
        actionBusy.value = false;
    }
}

function openCreateMemory(): void {
    memoryEditorMode.value = "create";
    memoryEditTopic.value = null;
    memoryForm.topic = "";
    memoryForm.aliases = "";
    memoryForm.view = "";
    memoryDialogOpen.value = true;
}

function openEditMemory(memory: ProjectRagMemoryDto): void {
    memoryEditorMode.value = "edit";
    memoryEditTopic.value = memory.topic;
    memoryForm.topic = memory.topic;
    memoryForm.aliases = (memory.aliases ?? []).join(", ");
    memoryForm.view = memory.view;
    memoryDialogOpen.value = true;
}

function toMemoryPayload(): ProjectRagMemoryWriteRequestDto {
    const aliases = memoryForm.aliases
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return {
        subjectPath: selectedSubjectPath.value,
        ...(memoryEditorMode.value === "edit" && memoryEditTopic.value ? {topic: memoryEditTopic.value} : {}),
        memory: {
            topic: memoryForm.topic.trim(),
            ...(aliases.length ? {aliases} : {}),
            view: memoryForm.view.trim(),
        },
    };
}

async function saveMemory(): Promise<void> {
    if (!memoryForm.topic.trim() || !memoryForm.view.trim()) {
        notification.error("topic 和 view 不能为空");
        return;
    }
    actionBusy.value = true;
    try {
        subjectDetail.value = await $fetch<ProjectRagSubjectDto>("/api/projects/rag/memories", {
            method: memoryEditorMode.value === "create" ? "POST" : "PATCH",
            query: projectQuery(),
            body: toMemoryPayload(),
        });
        memoryDialogOpen.value = false;
        await loadOverview();
        notification.success("memory 已保存，索引已标记待更新。");
    } catch (saveError) {
        notification.error(resolveApiErrorMessage(saveError, "保存 memory 失败"));
    } finally {
        actionBusy.value = false;
    }
}

function queueDeleteEvent(event: ProjectRagEventDto, index: number): void {
    deleteTarget.value = {
        kind: "event",
        index,
        label: event.time || event.tick || event.text.slice(0, 28),
    };
    deleteConfirmOpen.value = true;
}

function queueDeleteMemory(memory: ProjectRagMemoryDto): void {
    deleteTarget.value = {
        kind: "memory",
        topic: memory.topic,
        label: memory.topic,
    };
    deleteConfirmOpen.value = true;
}

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value;
    if (!target) {
        return;
    }
    actionBusy.value = true;
    try {
        subjectDetail.value = await $fetch<ProjectRagSubjectDto>(target.kind === "event" ? "/api/projects/rag/events" : "/api/projects/rag/memories", {
            method: "DELETE",
            query: projectQuery(),
            body: target.kind === "event"
                ? {subjectPath: selectedSubjectPath.value, index: target.index}
                : {subjectPath: selectedSubjectPath.value, topic: target.topic},
        });
        deleteConfirmOpen.value = false;
        deleteTarget.value = null;
        await loadOverview();
        notification.success("已删除，索引已标记待更新。");
    } catch (deleteError) {
        notification.error(resolveApiErrorMessage(deleteError, "删除失败"));
    } finally {
        actionBusy.value = false;
    }
}

async function searchRag(): Promise<void> {
    if (!searchQuery.value.trim() || !selectedSubjectPath.value) {
        return;
    }
    searching.value = true;
    searchError.value = "";
    try {
        searchResult.value = await $fetch<ProjectRagSearchResultDto>("/api/projects/rag/search", {
            method: "POST",
            query: projectQuery(),
            body: {
                subjectPath: selectedSubjectPath.value,
                query: searchQuery.value.trim(),
                limit: 10,
            },
        });
    } catch (searchFailure) {
        searchResult.value = null;
        searchError.value = resolveApiErrorMessage(searchFailure, "RAG 搜索失败");
    } finally {
        searching.value = false;
    }
}

async function rebuildRag(scope: "subject" | "project"): Promise<void> {
    actionBusy.value = true;
    try {
        const result = await $fetch<ProjectRagRebuildResultDto>("/api/projects/rag/rebuild", {
            method: "POST",
            query: projectQuery(),
            body: scope === "subject" ? {subjectPath: selectedSubjectPath.value} : {},
        });
        await loadOverview();
        if (selectedSubjectPath.value) {
            await loadSubject(selectedSubjectPath.value);
        }
        if (result.skippedSubjects) {
            notification.warning(formatRebuildWarning(result));
            return;
        }
        notification.success(scope === "subject" ? "当前 subject 索引已重建。" : "当前 Project 索引已重建。");
    } catch (rebuildError) {
        notification.error(resolveApiErrorMessage(rebuildError, "重建索引失败"));
    } finally {
        actionBusy.value = false;
    }
}

function formatRebuildWarning(result: ProjectRagRebuildResultDto): string {
    const failures = result.results.filter((item) => !item.ok);
    const shownFailures = failures.slice(0, 3).map((item) => `${item.subjectPath}: ${item.message ?? "未知错误"}`);
    const moreFailures = failures.length > shownFailures.length ? `，另有 ${failures.length - shownFailures.length} 个失败` : "";
    const failureSummary = shownFailures.length ? `失败原因：${shownFailures.join("；")}${moreFailures}。` : "";
    return `已重建 ${result.rebuiltSubjects} 个 subject，跳过 ${result.skippedSubjects} 个。${failureSummary}`;
}

function formatSourceStatus(statuses: ProjectRagSourceStatusDto[] | undefined): string {
    if (!statuses?.length) {
        return "未知";
    }
    if (statuses.some((status) => status.status === "error")) {
        return "索引失败";
    }
    if (statuses.some((status) => status.status === "dirty")) {
        return "有修改待索引";
    }
    if (statuses.every((status) => status.status === "synced")) {
        return "已同步";
    }
    return "未索引";
}

function sourceStatusClass(statuses: ProjectRagSourceStatusDto[] | undefined): string {
    const label = formatSourceStatus(statuses);
    if (label === "已同步") return "text-[var(--status-success)]";
    if (label === "有修改待索引") return "text-[var(--status-warning)]";
    if (label === "索引失败") return "text-[var(--status-danger)]";
    return "text-[var(--text-muted)]";
}

function subjectStatusLabel(subject: ProjectRagSubjectSummaryDto): string {
    if (subject.errors.length) {
        return "JSONL 错误";
    }
    return formatSourceStatus(subject.sourceStatuses);
}

watch(currentProjectRoot, () => {
    searchResult.value = null;
    searchError.value = "";
    void loadOverview();
});

onMounted(() => {
    void loadOverview();
});
</script>

<template>
    <div class="flex h-full min-h-0 bg-[var(--bg-panel)] text-[var(--text-main)]">
        <!-- Subject 列表 -->
        <div class="flex w-[42%] min-w-[150px] max-w-[240px] shrink-0 flex-col border-r border-[var(--border-color)]">
            <div class="border-b border-[var(--border-color)] p-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="text-[11px] font-semibold uppercase text-[var(--text-secondary)]">Subjects</div>
                    <button type="button" class="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]" title="刷新" :disabled="loadingOverview" @click="void loadOverview()">
                        <span :class="loadingOverview ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-refresh-cw'" class="h-3.5 w-3.5"></span>
                    </button>
                </div>
                <div class="mt-2 grid grid-cols-2 gap-1 text-[11px] text-[var(--text-muted)]">
                    <div>{{ subjects.length }} subjects</div>
                    <div>{{ totalEvents }} events</div>
                    <div>{{ totalMemories }} memory</div>
                    <div :class="sourceStatusClass(selectedSubject?.sourceStatuses)">{{ selectedSubject ? subjectStatusLabel(selectedSubject) : "无选中" }}</div>
                </div>
            </div>

            <div v-if="error" class="border-b border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-2 text-[11px] text-[var(--status-danger)]">{{ error }}</div>

            <div class="min-h-0 flex-1 overflow-auto p-2">
                <div v-if="!currentProjectRoot" class="py-8 text-center text-[12px] text-[var(--text-muted)]">当前没有 Project Workspace。</div>
                <div v-else-if="!loadingOverview && subjects.length === 0" class="py-8 text-center text-[12px] text-[var(--text-muted)]">当前 Project 暂无 subject RAG 数据。</div>
                <button
                    v-for="subject in subjects"
                    :key="subject.subjectPath"
                    type="button"
                    class="mb-1 w-full rounded-md border p-2 text-left transition-colors"
                    :class="selectedSubjectPath === subject.subjectPath ? 'border-[var(--accent-main)] bg-[var(--accent-bg)]' : 'border-transparent hover:bg-[var(--bg-hover)]'"
                    @click="selectSubject(subject.subjectPath)"
                >
                    <div class="truncate text-[12px] font-medium text-[var(--text-main)]">{{ subject.subjectId }}</div>
                    <div class="mt-1 flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
                        <span>{{ subject.eventCount }}E / {{ subject.memoryCount }}M</span>
                        <span :class="sourceStatusClass(subject.sourceStatuses)">{{ subjectStatusLabel(subject) }}</span>
                    </div>
                </button>
            </div>
        </div>

        <!-- Subject 详情 -->
        <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-color)] px-3 py-2">
                <div class="min-w-0">
                    <div class="truncate text-[12px] font-semibold">{{ selectedSubject?.subjectId ?? "RAG" }}</div>
                    <div class="truncate text-[10px] text-[var(--text-muted)]">{{ selectedSubjectPath || "请选择 subject" }}</div>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                    <button type="button" class="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:opacity-50" title="重建当前 subject 索引" :disabled="!selectedSubjectPath || actionBusy" @click="void rebuildRag('subject')">
                        <span :class="actionBusy ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-refresh-cw'" class="h-3.5 w-3.5"></span>
                    </button>
                    <button type="button" class="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] disabled:opacity-50" title="重建当前 Project 索引" :disabled="subjects.length === 0 || actionBusy" @click="void rebuildRag('project')">
                        <span class="i-lucide-database-backup h-3.5 w-3.5"></span>
                    </button>
                </div>
            </div>

            <div class="flex shrink-0 border-b border-[var(--border-color)] px-2 pt-2">
                <button type="button" class="px-3 py-1.5 text-[12px]" :class="activeTab === 'events' ? 'border-b-2 border-[var(--accent-main)] text-[var(--text-main)]' : 'text-[var(--text-muted)]'" @click="activeTab = 'events'">Events</button>
                <button type="button" class="px-3 py-1.5 text-[12px]" :class="activeTab === 'memory' ? 'border-b-2 border-[var(--accent-main)] text-[var(--text-main)]' : 'text-[var(--text-muted)]'" @click="activeTab = 'memory'">Memory</button>
                <button type="button" class="px-3 py-1.5 text-[12px]" :class="activeTab === 'search' ? 'border-b-2 border-[var(--accent-main)] text-[var(--text-main)]' : 'text-[var(--text-muted)]'" @click="activeTab = 'search'">Search</button>
            </div>

            <div v-if="subjectDetail?.errors.length" class="border-b border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-[11px] text-[var(--status-danger)]">
                <div v-for="item in subjectDetail.errors" :key="`${item.source}:${item.message}`">{{ item.source }}: {{ item.message }}</div>
            </div>

            <div class="min-h-0 flex-1 overflow-auto p-3">
                <div v-if="!currentProjectRoot" class="py-8 text-center text-[12px] text-[var(--text-muted)]">当前没有 Project Workspace。</div>

                <div v-else-if="loadingSubject" class="py-8 text-center text-[12px] text-[var(--text-muted)]">正在加载 RAG 数据...</div>

                <template v-else-if="subjectDetail && activeTab === 'events'">
                    <div class="mb-3 flex items-center justify-between gap-2">
                        <div class="text-[11px]" :class="sourceStatusClass(subjectDetail.sourceStatuses)">{{ currentStatusLabel }}</div>
                        <button type="button" class="rounded-md border border-[var(--border-color)] px-2 py-1 text-[11px] hover:bg-[var(--bg-hover)] disabled:opacity-50" :disabled="selectedSubjectHasEventError" @click="openCreateEvent">
                            <span class="i-lucide-plus mr-1 inline-block h-3 w-3 align-[-2px]"></span>Event
                        </button>
                    </div>
                    <div v-if="subjectDetail.events.length === 0" class="py-8 text-center text-[12px] text-[var(--text-muted)]">暂无 events。</div>
                    <div v-for="(event, index) in subjectDetail.events" :key="`${event.line}:${event.text}`" class="mb-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] p-2">
                        <div class="mb-1 flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
                            <span>#{{ event.line }} {{ event.time || event.tick || "" }}</span>
                            <span class="flex items-center gap-1">
                                <button type="button" class="rounded p-1 hover:bg-[var(--bg-hover)] disabled:opacity-40" title="上移" :disabled="index === 0 || selectedSubjectHasEventError" @click="void reorderEvent(index, -1)"><span class="i-lucide-arrow-up h-3 w-3"></span></button>
                                <button type="button" class="rounded p-1 hover:bg-[var(--bg-hover)] disabled:opacity-40" title="下移" :disabled="index === subjectDetail.events.length - 1 || selectedSubjectHasEventError" @click="void reorderEvent(index, 1)"><span class="i-lucide-arrow-down h-3 w-3"></span></button>
                                <button type="button" class="rounded p-1 hover:bg-[var(--bg-hover)]" title="编辑" :disabled="selectedSubjectHasEventError" @click="openEditEvent(event, index)"><span class="i-lucide-pencil h-3 w-3"></span></button>
                                <button type="button" class="rounded p-1 text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]" title="删除" :disabled="selectedSubjectHasEventError" @click="queueDeleteEvent(event, index)"><span class="i-lucide-trash-2 h-3 w-3"></span></button>
                            </span>
                        </div>
                        <div class="whitespace-pre-wrap text-[12px] leading-5">{{ event.text }}</div>
                    </div>
                </template>

                <template v-else-if="subjectDetail && activeTab === 'memory'">
                    <div class="mb-3 flex items-center justify-between gap-2">
                        <div class="text-[11px]" :class="sourceStatusClass(subjectDetail.sourceStatuses)">{{ currentStatusLabel }}</div>
                        <button type="button" class="rounded-md border border-[var(--border-color)] px-2 py-1 text-[11px] hover:bg-[var(--bg-hover)] disabled:opacity-50" :disabled="selectedSubjectHasMemoryError" @click="openCreateMemory">
                            <span class="i-lucide-plus mr-1 inline-block h-3 w-3 align-[-2px]"></span>Memory
                        </button>
                    </div>
                    <div v-if="subjectDetail.memories.length === 0" class="py-8 text-center text-[12px] text-[var(--text-muted)]">暂无 memory。</div>
                    <div v-for="memory in subjectDetail.memories" :key="memory.topic" class="mb-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] p-2">
                        <div class="mb-1 flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <div class="truncate text-[12px] font-semibold">{{ memory.topic }}</div>
                                <div v-if="memory.aliases?.length" class="mt-1 flex flex-wrap gap-1">
                                    <span v-for="alias in memory.aliases" :key="alias" class="rounded-sm bg-[var(--bg-panel)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{{ alias }}</span>
                                </div>
                            </div>
                            <div class="flex shrink-0 items-center gap-1 text-[var(--text-muted)]">
                                <button type="button" class="rounded p-1 hover:bg-[var(--bg-hover)]" title="编辑" :disabled="selectedSubjectHasMemoryError" @click="openEditMemory(memory)"><span class="i-lucide-pencil h-3 w-3"></span></button>
                                <button type="button" class="rounded p-1 text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]" title="删除" :disabled="selectedSubjectHasMemoryError" @click="queueDeleteMemory(memory)"><span class="i-lucide-trash-2 h-3 w-3"></span></button>
                            </div>
                        </div>
                        <div class="whitespace-pre-wrap text-[12px] leading-5">{{ memory.view }}</div>
                    </div>
                </template>

                <template v-else-if="subjectDetail && activeTab === 'search'">
                    <div class="mb-3 flex gap-2">
                        <input v-model="searchQuery" class="min-w-0 flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--accent-main)]" placeholder="输入 RAG query" @keydown.enter="void searchRag()">
                        <button type="button" class="rounded-md border border-[var(--border-color)] px-2 py-1.5 text-[11px] hover:bg-[var(--bg-hover)] disabled:opacity-50" :disabled="searching || !searchQuery.trim()" @click="void searchRag()">
                            <span :class="searching ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-search'" class="mr-1 inline-block h-3 w-3 align-[-2px]"></span>Search
                        </button>
                    </div>
                    <div v-if="searchError" class="mb-3 rounded-md border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-2 text-[11px] text-[var(--status-danger)]">{{ searchError }}</div>
                    <div v-if="searchResult && searchResult.candidates.length === 0" class="py-8 text-center text-[12px] text-[var(--text-muted)]">没有召回候选。</div>
                    <div v-for="candidate in searchResult?.candidates ?? []" :key="`${candidate.rank}:${candidate.source}:${candidate.text}`" class="mb-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] p-2">
                        <div class="mb-1 text-[10px] text-[var(--text-muted)]">
                            #{{ candidate.rank }} {{ candidate.source }}
                            <span v-if="candidate.topic"> · {{ candidate.topic }}</span>
                            <span v-if="candidate.time"> · {{ candidate.time }}</span>
                            <span v-else-if="candidate.tick"> · {{ candidate.tick }}</span>
                        </div>
                        <div class="whitespace-pre-wrap text-[12px] leading-5">{{ candidate.text }}</div>
                    </div>
                </template>
            </div>
        </div>

        <Dialog v-model="eventDialogOpen" :title="eventEditorMode === 'create' ? '新增 Event' : '编辑 Event'" width="460px" show-cancel :busy="actionBusy" @confirm="saveEvent">
            <div class="space-y-3">
                <input v-model="eventForm.tick" class="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-sm" placeholder="tick">
                <input v-model="eventForm.time" class="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-sm" placeholder="time">
                <textarea v-model="eventForm.text" class="min-h-28 w-full resize-y rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-sm" placeholder="text"></textarea>
            </div>
        </Dialog>

        <Dialog v-model="memoryDialogOpen" :title="memoryEditorMode === 'create' ? '新增 Memory' : '编辑 Memory'" width="520px" show-cancel :busy="actionBusy" @confirm="saveMemory">
            <div class="space-y-3">
                <input v-model="memoryForm.topic" class="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-sm" placeholder="topic">
                <input v-model="memoryForm.aliases" class="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-sm" placeholder="aliases，用逗号分隔">
                <textarea v-model="memoryForm.view" class="min-h-36 w-full resize-y rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-sm" placeholder="view"></textarea>
            </div>
        </Dialog>

        <Dialog v-model="deleteConfirmOpen" title="删除确认" width="420px" show-cancel :busy="actionBusy" @confirm="confirmDelete">
            <div class="text-sm leading-6 text-[var(--text-secondary)]">
                确认删除「{{ deleteTarget?.label }}」吗？删除后会标记索引待更新。
            </div>
        </Dialog>
    </div>
</template>
