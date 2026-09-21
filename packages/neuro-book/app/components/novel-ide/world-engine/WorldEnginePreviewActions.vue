<script setup lang="ts">
import {computed} from "vue";
import WorldEnginePreviewMutationBuilder from "nbook/app/components/novel-ide/world-engine/WorldEnginePreviewMutationBuilder.vue";
import type {WorldMutationOp, WorldPreviewSchemaAttr, WorldPreviewSchemaType, WorldPreviewStateSubject} from "nbook/app/utils/world-engine-preview";

type PreviewSubjectForm = {
    id: string;
    type: string;
    name: string;
    time: string;
};

type PreviewSliceForm = {
    time: string;
    title: string;
    summary: string;
    kind: string;
    mutations: string;
};

type PreviewQueryForm = {
    subjectIds: string;
    type: string;
    attrs: string;
    at: string;
    listLimit: number;
};

type PreviewMutationBuilderModel = {
    subjectId: string;
    path: string;
    op: WorldMutationOp;
    value: string;
};

type PreviewSubjectOption = {
    id: string;
    type: string;
};

const props = defineProps<{
    subjectForm: PreviewSubjectForm;
    sliceForm: PreviewSliceForm;
    queryForm: PreviewQueryForm;
    schemaTypes: WorldPreviewSchemaType[];
    selectedTypeAttrs: WorldPreviewSchemaAttr[];
    projectReady: boolean;
    loadingWorld: boolean;
    actionBusy: boolean;
    editingSliceId: string;
    sliceActionLabel: string;
    writeResultJson: string;
    hasWriteResult: boolean;
    mutationBuilder: PreviewMutationBuilderModel;
    subjects: PreviewSubjectOption[];
    mutationBuilderSubjectType: string;
    mutationBuilderAttrs: WorldPreviewSchemaAttr[];
    mutationBuilderOpOptions: WorldMutationOp[];
    mutationBuilderValueHint: string;
    mutationBuilderNeedsJsonObject: boolean;
    stateResult: WorldPreviewStateSubject[];
    mutationLoadOptions: Array<{label: string; value: string}>;
    mutationLoadIndex: string;
    canUseSelectedMutation: boolean;
}>();

const emit = defineEmits<{
    (e: "create-subject"): void;
    (e: "clear-slice-edit-mode"): void;
    (e: "update-builder-field", field: keyof PreviewMutationBuilderModel, value: string): void;
    (e: "add-builder-mutation", mode: "append" | "replace"): void;
    (e: "update-mutation-load-index", value: string): void;
    (e: "load-mutation", index: number): void;
    (e: "insert-after-selected-mutation"): void;
    (e: "duplicate-selected-mutation"): void;
    (e: "replace-selected-mutation"): void;
    (e: "delete-selected-mutation"): void;
    (e: "move-selected-mutation", direction: "up" | "down"): void;
    (e: "write-slice"): void;
    (e: "query-state"): void;
}>();

const subjectIdAlreadyExists = computed(() => {
    const subjectId = props.subjectForm.id.trim();
    return Boolean(subjectId) && props.subjects.some((subject) => subject.id === subjectId);
});
const canCreateSubject = computed(() => props.projectReady && !props.loadingWorld && !props.actionBusy && props.subjectForm.id.trim() && props.subjectForm.type.trim() && props.subjectForm.time.trim() && !subjectIdAlreadyExists.value);
const canWriteSlice = computed(() => props.projectReady && !props.loadingWorld && !props.actionBusy && props.sliceForm.time.trim());
const canQueryState = computed(() => props.projectReady && !props.loadingWorld && !props.actionBusy && (props.queryForm.subjectIds.trim() || props.queryForm.type.trim()));
</script>

<template>
    <!-- Preview Actions -->
    <section class="min-w-0 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div class="border-b border-[var(--border-color)] px-4 py-3">
            <h2 class="text-sm font-semibold">Actions</h2>
        </div>

        <div class="space-y-5 p-4">
            <!-- 创建 subject -->
            <div class="space-y-2">
                <div class="text-xs font-semibold uppercase text-[var(--text-secondary)]">Create Subject</div>
                <fieldset class="space-y-2 disabled:opacity-60" :disabled="loadingWorld || actionBusy">
                    <div class="grid grid-cols-2 gap-2">
                        <input v-model="subjectForm.id" class="h-9 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="id">
                        <select v-model="subjectForm.type" class="h-9 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]">
                            <option v-for="type in schemaTypes" :key="type.type" :value="type.type">{{ type.type }}</option>
                        </select>
                    </div>
                    <input v-model="subjectForm.name" class="h-9 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="name">
                    <input v-model="subjectForm.time" class="h-9 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="time">
                    <div class="flex flex-wrap gap-1">
                        <button v-for="attr in selectedTypeAttrs.slice(0, 8)" :key="attr.name" type="button" class="rounded border border-[var(--border-color)] px-2 py-1 text-[11px] text-[var(--text-muted)]" disabled>{{ attr.name }}</button>
                    </div>
                    <div v-if="subjectIdAlreadyExists" class="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-xs text-[var(--status-warning)]">该 subject 已存在。点击左侧 subject 会载入查询上下文；新建 subject 请填写新的 id。</div>
                    <button type="button" class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-color)] px-3 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50" :disabled="!canCreateSubject" @click="emit('create-subject')">
                        <span class="i-lucide-circle-plus h-4 w-4"></span>
                        创建 Subject
                    </button>
                </fieldset>
            </div>

            <!-- 写 slice -->
            <div class="space-y-2 border-t border-[var(--border-color)] pt-5">
                <fieldset class="space-y-2 disabled:opacity-60" :disabled="loadingWorld || actionBusy">
                    <div class="flex items-center justify-between gap-2">
                        <div class="text-xs font-semibold uppercase text-[var(--text-secondary)]">{{ editingSliceId ? "Edit Slice" : "Write Slice" }}</div>
                        <button v-if="editingSliceId" type="button" class="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]" @click="emit('clear-slice-edit-mode')">
                            取消编辑
                        </button>
                    </div>
                    <div v-if="editingSliceId" class="rounded-md border border-[var(--accent-main)]/30 bg-[var(--accent-bg)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                        当前整块替换 slice：{{ editingSliceId }}
                    </div>
                    <input v-model="sliceForm.time" class="h-9 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="time">
                    <div class="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                        <input v-model="sliceForm.title" class="h-9 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="title">
                        <input v-model="sliceForm.kind" class="h-9 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="kind">
                    </div>
                    <textarea v-model="sliceForm.summary" class="min-h-16 w-full resize-y rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="summary"></textarea>
                    <WorldEnginePreviewMutationBuilder
                        :disabled="loadingWorld || actionBusy"
                        :builder="mutationBuilder"
                        :subjects="subjects"
                        :subject-form-id="subjectForm.id"
                        :subject-type-label="mutationBuilderSubjectType"
                        :builder-attrs="mutationBuilderAttrs"
                        :builder-op-options="mutationBuilderOpOptions"
                        :value-hint="mutationBuilderValueHint"
                        :value-requires-json-object="mutationBuilderNeedsJsonObject"
                        :state-result="stateResult"
                        :mutation-load-options="mutationLoadOptions"
                        :mutation-load-index="mutationLoadIndex"
                        :can-use-selected-mutation="canUseSelectedMutation"
                        @update-builder-field="(field, value) => emit('update-builder-field', field, value)"
                        @add-builder-mutation="emit('add-builder-mutation', $event)"
                        @update-mutation-load-index="emit('update-mutation-load-index', $event)"
                        @load-mutation="emit('load-mutation', $event)"
                        @insert-after-selected-mutation="emit('insert-after-selected-mutation')"
                        @duplicate-selected-mutation="emit('duplicate-selected-mutation')"
                        @replace-selected-mutation="emit('replace-selected-mutation')"
                        @delete-selected-mutation="emit('delete-selected-mutation')"
                        @move-selected-mutation="emit('move-selected-mutation', $event)"
                    />
                    <textarea v-model="sliceForm.mutations" class="min-h-40 w-full resize-y rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--accent-main)]" spellcheck="false"></textarea>
                    <button type="button" class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-color)] px-3 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50" :disabled="!canWriteSlice" @click="emit('write-slice')">
                        <span :class="editingSliceId ? 'i-lucide-save' : 'i-lucide-send'" class="h-4 w-4"></span>
                        {{ sliceActionLabel }}
                    </button>
                </fieldset>
                <pre v-if="hasWriteResult" class="max-h-32 overflow-auto rounded bg-[var(--bg-input)] p-2 text-[11px] leading-5">{{ writeResultJson }}</pre>
            </div>

            <!-- 查询 -->
            <div class="space-y-2 border-t border-[var(--border-color)] pt-5">
                <div class="text-xs font-semibold uppercase text-[var(--text-secondary)]">Query</div>
                <fieldset class="space-y-2 disabled:opacity-60" :disabled="loadingWorld || actionBusy">
                    <input v-model="queryForm.subjectIds" class="h-9 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="subjectIds">
                    <div class="grid grid-cols-2 gap-2">
                        <input v-model="queryForm.type" class="h-9 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="type">
                        <input v-model.number="queryForm.listLimit" type="number" min="1" max="100" class="h-9 rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="listLimit">
                    </div>
                    <input v-model="queryForm.attrs" class="h-9 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="attrs">
                    <input v-model="queryForm.at" class="h-9 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm outline-none focus:border-[var(--accent-main)]" placeholder="at">
                    <button type="button" class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-color)] px-3 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50" :disabled="!canQueryState" @click="emit('query-state')">
                        <span class="i-lucide-search h-4 w-4"></span>
                        查询状态
                    </button>
                </fieldset>
            </div>
        </div>
    </section>
</template>
