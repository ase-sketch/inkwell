<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from "vue";
import FormCheckboxLabTarget from "./FormCheckboxLabTarget.vue";
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

// 树状复选框状态（完整层级演示）
const parentChecked = ref<boolean | "indeterminate">("indeterminate");
const subItem1 = ref(false);
const subItem2 = ref(true);
const subItem3 = ref(true);
const item4 = ref(false);
const item5 = ref(true);

// 关联单选展示
const selectedRadio = ref("option3");
const radioOptions = [
    {key: "option1", label: "单选按钮选项一"},
    {key: "option2", label: "单选按钮选项二"},
    {key: "option3", label: "单选按钮选项三"},
];

// 联动计算父级半选/全选/未选状态
function updateParentState(): void {
    const subs = [subItem1.value, subItem2.value, subItem3.value];
    const trueCount = subs.filter(Boolean).length;
    if (trueCount === 3) {
        parentChecked.value = true;
    } else if (trueCount === 0) {
        parentChecked.value = false;
    } else {
        parentChecked.value = "indeterminate";
    }
}

function toggleParent(): void {
    if (parentChecked.value === true) {
        parentChecked.value = false;
        subItem1.value = false;
        subItem2.value = false;
        subItem3.value = false;
    } else {
        parentChecked.value = true;
        subItem1.value = true;
        subItem2.value = true;
        subItem3.value = true;
    }
}

function toggleSub(index: 1 | 2 | 3): void {
    if (index === 1) subItem1.value = !subItem1.value;
    else if (index === 2) subItem2.value = !subItem2.value;
    else if (index === 3) subItem3.value = !subItem3.value;
    updateParentState();
}

const controls = ref<Record<string, string | boolean>>({});
const scene = computed(() => getLabScene(props.definition, props.sceneId));
const disabled = computed(() => Boolean(controls.value.disabled) || scene.value.disabled === true);

const checkboxInvalid = computed(() => scene.value.invalid === true);

function resetState(): void {
    const defaults: Record<string, string | boolean> = {};
    for (const control of props.definition.controls) defaults[control.id] = controlDefaultValue(control);
    controls.value = defaults;
    parentChecked.value = "indeterminate";
    subItem1.value = false;
    subItem2.value = true;
    subItem3.value = true;
    item4.value = false;
    item5.value = true;
    selectedRadio.value = "option3";
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
        <!-- 紧凑 macOS 容器卡片（固定方案 2：macOS 原生微拟物） -->
        <div class="macos-compact-card">
            <!-- 容器标题栏 -->
            <div class="mb-4 flex items-center justify-between border-b border-[color-mix(in_srgb,var(--border-color)_50%,transparent)] pb-3">
                <div>
                    <h3 class="text-sm font-semibold text-[var(--text-main)]">功能开关与多选设置</h3>
                    <p class="text-xs text-[var(--text-muted)]">支持选中、未选中、半选（Indeterminate）与单选按钮。</p>
                </div>
                <span class="rounded-full bg-[color-mix(in_srgb,var(--accent-main)_12%,transparent)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent-main)]">
                    复选框 · FormCheckbox
                </span>
            </div>

            <!-- 复选框交互列表展示（macOS 原生微拟物风格） -->
            <div class="flex flex-col gap-2.5">
                <!-- 1. 树状层级复选组 -->
                <div class="flex flex-col gap-1.5">
                    <!-- 父级项（支持半选 [-] / 全选 [✓] / 清空 [ ]） -->
                    <div
                        class="group flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] transition-colors select-none"
                        :class="disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'"
                        @click="!disabled && toggleParent()"
                    >
                        <div
                            class="box-macos shrink-0 not-disabled:group-active:scale-[0.92]"
                            :class="parentChecked !== false ? 'box-macos-checked' : ''"
                        >
                            <svg v-if="parentChecked === 'indeterminate'" viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 text-white pointer-events-none">
                                <path d="M4 8H12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
                            </svg>
                            <svg v-else-if="parentChecked === true" viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 text-white pointer-events-none">
                                <path d="M3.5 8.2L6.3 11.2L12.5 4.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <span class="text-[14px] font-medium text-[var(--text-main)]">核心文档同步</span>
                    </div>

                    <!-- 缩进子项 1（32px 缩进） -->
                    <div
                        class="group flex items-center gap-3 py-1.5 pr-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] transition-colors select-none"
                        :class="disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'"
                        style="padding-left: 32px;"
                        @click="!disabled && toggleSub(1)"
                    >
                        <div
                            class="box-macos shrink-0 not-disabled:group-active:scale-[0.92]"
                            :class="subItem1 ? 'box-macos-checked' : ''"
                        >
                            <svg v-if="subItem1" viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 text-white pointer-events-none">
                                <path d="M3.5 8.2L6.3 11.2L12.5 4.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <span class="text-[13.5px] text-[var(--text-main)]">同步 Markdown 纯文本源文件</span>
                    </div>

                    <!-- 缩进子项 2 -->
                    <div
                        class="group flex items-center gap-3 py-1.5 pr-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] transition-colors select-none"
                        :class="disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'"
                        style="padding-left: 32px;"
                        @click="!disabled && toggleSub(2)"
                    >
                        <div
                            class="box-macos shrink-0 not-disabled:group-active:scale-[0.92]"
                            :class="subItem2 ? 'box-macos-checked' : ''"
                        >
                            <svg v-if="subItem2" viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 text-white pointer-events-none">
                                <path d="M3.5 8.2L6.3 11.2L12.5 4.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <span class="text-[13.5px] text-[var(--text-main)]">同步 Word 与 EPUB 导出载荷</span>
                    </div>

                    <!-- 缩进子项 3 -->
                    <div
                        class="group flex items-center gap-3 py-1.5 pr-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] transition-colors select-none"
                        :class="disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'"
                        style="padding-left: 32px;"
                        @click="!disabled && toggleSub(3)"
                    >
                        <div
                            class="box-macos shrink-0 not-disabled:group-active:scale-[0.92]"
                            :class="subItem3 ? 'box-macos-checked' : ''"
                        >
                            <svg v-if="subItem3" viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 text-white pointer-events-none">
                                <path d="M3.5 8.2L6.3 11.2L12.5 4.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <span class="text-[13.5px] text-[var(--text-main)]">自动拉取远端冲突解决标记</span>
                    </div>
                </div>

                <!-- 2. 独立功能复选框 -->
                <div class="flex flex-col gap-1.5 pt-1">
                    <!-- 独立项 4 -->
                    <div
                        class="group flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] transition-colors select-none"
                        :class="disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'"
                        @click="!disabled && (item4 = !item4)"
                    >
                        <div
                            class="box-macos shrink-0 not-disabled:group-active:scale-[0.92]"
                            :class="item4 ? 'box-macos-checked' : ''"
                        >
                            <svg v-if="item4" viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 text-white pointer-events-none">
                                <path d="M3.5 8.2L6.3 11.2L12.5 4.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <span class="text-[14px] text-[var(--text-main)]">启用实时自动保存快照</span>
                    </div>

                    <!-- 独立项 5 -->
                    <div
                        class="group flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] transition-colors select-none"
                        :class="disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'"
                        @click="!disabled && (item5 = !item5)"
                    >
                        <div
                            class="box-macos shrink-0 not-disabled:group-active:scale-[0.92]"
                            :class="item5 ? 'box-macos-checked' : ''"
                        >
                            <svg v-if="item5" viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 text-white pointer-events-none">
                                <path d="M3.5 8.2L6.3 11.2L12.5 4.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <span class="text-[14px] text-[var(--text-main)]">启用智能双向滚动虚化</span>
                    </div>
                </div>

                <FormCheckboxLabTarget
                    id="nb-lab-target"
                    v-model="item4"
                    :disabled="disabled"
                    :invalid="checkboxInvalid"
                    :label="scene.id === 'fallback' ? '' : '启用实时自动保存快照'"
                    @focus="report('focus')"
                    @update:model-value="report('update:modelValue', $event)"
                />

                <!-- 3. 附带单选按钮组（对齐 macOS 风格） -->
                <div class="mt-2 flex flex-col gap-1.5 border-t border-[color-mix(in_srgb,var(--border-color)_40%,transparent)] pt-3">
                    <span class="text-xs font-medium text-[var(--text-secondary)]">附带单选按钮（macOS 风格）：</span>
                    <div
                        v-for="rItem in radioOptions"
                        :key="rItem.key"
                        class="group flex items-center gap-3 py-1 px-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)] transition-colors select-none"
                        :class="disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'"
                        @click="!disabled && (selectedRadio = rItem.key)"
                    >
                        <div
                            class="radio-macos shrink-0 not-disabled:group-active:scale-[0.92]"
                            :class="selectedRadio === rItem.key ? 'radio-macos-checked' : ''"
                        >
                            <span v-if="selectedRadio === rItem.key" class="h-2 w-2 rounded-full bg-white pointer-events-none"></span>
                        </div>
                        <span class="text-[13.5px] text-[var(--text-main)]">{{ rItem.label }}</span>
                    </div>
                </div>
            </div>

            <!-- 底部状态指示 -->
            <div class="mt-5 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--border-color)_40%,transparent)] pt-3 text-[11px] text-[var(--text-muted)]">
                <span class="font-mono">ID: {{ scene.id }} | {{ scene.label }}</span>
                <span>当前标准: 方案 2: macOS 原生微拟物</span>
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

/* macOS 微拟物复选框 */
.box-macos {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1px solid color-mix(in srgb, var(--text-main) 22%, transparent);
    background: color-mix(in srgb, var(--bg-panel) 90%, transparent);
    box-shadow: inset 0 1px 1.5px color-mix(in srgb, var(--shadow-color) 12%, transparent),
                0 1px 2px color-mix(in srgb, var(--shadow-color) 6%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 120ms ease;
}

.group:hover .box-macos {
    border-color: color-mix(in srgb, var(--text-main) 38%, transparent);
    background: color-mix(in srgb, var(--bg-panel) 98%, transparent);
}

.box-macos-checked {
    border-color: var(--accent-main) !important;
    background: linear-gradient(180deg, var(--accent-main) 0%, color-mix(in srgb, var(--accent-main) 88%, #000000) 100%) !important;
    box-shadow: inset 0 1px 0.5px rgba(255, 255, 255, 0.45),
                0 2px 6px color-mix(in srgb, var(--accent-main) 38%, transparent) !important;
}

/* macOS 微拟物单选框 */
.radio-macos {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--text-main) 22%, transparent);
    background: color-mix(in srgb, var(--bg-panel) 90%, transparent);
    box-shadow: inset 0 1px 1.5px color-mix(in srgb, var(--shadow-color) 12%, transparent),
                0 1px 2px color-mix(in srgb, var(--shadow-color) 6%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 120ms ease;
}

.group:hover .radio-macos {
    border-color: color-mix(in srgb, var(--text-main) 38%, transparent);
    background: color-mix(in srgb, var(--bg-panel) 98%, transparent);
}

.radio-macos-checked {
    border-color: var(--accent-main) !important;
    background: linear-gradient(180deg, var(--accent-main) 0%, color-mix(in srgb, var(--accent-main) 88%, #000000) 100%) !important;
    box-shadow: inset 0 1px 0.5px rgba(255, 255, 255, 0.45),
                0 2px 6px color-mix(in srgb, var(--accent-main) 38%, transparent) !important;
}
</style>
