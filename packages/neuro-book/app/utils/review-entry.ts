import type {AgentSessionSummaryDto} from "nbook/shared/dto/agent-session.dto";

/**
 * 审稿双入口（编辑态「审这一章」＋划词「发给顾问挑刺」）的纯逻辑层。
 *
 * 视图组件只负责把点击转成这里的函数调用：首条消息文本、章节路径解析、
 * 会话复用判定与记忆分区全部收在这里，便于 vitest 直测
 * （仓内 vitest 没有 plugin-vue，.vue 不能进测试）。
 *
 * 三条已定口径（改这里等于改契约，务必同步测试）：
 * - 章节正文口径与基座 server/agent/context/current-chapter-context.ts 的
 *   parseManuscriptChapterPath 对齐：只认 manuscript/{卷}/{章}/index.md；
 *   卷级规划 manuscript/001-volume/index.md、设定条目、大纲一律不是章节正文。
 * - 首条消息沿用卡文追问的形态：选区/章节 chip + 技能令牌 + 引导语。
 *   顾问只提质疑、不代改正文，所以消息里明确「只挑刺、不动正文」。
 * - 章节级会话「同章复用、换章新开」：记住的 sessionId 按「项目 + 章节路径」分区存放，
 *   换章读不到上一章的记录，两章的审稿意见不会混进同一条对话；同一章反复点，
 *   只要会话还在、没归档、也没在跑，就接着用。
 */

/** 审稿顾问的会话 profile；profile 定义与前端会话白名单由 T-A 负责。 */
export const CHAPTER_REVIEW_PROFILE_KEY = "review.chapter";

/** 唤起审稿量表的技能令牌，与卡文追问的 $ka-wen 同构。 */
export const CHAPTER_REVIEW_SKILL_KEY = "$shen-gao";

/** 章节级审稿的记忆分区前缀；键里带项目与章节路径，换章自然读不到旧会话。 */
export const CHAPTER_REVIEW_SESSION_STORAGE_PREFIX = "agent:chapter-review-session";

/** 划词「发给顾问挑刺」的默认引导语。 */
export const CHAPTER_REVIEW_SELECTION_GUIDANCE =
    "请按审稿量表逐条挑刺：只说站不住的地方，每条带原文引用；只挑刺，不要改我的正文。";

/** 「审这一章」的默认引导语。 */
export const CHAPTER_REVIEW_CHAPTER_GUIDANCE =
    "请把这一章整章审一遍：按审稿量表逐条挑刺，只说站不住的地方，每条带原文引用；只挑刺，不要改我的正文。";

/** manuscript 章节路径的解析结果。 */
export type ManuscriptChapterPath = Readonly<{
    /** 卷目录名，如 001-volume。 */
    volume: string;
    /** 章目录名，如 001-departure。 */
    chapter: string;
    /** 归一化后的章节正文路径：manuscript/{卷}/{章}/index.md。 */
    manuscriptPath: string;
}>;

/** 只读的本地记忆接口；浏览器传 localStorage，测试传字面量对象。 */
export interface ReviewEntryStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

/**
 * 解析当前选中文件是否指向 manuscript/{卷}/{章}/index.md。
 *
 * 口径与基座 parseManuscriptChapterPath 对齐：允许 workspace/ 前缀、反斜杠与
 * 首尾斜杠，路径里出现 manuscript/ 之前的段落一律忽略。不是章节正文返回 null，
 * 调用方据此禁用按钮，而不是猜一个文件出来。
 */
export function parseManuscriptChapterPath(selectedFilePath: string | null | undefined): ManuscriptChapterPath | null {
    if (!selectedFilePath || typeof selectedFilePath !== "string") {
        return null;
    }
    const trimmed = selectedFilePath.trim().replace(/\\/g, "/");
    if (!trimmed) {
        return null;
    }

    const stripped = trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
    const manuscriptIndex = stripped.indexOf("manuscript/");
    if (manuscriptIndex === -1) {
        return null;
    }

    const candidate = stripped.slice(manuscriptIndex);
    const match = candidate.match(/^manuscript\/([^/]+)\/([^/]+)\/index\.md$/);
    if (!match) {
        return null;
    }

    const volume = match[1] ?? "";
    const chapter = match[2] ?? "";
    if (!volume || !chapter) {
        return null;
    }

    return {
        volume,
        chapter,
        manuscriptPath: `manuscript/${volume}/${chapter}/index.md`,
    };
}

/** 章节路径的展示名：manuscript/001-volume/002-dawn/index.md → 002-dawn。 */
export function chapterDisplayName(manuscriptPath: string | null | undefined): string {
    const parsed = parseManuscriptChapterPath(manuscriptPath);
    return parsed ? parsed.chapter : "";
}

export interface BuildSelectionCritiqueMessageOptions {
    /** 选区 chip，形如 [[manuscript/001-volume/002-dawn/index.md#L12-L20]]。 */
    ref: string;
    /** 作者补充的引导语；空白时回退到默认口径。 */
    guidance?: string;
}

/** 构造划词「发给顾问挑刺」的首条消息：选区 chip + $shen-gao + 引导语。 */
export function buildSelectionCritiqueMessage(options: BuildSelectionCritiqueMessageOptions): string {
    const ref = readText(options.ref);
    const guidance = readText(options.guidance) || CHAPTER_REVIEW_SELECTION_GUIDANCE;
    return `${ref} ${CHAPTER_REVIEW_SKILL_KEY}\n\n${guidance}`;
}

export interface BuildChapterReviewMessageOptions {
    /** 章节正文路径；非章节正文路径会抛错，避免把设定文件当成章节送审。 */
    chapterPath: string;
    /** 作者补充的引导语；空白时回退到默认口径。 */
    guidance?: string;
}

/**
 * 构造「审这一章」的首条消息：章节 chip + $shen-gao + 引导语。
 *
 * chip 必须带真实章节路径：会话记忆按「项目 + 章节路径」分区，
 * 复用判定和作者回看都靠它认出审的是哪一章。
 */
export function buildChapterReviewMessage(options: BuildChapterReviewMessageOptions): string {
    const parsed = parseManuscriptChapterPath(options.chapterPath);
    if (!parsed) {
        throw new Error("审这一章需要先选中章节正文");
    }
    const guidance = readText(options.guidance) || CHAPTER_REVIEW_CHAPTER_GUIDANCE;
    return `[[${parsed.manuscriptPath}]] ${CHAPTER_REVIEW_SKILL_KEY}\n\n${guidance}`;
}

/** 记忆分区的键：项目作用域 + 章节路径，换章换键。 */
export function chapterReviewSessionStorageKey(input: {scopeKey: string; chapterPath: string}): string {
    const scopeKey = readText(input.scopeKey) || "workspace-root";
    const parsed = parseManuscriptChapterPath(input.chapterPath);
    const chapterKey = parsed ? parsed.manuscriptPath : readText(input.chapterPath);
    return `${CHAPTER_REVIEW_SESSION_STORAGE_PREFIX}:${scopeKey}:${chapterKey}`;
}

/** 读回上一次审这一章用的会话 id；没有或不是正整数时返回 null。 */
export function readRememberedChapterReviewSessionId(
    storage: Pick<ReviewEntryStorage, "getItem">,
    storageKey: string,
): number | null {
    const raw = storage.getItem(storageKey);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** 记住这一章这次用的是哪个会话；只在该会话确实可用时才记。 */
export function rememberChapterReviewSession(
    storage: Pick<ReviewEntryStorage, "setItem">,
    storageKey: string,
    sessionId: number,
): void {
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return;
    }
    storage.setItem(storageKey, String(sessionId));
}

export interface ChapterReviewReuseOptions {
    /** 记忆里这一章上次用的会话 id；没有就别复用。 */
    rememberedSessionId: number | null;
    /** 当前 Project 根；传了就要求会话属于同一个 Project。 */
    currentProjectRoot?: string | null;
}

/**
 * 找出可以接着用的章节审稿会话：只复用「记忆里这一章那一条」，且它还在、
 * 没归档、也没在跑。
 *
 * 刻意不按 profileKey 扫全部会话挑一个——那会把上一章的审稿意见接到这一章来。
 * 记忆里没有（换章后必然没有）、或那一条已经不空闲，就返回 undefined，
 * 由调用方新开一个会话。
 */
export function findReusableChapterReviewSession(
    sessions: readonly AgentSessionSummaryDto[],
    options: ChapterReviewReuseOptions,
): AgentSessionSummaryDto | undefined {
    const rememberedSessionId = options.rememberedSessionId;
    if (rememberedSessionId === null || !Number.isInteger(rememberedSessionId) || rememberedSessionId <= 0) {
        return undefined;
    }

    const targetProjectRoot = readText(options.currentProjectRoot) || undefined;
    const session = sessions.find((item) => item.sessionId === rememberedSessionId);
    if (!session) {
        return undefined;
    }
    if (session.profileKey !== CHAPTER_REVIEW_PROFILE_KEY) {
        return undefined;
    }
    if (session.archived || session.status === "archived") {
        return undefined;
    }
    if (session.status === "running" || session.status === "waiting") {
        return undefined;
    }
    if (targetProjectRoot && session.currentProjectRoot !== targetProjectRoot) {
        return undefined;
    }
    return session;
}

/** 防御式读取文本字段：非字符串或全空白一律当没有。 */
function readText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}
