<script setup lang="ts">
import {ref} from "vue";
import SegmentedControl from "../../../src/components/controls/SegmentedControl.vue";
import LabChecks from "./LabChecks.vue";
import LabEventLog from "./LabEventLog.vue";
import LabVariableEditor from "./LabVariableEditor.vue";
import type {LabTokenGroup} from "./registry";
import type {LabEventEntry} from "./useLabEvents";

const props = defineProps<{
    groups: LabTokenGroup[];
    resolvedValues: Record<string, string>;
    overrides: Record<string, string>;
    overrideCount: number;
    targetSelector: string;
    sceneInvalid: boolean;
    revision: number;
    events: LabEventEntry[];
    eventLimit: number;
    onUpdateOverride: (name: string, value: string) => void;
    onResetOverride: (name: string) => void;
    onResetAllOverrides: () => void;
    onImportOverrides: (raw: string) => number;
    onExportOverrides: () => string;
}>();

const emit = defineEmits<{
    (event: "clear-events"): void;
}>();

type PanelTab = "vars" | "checks" | "events";
const tab = ref<PanelTab>("vars");
const tabOptions = [
    {label: "变量", value: "vars"},
    {label: "检查", value: "checks"},
    {label: "事件", value: "events"},
];
</script>

<template>
    <aside class="lab-inspector" aria-label="检查器">
        <div class="lab-inspector__tabs">
            <SegmentedControl v-model="tab" :options="tabOptions" aria-label="检查器页签" />
        </div>
        <div class="lab-inspector__body">
            <LabVariableEditor
                v-if="tab === 'vars'"
                :groups="props.groups"
                :resolved-values="props.resolvedValues"
                :overrides="props.overrides"
                :override-count="props.overrideCount"
                :on-update="props.onUpdateOverride"
                :on-reset="props.onResetOverride"
                :on-reset-all="props.onResetAllOverrides"
                :on-import="props.onImportOverrides"
                :on-export="props.onExportOverrides"
            />
            <LabChecks
                v-else-if="tab === 'checks'"
                :target-selector="props.targetSelector"
                :scene-invalid="props.sceneInvalid"
                :revision="props.revision"
            />
            <LabEventLog
                v-else
                :events="props.events"
                :limit="props.eventLimit"
                @clear="emit('clear-events')"
            />
        </div>
    </aside>
</template>
