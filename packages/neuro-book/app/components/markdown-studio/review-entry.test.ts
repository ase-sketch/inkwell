import {describe, expect, it} from "vitest";
import type {AgentSessionSummaryDto} from "nbook/shared/dto/agent-session.dto";
import {
    buildChapterReviewMessage,
    buildSelectionCritiqueMessage,
    chapterDisplayName,
    chapterReviewSessionStorageKey,
    CHAPTER_REVIEW_CHAPTER_GUIDANCE,
    CHAPTER_REVIEW_PROFILE_KEY,
    CHAPTER_REVIEW_SELECTION_GUIDANCE,
    CHAPTER_REVIEW_SESSION_STORAGE_PREFIX,
    CHAPTER_REVIEW_SKILL_KEY,
    findReusableChapterReviewSession,
    parseManuscriptChapterPath,
    readRememberedChapterReviewSessionId,
    rememberChapterReviewSession,
} from "nbook/app/utils/review-entry";

const CHAPTER_PATH = "manuscript/001-volume/002-dawn/index.md";

function createMockSession(overrides: Partial<AgentSessionSummaryDto> = {}): AgentSessionSummaryDto {
    return {
        sessionId: 1,
        sessionIdentity: "00000000-0000-0000-0000-000000000001",
        profileKey: CHAPTER_REVIEW_PROFILE_KEY,
        currentProjectRoot: "book-a",
        status: "idle",
        updatedAt: Date.now(),
        archived: false,
        ...overrides,
    };
}

/** 只记一个键的本地记忆替身，用来验证「同章复用、换章新开」。 */
function createMemoryStorage(): {getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; dump: () => Record<string, string>} {
    const store = new Map<string, string>();
    return {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => {
            store.set(key, value);
        },
        dump: () => Object.fromEntries(store),
    };
}

describe("章节路径解析（manuscript/{卷}/{章}/index.md）", () => {
    it("认出标准章节正文路径，并给出归一化结果", () => {
        expect(parseManuscriptChapterPath(CHAPTER_PATH)).toEqual({
            volume: "001-volume",
            chapter: "002-dawn",
            manuscriptPath: CHAPTER_PATH,
        });
    });

    it("容忍反斜杠、workspace 前缀与首尾斜杠", () => {
        for (const input of [
            "manuscript\\001-volume\\002-dawn\\index.md",
            "workspace/book-a/manuscript/001-volume/002-dawn/index.md",
            "/manuscript/001-volume/002-dawn/index.md/",
            "  manuscript/001-volume/002-dawn/index.md  ",
        ]) {
            expect(parseManuscriptChapterPath(input)?.manuscriptPath).toBe(CHAPTER_PATH);
        }
    });

    it("卷级规划、设定条目、大纲与空路径都不是章节正文", () => {
        for (const input of [
            null,
            undefined,
            "",
            "   ",
            "manuscript/index.md",
            "manuscript/001-volume/index.md",
            "manuscript/001-volume/002-dawn/notes.md",
            "lorebook/character/hero/index.md",
            "outline/beat/001/index.md",
            "manuscript/001-volume/002-dawn/",
        ]) {
            expect(parseManuscriptChapterPath(input)).toBeNull();
        }
    });

    it("展示名取章目录名", () => {
        expect(chapterDisplayName(CHAPTER_PATH)).toBe("002-dawn");
        expect(chapterDisplayName("lorebook/character/hero/index.md")).toBe("");
    });
});

describe("顾问挑刺首条消息", () => {
    it("选区 chip + 技能令牌 + 默认引导语", () => {
        expect(buildSelectionCritiqueMessage({ref: "[[manuscript/001-volume/002-dawn/index.md#L12-L20]]"}))
            .toBe(`[[manuscript/001-volume/002-dawn/index.md#L12-L20]] ${CHAPTER_REVIEW_SKILL_KEY}\n\n${CHAPTER_REVIEW_SELECTION_GUIDANCE}`);
    });

    it("作者自填的引导语优先，并清掉首尾空格", () => {
        expect(buildSelectionCritiqueMessage({
            ref: "[[manuscript/001-volume/002-dawn/index.md]]",
            guidance: "  这段对话我不确定像不像他  ",
        })).toBe(`[[manuscript/001-volume/002-dawn/index.md]] ${CHAPTER_REVIEW_SKILL_KEY}\n\n这段对话我不确定像不像他`);
    });

    it("引导语为空白时回退默认口径", () => {
        expect(buildSelectionCritiqueMessage({ref: "[[a.md]]", guidance: "   "}))
            .toBe(`[[a.md]] ${CHAPTER_REVIEW_SKILL_KEY}\n\n${CHAPTER_REVIEW_SELECTION_GUIDANCE}`);
    });
});

describe("审这一章首条消息", () => {
    it("章节 chip + 技能令牌 + 默认引导语", () => {
        expect(buildChapterReviewMessage({chapterPath: CHAPTER_PATH}))
            .toBe(`[[${CHAPTER_PATH}]] ${CHAPTER_REVIEW_SKILL_KEY}\n\n${CHAPTER_REVIEW_CHAPTER_GUIDANCE}`);
    });

    it("传入的不是章节正文时直接拒绝，不把设定文件当章节送审", () => {
        expect(() => buildChapterReviewMessage({chapterPath: "lorebook/character/hero/index.md"})).toThrow();
        expect(() => buildChapterReviewMessage({chapterPath: "manuscript/001-volume/index.md"})).toThrow();
    });

    it("两条入口都唤起审稿量表，且明确不动作者正文", () => {
        expect(buildChapterReviewMessage({chapterPath: CHAPTER_PATH})).toContain(CHAPTER_REVIEW_SKILL_KEY);
        expect(buildSelectionCritiqueMessage({ref: "[[a.md]]"})).toContain(CHAPTER_REVIEW_SKILL_KEY);
        expect(CHAPTER_REVIEW_CHAPTER_GUIDANCE).toContain("不要改我的正文");
        expect(CHAPTER_REVIEW_SELECTION_GUIDANCE).toContain("不要改我的正文");
    });
});

describe("章节审稿的会话记忆（同章复用、换章新开）", () => {
    it("记忆键按章节分区：同一章同键，换一章换键", () => {
        const scopeKey = "project:book-a";
        const first = chapterReviewSessionStorageKey({scopeKey, chapterPath: CHAPTER_PATH});
        const again = chapterReviewSessionStorageKey({scopeKey, chapterPath: "workspace/book-a/manuscript/001-volume/002-dawn/index.md"});
        const otherChapter = chapterReviewSessionStorageKey({scopeKey, chapterPath: "manuscript/001-volume/003-dusk/index.md"});

        expect(first).toBe(again);
        expect(first).not.toBe(otherChapter);
        expect(first.startsWith(`${CHAPTER_REVIEW_SESSION_STORAGE_PREFIX}:`)).toBe(true);
        expect(first).toContain(CHAPTER_PATH);
    });

    it("作用域缺失时退回 workspace-root，不写出空键", () => {
        const key = chapterReviewSessionStorageKey({scopeKey: "  ", chapterPath: CHAPTER_PATH});
        expect(key).toContain("workspace-root");
    });

    it("记得住、读得回，脏数据当没有", () => {
        const storage = createMemoryStorage();
        const key = chapterReviewSessionStorageKey({scopeKey: "project:book-a", chapterPath: CHAPTER_PATH});

        expect(readRememberedChapterReviewSessionId(storage, key)).toBeNull();
        rememberChapterReviewSession(storage, key, 42);
        expect(readRememberedChapterReviewSessionId(storage, key)).toBe(42);
        expect(storage.dump()[key]).toBe("42");

        storage.setItem(key, "not-a-number");
        expect(readRememberedChapterReviewSessionId(storage, key)).toBeNull();
        storage.setItem(key, "-3");
        expect(readRememberedChapterReviewSessionId(storage, key)).toBeNull();
    });

    it("无效的会话 id 不写进记忆", () => {
        const storage = createMemoryStorage();
        rememberChapterReviewSession(storage, "k", 0);
        rememberChapterReviewSession(storage, "k", 1.5);
        expect(storage.dump()).toEqual({});
    });
});

describe("章节审稿会话的复用判定", () => {
    it("复用记忆里这一章那一条空闲会话", () => {
        const session = createMockSession({sessionId: 101, currentProjectRoot: "book-a", status: "idle"});
        const found = findReusableChapterReviewSession([createMockSession({sessionId: 9, profileKey: "leader.default"}), session], {
            rememberedSessionId: 101,
            currentProjectRoot: "book-a",
        });
        expect(found?.sessionId).toBe(101);
    });

    it("换成另一章时记忆里没有 id，不复用列表里的旧会话", () => {
        const otherChapterSession = createMockSession({sessionId: 101, currentProjectRoot: "book-a"});
        expect(findReusableChapterReviewSession([otherChapterSession], {rememberedSessionId: null})).toBeUndefined();
    });

    it("记忆里的 id 已不在列表时返回 undefined，交给调用方新开", () => {
        const sessions = [createMockSession({sessionId: 7}), createMockSession({sessionId: 8})];
        expect(findReusableChapterReviewSession(sessions, {rememberedSessionId: 101})).toBeUndefined();
    });

    it("忽略已归档与正在跑的会话", () => {
        const archived = createMockSession({sessionId: 1, archived: true});
        const archivedStatus = createMockSession({sessionId: 2, status: "archived"});
        const running = createMockSession({sessionId: 3, status: "running"});
        const waiting = createMockSession({sessionId: 4, status: "waiting"});

        expect(findReusableChapterReviewSession([archived], {rememberedSessionId: 1})).toBeUndefined();
        expect(findReusableChapterReviewSession([archivedStatus], {rememberedSessionId: 2})).toBeUndefined();
        expect(findReusableChapterReviewSession([running], {rememberedSessionId: 3})).toBeUndefined();
        expect(findReusableChapterReviewSession([waiting], {rememberedSessionId: 4})).toBeUndefined();
    });

    it("忽略了别的 profile 或别的 Project 的会话", () => {
        const otherProfile = createMockSession({sessionId: 5, profileKey: "inline.editor"});
        const otherProject = createMockSession({sessionId: 6, currentProjectRoot: "book-b"});

        expect(findReusableChapterReviewSession([otherProfile], {rememberedSessionId: 5})).toBeUndefined();
        expect(findReusableChapterReviewSession([otherProject], {rememberedSessionId: 6, currentProjectRoot: "book-a"})).toBeUndefined();
        expect(findReusableChapterReviewSession([otherProject], {rememberedSessionId: 6})?.sessionId).toBe(6);
    });

    it("非法 id 一律不复用", () => {
        const session = createMockSession({sessionId: 1});
        expect(findReusableChapterReviewSession([session], {rememberedSessionId: 0})).toBeUndefined();
        expect(findReusableChapterReviewSession([session], {rememberedSessionId: -1})).toBeUndefined();
        expect(findReusableChapterReviewSession([session], {rememberedSessionId: Number.NaN})).toBeUndefined();
    });
});
