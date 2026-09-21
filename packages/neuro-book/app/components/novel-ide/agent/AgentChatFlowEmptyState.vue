<script setup lang="ts">
import NovelIdeSettingsDialog from "nbook/app/components/novel-ide/NovelIdeSettingsDialog.vue";
import {useConfigApi} from "nbook/app/composables/useConfigApi";
import {useNovelIdeStore} from "nbook/app/stores/novel-ide";

const emit = defineEmits<{
    (event: "start-interview"): void;
}>();

const {t} = useI18n();
const configApi = useConfigApi();
const novelIdeStore = useNovelIdeStore();
const settingsDialogOpen = ref(false);
const hasAvailableModels = ref<boolean | null>(null);

/** 检测全局配置中是否有启用的 provider 且其下包含启用的模型。 */
const checkAvailableModels = async (): Promise<void> => {
    try {
        const snapshot = await configApi.editorSnapshot(configApi.globalQuery());
        const providers = snapshot.modelSettings?.providers ?? [];
        hasAvailableModels.value = providers.some((provider) => provider.enabled && provider.models?.some((model) => model.enabled));
    } catch {
        // 请求失败或异常时保持温和，不误弹引导卡
        hasAvailableModels.value = true;
    }
};

onMounted(() => {
    void checkAvailableModels();
});

watch(() => novelIdeStore.configRevision, () => {
    void checkAvailableModels();
});
</script>

<template>
    <!-- 空态引导：模型未配置时的温和引导卡 + 开始新书访谈入口（B2 交付，行为不变） -->
    <div class="flex w-full max-w-[420px] flex-col space-y-3 pt-1">
        <button
            v-if="hasAvailableModels === false"
            type="button"
            class="group flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-left shadow-sm transition-all hover:bg-[var(--bg-hover)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-warning)]"
            @click="settingsDialogOpen = true"
        >
            <div class="flex min-w-0 items-center gap-3.5">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--status-warning-border)] bg-[var(--bg-panel)] text-[var(--status-warning)] transition-colors group-hover:border-[var(--status-warning)]">
                    <span class="i-lucide-settings-2 h-5 w-5"></span>
                </div>
                <div class="min-w-0">
                    <span class="block truncate text-sm font-semibold text-[var(--text-main)]">
                        {{ t("agent.chat.configureModelGuide") }}
                    </span>
                    <span class="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">
                        {{ t("agent.chat.configureModelGuideHint") }}
                    </span>
                </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--status-warning)]">
                <span>{{ t("agent.chat.configureModelAction") }}</span>
                <span class="i-lucide-arrow-right h-4 w-4 transition-transform group-hover:translate-x-0.5"></span>
            </div>
        </button>

        <!-- 「开始新书访谈」卡片：未配置模型时依然可见可点（温和不阻断） -->
        <button
            type="button"
            class="group flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-4 text-left shadow-sm transition-all hover:border-[var(--border-accent)] hover:bg-[var(--bg-hover)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-main)]"
            @click="emit('start-interview')"
        >
            <div class="flex min-w-0 items-center gap-3.5">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-bg)] text-[var(--accent-text)] transition-colors group-hover:bg-[var(--accent-main)] group-hover:text-[var(--text-inverse)]">
                    <span class="i-lucide-book-open-text h-5 w-5"></span>
                </div>
                <div class="min-w-0">
                    <span class="block truncate text-sm font-semibold text-[var(--text-main)]">
                        {{ t("agent.chat.startInterview") }}
                    </span>
                    <span class="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                        {{ t("agent.chat.startInterviewHint") }}
                    </span>
                </div>
            </div>
            <span class="i-lucide-arrow-right h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent-text)]"></span>
        </button>

        <NovelIdeSettingsDialog v-if="settingsDialogOpen" v-model="settingsDialogOpen" />
    </div>
</template>
