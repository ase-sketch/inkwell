<script setup lang="ts">
import {computed, nextTick, onMounted, ref} from "vue";
import LabInspectorPanel from "../component-lab/LabInspectorPanel.vue";
import LabNav from "../component-lab/LabNav.vue";
import LabStage from "../component-lab/LabStage.vue";
import {collectDeclaredTokenGroup, getLabComponent, getLabScene, labCoreTokenGroups} from "../component-lab/registry";
import {useLabEvents} from "../component-lab/useLabEvents";
import {useLabOverrides} from "../component-lab/useLabOverrides";
import {useLabSampler} from "../component-lab/useLabSampler";
import {useLabSession} from "../component-lab/useLabSession";
import {useColorway} from "../composables/useColorway";
import {useTheme} from "../composables/useTheme";

const session = useLabSession();
const theme = useTheme();
const colorway = useColorway();

const definition = computed(() => getLabComponent(session.componentId.value));
const scene = computed(() => getLabScene(definition.value, session.sceneId.value));

// 变量来源：核心登记表（配色 + 设计 + 主题 token）+ 已装主题声明的变量，不手抄
const tokenGroups = computed(() => {
    const declared = collectDeclaredTokenGroup();
    return declared === null ? labCoreTokenGroups : [...labCoreTokenGroups, declared];
});
const allowedNames = computed(() => new Set(tokenGroups.value.flatMap((group) => group.tokens)));

const labOverrides = useLabOverrides(allowedNames);
const labEvents = useLabEvents();

const inspectRevision = ref(0);
const resolvedValues = ref<Record<string, string>>({});

/** 一次采样 = 检查器重读 + 变量面板的当前计算值刷新，两者共用同一个触发器 */
function sample(): void {
    inspectRevision.value += 1;
    const styles = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const group of tokenGroups.value) {
        for (const token of group.tokens) next[token] = styles.getPropertyValue(token).trim();
    }
    resolvedValues.value = next;
}

useLabSampler(
    () => [session.componentId.value, session.sceneId.value, theme.current.value, colorway.current.value, labOverrides.overrides.value],
    sample,
);

onMounted(() => {
    requestAnimationFrame(() => void nextTick(sample));
});
</script>

<template>
    <div class="lab-page">
        <LabNav :component-id="session.componentId.value" @select="session.setComponent" />
        <LabStage
            :definition="definition"
            :scene-id="session.sceneId.value"
            :viewport-id="session.viewportId.value"
            :theme-value="session.themeUrlValue()"
            :colorway-value="colorway.current.value"
            @update:scene="session.setScene"
            @update:viewport="session.setViewport"
            @update:theme="session.setThemeValue"
            @update:colorway="session.setColorwayValue"
            @lab-event="labEvents.record"
            @rendered="sample"
        />
        <LabInspectorPanel
            :groups="tokenGroups"
            :resolved-values="resolvedValues"
            :overrides="labOverrides.overrides.value"
            :override-count="labOverrides.count.value"
            :target-selector="definition.targetSelector"
            :scene-invalid="scene.invalid === true"
            :revision="inspectRevision"
            :events="labEvents.events.value"
            :event-limit="labEvents.limit"
            :on-update-override="labOverrides.setOverride"
            :on-reset-override="labOverrides.resetOverride"
            :on-reset-all-overrides="labOverrides.resetAll"
            :on-import-overrides="labOverrides.importSnapshot"
            :on-export-overrides="labOverrides.exportSnapshot"
            @clear-events="labEvents.clear"
        />
    </div>
</template>
