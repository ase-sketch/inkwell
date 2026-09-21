<script setup lang="ts">
import FormInput from "nbook/app/components/common/form/FormInput.vue";
import FormSelect from "nbook/app/components/common/form/FormSelect.vue";
import type {SelectOption} from "nbook/app/components/common/form/FormSelect.vue";
import {useConfigApi} from "nbook/app/composables/useConfigApi";
import {useNotification} from "nbook/app/composables/useNotification";
import {resolveApiErrorMessage} from "nbook/app/utils/api-error";
import type {ConfigEditorSnapshotDto, ConfigWorkspaceQueryDto, GlobalConfigUpdateDto, SecretConfigValueDto, WebConfigDto} from "nbook/shared/dto/config.dto";

const props = withDefaults(defineProps<{
    targetQuery?: ConfigWorkspaceQueryDto;
    targetLabel?: string;
}>(), {
    targetQuery: undefined,
    targetLabel: "",
});

type SearchProviderKey = "tavily" | "brave";

type WebProviderDraft = {
    enabled: boolean;
    apiKey: string;
    apiKeyConfigured: boolean;
    apiKeyMaskedValue: string | null;
    apiKeyCleared: boolean;
    timeoutMs: string;
};

type WebProviderConfig = {
    enabled?: boolean;
    apiKey?: SecretConfigValueDto;
    timeoutMs?: number | null;
};

type WebDraft = {
    order: SearchProviderKey[];
    tavily: WebProviderDraft;
    brave: WebProviderDraft & {
        country: string;
        searchLang: string;
    };
    localFetch: {
        enabled: boolean;
        timeoutMs: string;
        maxRedirects: string;
        maxBytes: string;
        maxCharacters: string;
        minCharactersForLocal: string;
    };
    tavilyFallback: {
        enabled: boolean;
        timeoutMs: string;
    };
};

const configApi = useConfigApi();
const notification = useNotification();
const {t} = useI18n();
const loading = ref(false);
const saving = ref(false);
const errorText = ref("");
const editorSnapshot = ref<ConfigEditorSnapshotDto | null>(null);
const draft = ref<WebDraft>(createDraft());
const snapshotText = ref("");

const dirty = computed(() => JSON.stringify(buildWebPayload()) !== snapshotText.value);
const providerItems = computed(() => [
    {
        key: "tavily" as const,
        name: "Tavily",
        description: t("settings.panels.web.tavilyProviderDescription"),
        iconClass: "i-lucide-sparkles",
        configured: draft.value.tavily.apiKeyConfigured,
        enabled: draft.value.tavily.enabled,
    },
    {
        key: "brave" as const,
        name: "Brave Search",
        description: t("settings.panels.web.braveProviderDescription"),
        iconClass: "i-lucide-search",
        configured: draft.value.brave.apiKeyConfigured,
        enabled: draft.value.brave.enabled,
    },
]);
const providerOptions = computed<SelectOption[]>(() => [
    {value: "tavily", label: "Tavily", description: t("settings.panels.web.tavilyDescription")},
    {value: "brave", label: "Brave Search", description: t("settings.panels.web.braveDescription")},
]);
const defaultProvider = computed({
    get: (): SearchProviderKey => normalizeOrder(draft.value.order)[0] ?? "tavily",
    set: (providerKey: string): void => {
        if (providerKey !== "tavily" && providerKey !== "brave") {
            return;
        }
        draft.value.order = [providerKey, ...normalizeOrder(draft.value.order).filter((key) => key !== providerKey)];
    },
});

/**
 * 创建空 Web 配置草稿。
 */
function createDraft(): WebDraft {
    return {
        order: ["tavily", "brave"],
        tavily: createProviderDraft(),
        brave: {
            ...createProviderDraft(),
            country: "US",
            searchLang: "en",
        },
        localFetch: {
            enabled: true,
            timeoutMs: "15000",
            maxRedirects: "5",
            maxBytes: "2000000",
            maxCharacters: "20000",
            minCharactersForLocal: "300",
        },
        tavilyFallback: {
            enabled: false,
            timeoutMs: "20000",
        },
    };
}

/**
 * 创建 provider 草稿。
 */
function createProviderDraft(): WebProviderDraft {
    return {
        enabled: false,
        apiKey: "",
        apiKeyConfigured: false,
        apiKeyMaskedValue: null,
        apiKeyCleared: false,
        timeoutMs: "15000",
    };
}

/**
 * 从后端快照应用 Web 配置。
 */
function applySettings(snapshot: ConfigEditorSnapshotDto): void {
    editorSnapshot.value = snapshot;
    const web = snapshot.global.web ?? {};
    const search = web.search ?? {};
    const providers = search.providers ?? {};
    const fetchConfig = web.fetch ?? {};
    draft.value = {
        order: normalizeOrder(search.order),
        tavily: cloneProvider(providers.tavily, "15000"),
        brave: {
            ...cloneProvider(providers.brave, "15000"),
            country: normalizeText(providers.brave?.country, "US").toUpperCase(),
            searchLang: normalizeText(providers.brave?.searchLang, "en").toLowerCase(),
        },
        localFetch: {
            enabled: fetchConfig.local?.enabled ?? true,
            timeoutMs: stringifyNumber(fetchConfig.local?.timeoutMs, 15000),
            maxRedirects: stringifyNumber(fetchConfig.local?.maxRedirects, 5),
            maxBytes: stringifyNumber(fetchConfig.local?.maxBytes, 2000000),
            maxCharacters: stringifyNumber(fetchConfig.local?.maxCharacters, 20000),
            minCharactersForLocal: stringifyNumber(fetchConfig.local?.minCharactersForLocal, 300),
        },
        tavilyFallback: {
            enabled: fetchConfig.tavilyFallback?.enabled ?? false,
            timeoutMs: stringifyNullableNumber(fetchConfig.tavilyFallback?.timeoutMs, 20000),
        },
    };
    snapshotText.value = JSON.stringify(buildWebPayload());
}

/**
 * 克隆 secret provider 配置。
 */
function cloneProvider(provider: WebProviderConfig | undefined, fallbackTimeoutMs: string): WebProviderDraft {
    return {
        enabled: provider?.enabled ?? false,
        apiKey: "",
        apiKeyConfigured: provider?.apiKey?.configured ?? false,
        apiKeyMaskedValue: provider?.apiKey?.maskedValue ?? null,
        apiKeyCleared: false,
        timeoutMs: stringifyNullableNumber(provider?.timeoutMs, Number(fallbackTimeoutMs)),
    };
}

/**
 * 构造 secret 写回负载；空输入表示保留旧值。
 */
function buildSecretPayload(provider: WebProviderDraft): SecretConfigValueDto {
    return {
        configured: provider.apiKeyConfigured,
        maskedValue: provider.apiKeyMaskedValue,
        ...(provider.apiKeyCleared ? {value: ""} : {}),
        ...(!provider.apiKeyCleared && provider.apiKey.trim() ? {value: provider.apiKey.trim()} : {}),
    };
}

/**
 * 构造 web 配置写回段。
 */
function buildWebPayload(): WebConfigDto {
    return {
        search: {
            order: normalizeOrder(draft.value.order),
            providers: {
                tavily: {
                    enabled: draft.value.tavily.enabled,
                    apiKey: buildSecretPayload(draft.value.tavily),
                    timeoutMs: parseNullablePositiveInteger(draft.value.tavily.timeoutMs),
                },
                brave: {
                    enabled: draft.value.brave.enabled,
                    apiKey: buildSecretPayload(draft.value.brave),
                    country: normalizeText(draft.value.brave.country, "US").toUpperCase(),
                    searchLang: normalizeText(draft.value.brave.searchLang, "en").toLowerCase(),
                    timeoutMs: parseNullablePositiveInteger(draft.value.brave.timeoutMs),
                },
            },
        },
        fetch: {
            local: {
                enabled: draft.value.localFetch.enabled,
                timeoutMs: parsePositiveInteger(draft.value.localFetch.timeoutMs, 15000),
                maxRedirects: parseNonNegativeInteger(draft.value.localFetch.maxRedirects, 5),
                maxBytes: parsePositiveInteger(draft.value.localFetch.maxBytes, 2000000),
                maxCharacters: parsePositiveInteger(draft.value.localFetch.maxCharacters, 20000),
                minCharactersForLocal: parseNonNegativeInteger(draft.value.localFetch.minCharactersForLocal, 300),
            },
            tavilyFallback: {
                enabled: draft.value.tavilyFallback.enabled,
                timeoutMs: parseNullablePositiveInteger(draft.value.tavilyFallback.timeoutMs),
            },
        },
    };
}

/**
 * 构造 Global Config 写回体，只替换 web 段并保留其它配置。
 */
function buildGlobalConfigPayload(): GlobalConfigUpdateDto {
    return {
        web: buildWebPayload(),
    };
}

/**
 * 读取 Web 配置。
 */
async function loadSettings(): Promise<void> {
    loading.value = true;
    errorText.value = "";
    try {
        applySettings(await configApi.editorSnapshot(props.targetQuery));
    } catch (error) {
        errorText.value = resolveApiErrorMessage(error, t("settings.panels.web.loadFailed"));
    } finally {
        loading.value = false;
    }
}

/**
 * 重新读取已保存的 Web 工具配置，放弃当前草稿。
 */
async function restoreSettings(): Promise<void> {
    await loadSettings();
}

/**
 * 保存 Web 配置到 Workspace Root Global Config。
 */
async function saveSettings(): Promise<void> {
    if (!dirty.value || saving.value) {
        return;
    }
    saving.value = true;
    errorText.value = "";
    try {
        applySettings(await configApi.saveGlobal(buildGlobalConfigPayload(), props.targetQuery));
        notification.success(t("settings.panels.web.saveSuccess"));
    } catch (error) {
        errorText.value = resolveApiErrorMessage(error, t("settings.panels.web.saveFailed"));
    } finally {
        saving.value = false;
    }
}

/**
 * 切换 provider 启用状态。
 */
function toggleProvider(providerKey: SearchProviderKey): void {
    draft.value[providerKey].enabled = !draft.value[providerKey].enabled;
}

/**
 * 清空 provider API key。
 */
function clearProviderApiKey(providerKey: SearchProviderKey): void {
    const provider = draft.value[providerKey];
    provider.apiKey = "";
    provider.apiKeyConfigured = false;
    provider.apiKeyMaskedValue = null;
    provider.apiKeyCleared = true;
}

/**
 * 调整搜索 provider 顺序。
 */
function moveProvider(providerKey: SearchProviderKey, direction: -1 | 1): void {
    const nextOrder = normalizeOrder(draft.value.order);
    const index = nextOrder.indexOf(providerKey);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= nextOrder.length) {
        return;
    }
    const [item] = nextOrder.splice(index, 1);
    if (!item) {
        return;
    }
    nextOrder.splice(nextIndex, 0, item);
    draft.value.order = nextOrder;
}

/**
 * 返回 provider 草稿。
 */
function providerDraft(providerKey: SearchProviderKey): WebProviderDraft {
    return draft.value[providerKey];
}

/**
 * 返回 provider 是否可以上移/下移。
 */
function canMove(providerKey: SearchProviderKey, direction: -1 | 1): boolean {
    const index = normalizeOrder(draft.value.order).indexOf(providerKey);
    const nextIndex = index + direction;
    return index >= 0 && nextIndex >= 0 && nextIndex < draft.value.order.length;
}

/**
 * 规范化 provider 顺序，确保 Brave 和 Tavily 都出现一次。
 */
function normalizeOrder(order: unknown): SearchProviderKey[] {
    const values = Array.isArray(order) ? order : [];
    const normalized = values.filter((item): item is SearchProviderKey => item === "tavily" || item === "brave");
    for (const key of ["tavily", "brave"] as const) {
        if (!normalized.includes(key)) {
            normalized.push(key);
        }
    }
    return [...new Set(normalized)];
}

function stringifyNumber(value: unknown, fallback: number): string {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : String(fallback);
}

function stringifyNullableNumber(value: unknown, fallback: number): string {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : String(fallback);
}

function normalizeText(value: unknown, fallback: string): string {
    const text = typeof value === "string" ? value.trim() : "";
    return text || fallback;
}

function parseNullablePositiveInteger(value: string): number | null {
    const normalized = value.trim();
    if (!normalized) {
        return null;
    }
    return parsePositiveInteger(normalized, 0) || null;
}

function parsePositiveInteger(value: string, fallback: number): number {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function parseNonNegativeInteger(value: string, fallback: number): number {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

watch(() => [props.targetQuery?.workspaceKind, props.targetQuery?.projectRoot] as const, () => {
    void loadSettings();
});

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
    <!-- Web 工具配置 -->
    <div class="space-y-4 pt-1">
        <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="max-w-xl">
                <h3 class="text-base font-semibold text-[var(--text-main)]">{{ t("settings.panels.web.title") }}</h3>
                <p class="mt-1 text-xs text-[var(--text-secondary)]">{{ t("settings.panels.web.description") }}</p>
            </div>
        </div>

        <div v-if="errorText" class="flex items-start gap-3 rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 shadow-sm">
            <span class="i-lucide-alert-circle mt-0.5 h-4 w-4 shrink-0 text-[var(--status-danger)]"></span>
            <div class="text-sm text-[var(--status-danger)]">{{ errorText }}</div>
        </div>

        <div v-if="loading" class="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-sm">
            <span class="i-lucide-loader-2 h-8 w-8 animate-spin text-[var(--text-muted)]"></span>
            <span class="text-sm text-[var(--text-secondary)]">{{ t("settings.panels.web.loading") }}</span>
        </div>

        <div v-else class="space-y-4">
            <section class="rounded-xl border border-[var(--border-color)] border-opacity-60 bg-[var(--bg-input)] bg-opacity-20 p-5 shadow-sm">
                <div class="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="flex h-5 w-5 items-center justify-center rounded bg-[var(--accent-bg)] text-[var(--accent-text)]">
                                <span class="i-lucide-search h-3.5 w-3.5"></span>
                            </span>
                            <h4 class="text-xs font-bold tracking-wider text-[var(--text-main)]">{{ t("settings.panels.web.searchProvider") }}</h4>
                        </div>
                        <p class="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">{{ t("settings.panels.web.searchProviderDescription") }}</p>
                    </div>
                    <div class="w-[260px] shrink-0 space-y-1.5">
                        <div class="text-[11px] font-semibold text-[var(--text-secondary)]">{{ t("settings.panels.web.defaultSearchProvider") }}</div>
                        <FormSelect v-model="defaultProvider" :options="providerOptions" />
                        <div class="truncate text-[10px] text-[var(--text-muted)]">Fallback: {{ draft.order.map((key) => key === "tavily" ? "Tavily" : "Brave").join(" -> ") }}</div>
                    </div>
                </div>

                <div class="grid gap-3">
                    <div v-for="item in providerItems" :key="item.key" class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-4 shadow-sm">
                        <div class="flex flex-wrap items-start justify-between gap-3">
                            <div class="flex min-w-0 items-start gap-3">
                                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-input)] text-[var(--text-secondary)]">
                                    <span :class="item.iconClass" class="h-4 w-4"></span>
                                </div>
                                <div class="min-w-0">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <h5 class="text-sm font-semibold text-[var(--text-main)]">{{ item.name }}</h5>
                                        <span class="h-2 w-2 rounded-full" :class="item.enabled ? 'bg-[var(--status-success)]' : 'bg-[var(--text-muted)]'"></span>
                                        <span class="rounded border border-[var(--border-color)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{{ item.configured ? t("settings.panels.web.keyConfigured") : t("settings.panels.web.noKey") }}</span>
                                    </div>
                                    <p class="mt-1 text-xs text-[var(--text-secondary)]">{{ item.description }}</p>
                                </div>
                            </div>

                            <div class="flex items-center gap-1.5">
                                <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40" :disabled="!canMove(item.key, -1)" :title="t('settings.panels.web.moveUp')" @click="moveProvider(item.key, -1)">
                                    <span class="i-lucide-arrow-up h-3.5 w-3.5"></span>
                                </button>
                                <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40" :disabled="!canMove(item.key, 1)" :title="t('settings.panels.web.moveDown')" @click="moveProvider(item.key, 1)">
                                    <span class="i-lucide-arrow-down h-3.5 w-3.5"></span>
                                </button>
                                <button type="button" class="relative h-6 w-11 rounded-full border transition-colors" :class="item.enabled ? 'border-[var(--accent-main)] bg-[var(--accent-main)]' : 'border-[var(--border-color)] bg-[var(--bg-input)]'" :title="item.enabled ? t('settings.panels.web.disableProvider') : t('settings.panels.web.enableProvider')" @click="toggleProvider(item.key)">
                                    <span class="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform" :class="item.enabled ? 'translate-x-5' : 'translate-x-0.5'"></span>
                                </button>
                            </div>
                        </div>

                        <div class="mt-4 grid gap-3 md:grid-cols-3">
                            <label class="space-y-1.5 md:col-span-2">
                                <span class="text-xs font-medium text-[var(--text-secondary)]">{{ t("settings.panels.web.apiKey") }}</span>
                                <div class="flex gap-2">
                                    <FormInput v-model="providerDraft(item.key).apiKey" type="password" :placeholder="providerDraft(item.key).apiKeyConfigured ? providerDraft(item.key).apiKeyMaskedValue ?? t('settings.panels.web.apiKeyConfigured') : t('settings.panels.web.notConfigured')" />
                                    <button type="button" class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-2.5 text-[11px] font-medium text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]" @click="clearProviderApiKey(item.key)">
                                        <span class="i-lucide-trash-2 h-3.5 w-3.5"></span>
                                        {{ t("settings.panels.web.clear") }}
                                    </button>
                                </div>
                            </label>

                            <label class="space-y-1.5">
                                <span class="text-xs font-medium text-[var(--text-secondary)]">{{ t("settings.panels.web.timeoutMs") }}</span>
                                <FormInput v-model="providerDraft(item.key).timeoutMs" type="number" min="1000" step="1000" placeholder="15000" />
                            </label>

                            <template v-if="item.key === 'brave'">
                                <label class="space-y-1.5">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">{{ t("settings.panels.web.country") }}</span>
                                    <FormInput v-model="draft.brave.country" placeholder="US" />
                                </label>
                                <label class="space-y-1.5">
                                    <span class="text-xs font-medium text-[var(--text-secondary)]">{{ t("settings.panels.web.searchLang") }}</span>
                                    <FormInput v-model="draft.brave.searchLang" placeholder="en" />
                                </label>
                            </template>
                        </div>
                    </div>
                </div>
            </section>

            <section class="rounded-xl border border-[var(--border-color)] border-opacity-60 bg-[var(--bg-input)] bg-opacity-20 p-5 shadow-sm">
                <div class="mb-4 flex items-center gap-2">
                    <span class="flex h-5 w-5 items-center justify-center rounded bg-[var(--accent-bg)] text-[var(--accent-text)]">
                        <span class="i-lucide-file-down h-3.5 w-3.5"></span>
                    </span>
                    <h4 class="text-xs font-bold tracking-wider text-[var(--text-main)]">{{ t("settings.panels.web.localFetch") }}</h4>
                </div>

                <div class="grid gap-3 md:grid-cols-3">
                    <button type="button" class="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-3 text-left shadow-sm transition-all hover:bg-[var(--bg-hover)]" @click="draft.localFetch.enabled = !draft.localFetch.enabled">
                        <span><span class="block text-sm font-medium text-[var(--text-main)]">{{ t("settings.panels.web.localFirst") }}</span><span class="mt-0.5 block text-xs text-[var(--text-secondary)]">{{ t("settings.panels.web.localFirstDescription") }}</span></span>
                        <span class="h-2.5 w-2.5 rounded-full" :class="draft.localFetch.enabled ? 'bg-[var(--status-success)]' : 'bg-[var(--text-muted)]'"></span>
                    </button>
                    <label class="space-y-1.5">
                        <span class="text-xs font-medium text-[var(--text-secondary)]">{{ t("settings.panels.web.timeoutMs") }}</span>
                        <FormInput v-model="draft.localFetch.timeoutMs" type="number" min="1000" step="1000" />
                    </label>
                    <label class="space-y-1.5">
                        <span class="text-xs font-medium text-[var(--text-secondary)]">{{ t("settings.panels.web.maxRedirects") }}</span>
                        <FormInput v-model="draft.localFetch.maxRedirects" type="number" min="0" step="1" />
                    </label>
                    <label class="space-y-1.5">
                        <span class="text-xs font-medium text-[var(--text-secondary)]">{{ t("settings.panels.web.maxBytes") }}</span>
                        <FormInput v-model="draft.localFetch.maxBytes" type="number" min="1024" step="1024" />
                    </label>
                    <label class="space-y-1.5">
                        <span class="text-xs font-medium text-[var(--text-secondary)]">{{ t("settings.panels.web.maxCharacters") }}</span>
                        <FormInput v-model="draft.localFetch.maxCharacters" type="number" min="1000" step="1000" />
                    </label>
                    <label class="space-y-1.5">
                        <span class="text-xs font-medium text-[var(--text-secondary)]">{{ t("settings.panels.web.fallbackThreshold") }}</span>
                        <FormInput v-model="draft.localFetch.minCharactersForLocal" type="number" min="0" step="100" />
                    </label>
                </div>
            </section>

            <section class="rounded-xl border border-[var(--border-color)] border-opacity-60 bg-[var(--bg-input)] bg-opacity-20 p-5 shadow-sm">
                <div class="mb-4 flex items-center justify-between gap-4">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="flex h-5 w-5 items-center justify-center rounded bg-[var(--accent-bg)] text-[var(--accent-text)]">
                                <span class="i-lucide-rotate-cw h-3.5 w-3.5"></span>
                            </span>
                            <h4 class="text-xs font-bold tracking-wider text-[var(--text-main)]">{{ t("settings.panels.web.tavilyFallback") }}</h4>
                        </div>
                        <p class="mt-1.5 text-xs text-[var(--text-secondary)]">{{ t("settings.panels.web.tavilyFallbackDescription") }}</p>
                    </div>
                    <button type="button" class="relative h-6 w-11 rounded-full border transition-colors" :class="draft.tavilyFallback.enabled ? 'border-[var(--accent-main)] bg-[var(--accent-main)]' : 'border-[var(--border-color)] bg-[var(--bg-input)]'" @click="draft.tavilyFallback.enabled = !draft.tavilyFallback.enabled">
                        <span class="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform" :class="draft.tavilyFallback.enabled ? 'translate-x-5' : 'translate-x-0.5'"></span>
                    </button>
                </div>
                <div class="max-w-xs space-y-1.5">
                    <span class="text-xs font-medium text-[var(--text-secondary)]">{{ t("settings.panels.web.fallbackTimeoutMs") }}</span>
                    <FormInput v-model="draft.tavilyFallback.timeoutMs" type="number" min="1000" step="1000" placeholder="20000" />
                </div>
            </section>
        </div>
    </div>
</template>
