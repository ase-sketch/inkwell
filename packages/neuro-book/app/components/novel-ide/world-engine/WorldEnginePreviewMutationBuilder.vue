<script setup lang="ts">
import WorldEngineMutationActionButtons from "nbook/app/components/novel-ide/world-engine/WorldEngineMutationActionButtons.vue";
import WorldEngineMutationListControls from "nbook/app/components/novel-ide/world-engine/WorldEngineMutationListControls.vue";
import {type WorldMutationOp, type WorldPreviewSchemaAttr, type WorldPreviewStateSubject} from "nbook/app/utils/world-engine-preview";

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
    disabled?: boolean;
    builder: PreviewMutationBuilderModel;
    subjects: PreviewSubjectOption[];
    subjectFormId: string;
    subjectTypeLabel: string;
    builderAttrs: WorldPreviewSchemaAttr[];
    builderOpOptions: WorldMutationOp[];
    valueHint: string;
    valueRequiresJsonObject: boolean;
    stateResult: WorldPreviewStateSubject[];
    mutationLoadOptions: Array<{label: string; value: string}>;
    mutationLoadIndex: string;
    canUseSelectedMutation: boolean;
}>();

const emit = defineEmits<{
    (e: "update-builder-field", field: keyof PreviewMutationBuilderModel, value: string): void;
    (e: "add-builder-mutation", mode: "append" | "replace"): void;
    (e: "update-mutation-load-index", value: string): void;
    (e: "load-mutation", index: number): void;
    (e: "insert-after-selected-mutation"): void;
    (e: "duplicate-selected-mutation"): void;
    (e: "replace-selected-mutation"): void;
    (e: "delete-selected-mutation"): void;
    (e: "move-selected-mutation", direction: "up" | "down"): void;
}>();

/** 读取原生表单事件中的字符串值，让模板保持简洁。 */
function inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
}

function attrPath(name: string): string {
    return `/${name.split(".").filter(Boolean).map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;
}
</script>

<template>
    <!-- Preview Mutation Builder -->
    <div class="rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] p-3">
        <fieldset class="m-0 border-0 p-0 disabled:opacity-70" :disabled="props.disabled">
        <div class="mb-2 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
                <div class="text-xs font-semibold text-[var(--text-secondary)]">Mutation Builder</div>
                <span class="shrink-0 rounded border border-[var(--border-color)] px-1.5 py-0.5 font-mono">{{ valueHint }}</span>
            </div>
            <WorldEngineMutationListControls
                :disabled="props.disabled"
                :selected-subject-type-label="subjectTypeLabel"
                :mutation-load-options="mutationLoadOptions"
                :mutation-load-index="mutationLoadIndex"
                @update-mutation-load-index="emit('update-mutation-load-index', $event)"
                @load-mutation="emit('load-mutation', $event)"
                @move-selected-mutation="emit('move-selected-mutation', $event)"
            />
        </div>
        <div class="grid grid-cols-2 gap-2">
            <select :value="builder.subjectId" class="h-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 text-xs outline-none focus:border-[var(--accent-main)]" @change="emit('update-builder-field', 'subjectId', inputValue($event))">
                <option :value="subjectFormId">{{ subjectFormId || "subject" }}</option>
                <option v-for="subject in subjects" :key="`builder:${subject.id}`" :value="subject.id">{{ subject.id }} · {{ subject.type }}</option>
            </select>
            <select :value="builder.path" class="h-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 text-xs outline-none focus:border-[var(--accent-main)]" @change="emit('update-builder-field', 'path', inputValue($event))">
                <option v-for="attr in builderAttrs" :key="`builder-attr:${attr.name}`" :value="attrPath(attr.name)">{{ attr.name }}</option>
            </select>
            <input :value="builder.path" list="world-engine-preview-builder-attrs" class="col-span-2 h-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 font-mono text-xs outline-none focus:border-[var(--accent-main)]" placeholder="JSON Pointer path, e.g. /memory/师门" @input="emit('update-builder-field', 'path', inputValue($event))">
            <datalist id="world-engine-preview-builder-attrs">
                <option v-for="attr in builderAttrs" :key="`builder-attr-option:${attr.name}`" :value="attrPath(attr.name)"></option>
            </datalist>
            <select :value="builder.op" class="h-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 text-xs outline-none focus:border-[var(--accent-main)]" @change="emit('update-builder-field', 'op', inputValue($event))">
                <option v-for="op in builderOpOptions" :key="op" :value="op">{{ op }}</option>
            </select>
            <textarea v-if="valueRequiresJsonObject" :value="builder.value" rows="4" class="col-span-2 min-h-[92px] resize-y rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 py-1.5 font-mono text-xs leading-5 outline-none focus:border-[var(--accent-main)]" placeholder="{&quot;key&quot;: &quot;value&quot;}" title="当前 value 必须是 JSON object" @input="emit('update-builder-field', 'value', inputValue($event))"></textarea>
            <input v-else :value="builder.value" class="h-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2 text-xs outline-none focus:border-[var(--accent-main)] disabled:opacity-50" :disabled="builder.op === 'remove'" placeholder="value" @input="emit('update-builder-field', 'value', inputValue($event))">
        </div>
        <WorldEngineMutationActionButtons
            :disabled="props.disabled"
            :can-use-selected-mutation="canUseSelectedMutation"
            @add-mutation="emit('add-builder-mutation', $event)"
            @insert-after-selected-mutation="emit('insert-after-selected-mutation')"
            @duplicate-selected-mutation="emit('duplicate-selected-mutation')"
            @replace-selected-mutation="emit('replace-selected-mutation')"
            @delete-selected-mutation="emit('delete-selected-mutation')"
        />
        </fieldset>
    </div>
</template>
