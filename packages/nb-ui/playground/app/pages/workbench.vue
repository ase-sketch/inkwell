<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from "vue";
import {useTheme} from "../composables/useTheme";
import {useColorway} from "../composables/useColorway";

/*
 * 工作台切片：只演示 UI 风格。
 *
 * 判断一套写作界面好不好看，最少需要三件东西同屏：器械、稿面、一段真的中文长句。
 * 其余（会话、差异、任务、菜单）都是产品功能，放进来只会让人先去理解产品。
 *
 * 页面本身几乎不写死样式，看到的差异必须能归因到主题变量——读数条就是这个用途。
 */

const theme = useTheme();
const colorway = useColorway();

const readout = ref<{label: string; value: string}[]>([]);
/** 「纸比桌亮」是 nbook 的支点，所以它必须是**量出来的**，不是页面写死的 */
const sheetVsDesk = ref("—");
/** 窗口左上角那一格归侧栏（macOS）还是归标题栏（Windows），由主题变量判定 */
const sidebarOwnsChrome = ref(false);
const chromeOwner = computed(() => (sidebarOwnsChrome.value ? "侧栏通顶" : "标题栏横带"));

/** sRGB 加权亮度。只用来比大小，不做对比度判定，所以不做 gamma 线性化 */
function luminance(color: string): number | null {
    const parts = color.match(/[\d.]+/g);
    if (parts === null || parts.length < 3) return null;
    return (0.2126 * Number(parts[0]) + 0.7152 * Number(parts[1]) + 0.0722 * Number(parts[2])) / 255;
}

function refreshReadout(): void {
    const cs = getComputedStyle(document.documentElement);
    readout.value = [
        {label: "界面", value: cs.getPropertyValue("--text-sm").trim() || "—"},
        {label: "稿面", value: cs.getPropertyValue("--reading-size").trim() || "—"},
        {label: "行宽", value: cs.getPropertyValue("--reading-measure").trim() || "—"},
        {label: "行高", value: cs.getPropertyValue("--leading-reading").trim() || "—"},
        {label: "圆角", value: cs.getPropertyValue("--radius-control").trim() || "—"},
        {label: "界面字", value: (cs.getPropertyValue("--font-ui").split(",")[0] ?? "").replaceAll('"', "").trim()},
        {label: "稿面字", value: (cs.getPropertyValue("--font-display").split(",")[0] ?? "").replaceAll('"', "").trim()},
    ];

    sidebarOwnsChrome.value = (() => {
        /*
         * 判定顺序不能倒过来：先问「是不是跟标题栏同面」，那是默认形态。
         * 先比侧栏的话，凡是把标题栏和侧栏调成同一个面色的主题都会被误判成 macOS 窗口，
         * 于是画出交通灯却没有通顶的侧栏。（触发这条的是已下线的 lamplight——器械只用一种
         * 面色——现存四套里没有，所以这个顺序改错了也不会当场露馅。）
         */
        const chrome = cs.getPropertyValue("--chrome-surface").trim();
        if (chrome === "" || chrome === cs.getPropertyValue("--toolbar-surface").trim()) return false;
        return chrome === cs.getPropertyValue("--sidebar-surface").trim();
    })();

    const sheet = document.querySelector(".wb-sheet");
    const shell = document.querySelector(".wb-shell");
    if (sheet === null || shell === null) return;
    const paper = luminance(getComputedStyle(sheet).backgroundColor);
    const desk = luminance(getComputedStyle(shell).backgroundColor);
    sheetVsDesk.value = paper === null || desk === null
        ? "—"
        : `稿面${paper > desk ? "亮" : "暗"}于桌面 ${(Math.abs(paper - desk) * 100).toFixed(1)}%`;
}

onMounted(() => {
    void nextTick(refreshReadout);
});
watch([theme.current, colorway.current], () => {
    // 等过渡走完再读，否则读到的是中间态
    window.setTimeout(refreshReadout, 300);
});

// ── 演示内容 ────────────────────────────────────────────────────────────────

const activeChapter = ref("c14");

/** tone：done 定稿、draft 草稿、todo 空章 */
const chapters = [
    {id: "c11", name: "第 11 章 · 城门", words: "3,120", tone: "done"},
    {id: "c12", name: "第 12 章 · 旧识", words: "2,860", tone: "done"},
    {id: "c13", name: "第 13 章 · 灯下", words: "1,204", tone: "draft"},
    {id: "c14", name: "第 14 章 · 雨夜的来信", words: "3,412", tone: "draft"},
    {id: "c15", name: "第 15 章 · 未名", words: "—", tone: "todo"},
    {id: "c16", name: "第 16 章 · 渡口", words: "—", tone: "todo"},
];

const toneVar: Record<string, string> = {
    done: "var(--status-success)",
    draft: "var(--status-warning)",
    todo: "var(--border-strong)",
};
</script>

<template>
    <!-- flex-1 由 app.vue 的 <NuxtPage> 透传下来，所以这里只要开 flex 列并允许收缩 -->
    <div class="flex min-h-0 flex-col">
        <div class="wb-readout">
            <span class="sc-kbd">{{ theme.active.value?.manifest.name ?? "未装主题" }}</span>
            <span class="sc-kbd">{{ colorway.colorwayMeta[colorway.current.value]?.label ?? colorway.current.value }}</span>
            <span class="sc-kbd">{{ sheetVsDesk }}</span>
            <span class="sc-kbd">左上角 {{ chromeOwner }}</span>
            <span v-for="item in readout" :key="item.label" class="sc-kbd">{{ item.label }} {{ item.value }}</span>
        </div>

        <div class="wb-shell min-h-0 flex-1">
            <!-- 左上角：归属由主题定（--chrome-surface），里面放什么由操作系统定 -->
            <div class="wb-chrome sc-glass">
                <span v-if="sidebarOwnsChrome" class="wb-traffic">
                    <span class="wb-traffic__close"></span>
                    <span class="wb-traffic__min"></span>
                    <span class="wb-traffic__max"></span>
                </span>
                <span v-else class="wb-appmark">
                    <span class="i-lucide-feather h-4 w-4" style="color: var(--accent-main)"></span>
                    NeuroBook
                </span>
            </div>

            <header class="wb-title sc-glass">
                <span class="wb-title__name">雨落长安 — 第 14 章</span>
                <div class="wb-title__tools">
                    <button class="sc-icon-btn" title="批注"><span class="i-lucide-message-square h-4 w-4"></span></button>
                    <button class="sc-icon-btn" title="版本"><span class="i-lucide-history h-4 w-4"></span></button>
                    <button class="sc-icon-btn" title="专注"><span class="i-lucide-maximize h-4 w-4"></span></button>
                </div>
                <!-- 那一格归标题栏时，窗口按钮按 Windows 惯例落在最右 -->
                <div v-if="!sidebarOwnsChrome" class="wb-winbtns">
                    <button class="wb-winbtn" title="最小化"><span class="i-lucide-minus h-3.5 w-3.5"></span></button>
                    <button class="wb-winbtn" title="最大化"><span class="i-lucide-square h-3 w-3"></span></button>
                    <button class="wb-winbtn wb-winbtn--close" title="关闭"><span class="i-lucide-x h-3.5 w-3.5"></span></button>
                </div>
            </header>

            <aside class="wb-side sc-glass">
                <div class="wb-side__project">雨落长安</div>
                <div class="wb-side__label">第二卷 · 归途</div>
                <nav class="wb-nav">
                    <button
                        v-for="chapter in chapters"
                        :key="chapter.id"
                        type="button"
                        class="wb-nav__item"
                        :aria-current="activeChapter === chapter.id"
                        @click="activeChapter = chapter.id"
                    >
                        <span class="wb-nav__dot" :style="{background: toneVar[chapter.tone]}"></span>
                        <span class="wb-nav__name">{{ chapter.name }}</span>
                        <span class="wb-nav__count">{{ chapter.words }}</span>
                    </button>
                </nav>
                <div class="wb-side__foot">今日 <b>1,240</b> / 2,000 字</div>
            </aside>

            <!-- 稿面。内容层是实心的：玻璃属导航层，正文套玻璃是 Apple 明确反对的一条 -->
            <main class="wb-main">
                <article class="wb-sheet">
                    <div class="wb-row">
                        <div class="wb-margin"></div>
                        <header class="wb-block">
                            <div class="wb-eyebrow">第二卷 · 归途</div>
                            <h1 class="wb-doctitle">雨夜的来信</h1>
                            <div class="wb-docmeta">3,412 字 · 12 分钟前保存 · 草稿</div>
                        </header>
                    </div>

                    <div class="wb-row">
                        <div class="wb-margin"></div>
                        <p class="wb-block wb-para">
                            雨是从申时起的头，先在瓦上敲得零碎，后来连成一片，把整条巷子浇成一块化不开的墨。
                            阿沅坐在窗下，把灯芯挑了三回，油还是烧得慢。她数着更鼓，数到第二遍就乱了。
                        </p>
                    </div>

                    <div class="wb-row">
                        <div class="wb-margin">
                            <span class="wb-note">
                                <span class="wb-note__tag">节奏</span>
                                这一段可以再慢半拍
                            </span>
                        </div>
                        <p class="wb-block wb-para">
                            巷子那头有人踏水而过，脚步停在门前，又走开了。她没有起身。
                            这三个月里，停在门前又走开的脚步太多；起初她次次都去开门，后来学会了坐着。
                        </p>
                    </div>

                    <div class="wb-row">
                        <div class="wb-margin">
                            <span class="wb-note">
                                <span class="wb-note__tag">线索</span>
                                松烟墨是本章唯一的线索，别再往后放
                            </span>
                        </div>
                        <p class="wb-block wb-para">
                            先渗进门缝的是一线水，然后是一角纸。纸被雨泡得发软，字迹却没有化开——
                            <span class="wb-em">写信的人用的是松烟墨，那是官仓里才有的东西。</span>
                            她把纸抽出来的时候，指腹沾上一层薄薄的黑。
                        </p>
                    </div>

                    <div class="wb-row">
                        <div class="wb-margin"></div>
                        <p class="wb-block wb-para">
                            这笔迹她认得。<span class="wb-ref">沈砚</span>走的那年，把最后一份漕运账册留在了这间屋子里。
                            十年过去，账册还在，人没有回来。信上只有两行：一行是地名，一行是时辰。
                        </p>
                    </div>

                    <div class="wb-row">
                        <div class="wb-margin">
                            <span class="wb-note">
                                <span class="wb-note__tag">设定</span>
                                <span class="wb-ref">漕运司</span>还没写进世界书
                            </span>
                        </div>
                        <p class="wb-block wb-para">
                            她把纸凑到灯前，火光透过纸背，映出更早以前写下又被刮掉的一层字。
                            更鼓敲过第三遍。信上写的时辰是子时，地名她记得——城西的老渡口，
                            十年前她站过的那个地方。她把灯吹了，屋里一下子只剩下雨声。
                        </p>
                    </div>
                </article>
            </main>
        </div>
    </div>
</template>
