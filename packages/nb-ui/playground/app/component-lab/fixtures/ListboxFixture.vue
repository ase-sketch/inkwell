<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from "vue";
import SegmentedControl from "../../../../src/components/controls/SegmentedControl.vue";
import Listbox, {type ListboxGroupData, type ListboxOptionData, type ListboxSize} from "../../../../src/components/form/Listbox.vue";
import FixtureShell from "../FixtureShell.vue";
import {controlDefaultValue, type LabComponentDefinition} from "../registry";

const props = defineProps<{
    definition: LabComponentDefinition;
    sceneId: string;
}>(), emit = defineEmits<{
    (event: "lab-event", name: string, payload?: unknown): void;
    (event: "rendered"): void;
}>();

// 4 种设计方案直接在页面内切换
const designStyle = ref<"compact" | "card" | "grouped" | "transfer">("compact");
const designOptions = [
    {label: "方案 1: macOS 经典检查器 (推荐)", value: "compact"},
    {label: "方案 2: 现代富实体卡片", value: "card"},
    {label: "方案 3: 分段多组折叠大纲", value: "grouped"},
    {label: "方案 4: 双栏穿梭流转分配器", value: "transfer"},
];

const controls = ref<Record<string, string | boolean>>({});
const size = computed<ListboxSize>(() => (controls.value.size as ListboxSize) || "md");
const multiple = computed(() => Boolean(controls.value.multiple !== false));
const showFilter = computed(() => Boolean(controls.value.showFilter !== false));
const showActionBar = computed(() => Boolean(controls.value.showActionBar !== false));
const disabled = computed(() => Boolean(controls.value.disabled) || props.sceneId === "disabled");

// 方案 1: 世界观题材标签
const tagOptions: ListboxOptionData[] = [
    {value: "tag1", label: "赛博朋克", description: "高科技与低生活交织的世界", iconClass: "i-lucide-cpu", badge: "核心题材", badgeTone: "accent"},
    {value: "tag2", label: "硬核科幻", description: "严格基于物理与工程推演", iconClass: "i-lucide-atom", badge: "基准设定", badgeTone: "neutral"},
    {value: "tag3", label: "意识上传", description: "数字永生与记忆重构危机", iconClass: "i-lucide-brain", badge: "主线伏笔", badgeTone: "warning"},
    {value: "tag4", label: "反乌托邦", description: "巨型财阀与地下反抗军碰撞", iconClass: "i-lucide-building-2", badge: "背景社会", badgeTone: "danger"},
    {value: "tag5", label: "悬疑推理", description: "多重伏笔与第404号节点之谜", iconClass: "i-lucide-search", badge: "叙事结构", badgeTone: "neutral"},
    {value: "tag6", label: "太空歌剧", description: "近地轨道殖民地与舰队博弈", iconClass: "i-lucide-rocket", badge: "后期支线", badgeTone: "neutral"},
    {value: "tag7", label: "机械飞升", description: "碳基向硅基形态的终极跃迁", iconClass: "i-lucide-zap", badge: "核心哲学", badgeTone: "accent"},
];
const selectedCompact = ref<string | string[]>(["tag1", "tag3"]);

// 方案 2: 登场人物与设定实体
const characterOptions: ListboxOptionData[] = [
    {
        value: "char1",
        label: "林澈 (Lin Che)",
        description: "前首席深潜调试师，代号「渡鸦」，拥有量子突触钥匙",
        iconClass: "i-lucide-user",
        badge: "主角 · 觉醒中",
        badgeTone: "accent",
    },
    {
        value: "char2",
        label: "苏浅 (Su Qian)",
        description: "荒坂第七实验室叛逃首席科学家，神经义体与矩阵专家",
        iconClass: "i-lucide-user-check",
        badge: "盟友 · 智囊",
        badgeTone: "success",
    },
    {
        value: "char3",
        label: "荒坂源一 (Arasaka)",
        description: "荒坂财阀安全主管，手持重型机械义肢与暗网狙杀令",
        iconClass: "i-lucide-shield-alert",
        badge: "敌对 · 追猎者",
        badgeTone: "danger",
    },
    {
        value: "char4",
        label: "零号幽灵 (Ghost-0)",
        description: "自主进化的强人工智能协议，游荡在未分区意识深海",
        iconClass: "i-lucide-sparkles",
        badge: "中立 · 神秘",
        badgeTone: "warning",
    },
    {
        value: "char5",
        label: "维克托·陈 (Victor)",
        description: "下城区黑市义体医生与情报贩子，地下反抗军联络人",
        iconClass: "i-lucide-wrench",
        badge: "辅助 · 中间人",
        badgeTone: "neutral",
    },
];
const selectedCard = ref<string | string[]>(["char1", "char2"]);

// 方案 3: 分卷大纲多组章节
const groupedChapters: ListboxGroupData[] = [
    {
        id: "vol1",
        label: "第一卷：深潜意识海",
        options: [
            {value: "ch101", label: "第01章：第404号神经节点", description: "林澈在下城区黑诊所苏醒，记忆丢失", iconClass: "i-lucide-file-text", badge: "3.2k字", badgeTone: "neutral"},
            {value: "ch102", label: "第02章：赛博空间的不速之客", description: "暗网追踪与初次意识潜入", iconClass: "i-lucide-file-text", badge: "4.1k字", badgeTone: "neutral"},
            {value: "ch103", label: "第03章：幽灵协议与量子密钥", description: "遭遇荒坂财阀的第一次截杀", iconClass: "i-lucide-file-text", badge: "3.8k字", badgeTone: "accent"},
            {value: "ch104", label: "第04章：雨夜霓虹逃亡", description: "与苏浅在地下反抗军据点会合", iconClass: "i-lucide-file-text", badge: "5.0k字", badgeTone: "success"},
        ],
    },
    {
        id: "vol2",
        label: "第二卷：地下反抗军",
        options: [
            {value: "ch201", label: "第05章：荒坂财阀的悬赏令", description: "下城区全面封锁与矩阵反侦察", iconClass: "i-lucide-file-text", badge: "4.5k字", badgeTone: "warning"},
            {value: "ch202", label: "第06章：机械义肢与黑市交易", description: "升级神经超频插槽", iconClass: "i-lucide-file-text", badge: "3.6k字", badgeTone: "neutral"},
            {value: "ch203", label: "第07章：矩阵中枢潜入行动", description: "正面突破第七实验室防火墙", iconClass: "i-lucide-file-text", badge: "6.2k字", badgeTone: "danger"},
        ],
    },
    {
        id: "vol3",
        label: "第三卷：终极觉醒",
        options: [
            {value: "ch301", label: "第08章：意识深海的真相", description: "发现整个世界为沙盒矩阵", iconClass: "i-lucide-file-text", badge: "5.8k字", badgeTone: "accent"},
            {value: "ch302", label: "第09章：机械与灵魂的终章", description: "打破物理现实与数字的边界", iconClass: "i-lucide-file-text", badge: "7.0k字", badgeTone: "success"},
        ],
    },
];
const selectedGrouped = ref<string | string[]>(["ch101", "ch103", "ch201"]);

// 方案 4: 双栏穿梭流转分配器数据与操作
const transferAvailable = ref<ListboxOptionData[]>([
    {value: "tf1", label: "第01章：第404号神经节点", description: "3.2k字 · 第一卷", iconClass: "i-lucide-file-text"},
    {value: "tf2", label: "第02章：赛博空间的不速之客", description: "4.1k字 · 第一卷", iconClass: "i-lucide-file-text"},
    {value: "tf3", label: "第05章：荒坂财阀的悬赏令", description: "4.5k字 · 第二卷", iconClass: "i-lucide-file-text"},
    {value: "tf4", label: "第06章：机械义肢与黑市交易", description: "3.6k字 · 第二卷", iconClass: "i-lucide-file-text"},
]);
const transferSelected = ref<ListboxOptionData[]>([
    {value: "tf5", label: "第03章：幽灵协议与量子密钥", description: "3.8k字 · 第一卷", iconClass: "i-lucide-file-text", badge: "核心", badgeTone: "accent"},
    {value: "tf6", label: "第04章：雨夜霓虹逃亡", description: "5.0k字 · 第一卷", iconClass: "i-lucide-file-text", badge: "高潮", badgeTone: "success"},
    {value: "tf7", label: "第07章：矩阵中枢潜入行动", description: "6.2k字 · 第二卷", iconClass: "i-lucide-file-text", badge: "终局", badgeTone: "danger"},
]);
const checkedLeft = ref<string[]>([]);
const checkedRight = ref<string[]>([]);

function moveToRight(): void {
    if (checkedLeft.value.length === 0) return;
    const moving = transferAvailable.value.filter((i) => checkedLeft.value.includes(i.value));
    transferSelected.value.push(...moving);
    transferAvailable.value = transferAvailable.value.filter((i) => !checkedLeft.value.includes(i.value));
    checkedLeft.value = [];
}

function moveToLeft(): void {
    if (checkedRight.value.length === 0) return;
    const moving = transferSelected.value.filter((i) => checkedRight.value.includes(i.value));
    transferAvailable.value.push(...moving);
    transferSelected.value = transferSelected.value.filter((i) => !checkedRight.value.includes(i.value));
    checkedRight.value = [];
}

function moveAllToRight(): void {
    transferSelected.value.push(...transferAvailable.value);
    transferAvailable.value = [];
    checkedLeft.value = [];
}

function moveAllToLeft(): void {
    transferAvailable.value.push(...transferSelected.value);
    transferSelected.value = [];
    checkedRight.value = [];
}

function moveItemUp(): void {
    if (checkedRight.value.length !== 1) return;
    const idx = transferSelected.value.findIndex((i) => i.value === checkedRight.value[0]);
    if (idx > 0) {
        const item = transferSelected.value[idx];
        if (item) {
            transferSelected.value.splice(idx, 1);
            transferSelected.value.splice(idx - 1, 0, item);
        }
    }
}

function moveItemDown(): void {
    if (checkedRight.value.length !== 1) return;
    const idx = transferSelected.value.findIndex((i) => i.value === checkedRight.value[0]);
    if (idx >= 0 && idx < transferSelected.value.length - 1) {
        const item = transferSelected.value[idx];
        if (item) {
            transferSelected.value.splice(idx, 1);
            transferSelected.value.splice(idx + 1, 0, item);
        }
    }
}

function resetState(): void {
    const defaults: Record<string, string | boolean> = {};
    for (const control of props.definition.controls) defaults[control.id] = controlDefaultValue(control);
    controls.value = defaults;

    if (props.sceneId === "card") designStyle.value = "card";
    else if (props.sceneId === "grouped") designStyle.value = "grouped";
    else designStyle.value = "compact";
}

watch(() => [props.definition.id, props.sceneId], () => {
    resetState();
    void nextTick(() => emit("rendered"));
}, {immediate: true});

onMounted(() => void nextTick(() => emit("rendered")));
</script>

<template>
    <FixtureShell v-model:controls="controls" :definition="definition" :scene-id="sceneId">
        <!-- 顶层设计风格切换栏（与 IconButton 一致） -->
        <div class="mb-6 flex flex-col gap-3">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 bg-[color-mix(in_srgb,var(--bg-panel)_75%,transparent)] backdrop-blur-xl border border-[color-mix(in_srgb,var(--border-color)_70%,transparent)] shadow-sm">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold text-[var(--text-secondary)]">Listbox 方案:</span>
                    <SegmentedControl
                        v-model="designStyle"
                        :options="designOptions"
                        size="sm"
                    />
                </div>
                <span class="text-xs text-[var(--text-muted)]">点击选项体验实时勾选与搜索反馈</span>
            </div>

            <!-- 设计说明条 -->
            <div class="scheme-banner">
                <div class="flex items-start gap-2.5">
                    <span class="scheme-pill">方案解析</span>
                    <span v-if="designStyle === 'compact'" class="scheme-banner-text">
                        <strong>方案 1：macOS 经典紧凑检查器（推荐）</strong>——<code>28px~32px</code> 紧凑行高，单选高亮品牌蓝底，多选为左侧实心超椭圆微 Checkbox，集成即时搜索与底部快捷全选/反选/清空栏，极致利用桌面侧栏空间。
                    </span>
                    <span v-else-if="designStyle === 'card'" class="scheme-banner-text">
                        <strong>方案 2：现代富实体卡片列表</strong>——独立微卡片排版，左侧大图标/头像插槽，粗体主标题 + 2 行副标题描述，右侧状态胶囊徽章（<code>主角 · 觉醒中</code>、<code>敌对 · 追猎者</code>），选中态带有 <code>0 0 0 1.5px var(--accent-main)</code> 柔光微外框。
                    </span>
                    <span v-else-if="designStyle === 'grouped'" class="scheme-banner-text">
                        <strong>方案 3：分段多组折叠大纲</strong>——按卷章（第一卷、第二卷、第三卷）分类聚合，粘性磨砂组头展示总字数与篇目，支持一键「切换全选本组」，跨组即时模糊搜索。
                    </span>
                    <span v-else-if="designStyle === 'transfer'" class="scheme-banner-text">
                        <strong>方案 4：双栏穿梭流转分配器（Shuttle Transfer）</strong>——左栏「全部待选分卷章节池」，右栏「本次导出目标章节」，中间配备穿梭操作流转按钮（<code>&gt;</code>、<code>&lt;</code>、<code>&gt;&gt;</code>、<code>&lt;&lt;</code>），支持在已选栏中上下调整导出排版顺序。
                    </span>
                </div>
            </div>
        </div>

        <!-- 紧凑 macOS 容器卡片 -->
        <div class="macos-compact-card space-y-4 w-full" :class="designStyle === 'transfer' ? '!max-w-2xl' : '!max-w-md'">
            <!-- 容器标题栏 -->
            <div class="flex items-center justify-between pb-2 border-b border-[color-mix(in_srgb,var(--border-color)_60%,transparent)]">
                <div>
                    <h3 class="text-sm font-bold text-[var(--text-main)]">
                        {{ designStyle === 'compact' ? '作品题材与世界观标签库 (Compact)' : designStyle === 'card' ? '出场角色与设定实体卡片 (Rich Cards)' : designStyle === 'grouped' ? '分卷大纲章节多组聚合 (Grouped Sections)' : '电子书排版导出章节穿梭分配器 (Dual Shuttle)' }}
                    </h3>
                    <p class="text-xs text-[var(--text-muted)] mt-0.5">
                        {{ designStyle === 'transfer' ? '在左侧待选池与右侧已选区间穿梭流转，并可调整导出顺序。' : '支持多选、即时过滤、全选/反选与键盘导航。' }}
                    </p>
                </div>
                <span class="rounded-full bg-[color-mix(in_srgb,var(--accent-main)_12%,transparent)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent-main)]">
                    列表选择框 · Listbox
                </span>
            </div>

            <!-- 视图渲染区 -->
            <!-- 方案 1: 经典紧凑列表 -->
            <div v-if="designStyle === 'compact'" class="space-y-2">
                <Listbox
                    id="nb-lab-target"
                    v-model="selectedCompact"
                    :options="tagOptions"
                    variant="compact"
                    :size="size"
                    :multiple="multiple"
                    :show-filter="showFilter"
                    :show-action-bar="showActionBar"
                    :disabled="disabled"
                    max-height="300px"
                    @update:model-value="emit('lab-event', 'update:modelValue', $event)"
                />
            </div>

            <!-- 方案 2: 现代富卡片实体列表 -->
            <div v-else-if="designStyle === 'card'" class="space-y-2">
                <Listbox
                    id="nb-lab-target"
                    v-model="selectedCard"
                    :options="characterOptions"
                    variant="card"
                    :size="size"
                    :multiple="multiple"
                    :show-filter="showFilter"
                    :show-action-bar="showActionBar"
                    :disabled="disabled"
                    max-height="320px"
                    @update:model-value="emit('lab-event', 'update:modelValue', $event)"
                />
            </div>

            <!-- 方案 3: 分段多组折叠大纲 -->
            <div v-else-if="designStyle === 'grouped'" class="space-y-2">
                <Listbox
                    id="nb-lab-target"
                    v-model="selectedGrouped"
                    :groups="groupedChapters"
                    variant="compact"
                    :size="size"
                    :multiple="multiple"
                    :show-filter="showFilter"
                    :show-action-bar="showActionBar"
                    :disabled="disabled"
                    max-height="320px"
                    @update:model-value="emit('lab-event', 'update:modelValue', $event)"
                />
            </div>

            <!-- 方案 4: 双栏穿梭流转分配器 -->
            <div v-else-if="designStyle === 'transfer'" class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <!-- 左栏：待选章节池 -->
                <div class="flex flex-col space-y-1.5 min-w-0">
                    <span class="text-xs font-semibold text-[var(--text-secondary)] flex items-center justify-between">
                        <span>待选章节池</span>
                        <span class="font-mono text-[10px] opacity-70">{{ transferAvailable.length }} 篇</span>
                    </span>
                    <Listbox
                        v-model="checkedLeft"
                        :options="transferAvailable"
                        variant="compact"
                        size="sm"
                        multiple
                        show-filter
                        filter-placeholder="过滤待选项..."
                        max-height="240px"
                    />
                </div>

                <!-- 中间穿梭操作按钮组 -->
                <div class="flex flex-col items-center justify-center gap-1.5 px-1 py-4">
                    <button
                        type="button"
                        title="选中项移入右侧"
                        :disabled="checkedLeft.length === 0"
                        class="nb-ui-focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--border-color)_70%,transparent)] bg-[var(--bg-panel)] text-xs text-[var(--text-main)] shadow-sm hover:bg-[color-mix(in_srgb,var(--accent-main)_14%,transparent)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors [transition-duration:var(--motion-fast)] cursor-pointer"
                        @click="moveToRight"
                    >
                        <span class="i-lucide-chevron-right h-4 w-4" aria-hidden="true" />
                    </button>

                    <button
                        type="button"
                        title="全部移入右侧"
                        :disabled="transferAvailable.length === 0"
                        class="nb-ui-focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--border-color)_70%,transparent)] bg-[var(--bg-panel)] text-xs text-[var(--text-main)] shadow-sm hover:bg-[color-mix(in_srgb,var(--accent-main)_14%,transparent)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors [transition-duration:var(--motion-fast)] cursor-pointer"
                        @click="moveAllToRight"
                    >
                        <span class="i-lucide-chevrons-right h-4 w-4" aria-hidden="true" />
                    </button>

                    <button
                        type="button"
                        title="选中项移出左侧"
                        :disabled="checkedRight.length === 0"
                        class="nb-ui-focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--border-color)_70%,transparent)] bg-[var(--bg-panel)] text-xs text-[var(--text-main)] shadow-sm hover:bg-[color-mix(in_srgb,var(--accent-main)_14%,transparent)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors [transition-duration:var(--motion-fast)] cursor-pointer"
                        @click="moveToLeft"
                    >
                        <span class="i-lucide-chevron-left h-4 w-4" aria-hidden="true" />
                    </button>

                    <button
                        type="button"
                        title="全部移出左侧"
                        :disabled="transferSelected.length === 0"
                        class="nb-ui-focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--border-color)_70%,transparent)] bg-[var(--bg-panel)] text-xs text-[var(--text-main)] shadow-sm hover:bg-[color-mix(in_srgb,var(--accent-main)_14%,transparent)] hover:text-[var(--accent-main)] hover:border-[var(--accent-main)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors [transition-duration:var(--motion-fast)] cursor-pointer"
                        @click="moveAllToLeft"
                    >
                        <span class="i-lucide-chevrons-left h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <!-- 右栏：本次导出章节 (支持排序) -->
                <div class="flex flex-col space-y-1.5 min-w-0">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-[var(--accent-main)] flex items-center gap-1">
                            <span>本次导出目标</span>
                            <span class="font-mono text-[10px] opacity-70">({{ transferSelected.length }} 篇)</span>
                        </span>
                        <div class="flex items-center gap-1">
                            <button
                                type="button"
                                title="上移选中项"
                                :disabled="checkedRight.length !== 1"
                                class="nb-ui-focus-ring flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors [transition-duration:var(--motion-fast)] cursor-pointer"
                                @click="moveItemUp"
                            >
                                <span class="i-lucide-arrow-up h-3 w-3" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                title="下移选中项"
                                :disabled="checkedRight.length !== 1"
                                class="nb-ui-focus-ring flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors [transition-duration:var(--motion-fast)] cursor-pointer"
                                @click="moveItemDown"
                            >
                                <span class="i-lucide-arrow-down h-3 w-3" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                    <Listbox
                        v-model="checkedRight"
                        :options="transferSelected"
                        variant="compact"
                        size="sm"
                        multiple
                        show-filter
                        filter-placeholder="过滤已选项..."
                        max-height="240px"
                    />
                </div>
            </div>
        </div>
    </FixtureShell>
</template>

<style scoped>
.scheme-banner {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--bg-panel) 70%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid color-mix(in srgb, var(--border-color) 60%, transparent);
}

.scheme-pill {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    background: var(--accent-main);
    color: #ffffff;
    flex-shrink: 0;
}

.scheme-banner-text {
    font-size: var(--text-xs);
    color: var(--text-main);
    line-height: 1.4;
}

.scheme-banner-text strong {
    color: var(--text-main);
}

.scheme-banner-text code {
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 1px 4px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--text-main) 8%, transparent);
}

.macos-compact-card {
    width: 100%;
    margin: var(--space-2) auto 0;
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
