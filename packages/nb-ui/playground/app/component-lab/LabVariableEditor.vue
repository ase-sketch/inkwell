<script setup lang="ts">
import {computed, ref} from "vue";
import IconButton from "../../../src/components/controls/IconButton.vue";
import FormInput from "../../../src/components/form/FormInput.vue";
import type {LabTokenGroup} from "./registry";

// 回调用函数 prop 而不是 emit：emit 的返回值拿不到，异常也会被 Vue 错误处理吞掉，
// 而单项校验与原子导入都依赖同步的异常与返回值。
const props = defineProps<{
    groups: LabTokenGroup[];
    resolvedValues: Record<string, string>;
    overrides: Record<string, string>;
    overrideCount: number;
    onUpdate: (name: string, value: string) => void;
    onReset: (name: string) => void;
    onResetAll: () => void;
    /** 导入是原子的：整份校验通过才替换，任何非法项抛错且旧覆盖不变 */
    onImport: (raw: string) => number;
    onExport: () => string;
}>();

const query = ref("");
const status = ref<{ok: boolean; text: string} | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const filteredGroups = computed(() => {
    const needle = query.value.trim().toLowerCase();
    if (needle === "") return props.groups;
    return props.groups
        .map((group) => ({...group, tokens: group.tokens.filter((token) => token.toLowerCase().includes(needle))}))
        .filter((group) => group.tokens.length > 0);
});

function tokenKind(name: string): string {
    if (name.startsWith("--bg-") || name.startsWith("--text-") || name.startsWith("--accent-") || name.startsWith("--status-") || name.includes("surface") || name.includes("outline") || name === "--divider") return "颜色";
    if (name.includes("motion")) return "时长";
    if (name.includes("radius") || name.includes("space") || name.includes("control-h") || name.includes("control-px") || name.includes("panel-p") || name.includes("gap")) return "长度";
    if (name.includes("shadow") || name.includes("elevation") || name.includes("blur") || name.includes("backdrop")) return "效果";
    return "CSS";
}

function applyUpdate(name: string, value: string): void {
    try {
        props.onUpdate(name, value);
        status.value = null;
    } catch (error) {
        status.value = {ok: false, text: error instanceof Error ? error.message : String(error)};
    }
}

async function copyName(name: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(name);
        status.value = {ok: true, text: `已复制 ${name}`};
    } catch {
        status.value = {ok: false, text: "复制失败"};
    }
}

function exportSnapshot(): void {
    const raw = props.onExport();
    const blob = new Blob([raw], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "nb-ui-component-lab-overrides.json";
    anchor.click();
    URL.revokeObjectURL(url);
    status.value = {ok: true, text: "快照已导出"};
}

async function importFromFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const raw = await file.text();
    try {
        const count = props.onImport(raw);
        status.value = {ok: true, text: `已导入 ${count} 项覆盖`};
    } catch (error) {
        status.value = {ok: false, text: `导入被拒绝：${error instanceof Error ? error.message : String(error)}`};
    }
}
</script>

<template>
    <div class="lab-vars">
        <div class="lab-vars__header">
            <span class="lab-vars__count" :class="{'is-active': overrideCount > 0}">{{ overrideCount }} 项覆盖</span>
            <div class="lab-vars__actions">
                <IconButton title="全部重置" size="sm" :disabled="overrideCount === 0" @click="props.onResetAll()">
                    <span class="i-lucide-rotate-ccw" aria-hidden="true"></span>
                </IconButton>
                <IconButton title="导入 JSON 快照" size="sm" @click="fileInput?.click()">
                    <span class="i-lucide-upload" aria-hidden="true"></span>
                </IconButton>
                <IconButton title="导出 JSON 快照" size="sm" @click="exportSnapshot">
                    <span class="i-lucide-download" aria-hidden="true"></span>
                </IconButton>
            </div>
            <input ref="fileInput" type="file" accept="application/json,.json" class="lab-vars__file" @change="importFromFile">
        </div>

        <div v-if="status" class="lab-vars__status" :class="status.ok ? 'is-ok' : 'is-fail'" role="status">{{ status.text }}</div>

        <div class="lab-vars__search">
            <FormInput v-model="query" type="search" placeholder="筛选变量">
                <template #prefix><span class="i-lucide-search lab-vars__search-icon" aria-hidden="true"></span></template>
            </FormInput>
        </div>

        <div v-if="filteredGroups.length === 0" class="lab-vars__empty">没有匹配变量</div>
        <section v-for="group in filteredGroups" :key="group.id" class="lab-vars__group">
            <h3 class="lab-vars__group-title">{{ group.label }}</h3>
            <div
                v-for="token in group.tokens"
                :key="token"
                class="lab-vars__row"
                :class="{'is-overridden': token in overrides}"
            >
                <span class="lab-vars__swatch" :style="{background: overrides[token] ?? resolvedValues[token] ?? 'transparent'}" aria-hidden="true"></span>
                <code class="lab-vars__name" :title="`${token}（点击复制）`" @click="copyName(token)">{{ token }}</code>
                <span class="lab-vars__kind">{{ tokenKind(token) }}</span>
                <input
                    class="nb-ui-control nb-ui-control-h-sm lab-vars__input rounded-[var(--radius-control)] border bg-[var(--control-surface)] px-2"
                    type="text"
                    :value="overrides[token] ?? ''"
                    :placeholder="resolvedValues[token] || '未定义'"
                    :aria-label="`${token} 覆盖值`"
                    @change="applyUpdate(token, ($event.target as HTMLInputElement).value)"
                    @keydown.enter="($event.target as HTMLInputElement).blur()"
                >
                <IconButton v-if="token in overrides" :title="`重置 ${token}`" size="sm" @click="props.onReset(token)">
                    <span class="i-lucide-rotate-ccw" aria-hidden="true"></span>
                </IconButton>
            </div>
        </section>
    </div>
</template>
