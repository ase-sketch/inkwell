<script setup lang="ts">
import FormSelect from "nbook/app/components/common/form/FormSelect.vue";
import type {SelectOption} from "nbook/app/components/common/form/FormSelect.vue";
import {useConfigApi} from "nbook/app/composables/useConfigApi";
import {useCostDisplay} from "nbook/app/composables/useCostDisplay";
import {useNotification} from "nbook/app/composables/useNotification";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import type {CostDisplayCurrency} from "nbook/app/utils/cost-format";
import type {ConfigEditorSnapshotDto, ConfigWorkspaceQueryDto, GlobalConfigUpdateDto} from "nbook/shared/dto/config.dto";

const props = withDefaults(defineProps<{
    targetQuery?: ConfigWorkspaceQueryDto;
}>(), {
    targetQuery: undefined,
});

const configApi = useConfigApi();
const costDisplay = useCostDisplay();
const notification = useNotification();
const {t} = useI18n();

const loading = ref(false);
const saving = ref(false);
const exchangeRateLoading = ref(false);
const editorSnapshot = ref<ConfigEditorSnapshotDto | null>(null);
const costCurrency = ref<CostDisplayCurrency>("USD");
const snapshotCurrency = ref<CostDisplayCurrency>("USD");

const currencyOptions = computed<SelectOption[]>(() => [
    {value: "USD", label: "USD", description: t("settings.panels.cost.usdDescription")},
    {value: "CNY", label: "CNY", description: t("settings.panels.cost.cnyDescription")},
]);

const dirty = computed(() => costCurrency.value !== snapshotCurrency.value);
const exchangeRateLabel = computed(() => {
    if (!costDisplay.usdToCnyRate.value) {
        return t("settings.panels.cost.exchangeRateMissing");
    }
    const staleLabel = costDisplay.exchangeRateStale.value ? t("settings.panels.cost.cachedRate") : "";
    return `1 USD = ${costDisplay.usdToCnyRate.value.toFixed(4)} CNY${staleLabel}`;
});
const exchangeRateFetchedLabel = computed(() => {
    const fetchedAt = costDisplay.exchangeRateFetchedAt.value;
    if (!fetchedAt) {
        return "";
    }
    const date = new Date(fetchedAt);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return t("settings.panels.cost.fetchedAt", {time: date.toLocaleString()});
});

/**
 * 从通用 effective JSON 中读取费用显示币种。
 */
function readSnapshotCostCurrency(snapshot: ConfigEditorSnapshotDto): CostDisplayCurrency {
    const ui = snapshot.effective.ui;
    if (ui && typeof ui === "object" && !Array.isArray(ui) && "costCurrency" in ui && ui.costCurrency === "CNY") {
        return "CNY";
    }
    return "USD";
}

/**
 * 构造 Global Config 写回体。
 */
function buildGlobalConfigPayload(): GlobalConfigUpdateDto {
    const base = editorSnapshot.value?.global ?? {};
    return {
        ui: {
            ...(base.ui ?? {}),
            theme: base.ui?.theme ?? "sepia",
            customThemes: base.ui?.customThemes ?? [],
            costCurrency: costCurrency.value,
        },
    };
}

/**
 * 应用后端配置快照。
 */
function applySettings(snapshot: ConfigEditorSnapshotDto): void {
    editorSnapshot.value = snapshot;
    costCurrency.value = readSnapshotCostCurrency(snapshot);
    snapshotCurrency.value = costCurrency.value;
    costDisplay.setCostCurrency(costCurrency.value);
    void costDisplay.ensureExchangeRate(configApi.exchangeRate);
}

/**
 * 读取费用显示设置。
 */
async function loadSettings(): Promise<void> {
    loading.value = true;
    try {
        applySettings(await configApi.editorSnapshot(props.targetQuery));
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, t("settings.panels.cost.loadFailed")));
    } finally {
        loading.value = false;
    }
}

/**
 * 重新读取已保存的费用显示设置，放弃当前草稿。
 */
async function restoreSettings(): Promise<void> {
    await loadSettings();
}

/**
 * 保存费用显示币种。汇率不写入配置，仅保存在当前前端会话。
 */
async function saveSettings(): Promise<void> {
    if (!dirty.value || saving.value) {
        return;
    }
    saving.value = true;
    try {
        applySettings(await configApi.saveGlobal(buildGlobalConfigPayload(), props.targetQuery));
        notification.success(t("settings.panels.cost.saveSuccess"));
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, t("settings.panels.cost.saveFailed")));
    } finally {
        saving.value = false;
    }
}

/**
 * 手动刷新 USD/CNY 汇率。只有用户点击时才访问后端 API。
 */
async function refreshExchangeRate(): Promise<void> {
    if (exchangeRateLoading.value) {
        return;
    }
    exchangeRateLoading.value = true;
    try {
        const rate = await configApi.exchangeRate();
        costDisplay.setExchangeRate(rate);
        notification.success(t("settings.panels.cost.refreshSuccess", {
            rate: rate.rate.toFixed(4),
            stale: rate.stale ? t("settings.panels.cost.cachedRate") : "",
        }));
    } catch (error) {
        notification.error(resolveApiErrorMessage(error, t("settings.panels.cost.refreshFailed")));
    } finally {
        exchangeRateLoading.value = false;
    }
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
    <!-- 费用显示设置 -->
    <div class="space-y-4 pt-1">
        <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="max-w-xl">
                <h3 class="text-base font-semibold text-[var(--text-main)]">{{ t("settings.panels.cost.title") }}</h3>
                <p class="mt-1 text-xs text-[var(--text-secondary)]">{{ t("settings.panels.cost.description") }}</p>
            </div>
        </div>

        <div v-if="loading" class="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-sm">
            <span class="i-lucide-loader-2 h-8 w-8 animate-spin text-[var(--text-muted)]"></span>
            <span class="text-sm text-[var(--text-secondary)]">{{ t("settings.panels.cost.loading") }}</span>
        </div>

        <div v-else class="grid gap-4">
            <section class="rounded-xl border border-[var(--border-color)] border-opacity-60 bg-[var(--bg-input)] bg-opacity-20 p-5 space-y-5 shadow-sm transition-all duration-300 hover:shadow-[0_4px_20px_color-mix(in_srgb,var(--shadow-color)_2%,transparent)]">
                <div class="space-y-1.5">
                    <div class="flex items-center gap-2">
                        <span class="flex h-5 w-5 items-center justify-center rounded bg-[var(--accent-bg)] text-[var(--accent-text)]">
                            <span class="i-lucide-circle-dollar-sign h-3.5 w-3.5"></span>
                        </span>
                        <h4 class="text-xs font-bold tracking-wider text-[var(--text-main)]">{{ t("settings.panels.cost.currencyTitle") }}</h4>
                    </div>
                    <p class="text-xs leading-relaxed text-[var(--text-secondary)]">{{ t("settings.panels.cost.currencyDescription") }}</p>
                </div>

                <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div class="space-y-1.5">
                        <label class="text-xs font-semibold text-[var(--text-secondary)]">{{ t("settings.panels.cost.currencyLabel") }}</label>
                        <FormSelect v-model="costCurrency" :options="currencyOptions" />
                    </div>
                    <button
                        type="button"
                        class="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 text-xs font-medium text-[var(--text-main)] shadow-sm transition-colors hover:bg-[var(--bg-hover)] active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                        :disabled="exchangeRateLoading"
                        @click="void refreshExchangeRate()"
                    >
                        <span v-if="exchangeRateLoading" class="i-lucide-loader-2 mr-1.5 h-3.5 w-3.5 animate-spin"></span>
                        <span v-else class="i-lucide-refresh-cw mr-1.5 h-3.5 w-3.5"></span>
                        {{ t("settings.panels.cost.refreshRate") }}
                    </button>
                </div>

                <div class="rounded-lg border border-[var(--border-color)] border-opacity-40 bg-[var(--bg-input)] bg-opacity-25 px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
                    <div>{{ exchangeRateLabel }}</div>
                    <div v-if="exchangeRateFetchedLabel" class="text-[10px] text-[var(--text-muted)]">{{ exchangeRateFetchedLabel }}</div>
                </div>
            </section>
        </div>
    </div>
</template>
