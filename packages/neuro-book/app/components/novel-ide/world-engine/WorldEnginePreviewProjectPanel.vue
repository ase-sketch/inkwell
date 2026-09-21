<script setup lang="ts">
import type {WorldPreviewSchemaAttr, WorldPreviewSchemaType} from "nbook/app/utils/world-engine-preview";

type PreviewProjectForm = {
    title: string;
    summary: string;
};

type PreviewProjectOption = {
    title: string;
    projectRoot: string;
};

type PreviewSchemaProjection = {
    calendar: {
        format: string;
        examples: string[];
    };
};

const props = defineProps<{
    createProjectForm: PreviewProjectForm;
    selectedProject: PreviewProjectOption | null;
    schema: PreviewSchemaProjection | null;
    schemaTypes: WorldPreviewSchemaType[];
    projectReady: boolean;
    loadingProjects: boolean;
    loadingWorld: boolean;
    actionBusy: boolean;
    /** create 结果未结算时的持久恢复详情；空字符串表示无门禁。 */
    createRecovery: string;
}>();

const emit = defineEmits<{
    (e: "create-project"): void;
    (e: "retry-create-recovery"): void;
    (e: "fill-mutation", typeName: string, attr: WorldPreviewSchemaAttr): void;
}>();

const schemaSourcePath = "world-engine/schema/index.ts";
const calendarSourcePath = "world-engine/calendar.ts";

/** 生成主 IDE 深链，用于从独立 Preview 跳回 Project Workspace 配置文件。 */
function buildIdeOpenPathHref(path: string): string {
    if (!props.selectedProject) {
        return "#";
    }
    return `/?${new URLSearchParams({project: props.selectedProject.projectRoot, openPath: path}).toString()}`;
}
</script>

<template>
    <!-- Preview Project 与 Schema -->
    <section class="min-w-0 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div class="border-b border-[var(--border-color)] px-4 py-3">
            <h2 class="text-sm font-semibold">Project</h2>
        </div>
        <div class="space-y-3 p-4">
            <div v-if="createRecovery" class="space-y-2 rounded-md border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-xs text-[var(--status-danger)]" role="alert">
                <p>{{ createRecovery }}</p>
                <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--status-danger-border)] bg-[var(--bg-panel)] px-3 font-medium disabled:opacity-50" :disabled="actionBusy" @click="emit('retry-create-recovery')"><span class="i-lucide-refresh-cw h-3.5 w-3.5" :class="actionBusy ? 'animate-spin' : ''"></span>重新读取 Project 列表</button>
            </div>
            <fieldset class="space-y-3 disabled:opacity-60" :disabled="loadingProjects || loadingWorld || actionBusy || Boolean(createRecovery)">
                <input v-model="createProjectForm.title" class="h-9 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="Project title">
                <input v-model="createProjectForm.summary" class="h-9 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="Summary">
                <button type="button" class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent-main)] px-3 text-sm text-[var(--accent-contrast)] disabled:opacity-50" :disabled="loadingProjects || loadingWorld || actionBusy || Boolean(createRecovery)" @click="emit('create-project')">
                    <span class="i-lucide-folder-plus h-4 w-4"></span>
                    新建 Project
                </button>
            </fieldset>
            <div v-if="selectedProject" class="rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] p-3 text-xs leading-6">
                <div class="font-medium">{{ selectedProject.title }}</div>
                <div class="text-[var(--text-muted)]">{{ selectedProject.projectRoot }}</div>
            </div>
        </div>

        <div class="border-y border-[var(--border-color)] px-4 py-3">
            <h2 class="text-sm font-semibold">Schema</h2>
        </div>
        <div class="max-h-[520px] space-y-3 overflow-auto p-4">
            <div v-if="selectedProject" class="flex min-w-0 flex-wrap gap-1.5" title="Project Workspace 内的 World Engine 配置文件">
                <a class="inline-flex min-w-0 items-center gap-1 rounded border border-[var(--border-color)] bg-[var(--bg-panel)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]" :href="buildIdeOpenPathHref(schemaSourcePath)" target="_blank" rel="noopener noreferrer" title="在主 IDE 打开 schema 配置文件">
                    <span class="i-lucide-table-properties h-3 w-3 shrink-0"></span>
                    <span class="min-w-0 truncate">{{ schemaSourcePath }}</span>
                </a>
                <a class="inline-flex min-w-0 items-center gap-1 rounded border border-[var(--border-color)] bg-[var(--bg-panel)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]" :href="buildIdeOpenPathHref(calendarSourcePath)" target="_blank" rel="noopener noreferrer" title="在主 IDE 打开 calendar.ts 配置文件">
                    <span class="i-lucide-calendar-clock h-3 w-3 shrink-0"></span>
                    <span class="min-w-0 truncate">{{ calendarSourcePath }}</span>
                </a>
            </div>
            <div v-if="!schema" class="text-sm text-[var(--text-muted)]">未加载</div>
            <div v-else>
                <div class="mb-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] p-3 text-xs">
                    <div class="font-medium">{{ schema.calendar.format }}</div>
                    <div class="mt-1 text-[var(--text-muted)]">{{ schema.calendar.examples.join(" / ") }}</div>
                </div>
                <div v-for="type in schemaTypes" :key="type.type" class="mb-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] p-3">
                    <div class="text-sm font-semibold">{{ type.type }}</div>
                    <div v-if="type.desc" class="mt-1 text-xs text-[var(--text-muted)]">{{ type.desc }}</div>
                    <div class="mt-2 flex flex-wrap gap-1">
                        <button v-for="attr in type.attrs" :key="`${type.type}:${attr.name}`" type="button" class="rounded border border-[var(--border-color)] px-2 py-1 text-[11px] hover:bg-[var(--bg-hover)] disabled:opacity-50" :disabled="loadingProjects || loadingWorld || actionBusy" @click="emit('fill-mutation', type.type, attr)">
                            {{ attr.name }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>
