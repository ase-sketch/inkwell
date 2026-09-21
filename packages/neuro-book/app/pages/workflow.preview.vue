<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";
import WorkflowMermaid from "nbook/app/components/workflow-preview/WorkflowMermaid.vue";
import WorkflowRunPanel from "nbook/app/components/workflow-preview/WorkflowRunPanel.vue";
import {useIdeTheme} from "nbook/app/composables/useIdeTheme";
import {isProjectSessionSupersededError, useProjectSession} from "nbook/app/composables/useProjectSession";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import type {IdeTheme} from "nbook/app/utils/theme/theme-tokens";
import type {
    AgentJobEventCursor,
    AgentJobListResponseDto,
    AgentJobStartDto,
} from "nbook/shared/dto/agent-job.dto";
import type {WorkflowDemoScenarioDto} from "nbook/server/agent/workflow/workflow-demo-service";
import type {ProjectListResponseDto, ProjectMetadataDto} from "nbook/shared/dto/project.dto";

type WorkflowCatalogItemDto = {
    key: string;
    title: string;
    description: string;
    whenToUse: string | null;
    argsHint: Array<{name: string; label: string; defaultValue: string}>;
    source: "install" | "project";
};

type WorkflowCatalogDto = {
    workflows: WorkflowCatalogItemDto[];
    models: Array<{modelKey: string; note: string}>;
};

type FormalWorkflowRun = {
    jobId: string;
    jobEventCursor: AgentJobEventCursor;
    runId: string;
    workflowKey: string;
    /** 只有本页当前生命周期发起的 run 保留其显式项目；job ref 不重复持久化此字段。 */
    projectRoot: string | null;
};

/**
 * Task 110/111 · 正式 Workflow Catalog 主动触发入口 + 内核演示页。
 * 正式区绑定显式 Project Workspace；原有经典 demo/真实 agent 场景保持独立，继续用于投影验证。
 */
const theme = ref<IdeTheme>("dark");
const themeHostRef = ref<HTMLElement | null>(null);
const {mountThemeHost, setTheme} = useIdeTheme(theme);
const themeOptions: Array<{value: IdeTheme; label: string}> = [
    {value: "dark", label: "暗色"},
    {value: "light", label: "浅色"},
    {value: "sepia", label: "羊皮纸"},
];

const scenarios = ref<WorkflowDemoScenarioDto[]>([]);
const argsDrafts = ref<Record<string, Record<string, string>>>({});
const runs = ref<{runId: string; scenarioKey: string; status: string}[]>([]);
const activeRun = ref<{runId: string; scenarioKey: string} | null>(null);
const pageError = ref("");
const starting = ref("");
/** Task 111 正式入口：Catalog、显式 Project Workspace 与本页启动的 run。 */
const catalogWorkflows = ref<WorkflowCatalogItemDto[]>([]);
const catalogModels = ref<WorkflowCatalogDto["models"]>([]);
const projects = ref<ProjectMetadataDto[]>([]);
const selectedProjectRoot = ref("");
const selectedModelKey = ref("");
const formalArgsDrafts = ref<Record<string, Record<string, string>>>({});
const formalRuns = ref<FormalWorkflowRun[]>([]);
const formalActiveRun = ref<FormalWorkflowRun | null>(null);
const formalStarting = ref("");
const formalError = ref("");
const formalCatalogLoading = ref(false);
const formalEntryLoading = ref(false);
const formalProjectSwitching = ref(false);
const formalLoading = computed(() => formalCatalogLoading.value || formalEntryLoading.value || formalProjectSwitching.value);
const formalProjectSession = useProjectSession();
const formalProjectStatus = computed(() => formalProjectSession.state.value.status);
const formalProjectStatusLabel = computed(() => ({
    idle: "未选择项目",
    opening: "正在打开项目",
    reconnecting: "正在重新连接",
    ready: "项目已就绪",
    failed: "项目打开失败",
})[formalProjectStatus.value]);
/** 演示速度：mock responder sleep 的倍率（只影响观感节奏，不影响 replay 语义） */
const speedFactor = ref(4);
const SPEED_OPTIONS = [
    {value: 1, label: "1× 原速"},
    {value: 4, label: "4× 演示"},
    {value: 8, label: "8× 超慢"},
];

async function loadScenarios() {
    try {
        scenarios.value = await $fetch<WorkflowDemoScenarioDto[]>("/api/agent/workflow-demo/scenarios");
        for (const scenario of scenarios.value) {
            argsDrafts.value[scenario.key] = Object.fromEntries(scenario.argsHint.map((hint) => [hint.name, hint.defaultValue]));
        }
    } catch (e) {
        pageError.value = resolveApiErrorMessage(e, "读取场景列表失败");
    }
}

async function refreshRuns() {
    try {
        runs.value = await $fetch<{runId: string; scenarioKey: string; status: string}[]>("/api/agent/workflow-demo/runs");
    } catch { /* run 列表失败不阻塞主流程 */ }
}

type FormalCatalogRequest = {
    key: string;
    promise: Promise<boolean>;
};

let formalCatalogRevision = 0;
let formalCatalogRequest: FormalCatalogRequest | null = null;

/** 当前选择和 Controller 必须仍精确拥有请求发起时的 ready generation。 */
function ownsFormalCatalogGeneration(projectRoot: string, readyRevision: number | null): boolean {
    if (projectRoot !== selectedProjectRoot.value) return false;
    if (!projectRoot) return readyRevision === null;
    return formalProjectSession.state.value.status === "ready"
        && formalProjectSession.state.value.ready.projectRoot === projectRoot
        && formalProjectSession.state.value.ready.revision === readyRevision;
}

/** 离开 ready generation 时立即撤销旧 Catalog，迟到请求只能自行结束。 */
function clearFormalCatalog(): void {
    formalCatalogRevision += 1;
    formalCatalogRequest = null;
    formalCatalogLoading.value = false;
    catalogWorkflows.value = [];
    catalogModels.value = [];
    selectedModelKey.value = "";
    formalArgsDrafts.value = {};
}

/** 按 Project ready generation 读取 Catalog；同 generation 的入口与 reconnect 共用请求。 */
async function loadFormalCatalog(
    projectRoot = selectedProjectRoot.value,
    readyRevision: number | null = projectRoot && formalProjectSession.state.value.status === "ready"
        ? formalProjectSession.state.value.ready.revision
        : null,
): Promise<boolean> {
    if (!ownsFormalCatalogGeneration(projectRoot, readyRevision)) return false;
    const key = projectRoot ? `${projectRoot}:${readyRevision}` : "workspace-root";
    if (formalCatalogRequest?.key === key) return formalCatalogRequest.promise;

    const revision = ++formalCatalogRevision;
    const request: FormalCatalogRequest = {key, promise: Promise.resolve(false)};
    formalCatalogLoading.value = true;
    formalError.value = "";
    request.promise = (async () => {
        try {
            const catalog = await $fetch<WorkflowCatalogDto>("/api/agent/workflow/catalog", {
                query: projectRoot ? {projectRoot} : undefined,
            });
            if (revision !== formalCatalogRevision || !ownsFormalCatalogGeneration(projectRoot, readyRevision)) {
                return false;
            }
            catalogWorkflows.value = catalog.workflows;
            catalogModels.value = catalog.models;
            if (selectedModelKey.value && !catalog.models.some((model) => model.modelKey === selectedModelKey.value)) {
                selectedModelKey.value = "";
            }
            formalArgsDrafts.value = Object.fromEntries(catalog.workflows.map((workflow) => [
                workflow.key,
                Object.fromEntries(workflow.argsHint.map((hint) => [
                    hint.name,
                    formalArgsDrafts.value[workflow.key]?.[hint.name] ?? hint.defaultValue,
                ])),
            ]));
            return true;
        } catch (error) {
            if (revision === formalCatalogRevision && ownsFormalCatalogGeneration(projectRoot, readyRevision)) {
                formalError.value = resolveApiErrorMessage(error, "读取正式 Workflow Catalog 失败");
            }
            return false;
        } finally {
            if (formalCatalogRequest === request) {
                formalCatalogRequest = null;
                formalCatalogLoading.value = false;
            }
        }
    })();
    formalCatalogRequest = request;
    return request.promise;
}

/**
 * 读取现有 Project Workspace、后台 Job，再按有效项目读取正式 Workflow Catalog。
 * 选中项先完成显式激活事务，再读取 Project 数据面；列表刷新本身不改变选择。
 */
let formalEntryRevision = 0;

async function loadFormalEntry(): Promise<void> {
    const revision = ++formalEntryRevision;
    formalEntryLoading.value = true;
    formalError.value = "";
    try {
        const [projectList, jobList] = await Promise.all([
            $fetch<ProjectListResponseDto>("/api/projects"),
            $fetch<AgentJobListResponseDto>("/api/agent/jobs"),
        ]);
        if (revision !== formalEntryRevision) {
            return;
        }
        projects.value = [...projectList.projects];
        if (selectedProjectRoot.value && !projectList.projects.some((project) => project.projectRoot === selectedProjectRoot.value)) {
            selectedProjectRoot.value = "";
        }
        const knownProjectRoots = new Map(formalRuns.value.map((run) => [run.jobId, run.projectRoot]));
        formalRuns.value = jobList.jobs.flatMap((job): FormalWorkflowRun[] => {
            if (job.kind !== "workflow" || job.ownerSessionId !== null || !job.ref || typeof job.ref !== "object" || Array.isArray(job.ref)) {
                return [];
            }
            const runId = typeof job.ref.runId === "string" ? job.ref.runId : "";
            const workflowKey = typeof job.ref.workflowKey === "string" ? job.ref.workflowKey : "";
            return runId ? [{
                jobId: job.jobId,
                jobEventCursor: jobList.eventCursor,
                runId,
                workflowKey: workflowKey || job.title,
                projectRoot: knownProjectRoots.get(job.jobId) ?? null,
            }] : [];
        });
        if (formalActiveRun.value) {
            formalActiveRun.value = formalRuns.value.find((run) => run.jobId === formalActiveRun.value?.jobId) ?? null;
        }
        if (!selectedProjectRoot.value || (
            formalProjectSession.state.value.status === "ready"
            && formalProjectSession.state.value.ready.projectRoot === selectedProjectRoot.value
        )) {
            await loadFormalCatalog();
        }
    } catch (error) {
        if (revision === formalEntryRevision) {
            formalError.value = resolveApiErrorMessage(error, "读取正式 Workflow Catalog 失败");
        }
    } finally {
        if (revision === formalEntryRevision) {
            formalEntryLoading.value = false;
        }
    }
}

/** 从正式 API 启动一次绑定到显式 Project Workspace 的 catalog workflow。 */
async function startFormalRun(workflow: WorkflowCatalogItemDto) {
    if (!selectedProjectRoot.value) {
        formalError.value = "请先选择一个现有 Project Workspace";
        return;
    }
    if (formalProjectSession.state.value.status !== "ready"
        || formalProjectSession.state.value.ready.projectRoot !== selectedProjectRoot.value) {
        formalError.value = "Project Workspace 正在打开，请等待项目就绪后再运行";
        return;
    }
    const projectRoot = selectedProjectRoot.value;
    const modelKey = selectedModelKey.value;
    formalStarting.value = workflow.key;
    formalError.value = "";
    try {
        const result = await $fetch<AgentJobStartDto & {runId: string}>("/api/agent/workflow/runs", {
            method: "POST",
            body: {
                workflowKey: workflow.key,
                args: formalArgsDrafts.value[workflow.key] ?? {},
                ...(modelKey ? {model: modelKey} : {}),
                projectRoot,
            },
        });
        const run = {
            jobId: result.jobId,
            jobEventCursor: result.jobEventCursor,
            runId: result.runId,
            workflowKey: workflow.key,
            projectRoot,
        };
        formalRuns.value.unshift(run);
        formalActiveRun.value = run;
    } catch (error) {
        formalError.value = resolveApiErrorMessage(error, "启动正式 workflow 失败");
    } finally {
        formalStarting.value = "";
    }
}

async function startRun(scenario: WorkflowDemoScenarioDto) {
    starting.value = scenario.key;
    pageError.value = "";
    try {
        const args = argsDrafts.value[scenario.key] ?? {};
        const result = await $fetch<{runId: string}>("/api/agent/workflow-demo/runs", {
            method: "POST",
            body: {scenarioKey: scenario.key, args, speedFactor: speedFactor.value},
        });
        activeRun.value = {runId: result.runId, scenarioKey: scenario.key};
        await refreshRuns();
    } catch (e) {
        pageError.value = resolveApiErrorMessage(e, "启动 run 失败");
    } finally {
        starting.value = "";
    }
}

onMounted(() => {
    mountThemeHost(themeHostRef.value);
    loadFormalEntry();
    loadScenarios();
    refreshRuns();
});

let formalProjectRevision = 0;
let suppressFormalProjectWatch = false;

/** 选择变化先释放旧 presence 并清空 Catalog；只有最新 ready Project 可以提交新数据。 */
watch(selectedProjectRoot, (projectRoot) => {
    if (suppressFormalProjectWatch) return;
    const revision = ++formalProjectRevision;
    formalProjectSwitching.value = true;
    void (async () => {
        try {
            clearFormalCatalog();
            await formalProjectSession.release();
            if (!projectRoot) {
                return;
            }
            const ready = await formalProjectSession.open(projectRoot);
            if (revision !== formalProjectRevision || selectedProjectRoot.value !== projectRoot) return;
            const loaded = await loadFormalCatalog(projectRoot, ready.revision);
            if (revision !== formalProjectRevision || selectedProjectRoot.value !== projectRoot || loaded) return;
            await formalProjectSession.release();
            if (revision !== formalProjectRevision || selectedProjectRoot.value !== projectRoot) return;
            suppressFormalProjectWatch = true;
            selectedProjectRoot.value = "";
            suppressFormalProjectWatch = false;
        } catch (error) {
            if (isProjectSessionSupersededError(error)) return;
            if (revision !== formalProjectRevision || selectedProjectRoot.value !== projectRoot) return;
            await formalProjectSession.release();
            if (revision !== formalProjectRevision || selectedProjectRoot.value !== projectRoot) return;
            suppressFormalProjectWatch = true;
            selectedProjectRoot.value = "";
            suppressFormalProjectWatch = false;
            formalError.value = resolveApiErrorMessage(error, `打开 Project 失败：${projectRoot}`);
        } finally {
            if (revision === formalProjectRevision) formalProjectSwitching.value = false;
        }
    })();
});

/**
 * presence 离开 ready 时立即清空 Project 数据；reconnect 发布新 revision 后重走同一个
 * generation single-flight loader。初次 opening 失败仍由选择 worker 负责回到未选择状态。
 */
watch(formalProjectSession.state, (next, previous) => {
    if (!selectedProjectRoot.value) return;
    if (next.status !== "ready" || next.ready.projectRoot !== selectedProjectRoot.value) {
        clearFormalCatalog();
        if (next.status === "opening" || next.status === "reconnecting") {
            formalProjectSwitching.value = true;
        }
        if (next.status === "failed" && previous.status === "reconnecting") {
            const projectRoot = selectedProjectRoot.value;
            const revision = ++formalProjectRevision;
            void (async () => {
                await formalProjectSession.release();
                if (revision !== formalProjectRevision || selectedProjectRoot.value !== projectRoot) return;
                suppressFormalProjectWatch = true;
                selectedProjectRoot.value = "";
                suppressFormalProjectWatch = false;
                formalProjectSwitching.value = false;
            })();
        }
        return;
    }
    if (previous.status === "ready" && previous.ready.revision === next.ready.revision) return;
    const projectRoot = next.ready.projectRoot;
    const revision = formalProjectRevision;
    formalProjectSwitching.value = true;
    void (async () => {
        const loaded = await loadFormalCatalog(next.ready.projectRoot, next.ready.revision);
        if (revision !== formalProjectRevision || selectedProjectRoot.value !== projectRoot) return;
        if (loaded) {
            formalProjectSwitching.value = false;
            return;
        }
        await formalProjectSession.release();
        if (revision !== formalProjectRevision || selectedProjectRoot.value !== projectRoot) return;
        suppressFormalProjectWatch = true;
        selectedProjectRoot.value = "";
        suppressFormalProjectWatch = false;
        formalProjectSwitching.value = false;
    })();
});
</script>

<template>
    <!-- Workflow 正式入口与 demo 共存的预览页。 -->
    <div ref="themeHostRef" class="workflow-preview-page min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
        <!-- 页面头部 -->
        <header class="border-b border-[var(--border-color)] bg-[var(--toolbar-bg)]/95 backdrop-blur">
            <div class="mx-auto flex max-w-[1500px] flex-col gap-4 px-5 py-5 xl:flex-row xl:items-end xl:justify-between">
                <div class="max-w-[900px]">
                    <div class="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Workflow Preview · Task 110 / 111</div>
                    <h1 class="mt-2 text-2xl font-semibold text-[var(--text-main)]">Agent Workflow 编排 · 正式入口与内核演示</h1>
                    <p class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        nb-workflow 内核跑在 <b>NeuroBook 真实 session 层</b>上：所有参与者都是真实 JSONL session（checkout=moveLeaf、append 显式锚定、excursion 旁支留树上、acquire 按 tag 跨 run 复用）。四个经典场景用确定性 mock responder 驱动；「真实 Agent 并发问答」跑真 profile + 真模型。
                    </p>
                    <div class="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">Route /workflow.preview</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">真实 JSONL session</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">journal 重放缓存</span>
                        <span class="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1">三种投影</span>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <button v-for="option in themeOptions" :key="option.value" type="button"
                        class="rounded-md border px-3 py-1.5 text-xs transition-colors"
                        :class="theme === option.value
                            ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'"
                        @click="setTheme(option.value)">{{ option.label }}</button>
                </div>
            </div>
        </header>

        <main class="mx-auto flex max-w-[1500px] flex-col gap-6 px-5 py-6">
            <div v-if="pageError" class="rounded border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger)]">{{ pageError }}</div>

            <!-- Task 111 正式 Catalog：显式选择 Project Workspace 后走正式 runs API。 -->
            <section class="rounded-xl border border-[var(--accent-main)]/35 bg-[var(--bg-panel)] p-4">
                <div class="flex flex-wrap items-start justify-between gap-4">
                    <div class="max-w-[860px]">
                        <div class="text-[10px] uppercase tracking-[0.24em] text-[var(--accent-main)]">正式 Catalog</div>
                        <h2 class="mt-1 text-base font-semibold text-[var(--text-main)]">用户主动触发 Workflow</h2>
                        <p class="mt-1 text-xs leading-6 text-[var(--text-secondary)]">每次运行都绑定你在此处明确选择的现有 Project Workspace；选择后本页会维持项目 open + presence，但不会切换 Novel IDE 的当前编辑项目，也不会借用下方 demo 的内存书稿。运行会创建真实 Agent session，并可能产生模型费用。</p>
                    </div>
                    <button type="button" class="rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:cursor-wait disabled:opacity-50" :disabled="formalLoading" @click="loadFormalEntry">{{ formalLoading ? "读取中…" : "刷新 Catalog" }}</button>
                </div>

                <div v-if="formalError" class="mt-3 rounded border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-xs text-[var(--status-danger)]">{{ formalError }}</div>

                <!-- 正式 run 的宿主选择：只允许后端列出的现有 Project Workspace。 -->
                <div class="mt-4 grid gap-3 md:grid-cols-2">
                    <label class="space-y-1 text-xs text-[var(--text-muted)]">
                        <span class="flex items-center justify-between gap-2">
                            <span>Project Workspace</span>
                            <span :class="formalProjectStatus === 'ready' ? 'text-[var(--status-success)]' : formalProjectStatus === 'failed' ? 'text-[var(--status-danger)]' : formalProjectStatus === 'opening' || formalProjectStatus === 'reconnecting' ? 'text-[var(--status-info)]' : 'text-[var(--text-muted)]'">{{ formalProjectStatusLabel }}</span>
                        </span>
                        <select v-model="selectedProjectRoot" class="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-2 text-sm text-[var(--text-main)]">
                            <option value="" disabled>{{ projects.length ? "选择项目" : "没有可用项目" }}</option>
                            <option v-for="project in projects" :key="project.projectRoot" :value="project.projectRoot">{{ project.title }} · {{ project.projectRoot }}</option>
                        </select>
                    </label>
                    <label class="space-y-1 text-xs text-[var(--text-muted)]">
                        <span>Workflow 默认模型</span>
                        <select v-model="selectedModelKey" class="w-full rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-2 text-sm text-[var(--text-main)]">
                            <option value="">跟随各 Profile 默认模型</option>
                            <option v-for="model in catalogModels" :key="model.modelKey" :value="model.modelKey">{{ model.modelKey }}{{ model.note ? ` · ${model.note}` : "" }}</option>
                        </select>
                    </label>
                </div>

                <!-- 正式 workflow 卡片与 argsHint 表单。 -->
                <div v-if="catalogWorkflows.length" class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div v-for="workflow in catalogWorkflows" :key="workflow.key" class="flex flex-col rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] p-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-sm font-semibold text-[var(--text-main)]">{{ workflow.title }}</span>
                            <span class="rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">{{ workflow.key }}</span>
                            <span v-if="workflow.source === 'install'" class="rounded border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-1.5 py-0.5 text-[10px] text-[var(--status-info)]">已安装</span>
                            <span v-else-if="workflow.source === 'project'" class="rounded border border-[var(--accent-main)] bg-[var(--accent-bg)] px-1.5 py-0.5 text-[10px] text-[var(--accent-text)]">项目覆盖</span>
                        </div>
                        <p class="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{{ workflow.description }}</p>
                        <p v-if="workflow.whenToUse" class="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">适用：{{ workflow.whenToUse }}</p>
                        <div v-if="workflow.argsHint.length && formalArgsDrafts[workflow.key]" class="mt-3 space-y-2">
                            <label v-for="hint in workflow.argsHint" :key="hint.name" class="block space-y-1 text-[11px] text-[var(--text-muted)]">
                                <span>{{ hint.label }}</span>
                                <input v-model="formalArgsDrafts[workflow.key]![hint.name]" class="w-full rounded border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-1.5 text-xs text-[var(--text-main)]">
                            </label>
                        </div>
                        <button type="button" class="mt-3 self-start rounded bg-[var(--accent-main)] px-4 py-1.5 text-xs font-medium text-[var(--text-inverse)] disabled:cursor-not-allowed disabled:opacity-50" :disabled="formalLoading || !selectedProjectRoot || formalProjectStatus !== 'ready' || Boolean(formalStarting)" @click="startFormalRun(workflow)">
                            {{ formalStarting === workflow.key ? "启动中…" : formalProjectStatus === "failed" ? "项目打开失败" : selectedProjectRoot && formalProjectStatus !== "ready" ? "正在打开项目…" : "运行正式 Workflow" }}
                        </button>
                    </div>
                </div>
                <div v-else-if="!formalError" class="mt-4 rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-4 text-center text-xs text-[var(--text-muted)]">{{ formalLoading ? "正在读取 Catalog…" : "Catalog 中暂无可用 workflow" }}</div>

                <!-- 本页启动的正式 run 历史与实时状态。 -->
                <div v-if="formalRuns.length" class="mt-4 flex flex-wrap gap-2">
                    <button v-for="run in formalRuns" :key="run.runId" type="button" class="rounded-full border px-3 py-1 text-xs"
                        :class="formalActiveRun?.runId === run.runId
                            ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'"
                        @click="formalActiveRun = run">{{ run.workflowKey }} · {{ run.jobId }} · {{ run.runId }}</button>
                </div>
                <div v-if="formalActiveRun" class="mt-4">
                    <div v-if="formalActiveRun.projectRoot" class="mb-2 text-xs text-[var(--text-muted)]">{{ formalActiveRun.projectRoot }}</div>
                    <WorkflowRunPanel :run-id="formalActiveRun.runId" :job-id="formalActiveRun.jobId" :job-event-cursor="formalActiveRun.jobEventCursor" mode="formal" />
                </div>
            </section>

            <!-- 场景卡片 -->
            <section>
                <div class="mb-3 flex flex-wrap items-center gap-3">
                    <h2 class="text-base font-semibold text-[var(--text-main)]">场景</h2>
                    <!-- 演示速度选择：随启动请求发送 -->
                    <div class="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                        <span>演示速度</span>
                        <button v-for="option in SPEED_OPTIONS" :key="option.value"
                            class="rounded-full border px-2.5 py-0.5 transition-colors"
                            :class="speedFactor === option.value
                                ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                                : 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'"
                            @click="speedFactor = option.value">{{ option.label }}</button>
                    </div>
                </div>
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div v-for="scenario in scenarios" :key="scenario.key" class="flex flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-semibold text-[var(--text-main)]">{{ scenario.title }}</span>
                            <span class="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{{ scenario.key }}</span>
                            <span v-if="scenario.real" class="rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 text-[10px] text-[var(--status-warning)]">真模型·有费用</span>
                        </div>
                        <p class="mt-2 flex-1 text-xs leading-6 text-[var(--text-secondary)]">{{ scenario.description }}</p>
                        <!-- args 表单 -->
                        <div v-if="scenario.argsHint.length && argsDrafts[scenario.key]" class="mt-2 flex flex-col gap-1.5">
                            <label v-for="hint in scenario.argsHint" :key="hint.name" class="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                                <span class="w-20 shrink-0">{{ hint.label }}</span>
                                <input v-model="argsDrafts[scenario.key]![hint.name]" class="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-main)] px-2 py-1 text-xs text-[var(--text-main)]">
                            </label>
                        </div>
                        <div class="mt-3 flex items-center gap-2">
                            <button :disabled="starting === scenario.key"
                                class="rounded-md border border-[var(--accent-main)] bg-[var(--accent-bg)] px-4 py-1.5 text-xs text-[var(--accent-text)] transition-colors hover:opacity-90 disabled:opacity-40"
                                @click="startRun(scenario)">{{ starting === scenario.key ? "启动中…" : "▶ 运行" }}</button>
                        </div>
                        <!-- workflow 源码 + 静态投影 -->
                        <details class="mt-3">
                            <summary class="cursor-pointer text-[11px] text-[var(--text-muted)]">workflow 代码（服务端运行时源码）</summary>
                            <pre class="mt-2 max-h-72 overflow-auto rounded border border-[var(--border-color)] bg-[var(--bg-main)] p-2 text-[11px] leading-5 text-[var(--text-secondary)]">{{ scenario.code }}</pre>
                        </details>
                        <details class="mt-2">
                            <summary class="cursor-pointer text-[11px] text-[var(--text-muted)]">静态投影（声明骨架 / AST 近似 CFG，运行前可见）</summary>
                            <div class="mt-2 flex flex-col gap-2">
                                <WorkflowMermaid v-if="scenario.skeletonMermaid" :code="scenario.skeletonMermaid" />
                                <WorkflowMermaid :code="scenario.cfgMermaid" />
                            </div>
                        </details>
                    </div>
                </div>
            </section>

            <!-- run 历史 -->
            <section v-if="runs.length">
                <div class="mb-2 flex items-center gap-2">
                    <h2 class="text-base font-semibold text-[var(--text-main)]">Run 历史</h2>
                    <button class="rounded border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]" @click="refreshRuns">刷新</button>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button v-for="run in runs" :key="run.runId"
                        class="rounded-full border px-3 py-1 text-xs"
                        :class="activeRun?.runId === run.runId
                            ? 'border-[var(--accent-main)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'"
                        @click="activeRun = {runId: run.runId, scenarioKey: run.scenarioKey}">{{ run.runId }} · {{ run.scenarioKey }} · {{ run.status }}</button>
                </div>
            </section>

            <!-- 活跃 run 面板 -->
            <section v-if="activeRun">
                <h2 class="mb-3 text-base font-semibold text-[var(--text-main)]">实时运行视图</h2>
                <WorkflowRunPanel :run-id="activeRun.runId" :scenario-key="activeRun.scenarioKey" />
            </section>
        </main>
    </div>
</template>

<style scoped>
.workflow-preview-page {
    background-image: radial-gradient(circle at top left, color-mix(in srgb, var(--accent-main) 8%, transparent), transparent 28%);
}
</style>
