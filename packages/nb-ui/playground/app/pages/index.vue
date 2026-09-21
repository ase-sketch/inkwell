<script setup lang="ts">
import {ref} from "vue";
import Button from "../../../src/components/controls/Button.vue";
import IconButton from "../../../src/components/controls/IconButton.vue";
import SegmentedControl from "../../../src/components/controls/SegmentedControl.vue";
import Badge, {type BadgeTone} from "../../../src/components/display/Badge.vue";
import FormInput from "../../../src/components/form/FormInput.vue";
import FormSelect from "../../../src/components/form/FormSelect.vue";
import SwitchField from "../../../src/components/controls/SwitchField.vue";
import TimePicker from "../../../src/components/form/TimePicker.vue";
import {useColorway} from "../composables/useColorway";
import {useTheme} from "../composables/useTheme";

const theme = useTheme();
const colorway = useColorway();

// ── 演示状态 ────────────────────────────────────────────────────────────────
const activeTab = ref("outline");
const viewMode = ref<string | number | boolean | null>("write");
const chapter = ref("第 12 章 · 灰烬之前");
const summary = ref("裴照在旧档案馆找到母亲留下的第二封信，信里提到「灯塔」不是地名。");
const wordGoal = ref("2400");
const invalidGoal = ref("0");
const autosave = ref(true);
const publish = ref(false);
const activeChapterId = ref("c12");
/** 组件覆盖探针的 v-model。契约里 modelValue 是 "HH:mm" 字符串，不是 Date */
const reminderAt = ref<string | undefined>("09:30");

/** 下拉的 v-model。这一处是真组件，用来看浮层有没有吃到主题的玻璃 */
const pickedFormat = ref("markdown");
const formatOptions = [
    {label: "Markdown（.md）", value: "markdown", iconClass: "i-lucide-file-text"},
    {label: "纯文本（.txt）", value: "text", iconClass: "i-lucide-file"},
    {label: "Word 文档（.docx）", value: "docx", iconClass: "i-lucide-file-type"},
    {label: "EPUB 电子书", value: "epub", iconClass: "i-lucide-book"},
    {label: "PDF（暂不可用）", value: "pdf", disabled: true},
];

const chapters = [
    {id: "c10", label: "第 10 章 · 潮线", state: "done"},
    {id: "c11", label: "第 11 章 · 无人接听", state: "done"},
    {id: "c12", label: "第 12 章 · 灰烬之前", state: "writing"},
    {id: "c13", label: "第 13 章 · 未命名", state: "empty"},
];

const tabs = [
    {value: "outline", label: "大纲"},
    {value: "notes", label: "笔记"},
    {value: "history", label: "版本"},
];

const rows = [
    {name: "chapter-12.md", status: "写作中", tone: "warning" as const, words: "1,842", time: "3 分钟前"},
    {name: "chapter-11.md", status: "已同步", tone: "success" as const, words: "2,610", time: "昨天"},
    {name: "outline.md", status: "有冲突", tone: "danger" as const, words: "764", time: "2 天前"},
];

const badges: {tone: BadgeTone; label: string}[] = [
    {tone: "neutral", label: "草稿"},
    {tone: "accent", label: "当前"},
    {tone: "success", label: "已同步"},
    {tone: "warning", label: "待审"},
    {tone: "danger", label: "冲突"},
];

const viewOptions = [
    {label: "写作", value: "write"},
    {label: "剧情", value: "plot"},
    {label: "审阅", value: "review"},
];
</script>

<template>
    <main class="sc-root min-h-full px-4 py-6">
        <div class="sc-page-shell mx-auto max-w-6xl">
            <div class="sc-page-content">
                <!-- ── 当前主题说明 ──────────────────────────────────────────── -->
                <section class="flex flex-col gap-3">
                    <div class="flex flex-wrap items-baseline gap-3">
                        <h1 class="sc-display">{{ theme.active.value?.manifest.name ?? "未装主题" }}</h1>
                        <span class="sc-secondary">{{ theme.active.value?.manifest.tagline }}</span>
                        <span class="sc-muted">
                            · 配色 {{ colorway.colorwayMeta[colorway.current.value]?.label ?? colorway.current.value }}
                        </span>
                    </div>
                    <p class="sc-secondary max-w-3xl">
                        {{ theme.active.value?.manifest.description ?? "一个主题都没装是受支持的状态：界面能用，只是没有设计感。" }}
                    </p>
                </section>

                <!-- ── ① 真实界面切片：这才是判断主题的主要依据 ───────────────────── -->
                <section class="flex flex-col gap-3">
                    <h2 class="sc-title sc-secondary">① 界面切片 · 写作工作台</h2>

                    <div class="sc-window sc-rim">
                        <div class="sc-toolbar sc-glass">
                            <!-- 真 SegmentedControl 组件 -->
                            <SegmentedControl
                                v-model="viewMode"
                                :options="viewOptions"
                                size="xs"
                            />

                            <div class="sc-secondary flex items-center gap-2">
                                <span class="i-lucide-file-text h-4 w-4"></span>
                                <span>{{ chapter }}</span>
                                <Badge tone="warning" size="sm" dot>未保存</Badge>
                            </div>

                            <div class="ml-auto flex items-center gap-1.5">
                                <IconButton title="搜索" size="sm"><span class="i-lucide-search h-3.5 w-3.5"></span></IconButton>
                                <IconButton title="历史" size="sm"><span class="i-lucide-history h-3.5 w-3.5"></span></IconButton>
                                <IconButton title="设置" size="sm"><span class="i-lucide-settings h-3.5 w-3.5"></span></IconButton>
                                <Button variant="primary" size="sm">
                                    <span class="i-lucide-sparkles h-3.5 w-3.5" aria-hidden="true"></span>续写
                                </Button>
                            </div>
                        </div>

                        <div class="grid gap-0 md:grid-cols-[220px_1fr_260px]">
                            <!-- 章节列表 -->
                            <div class="sc-sidebar sc-glass p-4" style="border-right: var(--border-w) solid var(--divider)">
                                <div class="sc-muted mb-3">章节</div>
                                <div class="sc-list">
                                    <div
                                        v-for="c in chapters"
                                        :key="c.id"
                                        class="sc-list__item"
                                        :aria-current="activeChapterId === c.id"
                                        @click="activeChapterId = c.id"
                                    >
                                        <span
                                            class="h-4 w-4 shrink-0"
                                            :class="c.state === 'empty' ? 'i-lucide-file-plus' : 'i-lucide-file-text'"
                                        ></span>
                                        <span class="truncate">{{ c.label }}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- 属性表单 -->
                            <div class="sc-content sc-panel__body">
                                <div class="sc-tabs">
                                    <button
                                        v-for="t in tabs"
                                        :key="t.value"
                                        type="button"
                                        class="sc-tab"
                                        :aria-selected="activeTab === t.value"
                                        @click="activeTab = t.value"
                                    >
                                        {{ t.label }}
                                    </button>
                                </div>

                                <div class="sc-field">
                                    <label class="sc-label" for="f-title">标题</label>
                                    <FormInput id="f-title" v-model="chapter" />
                                </div>

                                <div class="sc-field">
                                    <label class="sc-label" for="f-sum">一句话梗概</label>
                                    <textarea id="f-sum" v-model="summary" class="sc-textarea"></textarea>
                                    <span class="sc-hint">用于生成续写提示，建议不超过两行。</span>
                                </div>

                                <div class="grid gap-4 sm:grid-cols-2">
                                    <div class="sc-field">
                                        <label class="sc-label" for="f-goal">字数目标</label>
                                        <FormInput id="f-goal" v-model="wordGoal" />
                                    </div>
                                    <div class="sc-field">
                                        <label class="sc-label" for="f-bad">字数目标（错误态）</label>
                                        <FormInput id="f-bad" v-model="invalidGoal" />
                                        <span class="sc-error">目标必须大于 0。</span>
                                    </div>
                                </div>

                                <div class="flex flex-wrap items-center gap-6">
                                    <SwitchField v-model="autosave" label="自动保存" />
                                    <SwitchField v-model="publish" label="发布到站点" />
                                </div>
                            </div>

                            <!-- 状态面板 -->
                            <div class="sc-sidebar sc-glass p-4" style="border-left: var(--border-w) solid var(--divider)">
                                <div class="sc-muted mb-3">本章状态</div>
                                <div class="flex flex-wrap gap-2">
                                    <Badge v-for="b in badges" :key="b.label" :tone="b.tone" size="sm">
                                        {{ b.label }}
                                    </Badge>
                                </div>
                                <hr class="sc-divider my-4" />
                                <div class="sc-secondary flex flex-col gap-2">
                                    <div class="flex justify-between"><span>字数</span><span class="sc-mono">1,842</span></div>
                                    <div class="flex justify-between"><span>伏笔</span><span class="sc-mono">3 未回收</span></div>
                                    <div class="flex justify-between"><span>上次同步</span><span class="sc-mono">3 分钟前</span></div>
                                </div>
                                <hr class="sc-divider my-4" />
                                <Button variant="secondary" block>
                                    <span class="i-lucide-git-compare h-4 w-4" aria-hidden="true"></span>对比上一版
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ── ② 元素对照 ────────────────────────────────────────────────── -->
                <section class="flex flex-col gap-3">
                    <h2 class="sc-title sc-secondary">② 元素对照</h2>
                    <div class="grid gap-4 md:grid-cols-2">
                        <div class="sc-panel">
                            <div class="sc-panel__head"><span class="sc-title">按钮</span></div>
                            <div class="sc-panel__body">
                                <div class="flex flex-wrap items-center gap-3">
                                    <Button variant="primary">主操作</Button>
                                    <Button variant="secondary">次操作</Button>
                                    <Button variant="ghost">幽灵</Button>
                                    <Button variant="danger">删除</Button>
                                    <Button variant="secondary" disabled>禁用</Button>
                                </div>
                                <div class="flex flex-wrap items-center gap-3">
                                    <Button size="sm">小</Button>
                                    <Button size="md">中</Button>
                                    <Button size="lg">大</Button>
                                    <IconButton title="添加"><span class="i-lucide-plus h-4 w-4"></span></IconButton>
                                    <span class="sc-muted">Tab 聚焦看焦点环</span>
                                </div>
                            </div>
                        </div>

                        <div class="sc-panel">
                            <div class="sc-panel__head"><span class="sc-title">输入与选择</span></div>
                            <div class="sc-panel__body">
                                <FormInput placeholder="常态 · placeholder" />
                                <FormSelect v-model="pickedFormat" :options="formatOptions" />
                                <div class="flex flex-wrap items-center gap-3">
                                    <span class="sc-kbd">⌘</span><span class="sc-kbd">K</span>
                                    <span class="sc-muted">键帽借用控件描边与凹凸配方</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 组件覆盖：时间选择器 -->
                    <div class="sc-panel" data-nb-override-probe>
                        <div class="sc-panel__head">
                            <span class="sc-title">组件覆盖：时间选择器</span>
                            <span class="sc-muted">macOS 主题下换成滚轮，其余主题用库默认的下拉列表</span>
                        </div>
                        <div class="sc-panel__body">
                            <div class="flex flex-wrap items-start gap-4">
                                <div style="width: 220px">
                                    <TimePicker v-model="reminderAt" :step="30" min="06:00" max="23:00" />
                                </div>
                                <span class="sc-muted">当前值 {{ reminderAt ?? "（未选）" }} · ↑↓ 调整、Enter 开合、Esc 回滚</span>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ── ③ 数据与浮层 ──────────────────────────────────────────────── -->
                <section class="flex flex-col gap-3">
                    <h2 class="sc-title sc-secondary">③ 数据与浮层</h2>
                    <div class="relative grid gap-4 md:grid-cols-[1fr_320px]">
                        <div class="sc-panel">
                            <table class="sc-table">
                                <thead>
                                    <tr><th>文件</th><th>状态</th><th>字数</th><th>更新</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-for="r in rows" :key="r.name">
                                        <td class="sc-mono">{{ r.name }}</td>
                                        <td><Badge :tone="r.tone" size="sm" dot>{{ r.status }}</Badge></td>
                                        <td class="sc-mono">{{ r.words }}</td>
                                        <td>{{ r.time }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div class="sc-panel">
                            <div class="sc-empty">
                                <span class="i-lucide-search-x h-6 w-6"></span>
                                <span class="sc-title">没有匹配的结果</span>
                                <span class="sc-muted">空态用来看留白节奏是否成立</span>
                            </div>
                        </div>
                    </div>

                    <div class="sc-dialog sc-glass sc-glass--strong sc-rim" style="max-width: 460px">
                        <div class="sc-dialog__head">
                            <span class="sc-title">放弃本次修改？</span>
                            <IconButton title="关闭" size="sm"><span class="i-lucide-x h-3.5 w-3.5"></span></IconButton>
                        </div>
                        <div class="sc-dialog__body">未保存的段落会丢失，且无法恢复。</div>
                        <div class="sc-dialog__foot">
                            <Button variant="secondary" size="sm">取消</Button>
                            <Button variant="danger" size="sm">放弃修改</Button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </main>
</template>
