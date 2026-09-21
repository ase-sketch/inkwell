<script setup lang="ts">
/**
 * 可观测设置面板：Pi 请求 trace 的最小开关（enabled + 每会话保留条数）。
 * 走 editorSnapshot → 修改 observability → saveGlobal 的标准面板链路（global scope）。
 */
import {useConfigApi} from "nbook/app/composables/useConfigApi";
import {useNotification} from "nbook/app/composables/useNotification";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import type {ConfigEditorSnapshotDto, ConfigWorkspaceQueryDto, GlobalConfigUpdateDto} from "nbook/shared/dto/config.dto";

/** 展示默认值，与后端 normalizer 的 DEFAULT_PI_TRACE 保持一致。 */
const PI_TRACE_DEFAULTS = {enabled: true, maxRecords: 100};

const props = withDefaults(defineProps<{
    targetQuery?: ConfigWorkspaceQueryDto;
}>(), {
    targetQuery: undefined,
});

const configApi = useConfigApi();
const notification = useNotification();
const {t} = useI18n();

const loading = ref(false);
const saving = ref(false);
const editorSnapshot = ref<ConfigEditorSnapshotDto | null>(null);
const enabled = ref(PI_TRACE_DEFAULTS.enabled);
const maxRecords = ref(PI_TRACE_DEFAULTS.maxRecords);
const snapshotEnabled = ref(PI_TRACE_DEFAULTS.enabled);
const snapshotMaxRecords = ref(PI_TRACE_DEFAULTS.maxRecords);

const dirty = computed(() => enabled.value !== snapshotEnabled.value || maxRecords.value !== snapshotMaxRecords.value);

/**
 * 从快照读 piTrace 当前值；global 里没写过的字段落展示默认值。
 */
function applySettings(snapshot: ConfigEditorSnapshotDto): void {
    editorSnapshot.value = snapshot;
    const piTrace = snapshot.global.observability?.piTrace;
    enabled.value = piTrace?.enabled ?? PI_TRACE_DEFAULTS.enabled;
    maxRecords.value = piTrace?.maxRecords ?? PI_TRACE_DEFAULTS.maxRecords;
    snapshotEnabled.value = enabled.value;
    snapshotMaxRecords.value = maxRecords.value;
}

/**
 * 构造 Global Config 写回体。只覆盖 piTrace 的两个面板字段，
 * 保留手写的其它 observability 配置（如 capturePayload）。
 */
function buildGlobalConfigPayload(): GlobalConfigUpdateDto {
    const base = editorSnapshot.value?.global ?? {};
    return {
        observability: {
            ...(base.observability ?? {}),
            piTrace: {
                ...(base.observability?.piTrace ?? {}),
                enabled: enabled.value,
                maxRecords: maxRecords.value,
            },
        },
    };
}

async function loadSettings(): Promise<void> {
    loading.value = true;
    try {
        applySettings(await configApi.editorSnapshot(props.targetQuery));
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, t("settings.panels.observability.loadFailed")));
    } finally {
        loading.value = false;
    }
}

async function restoreSettings(): Promise<void> {
    await loadSettings();
}

async function saveSettings(): Promise<void> {
    if (!dirty.value || saving.value) {
        return;
    }
    saving.value = true;
    try {
        applySettings(await configApi.saveGlobal(buildGlobalConfigPayload(), props.targetQuery));
        notification.success(t("settings.panels.observability.saveSuccess"));
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, t("settings.panels.observability.saveFailed")));
    } finally {
        saving.value = false;
    }
}

/** 保留条数输入：夹到 0..10000 的整数；0 表示不裁剪。 */
function updateMaxRecords(value: string): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return;
    }
    maxRecords.value = Math.min(Math.max(Math.floor(parsed), 0), 10_000);
}

watch(() => props.targetQuery, () => {
    void loadSettings();
}, {deep: true});

onMounted(() => {
    void loadSettings();
});

defineExpose({
    dirty,
    loading,
    saving,
    saveSettings,
    restoreSettings,
});
</script>

<template>
    <!-- 可观测设置面板 -->
    <div class="space-y-4 pt-1">
        <div class="max-w-xl">
            <h3 class="text-base font-semibold text-[var(--text-main)]">{{ t("settings.panels.observability.title") }}</h3>
            <p class="mt-1 text-xs text-[var(--text-secondary)]">{{ t("settings.panels.observability.description") }}</p>
        </div>

        <div v-if="loading" class="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-sm">
            <span class="i-lucide-loader-2 h-8 w-8 animate-spin text-[var(--text-muted)]"></span>
            <span class="text-sm text-[var(--text-secondary)]">{{ t("common.loading") }}</span>
        </div>

        <div v-else class="grid gap-3">
            <!-- 启用开关 -->
            <div class="flex items-center gap-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-5 py-4 shadow-sm">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-input)] text-[var(--text-secondary)]">
                    <span class="i-lucide-activity h-5 w-5"></span>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-[var(--text-main)]">{{ t("settings.panels.observability.enabledTitle") }}</div>
                    <div class="mt-0.5 text-xs text-[var(--text-secondary)]">{{ t("settings.panels.observability.enabledDescription") }}</div>
                </div>
                <button type="button" class="relative h-6 w-11 shrink-0 rounded-full border transition-colors" :class="enabled ? 'border-[var(--accent-main)] bg-[var(--accent-main)]' : 'border-[var(--border-color)] bg-[var(--bg-input)]'" @click="enabled = !enabled">
                    <span class="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform" :class="enabled ? 'translate-x-5' : 'translate-x-0.5'"></span>
                </button>
            </div>

            <!-- 每会话保留条数 -->
            <label class="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-5 py-4 shadow-sm">
                <span class="text-sm font-medium text-[var(--text-main)]">{{ t("settings.panels.observability.maxRecordsTitle") }}</span>
                <span class="mt-0.5 block text-xs text-[var(--text-secondary)]">{{ t("settings.panels.observability.maxRecordsDescription") }}</span>
                <input type="number" class="mt-3 h-8 w-full max-w-[220px] rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-main)] focus:ring-1 focus:ring-[var(--accent-main)] focus:ring-opacity-20" :value="maxRecords" min="0" max="10000" step="10" @input="updateMaxRecords(($event.target as HTMLInputElement).value)">
            </label>

            <!-- 隐私提示 -->
            <div class="rounded-lg border border-[var(--border-color)] border-opacity-40 bg-[var(--bg-input)] bg-opacity-25 px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
                <span class="i-lucide-shield-alert mr-1 inline-block h-3.5 w-3.5 align-text-bottom"></span>{{ t("settings.panels.observability.privacyNote") }}
            </div>
        </div>
    </div>
</template>
