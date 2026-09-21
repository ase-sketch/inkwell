<script setup lang="ts">
import FormInput from "../../../../src/components/form/FormInput.vue";
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

// 真实小说创作与工作区领域数据
const bookTitle = ref("《星穹折叠：第零纪元》");
const worldView = ref("赛博纪元·轨道空港浮空城");
const searchKeyword = ref("量子纠缠逆熵通讯");
const accessPasscode = ref("Alpha-7890-Omega");
const showPassword = ref(false);

const controls = ref<Record<string, string | boolean>>({});
const scene = computed(() => getLabScene(props.definition, props.sceneId));
const disabled = computed(() => Boolean(controls.value.disabled) || scene.value.disabled === true);
const readonly = computed(() => Boolean(controls.value.readonly));

function resetState(): void {
    const defaults: Record<string, string | boolean> = {};
    for (const control of props.definition.controls) defaults[control.id] = controlDefaultValue(control);
    controls.value = defaults;
    bookTitle.value = scene.value.invalid ? "" : "《星穹折叠：第零纪元》";
    worldView.value = "赛博纪元·轨道空港浮空城";
    searchKeyword.value = "量子纠缠逆熵通讯";
    accessPasscode.value = "Alpha-7890-Omega";
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
        <!-- macOS 紧凑卡片容器（固定方案 1：macOS 经典沉浸输入槽） -->
        <div class="macos-compact-card">
            <!-- 容器标题栏 -->
            <div class="mb-4 flex items-center justify-between border-b border-[color-mix(in_srgb,var(--border-color)_50%,transparent)] pb-3">
                <div class="flex items-center gap-2">
                    <span class="i-lucide-book-open h-4 w-4 text-[var(--accent-main)]" aria-hidden="true" />
                    <h3 class="text-sm font-semibold text-[var(--text-main)]">作品档案核心元数据录入</h3>
                </div>
                <span class="rounded-full bg-[color-mix(in_srgb,var(--accent-main)_12%,transparent)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent-main)]">
                    表单输入 · FormInput
                </span>
            </div>

            <!-- 表单输入字段区域 -->
            <div class="space-y-4">
                <!-- 1. 作品主标题 -->
                <div class="flex flex-col gap-1.5">
                    <label class="text-xs font-medium text-[var(--text-secondary)] flex items-center justify-between">
                        <span>主标题（必填）</span>
                        <span v-if="scene.invalid" class="text-[11px] text-[var(--status-danger)]">标题不能为空</span>
                    </label>
                    <div
                        class="relative flex h-9 w-full items-center px-3 rounded-[6px] border border-[color-mix(in_srgb,var(--text-main)_16%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] focus-within:border-[var(--accent-main)] focus-within:shadow-[var(--focus-ring)]"
                        :class="[
                            scene.invalid ? 'border-[var(--status-danger)] focus-within:border-[var(--status-danger)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-danger)_25%,transparent)]' : '',
                            disabled ? 'opacity-45 cursor-not-allowed' : '',
                        ]"
                    >
                        <input
                            v-model="bookTitle"
                            id="nb-lab-target"
                            type="text"
                            :disabled="disabled"
                            :readonly="readonly"
                            placeholder="请输入作品主标题..."
                            class="w-full h-full bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none disabled:cursor-not-allowed leading-normal"
                            @focus="report('focus', {field: 'bookTitle'})"
                            @input="report('update:modelValue', {field: 'bookTitle', value: bookTitle})"
                        />
                    </div>
                </div>

                <!-- 2. 世界观代号（前缀插槽，垂直居中对齐） -->
                <div class="flex flex-col gap-1.5">
                    <label class="text-xs font-medium text-[var(--text-secondary)]">世界观锚点代号（带前缀）</label>
                    <div
                        class="relative flex h-9 w-full items-center gap-2 px-3 rounded-[6px] border border-[color-mix(in_srgb,var(--text-main)_16%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] focus-within:border-[var(--accent-main)] focus-within:shadow-[var(--focus-ring)]"
                        :class="[
                            disabled ? 'opacity-45 cursor-not-allowed' : '',
                        ]"
                    >
                        <span class="inline-flex items-center justify-center self-center shrink-0 text-xs font-mono font-bold text-[var(--accent-main)] select-none leading-none pt-0.5">
                            @WORLD/
                        </span>
                        <input
                            v-model="worldView"
                            type="text"
                            :disabled="disabled"
                            :readonly="readonly"
                            placeholder="设定集锚点..."
                            class="min-w-0 flex-1 h-full bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none disabled:cursor-not-allowed leading-normal"
                            @focus="report('focus', {field: 'worldView'})"
                        />
                    </div>
                </div>

                <!-- 3. AI 灵感搜索栏（单一清除按钮，去除原生重复 x） -->
                <div class="flex flex-col gap-1.5">
                    <label class="text-xs font-medium text-[var(--text-secondary)]">设定库全文检索（搜索类型）</label>
                    <div
                        class="relative flex h-9 w-full items-center gap-2 px-3 rounded-[6px] border border-[color-mix(in_srgb,var(--text-main)_16%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] focus-within:border-[var(--accent-main)] focus-within:shadow-[var(--focus-ring)]"
                        :class="[
                            disabled ? 'opacity-45 cursor-not-allowed' : '',
                        ]"
                    >
                        <span class="i-lucide-search h-4 w-4 shrink-0 text-[var(--text-muted)] flex items-center justify-center self-center" aria-hidden="true" />
                        <input
                            v-model="searchKeyword"
                            type="search"
                            :disabled="disabled"
                            :readonly="readonly"
                            placeholder="检索大纲、人物或灵感词条..."
                            class="nb-ui-native-input min-w-0 flex-1 h-full bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none disabled:cursor-not-allowed leading-normal"
                            @focus="report('focus', {field: 'searchKeyword'})"
                        />
                        <button
                            v-if="searchKeyword && !disabled && !readonly"
                            type="button"
                            class="i-lucide-x h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer flex items-center justify-center self-center transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                            aria-label="清空搜索"
                            @click="searchKeyword = ''"
                        />
                    </div>
                </div>

                <!-- 4. 加密访问密钥（密码类型 + 显隐切换） -->
                <div class="flex flex-col gap-1.5">
                    <label class="text-xs font-medium text-[var(--text-secondary)]">保密大纲访问凭证（密码输入）</label>
                    <div
                        class="relative flex h-9 w-full items-center gap-2 px-3 rounded-[6px] border border-[color-mix(in_srgb,var(--text-main)_16%,transparent)] bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)] transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] focus-within:border-[var(--accent-main)] focus-within:shadow-[var(--focus-ring)]"
                        :class="[
                            disabled ? 'opacity-45 cursor-not-allowed' : '',
                        ]"
                    >
                        <span class="i-lucide-lock h-4 w-4 shrink-0 text-[var(--text-muted)] flex items-center justify-center self-center" aria-hidden="true" />
                        <input
                            v-model="accessPasscode"
                            :type="showPassword ? 'text' : 'password'"
                            :disabled="disabled"
                            :readonly="readonly"
                            placeholder="输入解密密钥..."
                            class="min-w-0 flex-1 h-full font-mono bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none disabled:cursor-not-allowed leading-normal"
                            @focus="report('focus', {field: 'accessPasscode'})"
                        />
                        <button
                            type="button"
                            class="h-4 w-4 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer flex items-center justify-center self-center transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
                            :class="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                            @click="showPassword = !showPassword"
                        />
                    </div>
                </div>
            </div>

                <div data-native-input-probes inert aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none">
                    <FormInput id="nb-marker-search" v-model="searchKeyword" type="search" />
                    <input id="host-search" type="search" aria-label="宿主搜索探针" class="h-9 rounded-[6px] border px-3" :value="searchKeyword">
                </div>

            <!-- 底部状态指示 -->
            <div class="mt-5 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--border-color)_40%,transparent)] pt-3 text-[11px] text-[var(--text-muted)]">
                <span class="font-mono">ID: {{ scene.id }} | {{ scene.label }}</span>
                <span>当前标准: 方案 1: macOS 经典沉浸输入槽</span>
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
