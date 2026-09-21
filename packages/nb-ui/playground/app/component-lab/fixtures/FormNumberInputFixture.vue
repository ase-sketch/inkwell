<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from "vue";
import FixtureShell from "../FixtureShell.vue";
import {controlDefaultValue, getLabScene, type LabComponentDefinition} from "../registry";

const props = defineProps<{
    definition: LabComponentDefinition;
    sceneId: string;
}>();

const emit = defineEmits<{
    (event: "lab-event", name: string, payload?: unknown): void;
    (event: "rendered"): void;
}>();

// 真实小说排版与工作区参数
const lineHeight = ref(1.75);
const targetWordCount = ref(3500);
const aiTemperature = ref(0.8);
const snapshotMinutes = ref(15);

const controls = ref<Record<string, string | boolean>>({});
const scene = computed(() => getLabScene(props.definition, props.sceneId));
const disabled = computed(() => Boolean(controls.value.disabled) || scene.value.disabled === true);
const readonly = computed(() => Boolean(controls.value.readonly));

function resetState(): void {
    const defaults: Record<string, string | boolean> = {};
    for (const control of props.definition.controls) defaults[control.id] = controlDefaultValue(control);
    controls.value = defaults;
    lineHeight.value = scene.value.invalid ? 0 : 1.75;
    targetWordCount.value = 3500;
    aiTemperature.value = 0.8;
    snapshotMinutes.value = 15;
}

function adjustVal(target: "lineHeight" | "targetWordCount" | "aiTemperature" | "snapshotMinutes", delta: number): void {
    if (disabled.value || readonly.value) return;
    if (target === "lineHeight") {
        lineHeight.value = Math.max(1.0, Math.min(3.0, Number((lineHeight.value + delta).toFixed(2))));
    } else if (target === "targetWordCount") {
        targetWordCount.value = Math.max(500, Math.min(20000, targetWordCount.value + delta));
    } else if (target === "aiTemperature") {
        aiTemperature.value = Math.max(0.0, Math.min(1.5, Number((aiTemperature.value + delta).toFixed(1))));
    } else if (target === "snapshotMinutes") {
        snapshotMinutes.value = Math.max(1, Math.min(120, snapshotMinutes.value + delta));
    }
    emit("lab-event", "update:modelValue", {target, delta});
}

function report(name: string, payload?: unknown): void {
    if (!props.definition.events.includes(name)) return;
    emit("lab-event", name, payload);
}

watch(() => [props.definition.id, props.sceneId], () => {
    resetState();
    void nextTick(() => emit("rendered"));
}, {immediate: true});

onMounted(() => void nextTick(() => emit("rendered")));
</script>

<template>
    <FixtureShell v-model:controls="controls" :definition="definition" :scene-id="sceneId">
        <!-- macOS 紧凑卡片容器（固定方案 1：macOS 经典上下微调钮） -->
        <div class="macos-compact-card">
            <!-- 容器标题栏 -->
            <div class="mb-4 flex items-center justify-between border-b border-[color-mix(in_srgb,var(--border-color)_50%,transparent)] pb-3">
                <div class="flex items-center gap-2">
                    <span class="i-lucide-sliders h-4 w-4 text-[var(--accent-main)]" aria-hidden="true" />
                    <h3 class="text-sm font-semibold text-[var(--text-main)]">写作引擎与排版数值调节</h3>
                </div>
                <span class="rounded-full bg-[color-mix(in_srgb,var(--accent-main)_12%,transparent)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent-main)]">
                    数值步进 · FormNumberInput
                </span>
            </div>

            <!-- 表单数值调节演示区 -->
            <div class="space-y-4">
                <!-- 1. 正文排版行高比例 -->
                <div class="flex flex-col gap-1.5">
                    <div class="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
                        <span>正文行距倍率 (Line Height)</span>
                        <span class="font-mono text-[var(--accent-main)]">{{ lineHeight }}x</span>
                    </div>
                    <div
                        class="relative flex h-9 w-full items-center rounded-[6px] border border-[color-mix(in_srgb,var(--text-main)_16%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] px-3 transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] focus-within:border-[var(--accent-main)] focus-within:shadow-[var(--focus-ring)]"
                        :class="[
                            scene.invalid ? 'border-[var(--status-danger)] focus-within:border-[var(--status-danger)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-danger)_25%,transparent)]' : '',
                            disabled ? 'opacity-45 cursor-not-allowed' : '',
                        ]"
                    >
                        <input
                            id="nb-lab-target"
                            v-model.number="lineHeight"
                            type="number"
                            step="0.05"
                            :disabled="disabled"
                            :readonly="readonly"
                            class="nb-ui-native-input min-w-0 flex-1 h-full bg-transparent font-mono text-sm text-[var(--text-main)] outline-none disabled:cursor-not-allowed leading-normal"
                            @focus="report('focus', {field: 'lineHeight'})"
                        />
                        <div class="flex flex-col items-center justify-center border-l border-[color-mix(in_srgb,var(--text-main)_12%,transparent)] pl-1 -mr-1 shrink-0 select-none">
                            <button
                                type="button"
                                aria-label="增加行距"
                                :disabled="disabled || readonly"
                                class="flex h-3.5 w-5 items-center justify-center rounded-[3px] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_12%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-95 not-disabled:active:bg-[color-mix(in_srgb,var(--text-main)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:transform-none cursor-pointer transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                                @click="adjustVal('lineHeight', 0.05)"
                            >
                                <span class="i-lucide-chevron-up h-3 w-3" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                aria-label="减少行距"
                                :disabled="disabled || readonly"
                                class="flex h-3.5 w-5 items-center justify-center rounded-[3px] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_12%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-95 not-disabled:active:bg-[color-mix(in_srgb,var(--text-main)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:transform-none cursor-pointer transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                                @click="adjustVal('lineHeight', -0.05)"
                            >
                                <span class="i-lucide-chevron-down h-3 w-3" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 2. 单章推荐字数 -->
                <div class="flex flex-col gap-1.5">
                    <div class="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
                        <span>单章推荐字数 (Target Words)</span>
                        <span class="font-mono text-[var(--accent-main)]">{{ targetWordCount }} 字</span>
                    </div>
                    <div
                        class="relative flex h-9 w-full items-center rounded-[6px] border border-[color-mix(in_srgb,var(--text-main)_16%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] px-3 transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] focus-within:border-[var(--accent-main)] focus-within:shadow-[var(--focus-ring)]"
                        :class="[
                            disabled ? 'opacity-45 cursor-not-allowed' : '',
                        ]"
                    >
                        <input
                            v-model.number="targetWordCount"
                            type="number"
                            step="500"
                            :disabled="disabled"
                            :readonly="readonly"
                            class="nb-ui-native-input min-w-0 flex-1 h-full bg-transparent font-mono text-sm text-[var(--text-main)] outline-none disabled:cursor-not-allowed leading-normal"
                            @focus="report('focus', {field: 'targetWordCount'})"
                        />
                        <div class="flex flex-col items-center justify-center border-l border-[color-mix(in_srgb,var(--text-main)_12%,transparent)] pl-1 -mr-1 shrink-0 select-none">
                            <button
                                type="button"
                                aria-label="增加字数"
                                :disabled="disabled || readonly"
                                class="flex h-3.5 w-5 items-center justify-center rounded-[3px] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_12%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-95 not-disabled:active:bg-[color-mix(in_srgb,var(--text-main)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:transform-none cursor-pointer transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                                @click="adjustVal('targetWordCount', 500)"
                            >
                                <span class="i-lucide-chevron-up h-3 w-3" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                aria-label="减少字数"
                                :disabled="disabled || readonly"
                                class="flex h-3.5 w-5 items-center justify-center rounded-[3px] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_12%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-95 not-disabled:active:bg-[color-mix(in_srgb,var(--text-main)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:transform-none cursor-pointer transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                                @click="adjustVal('targetWordCount', -500)"
                            >
                                <span class="i-lucide-chevron-down h-3 w-3" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 3. AI 创意散发温度 -->
                <div class="flex flex-col gap-1.5">
                    <div class="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
                        <span>AI 创意散发温度 (Temperature: 0.0 ~ 1.5)</span>
                        <span class="font-mono text-[var(--accent-main)]">{{ aiTemperature }}</span>
                    </div>
                    <div
                        class="relative flex h-9 w-full items-center rounded-[6px] border border-[color-mix(in_srgb,var(--text-main)_16%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] px-3 transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] focus-within:border-[var(--accent-main)] focus-within:shadow-[var(--focus-ring)]"
                        :class="[
                            disabled ? 'opacity-45 cursor-not-allowed' : '',
                        ]"
                    >
                        <input
                            v-model.number="aiTemperature"
                            type="number"
                            step="0.1"
                            min="0.0"
                            max="1.5"
                            :disabled="disabled"
                            :readonly="readonly"
                            class="nb-ui-native-input min-w-0 flex-1 h-full bg-transparent font-mono text-sm text-[var(--text-main)] outline-none disabled:cursor-not-allowed leading-normal"
                            @focus="report('focus', {field: 'aiTemperature'})"
                        />
                        <div class="flex flex-col items-center justify-center border-l border-[color-mix(in_srgb,var(--text-main)_12%,transparent)] pl-1 -mr-1 shrink-0 select-none">
                            <button
                                type="button"
                                aria-label="增加温度"
                                :disabled="disabled || readonly"
                                class="flex h-3.5 w-5 items-center justify-center rounded-[3px] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_12%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-95 not-disabled:active:bg-[color-mix(in_srgb,var(--text-main)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:transform-none cursor-pointer transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                                @click="adjustVal('aiTemperature', 0.1)"
                            >
                                <span class="i-lucide-chevron-up h-3 w-3" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                aria-label="减少温度"
                                :disabled="disabled || readonly"
                                class="flex h-3.5 w-5 items-center justify-center rounded-[3px] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_12%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-95 not-disabled:active:bg-[color-mix(in_srgb,var(--text-main)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:transform-none cursor-pointer transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                                @click="adjustVal('aiTemperature', -0.1)"
                            >
                                <span class="i-lucide-chevron-down h-3 w-3" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 4. 自动快照保存周期 -->
                <div class="flex flex-col gap-1.5">
                    <div class="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
                        <span>自动快照保存周期 (Minutes)</span>
                        <span class="font-mono text-[var(--accent-main)]">{{ snapshotMinutes }} 分钟</span>
                    </div>
                    <div
                        class="relative flex h-9 w-full items-center rounded-[6px] border border-[color-mix(in_srgb,var(--text-main)_16%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] px-3 transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] focus-within:border-[var(--accent-main)] focus-within:shadow-[var(--focus-ring)]"
                        :class="[
                            disabled ? 'opacity-45 cursor-not-allowed' : '',
                        ]"
                    >
                        <input
                            v-model.number="snapshotMinutes"
                            type="number"
                            step="5"
                            min="1"
                            max="120"
                            :disabled="disabled"
                            :readonly="readonly"
                            class="nb-ui-native-input min-w-0 flex-1 h-full bg-transparent font-mono text-sm text-[var(--text-main)] outline-none disabled:cursor-not-allowed leading-normal"
                            @focus="report('focus', {field: 'snapshotMinutes'})"
                        />
                        <div class="flex flex-col items-center justify-center border-l border-[color-mix(in_srgb,var(--text-main)_12%,transparent)] pl-1 -mr-1 shrink-0 select-none">
                            <button
                                type="button"
                                aria-label="增加周期"
                                :disabled="disabled || readonly"
                                class="flex h-3.5 w-5 items-center justify-center rounded-[3px] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_12%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-95 not-disabled:active:bg-[color-mix(in_srgb,var(--text-main)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:transform-none cursor-pointer transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                                @click="adjustVal('snapshotMinutes', 5)"
                            >
                                <span class="i-lucide-chevron-up h-3 w-3" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                aria-label="减少周期"
                                :disabled="disabled || readonly"
                                class="flex h-3.5 w-5 items-center justify-center rounded-[3px] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text-main)_12%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-95 not-disabled:active:bg-[color-mix(in_srgb,var(--text-main)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:transform-none cursor-pointer transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                                @click="adjustVal('snapshotMinutes', -5)"
                            >
                                <span class="i-lucide-chevron-down h-3 w-3" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <input id="host-number" type="number" tabindex="-1" aria-hidden="true" class="absolute h-px w-px opacity-0 pointer-events-none">

            <!-- 底部状态指示 -->
            <div class="mt-5 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--border-color)_40%,transparent)] pt-3 text-[11px] text-[var(--text-muted)]">
                <span class="font-mono">ID: {{ scene.id }} | {{ scene.label }}</span>
                <span>当前标准: 方案 1: macOS 经典上下微调钮</span>
            </div>
        </div>
    </FixtureShell>
</template>

<style scoped>
.macos-compact-card {
    width: 100%;
    max-width: 520px;
    margin: var(--space-3) auto 0;
    padding: var(--space-5) var(--space-6);
    border-radius: 14px;
    background: color-mix(in srgb, var(--bg-panel) 75%, transparent);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
    box-shadow: 0 20px 48px -12px color-mix(in srgb, var(--shadow-color) 26%, transparent),
                0 2px 8px color-mix(in srgb, var(--shadow-color) 8%, transparent);
}
</style>
