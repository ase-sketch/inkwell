import {describe, expect, it} from "vitest";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";
import {
    applyIdeShellSwap,
    formatSessionRelativeTime,
    groupLorebookEntries,
    groupSessionsByRecency,
    isLorebookBrowsableEntry,
    lorebookCategoryOf,
    projectLorebookNodes,
    resolveIdeShellView,
    resolveRailEntryAction,
} from "nbook/app/utils/ide-shell-layout";

function node(overrides: Partial<WorkspaceFileNode> & {path: string}): WorkspaceFileNode {
    return {
        mode: "content",
        entryType: null,
        icon: null,
        status: null,
        words: 0,
        refs: [],
        absolutePath: overrides.path,
        isDirectory: false,
        hasIndex: false,
        contentNode: true,
        summary: "",
        title: overrides.path,
        frontmatter: {},
        frontmatterError: null,
        state: null,
        size: 0,
        mtimeMs: 0,
        editable: true,
        ...overrides,
    };
}

/** 组装带 children 的目录节点：WorkspaceFileNode 本身不声明 children，树只存在于内存投影里。 */
function directory(path: string, children: WorkspaceFileNode[]): WorkspaceFileNode {
    return {...node({path, isDirectory: true, contentNode: false}), children} as WorkspaceFileNode;
}

describe("Ide shell layout", () => {
    it("没有打开文稿时聊天全宽居中，写作面不参与布局", () => {
        const view = resolveIdeShellView({documentOpen: false, writingRequested: false, lorebookDrawerOpen: false, outlineDrawerOpen: false});

        expect(view.surface).toBe("chat");
        expect(view.agentChatCentered).toBe(true);
        expect(view.editorVisible).toBe(false);
        expect(view.swapHandleVisible).toBe(false);
        expect(view.railEntry).toBe("chat");
    });

    it("打开文稿后编辑器居中，聊天收进右侧伴随栏并出现互换把手", () => {
        const view = resolveIdeShellView({documentOpen: true, writingRequested: false, lorebookDrawerOpen: false, outlineDrawerOpen: false});

        expect(view.surface).toBe("editor");
        expect(view.agentChatCentered).toBe(false);
        expect(view.editorVisible).toBe(true);
        expect(view.swapHandleVisible).toBe(true);
        expect(view.railEntry).toBe("write");
    });

    it("没有文稿但用户点了码字，写作面居中且不出现无意义的互换把手", () => {
        const view = resolveIdeShellView({documentOpen: false, writingRequested: true, lorebookDrawerOpen: false, outlineDrawerOpen: false});

        expect(view.surface).toBe("editor");
        expect(view.editorVisible).toBe(true);
        expect(view.agentChatCentered).toBe(false);
        expect(view.swapHandleVisible).toBe(false);
        expect(view.railEntry).toBe("write");
    });

    it("设定抽屉不改变主区情境，只改变图标栏高亮", () => {
        const interview = resolveIdeShellView({documentOpen: false, writingRequested: false, lorebookDrawerOpen: true, outlineDrawerOpen: false});
        const writing = resolveIdeShellView({documentOpen: true, writingRequested: false, lorebookDrawerOpen: true, outlineDrawerOpen: false});

        expect(interview.surface).toBe("chat");
        expect(interview.railEntry).toBe("lorebook");
        expect(writing.surface).toBe("editor");
        expect(writing.agentChatCentered).toBe(false);
        expect(writing.railEntry).toBe("lorebook");
    });

    it("一键互换只把中央让给对话，重复调用幂等", () => {
        const writing = resolveIdeShellView({documentOpen: true, writingRequested: false, lorebookDrawerOpen: false, outlineDrawerOpen: false});
        const swapped = applyIdeShellSwap(writing);

        expect(swapped.surface).toBe("chat");
        expect(swapped.agentChatCentered).toBe(true);
        expect(swapped.editorVisible).toBe(false);
        // 文稿仍然打开，所以把手必须留着，否则用户回不去码字态。
        expect(swapped.swapHandleVisible).toBe(true);
        expect(applyIdeShellSwap(swapped)).toEqual(swapped);

        const interview = resolveIdeShellView({documentOpen: false, writingRequested: false, lorebookDrawerOpen: false, outlineDrawerOpen: false});
        expect(applyIdeShellSwap(interview)).toEqual(interview);
    });

    it("大纲抽屉与设定抽屉一样不改变主区情境，只影响左侧栏高亮", () => {
        const interview = resolveIdeShellView({documentOpen: false, writingRequested: false, lorebookDrawerOpen: false, outlineDrawerOpen: true});
        const writing = resolveIdeShellView({documentOpen: true, writingRequested: false, lorebookDrawerOpen: false, outlineDrawerOpen: true});

        expect(interview.surface).toBe("chat");
        expect(interview.agentChatCentered).toBe(true);
        expect(interview.railEntry).toBe("outline");
        expect(writing.surface).toBe("editor");
        expect(writing.agentChatCentered).toBe(false);
        expect(writing.railEntry).toBe("outline");
        // 两个抽屉互斥：同时为真时设定优先，界面不会两头高亮。
        const both = resolveIdeShellView({documentOpen: true, writingRequested: false, lorebookDrawerOpen: true, outlineDrawerOpen: true});
        expect(both.railEntry).toBe("lorebook");
    });

    it("大纲入口解析成切换大纲抽屉，不影响主区情境", () => {
        const interview = {documentOpen: false, writingRequested: false, lorebookDrawerOpen: false, outlineDrawerOpen: false};
        const writing = {documentOpen: true, writingRequested: false, lorebookDrawerOpen: false, outlineDrawerOpen: false};

        expect(resolveRailEntryAction(interview, "outline")).toBe("toggle-outline");
        expect(resolveRailEntryAction(writing, "outline")).toBe("toggle-outline");
        // 解析结果是纯函数：不读也不改抽屉状态。
        expect(interview.outlineDrawerOpen).toBe(false);
    });

    it("图标栏入口按当前情境解析点击结果", () => {
        const interview = {documentOpen: false, writingRequested: false, lorebookDrawerOpen: false, outlineDrawerOpen: false};
        const writing = {documentOpen: true, writingRequested: false, lorebookDrawerOpen: false, outlineDrawerOpen: false};
        const writingNoDocument = {documentOpen: false, writingRequested: true, lorebookDrawerOpen: false, outlineDrawerOpen: false};

        expect(resolveRailEntryAction(interview, "chat")).toBe("focus-chat");
        expect(resolveRailEntryAction(interview, "write")).toBe("focus-editor");
        expect(resolveRailEntryAction(writing, "write")).toBe("focus-editor");
        expect(resolveRailEntryAction(writing, "chat")).toBe("focus-chat");
        expect(resolveRailEntryAction(writing, "lorebook")).toBe("toggle-lorebook");
        expect(resolveRailEntryAction(writing, "settings")).toBe("open-settings");
        expect(resolveIdeShellView(writingNoDocument).surface).toBe("editor");
        expect(resolveIdeShellView(interview).surface).toBe("chat");
    });

    it("只把 lorebook/ 下的设定条目投影进抽屉，普通目录与文稿文件排除", () => {
        const flatNodes = [
            node({path: "lorebook", isDirectory: true, contentNode: false, entryType: null}),
            node({path: "lorebook/character", isDirectory: true, contentNode: false, entryType: null}),
            node({path: "lorebook/character/hero/index.md", entryType: "character"}),
            node({path: "lorebook/location/harbor/index.md", entryType: "location"}),
            node({path: "manuscript/chapter-01/index.md", entryType: "chapter"}),
            node({path: "world-engine/calendar.ts", entryType: null, contentNode: false}),
        ];

        expect(projectLorebookNodes(flatNodes).map((item) => item.path)).toEqual([
            "lorebook/character/hero/index.md",
            "lorebook/location/harbor/index.md",
        ]);
        expect(isLorebookBrowsableEntry(flatNodes[3] ?? null)).toBe(true);
        expect(isLorebookBrowsableEntry(node({path: "manuscript/chapter-01/index.md", entryType: "chapter"}))).toBe(false);
        expect(isLorebookBrowsableEntry(node({path: "lorebook/character", isDirectory: true, contentNode: false, entryType: null}))).toBe(false);
        // lorebook/<类目>/index.md 是基座生成的类目说明页，对作者没有意义，不算条目。
        // lorebook/<类目>/index.md 属于类目说明页，深度不足，不算条目。
        expect(isLorebookBrowsableEntry(node({path: "lorebook/orphan.md", entryType: "note"}))).toBe(false);
        expect(isLorebookBrowsableEntry(node({path: "lorebook/character/hero/index.md", entryType: "note"}))).toBe(true);
        expect(isLorebookBrowsableEntry(node({path: "lorebook/character/index.md", entryType: "note", frontmatter: {subtype: "directory-index"}}))).toBe(false);
        expect(isLorebookBrowsableEntry(node({path: "lorebook/character/hero/index.md", entryType: null, contentNode: false}))).toBe(false);
        expect(isLorebookBrowsableEntry(node({path: "workspace/lorebook/item/sword/index.md", entryType: "item"}))).toBe(true);
    });

    it("按作者类目分组，空类目不出现", () => {
        const entries = [
            node({path: "lorebook/character/hero/index.md", entryType: "character"}),
            node({path: "lorebook/character/rival/index.md", entryType: "character"}),
            node({path: "lorebook/item/sword/index.md", entryType: "item"}),
            node({path: "lorebook/unknown-thing/x/index.md", entryType: "note"}),
        ];

        const groups = groupLorebookEntries(entries);

        expect(groups.map((group) => group.id)).toEqual(["character", "item", "note"]);
        expect(groups[0]?.entries.map((entry) => entry.path)).toEqual([
            "lorebook/character/hero/index.md",
            "lorebook/character/rival/index.md",
        ]);
        // 空类目（faction/location/system/world/event/instruction）一个都不出现。
        expect(groups.some((group) => group.id === "location")).toBe(false);
        expect(groups).toHaveLength(3);
        // 未知类目归入 note，不静默丢条目。
        expect(groups[2]?.entries.map((entry) => entry.path)).toEqual(["lorebook/unknown-thing/x/index.md"]);
    });

    it("includeEmpty 时 9 个作者类目全部保留，空组 entries 为空数组", () => {
        const entries = [
            node({path: "lorebook/character/hero/index.md", entryType: "character"}),
            node({path: "lorebook/unknown-thing/x/index.md", entryType: "note"}),
        ];

        const groups = groupLorebookEntries(entries, {includeEmpty: true});

        expect(groups.map((group) => group.id)).toEqual([
            "character", "faction", "location", "item", "system", "world", "event", "note", "instruction",
        ]);
        expect(groups[0]?.entries.map((entry) => entry.path)).toEqual(["lorebook/character/hero/index.md"]);
        expect(groups[1]?.entries).toEqual([]);
        // 未知类目仍归入 note，不静默丢条目。
        expect(groups[7]?.entries.map((entry) => entry.path)).toEqual(["lorebook/unknown-thing/x/index.md"]);
        // 默认行为不变：空组仍被丢掉。
        expect(groupLorebookEntries(entries).map((group) => group.id)).toEqual(["character", "note"]);
    });

    it("会话按本地日历日分进今天/昨天/近 7 天/更早，组内保持倒序，空组不出现", () => {
        // 固定「现在」为 2026-09-20 15:00 本地时间，边界断言才稳定。
        const now = new Date(2026, 8, 20, 15, 0, 0).getTime();
        const startOfToday = new Date(2026, 8, 20, 0, 0, 0).getTime();
        const day = 24 * 60 * 60 * 1000;
        const session = (id: number, updatedAt: number) => ({id, updatedAt});

        const groups = groupSessionsByRecency([
            session(1, startOfToday - 1),           // 昨天 23:59:59
            session(2, now),                         // 今天
            session(3, startOfToday),                // 今天 00:00 边界
            session(4, startOfToday - 6 * day),      // 近 7 天最早一天
            session(5, startOfToday - 6 * day - 1),  // 更早
            session(6, now - 3600_000),              // 今天更早些，应排在 2 之后
        ], now);

        expect(groups.map((group) => group.id)).toEqual(["today", "yesterday", "last7days", "earlier"]);
        expect(groups[0]?.sessions.map((item) => item.id)).toEqual([2, 6, 3]);
        expect(groups[1]?.sessions.map((item) => item.id)).toEqual([1]);
        expect(groups[2]?.sessions.map((item) => item.id)).toEqual([4]);
        expect(groups[3]?.sessions.map((item) => item.id)).toEqual([5]);

        // 只有「今天」有会话时，其余组不出现。
        const onlyToday = groupSessionsByRecency([session(7, now)], now);
        expect(onlyToday.map((group) => group.id)).toEqual(["today"]);
    });

    it("formatSessionRelativeTime 格式化相对时间与今天/昨天/近 7 天/更早口径一致", () => {
        const now = new Date(2026, 8, 20, 15, 30, 0).getTime();
        const startOfToday = new Date(2026, 8, 20, 0, 0, 0).getTime();
        const day = 24 * 60 * 60 * 1000;

        // 今天
        expect(formatSessionRelativeTime(new Date(2026, 8, 20, 14, 5, 0).getTime(), now)).toBe("今天 14:05");
        // 昨天
        expect(formatSessionRelativeTime(new Date(2026, 8, 19, 9, 30, 0).getTime(), now)).toBe("昨天 09:30");
        // 近 7 天
        expect(formatSessionRelativeTime(startOfToday - 2 * day + 3600_000, now)).toBe("2 天前");
        expect(formatSessionRelativeTime(startOfToday - 5 * day + 3600_000, now)).toBe("5 天前");
        // 更早（同一年）
        expect(formatSessionRelativeTime(new Date(2026, 5, 12, 10, 0, 0).getTime(), now)).toBe("6月12日");
        // 更早（往年）
        expect(formatSessionRelativeTime(new Date(2025, 11, 25, 8, 0, 0).getTime(), now)).toBe("2025年12月25日");
        // 无效/空
        expect(formatSessionRelativeTime(0, now)).toBe("");
    });

    it("类目识别同时支持 workspace/ 前缀", () => {
        expect(lorebookCategoryOf("lorebook/character/hero/index.md")).toBe("character");
        expect(lorebookCategoryOf("workspace/lorebook/item/sword/index.md")).toBe("item");
        expect(lorebookCategoryOf("manuscript/chapter-01/index.md")).toBe(null);
    });

    it("已经建好 children 的树也能投影", () => {
        const nested = directory("lorebook", [
            directory("lorebook/item", [
                node({path: "lorebook/item/sword/index.md", entryType: "item"}),
            ]),
            node({path: "manuscript/chapter-01/index.md", entryType: "chapter"}),
        ]);

        expect(projectLorebookNodes([nested]).map((item) => item.path)).toEqual(["lorebook/item/sword/index.md"]);
    });
});