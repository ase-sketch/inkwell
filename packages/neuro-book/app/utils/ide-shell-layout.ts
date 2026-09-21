import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";

/** 左侧栏上的一级入口。 */
export type IdeRailEntryId = "chat" | "write" | "outline" | "lorebook" | "settings";

/**
 * 对作者裸露的写作资产根目录。
 * 基座把 agents/、world-engine/、manual/、reference/、project.yaml 等内部文件与正文放在同一棵树里，
 * 作者视角只应看到正文（manuscript/）；其余「藏而不删」——agent 照常读写，只是不进作者界面。
 */
export const MANUSCRIPT_ROOT = "manuscript";

/** 主区当前由谁占据。 */
export type IdeShellSurface = "chat" | "editor";

/**
 * 主区情境的原始输入。只描述事实，不描述 UI。
 */
export type IdeShellContext = Readonly<{
    /** 已经打开了一个可编辑文稿。 */
    documentOpen: boolean;
    /**
     * 用户是否显式进入了码字态（点左侧栏「码字」）。
     * 它只在没有打开文稿时有效：此时写作面显示文件浏览与空态，而不是把用户困在纯对话里。
     */
    writingRequested: boolean;
    /** 右侧设定抽屉是否展开。 */
    lorebookDrawerOpen: boolean;
    /** 右侧大纲抽屉是否展开。两个抽屉互斥，同一时刻最多展开一个。 */
    outlineDrawerOpen: boolean;
}>;

/**
 * 由事实推导出的主区情境。组件只消费这个结果，避免各处分头判断。
 *
 * 主区是一个 flex 行：对话与写作面同时存在、靠 order 决定谁居中：
 * order-2 = 主区中央，order-4 = 右侧伴随栏。agentChatCentered 是唯一开关，
 * 这样 AgentChatSurface 的 DOM 位置永远不变，情境切换不会重挂载对话。
 */
export type IdeShellView = Readonly<{
    /** 主区居中显示谁。 */
    surface: IdeShellSurface;
    /** 对话是否占据主区中央（等价于 surface === "chat"）。 */
    agentChatCentered: boolean;
    /** 写作面是否渲染。 */
    editorVisible: boolean;
    /** 一键互换把手当前是否可用。 */
    swapHandleVisible: boolean;
    /** 左侧栏上高亮的入口。 */
    railEntry: IdeRailEntryId;
}>;

/**
 * 判断一个工作区节点是否是可浏览的设定条目。
 *
 * 设定条目是 lorebook/<类目>/<条目>/index.md 这一层；lorebook/<类目>/index.md 是基座生成的
 * 类目说明页（subtype: directory-index，摘要形如 "Character lorebook category."），
 * 对作者没有意义，因此不算条目。
 */
export function isLorebookBrowsableEntry(node: WorkspaceFileNode | null | undefined): boolean {
    if (!node || node.isDirectory || !node.contentNode || !node.entryType) {
        return false;
    }
    if (node.frontmatter && node.frontmatter.subtype === "directory-index") {
        return false;
    }
    return lorebookCategoryOf(node.path) !== null && lorebookEntryDepth(node.path) >= 2;
}

/**
 * 读取节点所属的 lorebook 类目名；不在 lorebook 下时返回 null。
 */
export function lorebookCategoryOf(filePath: string): string | null {
    const segments = normalizeWorkspacePathForLayout(filePath).split("/").filter(Boolean);
    const rootIndex = segments[0] === "workspace" ? 1 : 0;
    if (segments[rootIndex] !== "lorebook") {
        return null;
    }
    return segments[rootIndex + 1] ?? null;
}

/** 计算相对 lorebook 根的层级深度；不在 lorebook 下返回 -1。 */
function lorebookEntryDepth(filePath: string): number {
    const segments = normalizeWorkspacePathForLayout(filePath).split("/").filter(Boolean);
    const rootIndex = segments[0] === "workspace" ? 1 : 0;
    if (segments[rootIndex] !== "lorebook") {
        return -1;
    }
    return segments.length - rootIndex - 1;
}

/** 归一化路径：统一分隔符并去掉 ./ 与尾随斜杠。 */
function normalizeWorkspacePathForLayout(filePath: string): string {
    return filePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/**
 * 作者视角的设定类目顺序与文案。
 *
 * 基座 lorebook 的 9 个类目一个都不动——这里只是呈现层映射：把机制名换成作者能看懂的说法。
 * 空类目是否出现由 groupLorebookEntries 的 includeEmpty 选项决定（抽屉平时全列出，搜索态只列命中）。
 */
export const LOREBOOK_CATEGORIES = [
    {id: "character", icon: "i-lucide-user-round"},
    {id: "faction", icon: "i-lucide-flag"},
    {id: "location", icon: "i-lucide-map-pinned"},
    {id: "item", icon: "i-lucide-package"},
    {id: "system", icon: "i-lucide-sparkles"},
    {id: "world", icon: "i-lucide-globe-2"},
    {id: "event", icon: "i-lucide-calendar-clock"},
    {id: "note", icon: "i-lucide-scroll-text"},
    {id: "instruction", icon: "i-lucide-shield-alert"},
] as const;

export type LorebookCategoryId = typeof LOREBOOK_CATEGORIES[number]["id"];

/** 一个类目分组：组头 + 组内条目，空组不再返回。 */
export type LorebookGroup = Readonly<{
    id: LorebookCategoryId;
    icon: string;
    entries: WorkspaceFileNode[];
}>;

/**
 * 把设定条目按类目分组。
 * 默认丢掉空组；传 includeEmpty 时 9 个作者类目全部保留（空组 entries 为空数组），
 * 让作者在新书里也能看到完整分类体系。未知类目（基座未来新增）按 note 归位，
 * 保证不会静默丢失条目。
 */
export function groupLorebookEntries(
    entries: readonly WorkspaceFileNode[],
    options?: {includeEmpty?: boolean},
): LorebookGroup[] {
    const knownIds = new Set<string>(LOREBOOK_CATEGORIES.map((category) => category.id));
    const buckets = new Map<string, WorkspaceFileNode[]>();
    for (const entry of entries) {
        const raw = lorebookCategoryOf(entry.path);
        const id = raw && knownIds.has(raw) ? raw : "note";
        const bucket = buckets.get(id);
        if (bucket) {
            bucket.push(entry);
        } else {
            buckets.set(id, [entry]);
        }
    }
    return LOREBOOK_CATEGORIES
        .filter((category) => options?.includeEmpty === true || (buckets.get(category.id)?.length ?? 0) > 0)
        .map((category) => ({
            id: category.id,
            icon: category.icon,
            entries: buckets.get(category.id) ?? [],
        }));
}

/**
 * 把 workspace 文件树里 lorebook/ 之下的节点投影成可浏览的设定节点。
 * 只做投影与排序，不改写输入。
 */
export function projectLorebookNodes(nodes: readonly WorkspaceFileNode[]): WorkspaceFileNode[] {
    const projected: WorkspaceFileNode[] = [];
    const visit = (items: readonly WorkspaceFileNode[]): void => {
        for (const node of items) {
            if (isLorebookBrowsableEntry(node)) {
                projected.push(node);
                continue;
            }
            const children = (node as {children?: WorkspaceFileNode[]}).children;
            if (node.isDirectory && Array.isArray(children)) {
                visit(children);
            }
        }
    };
    visit(nodes);
    return projected;
}

/**
 * 条目卡片上给作者看的摘要。
 *
 * 只认真实内容摘要：优先 frontmatter/nodes 的 summary，其次正文首段。
 * 目录说明页（directory-index）与基座模板占位英文一律不返回——宁可不显示，也不给作者看
 * "Character lorebook category." 这种机器话。
 */
export function resolveLorebookEntrySummary(entry: WorkspaceFileNode): string {
    const summary = entry.summary?.trim() ?? "";
    return summary;
}

/**
 * 按当前事实推导主区情境。
 *
 * 访谈态与码字态由同一份事实表决定，不额外维护开关：
 * - 没有打开文稿且没有进入码字态：对话全宽居中，写作面不参与布局；
 * - 打开文稿（或显式进入码字态）：写作面居中，对话收进右侧伴随栏；
 * - 设定抽屉与大纲抽屉是否展开不影响主区情境，只影响右栏是否有抽屉与伴聊并存，
 *   以及左侧栏高亮谁（两个抽屉互斥，同时展开时设定优先）。
 */
export function resolveIdeShellView(context: IdeShellContext): IdeShellView {
    const drawerEntry: IdeRailEntryId | null = context.lorebookDrawerOpen
        ? "lorebook"
        : context.outlineDrawerOpen ? "outline" : null;
    const writingSurface = context.documentOpen || context.writingRequested;
    if (!writingSurface) {
        return {
            surface: "chat",
            agentChatCentered: true,
            editorVisible: false,
            swapHandleVisible: false,
            railEntry: drawerEntry ?? "chat",
        };
    }
    return {
        surface: "editor",
        agentChatCentered: false,
        editorVisible: true,
        swapHandleVisible: context.documentOpen,
        railEntry: drawerEntry ?? "write",
    };
}

/**
 * 应用一键互换：把主区中央让给对话，写作面让出主区。
 * 只在确实有文稿（把手可见）时有意义；重复调用是幂等的。
 */
export function applyIdeShellSwap(view: IdeShellView): IdeShellView {
    if (!view.swapHandleVisible || view.surface === "chat") {
        return view;
    }
    return {
        ...view,
        surface: "chat",
        agentChatCentered: true,
        editorVisible: false,
        swapHandleVisible: true,
    };
}

/** 会话时间分组 id：今天 / 昨天 / 近 7 天 / 更早。 */
export type SessionRecencyGroupId = "today" | "yesterday" | "last7days" | "earlier";

/** 一个会话时间分组：组 id + 组内会话（保持更新时间倒序）。 */
export type SessionRecencyGroup<T> = Readonly<{
    id: SessionRecencyGroupId;
    sessions: T[];
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 把会话按更新时间分进「今天 / 昨天 / 近 7 天 / 更早」四组，空组不返回。
 * 边界按本地日历日切（和作者直觉一致），不是滚动的 24 小时窗口；
 * now 由调用方注入，方便测试，也让 SSR 与客户端首屏结果一致。
 */
export function groupSessionsByRecency<T extends {updatedAt: number}>(
    sessions: readonly T[],
    now: number,
): Array<SessionRecencyGroup<T>> {
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const startOfYesterday = startOfToday - DAY_MS;
    const startOfLast7Days = startOfToday - 6 * DAY_MS;
    const buckets: Record<SessionRecencyGroupId, T[]> = {today: [], yesterday: [], last7days: [], earlier: []};
    for (const session of [...sessions].sort((left, right) => right.updatedAt - left.updatedAt)) {
        if (session.updatedAt >= startOfToday) {
            buckets.today.push(session);
        } else if (session.updatedAt >= startOfYesterday) {
            buckets.yesterday.push(session);
        } else if (session.updatedAt >= startOfLast7Days) {
            buckets.last7days.push(session);
        } else {
            buckets.earlier.push(session);
        }
    }
    const order: SessionRecencyGroupId[] = ["today", "yesterday", "last7days", "earlier"];
    return order
        .filter((id) => buckets[id].length > 0)
        .map((id) => ({id, sessions: buckets[id]}));
}

/**
 * 按当前情境解析图标栏入口的点击结果。
 * 返回 null 表示这次点击只影响抽屉或设置，不改主区情境。
 */
export function resolveRailEntryAction(
    context: IdeShellContext,
    entry: IdeRailEntryId,
): "focus-chat" | "focus-editor" | "toggle-lorebook" | "toggle-outline" | "open-settings" | null {
    switch (entry) {
        case "chat":
            return "focus-chat";
        case "write":
            return "focus-editor";
        case "outline":
            return "toggle-outline";
        case "lorebook":
            return "toggle-lorebook";
        case "settings":
            return "open-settings";
        default:
            return null;
    }
}
