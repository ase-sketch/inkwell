<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import IconButton from "nbook/app/components/common/IconButton.vue";
import { useNovelIdeStore } from "nbook/app/stores/novel-ide";
import {
    getBuiltinSensitiveWords,
    mergeSensitiveWordLists,
    scanSensitiveWords,
    type SensitiveMatch,
} from "nbook/app/utils/sensitive-word-scan";

const props = withDefaults(defineProps<{
    content?: string;
    filePath?: string;
    title?: string;
}>(), {
    content: undefined,
    filePath: undefined,
    title: undefined,
});

const emit = defineEmits<{
    (e: "jump", line: number): void;
    (e: "select", match: SensitiveMatch): void;
    (e: "close"): void;
}>();

const ideStore = useNovelIdeStore();
const {
    isScanningSensitiveWords: storeScanning,
    sensitiveWordMatches: storeMatches,
    customSensitiveWords: storeCustomWords,
    selectedFileContent,
    selectedFilePath,
    lastSensitiveWordScanAt,
} = storeToRefs(ideStore);

const localScanning = ref(false);
const localMatches = ref<SensitiveMatch[] | null>(null);
const localScanned = ref(false);

const isScanning = computed(() => {
    return props.content !== undefined ? localScanning.value : storeScanning.value;
});

const hasScanned = computed(() => {
    if (props.content !== undefined) {
        return localScanned.value;
    }
    return lastSensitiveWordScanAt.value !== null;
});

const matches = computed<SensitiveMatch[]>(() => {
    if (props.content !== undefined) {
        return localMatches.value ?? [];
    }
    return storeMatches.value;
});

const displayTitle = computed(() => {
    if (props.title) {
        return props.title;
    }
    const path = props.filePath ?? selectedFilePath.value;
    if (!path) {
        return "当前正文";
    }
    const segments = path.split("/");
    return segments[segments.length - 1] || path;
});

const builtinCount = computed(() => getBuiltinSensitiveWords().length);
const customCount = computed(() => storeCustomWords.value.length);

async function handleScan(): Promise<void> {
    if (props.content !== undefined) {
        localScanning.value = true;
        try {
            const custom = await ideStore.loadCustomSensitiveWords();
            const words = mergeSensitiveWordLists(getBuiltinSensitiveWords(), custom);
            localMatches.value = scanSensitiveWords(props.content, words);
            localScanned.value = true;
        } finally {
            localScanning.value = false;
        }
    } else {
        await ideStore.scanCurrentFileSensitiveWords();
    }
}

function handleJump(match: SensitiveMatch): void {
    emit("jump", match.line);
    emit("select", match);
}
</script>

<template>
    <section class="flex h-full w-full flex-col bg-[var(--bg-panel)] text-[var(--text-main)]">
        <!-- 顶部标题栏 -->
        <header class="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-color)] px-3">
            <div class="flex items-center gap-2 min-w-0">
                <span class="i-lucide-shield-alert h-4 w-4 shrink-0 text-[var(--accent-text)]"></span>
                <span class="text-sm font-medium truncate">敏感词自查</span>
                <span class="text-xs text-[var(--text-muted)] truncate max-w-[140px]">({{ displayTitle }})</span>
            </div>
            <div class="flex items-center gap-1.5">
                <button
                    type="button"
                    :disabled="isScanning"
                    class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50"
                    :class="[
                        hasScanned
                            ? 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
                            : 'bg-[var(--accent-main)] text-[var(--text-inverse)] hover:opacity-90'
                    ]"
                    @click="handleScan"
                >
                    <span
                        class="h-3.5 w-3.5"
                        :class="isScanning ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-search'"
                    ></span>
                    <span>{{ isScanning ? "扫描中..." : hasScanned ? "重新扫描" : "开始扫描" }}</span>
                </button>
                <IconButton
                    title="关闭面板"
                    size="sm"
                    @click="emit('close')"
                >
                    <span class="i-lucide-x h-4 w-4"></span>
                </IconButton>
            </div>
        </header>

        <!-- 词表信息与扫描概况 -->
        <div class="flex shrink-0 items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
            <span>词表：内置 {{ builtinCount }} 条 · 自定义 {{ customCount }} 条</span>
            <span
                v-if="hasScanned"
                class="inline-flex items-center gap-1 font-medium"
                :class="matches.length > 0 ? 'text-[var(--status-danger)]' : 'text-[var(--status-success)]'"
            >
                <span :class="matches.length > 0 ? 'i-lucide-alert-triangle' : 'i-lucide-check-circle-2'" class="h-3.5 w-3.5"></span>
                <span>{{ matches.length > 0 ? `发现 ${matches.length} 处疑似敏感词` : "未发现敏感词" }}</span>
            </span>
        </div>

        <!-- 结果展示列表 / 状态区 -->
        <div class="flex-1 overflow-y-auto p-3">
            <!-- 正在扫描 -->
            <div v-if="isScanning" class="flex flex-col items-center justify-center py-12 text-center text-xs text-[var(--text-muted)]">
                <span class="i-lucide-loader-2 h-6 w-6 animate-spin text-[var(--accent-text)] mb-2"></span>
                <span>正在扫描正文敏感词...</span>
            </div>

            <!-- 命中结果列表 -->
            <div v-else-if="hasScanned && matches.length > 0" class="flex flex-col gap-2">
                <article
                    v-for="(match, idx) in matches"
                    :key="`${match.word}-${match.line}-${match.column}-${idx}`"
                    tabindex="0"
                    role="button"
                    class="group flex flex-col gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] p-2.5 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--border-accent)] cursor-pointer"
                    @click="handleJump(match)"
                    @keydown.enter.prevent="handleJump(match)"
                    @keydown.space.prevent="handleJump(match)"
                >
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2">
                            <span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-[var(--status-danger-bg)] text-[var(--status-danger)] border border-[var(--status-danger-border)]">
                                {{ match.word }}
                            </span>
                            <span class="text-xs text-[var(--text-muted)]">
                                第 {{ match.line }} 行 : 第 {{ match.column }} 列
                            </span>
                        </div>
                        <span class="inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)] group-hover:text-[var(--accent-text)] transition-colors">
                            <span>跳转</span>
                            <span class="i-lucide-chevron-right h-3 w-3"></span>
                        </span>
                    </div>

                    <!-- 上下文预览片段 -->
                    <div class="rounded bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--text-secondary)] font-mono break-all line-clamp-2">
                        {{ match.context }}
                    </div>
                </article>
            </div>

            <!-- 扫描完成且零命中 -->
            <div v-else-if="hasScanned && matches.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
                <span class="i-lucide-check-circle-2 h-8 w-8 text-[var(--status-success)] mb-2"></span>
                <span class="text-sm font-medium text-[var(--text-main)] mb-1">未检测到敏感词</span>
                <span class="text-xs text-[var(--text-muted)]">当前章节正文未发现内置词表及自定义词表中的敏感词</span>
            </div>

            <!-- 尚未扫描初始状态 -->
            <div v-else class="flex flex-col items-center justify-center py-12 text-center">
                <span class="i-lucide-shield-check h-8 w-8 text-[var(--text-muted)] mb-2"></span>
                <span class="text-sm font-medium text-[var(--text-main)] mb-1">尚未进行敏感词自查</span>
                <p class="text-xs text-[var(--text-muted)] max-w-[220px] mb-4">
                    点击右上角「开始扫描」自查当前章节正文中的违禁及合规敏感词。
                </p>
                <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-main)] px-3 py-1.5 text-xs font-medium text-[var(--text-inverse)] transition-opacity hover:opacity-90"
                    @click="handleScan"
                >
                    <span class="i-lucide-search h-3.5 w-3.5"></span>
                    <span>立即扫描</span>
                </button>
            </div>
        </div>
    </section>
</template>
