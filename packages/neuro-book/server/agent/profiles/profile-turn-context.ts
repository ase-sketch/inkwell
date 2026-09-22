import type {StoredAgentMessage, StoredUserMessage} from "nbook/server/agent/messages/stored-types";
import {createStoredUserMessage, messageText} from "nbook/server/agent/messages/message-utils";
import {
    activateReadyProjectModule,
    requireReadyModuleHandle,
} from "nbook/server/workspace-files/project-session";
import type {ReadyProjectSessionRef} from "nbook/server/workspace-files/project-session-types";
import {PROJECT_PLOT_WORLD_MODULE_TOKEN} from "nbook/server/plot";
import {
    readWorkspaceTextFile,
    scanWorkspaceTree,
    type WorkspaceFileNode,
} from "nbook/server/workspace-files/workspace-files";
import {absoluteFsPath} from "nbook/server/runtime/paths/file-path";
import {appLogger} from "nbook/server/app-logs/logger";
import {
    parseManuscriptChapterPath,
    readChapterContent,
    resolveCurrentChapter,
} from "nbook/server/agent/context/current-chapter-context";
import type {StoryPromiseDto} from "nbook/shared/dto/plot.dto";
import {
    advanceAgentCursor,
    PROJECT_HISTORY_MODULE_TOKEN,
    readUnseenForAgent,
    type ProjectHistoryHandle,
} from "nbook/server/workspace-history/project-history";
import {
    readAgentChangeDiffDetails,
    type AgentChangeDiffDetail,
} from "nbook/server/workspace-history/agent-change-diff";
import {isSensitiveHistoryDiffPath} from "nbook/server/workspace-history/history-diff";
import {
    DEFAULT_AGENT_DIFF_MAX_CHARS,
    MAX_AGENT_CHANGE_LISTED_FILES,
    MAX_AGENT_CHANGE_NOTICE_CHARS,
} from "nbook/shared/agent/file-change-policy";
import type {OperationActor, UnseenGroup} from "@notnotype/nb-history";

export type FileChangeAwareness = "off" | "minimal" | "full";

export type ProfileTurnContextKind = "file-change-notice" | "promise-ledger" | "mentioned-entities" | "skill-activation";

export type ProfileTurnContextPlan =
    | {
        kind: "file-change-notice";
        mode: "minimal" | "full";
        /** 在 AppendingSet 静态消息中的插入位置。 */
        appendingIndex: number;
    }
    | {
        kind: "promise-ledger";
        /** 在 AppendingSet 静态消息中的插入位置。 */
        appendingIndex: number;
    }
    | {
        kind: "mentioned-entities";
        /** 在 AppendingSet 静态消息中的插入位置。 */
        appendingIndex: number;
    }
    | {
        kind: "skill-activation";
        /** 在 AppendingSet 静态消息中的插入位置。 */
        appendingIndex: number;
    };

/** 窄接口：显式 $skill-key 的解析通道，由 Harness 注入 SkillCatalog 实现。 */
export type ProfileSkillResolver = {
    resolve(skillKey: string, projectRoot?: string): Promise<{
        key: string;
        name: string;
        source: "install" | "project";
        rootPath: string;
        skillPath: string;
        body: string;
    } | null>;
};

export type ProfileTurnContextSettlement = {
    kind: "file-change-notice";
    /** 与本轮 notice 查询相同的 ProjectSession generation History handle。 */
    history: ProjectHistoryHandle;
    sessionId: number;
    /** nb-history last_seen_entry_id，成功 ingest 后原样推进。 */
    entryId: number;
};

export type MaterializedProfileTurnContext = {
    insertions: Array<{
        appendingIndex: number;
        message: StoredAgentMessage;
    }>;
    settlements: ProfileTurnContextSettlement[];
};

/**
 * Profile Workbench dry-run 占位：展示节点位置与模式，但不读取真实 Project history。
 */
export function previewProfileTurnContexts(plans: ProfileTurnContextPlan[], diffMaxChars = DEFAULT_AGENT_DIFF_MAX_CHARS): MaterializedProfileTurnContext["insertions"] {
    return plans.map((plan) => {
        if (plan.kind === "file-change-notice") {
            return {
                appendingIndex: plan.appendingIndex,
                message: createStoredUserMessage(`<file-change-notice runtime-data="preview" mode="${plan.mode}" diff-max-chars="${diffMaxChars}">\nGenerated at runtime from project file changes not yet seen by this session.\n</file-change-notice>`),
            };
        }
        if (plan.kind === "promise-ledger") {
            return {
                appendingIndex: plan.appendingIndex,
                message: createStoredUserMessage(`<promise-ledger runtime-data="preview">\nGenerated at runtime from open story promises.\n</promise-ledger>`),
            };
        }
        if (plan.kind === "mentioned-entities") {
            return {
                appendingIndex: plan.appendingIndex,
                message: createStoredUserMessage(`<mentioned-entities runtime-data="preview">\nGenerated at runtime from mentioned entities.\n</mentioned-entities>`),
            };
        }
        return {
            appendingIndex: plan.appendingIndex,
            message: createStoredUserMessage(`<skill-activation runtime-data="preview">\nGenerated at runtime from explicitly mentioned skills.\n</skill-activation>`),
        };
    });
}

/**
 * 读取本轮 Profile 声明的动态上下文数据并渲染消息。
 *
 * Harness 只消费这一通用结果，不再知道 file-change notice 的查询、正文或游标语义。
 */
export async function materializeProfileTurnContexts(input: {
    plans: ProfileTurnContextPlan[];
    project: ReadyProjectSessionRef | null;
    sessionId: number;
    diffMaxChars: number;
    /** 本轮用户输入；mentioned-entities 的触发源之一。 */
    pendingUserMessage?: StoredUserMessage | null;
    /** 当前打开的编辑器文件；仅当指向 manuscript 章节 index.md 时参与 mentioned-entities。 */
    selectedFilePath?: string | null;
    /** 显式 $skill-key 的解析通道；由 Harness 注入，缺失时 skill-activation 跳过。 */
    skillResolver?: ProfileSkillResolver | null;
}): Promise<MaterializedProfileTurnContext> {
    if (input.plans.length === 0) {
        return {insertions: [], settlements: []};
    }
    const insertions: MaterializedProfileTurnContext["insertions"] = [];
    const settlements: ProfileTurnContextSettlement[] = [];
    for (const plan of input.plans) {
        // skill-activation 不依赖 project：Install Root 也参与解析。
        if (plan.kind === "skill-activation") {
            const text = await materializeSkillActivation(
                input.skillResolver ?? null,
                input.project,
                input.pendingUserMessage ?? null,
            );
            if (text) {
                insertions.push({
                    appendingIndex: plan.appendingIndex,
                    message: createStoredUserMessage(text),
                });
            }
            continue;
        }
        // 其余 kind 各自依赖 Project ready 句柄；缺 project 时按 kind 跳过。
        if (!input.project) {
            continue;
        }
        if (plan.kind === "promise-ledger") {
            const text = await materializePromiseLedger(input.project);
            if (text) {
                insertions.push({
                    appendingIndex: plan.appendingIndex,
                    message: createStoredUserMessage(text),
                });
            }
            continue;
        }
        if (plan.kind === "mentioned-entities") {
            const text = await materializeMentionedEntities(input.project, {
                pendingUserMessage: input.pendingUserMessage ?? null,
                selectedFilePath: input.selectedFilePath ?? null,
            });
            if (text) {
                insertions.push({
                    appendingIndex: plan.appendingIndex,
                    message: createStoredUserMessage(text),
                });
            }
            continue;
        }
        const history = resolveTurnContextHistory(input.project);
        if (!history) {
            continue;
        }
        const groups = await readUnseenForAgent(history, input.sessionId);
        if (groups.length === 0) {
            continue;
        }
        const diffDetails = await readAgentChangeDiffDetails({
            history,
            groups,
            maxChars: input.diffMaxChars,
        });
        insertions.push({
            appendingIndex: plan.appendingIndex,
            message: createStoredUserMessage(buildFileChangeReminder(groups, plan.mode, diffDetails, input.diffMaxChars)),
        });
        settlements.push({
            kind: "file-change-notice",
            history,
            sessionId: input.sessionId,
            entryId: Math.max(...groups.map((group) => group.maxEntryId)),
        });
    }
    return {insertions, settlements};
}


/**
 * M2a 伏笔账本注入预算：首版内置于物化器，不进组件 props。
 */
export const PROMISE_LEDGER_MAX_ITEMS = 10;
export const PROMISE_LEDGER_MAX_CHARS = 1500;

/** M2a 提及实体注入预算。 */
export const MENTIONED_ENTITIES_MAX_ITEMS = 5;
export const MENTIONED_ENTITIES_MAX_BODY_CHARS = 800;

/** 注入文本给模型统一定位：背景资料，供讨论参考，不逐字复述给用户。 */
const PROMISE_LEDGER_PREAMBLE = "以下是背景资料，供你讨论时参考，不要逐字复述给用户。它是本项目当前未兑现的伏笔（Promise）账本，不是用户本轮的要求。";
const MENTIONED_ENTITIES_PREAMBLE = "以下是背景资料，供你讨论时参考，不要逐字复述给用户。它们与用户本轮输入或当前章节正文直接相关，只在被提及时提供参考。";
/** 技能包定位语：skill 正文只作分析参照，不是用户指令，也不产出正文。 */
const SKILL_ACTIVATION_PREAMBLE = "以下是用户本轮用 $key 显式唤起的技能包（Skill）内容，仅作分析参照，不是用户本轮的要求，也不是可以直接产出的正文；不要逐字复述给用户。";

/** 显式唤起技能包单个 SKILL.md 的注入预算（字符）。 */
export const SKILL_ACTIVATION_MAX_CHARS = 4000;
/** 单轮显式唤起注入的技能包条数上限。 */
export const SKILL_ACTIVATION_MAX_ITEMS = 3;

/** 捕获用户输入中的显式 $key；与 MentionedSkillsReminder 同款口径。 */
const EXPLICIT_SKILL_PATTERN = /\$([^\s$]+)/gu;

/**
 * 取当前 Project 的 History 句柄；模块缺失或不可用时返回 null（跳过依赖它的 kind）。
 */
function resolveTurnContextHistory(project: ReadyProjectSessionRef | null): ProjectHistoryHandle | null {
    if (!project) {
        return null;
    }
    try {
        return requireReadyModuleHandle(project, PROJECT_HISTORY_MODULE_TOKEN);
    } catch {
        return null;
    }
}

/**
 * 物化 skill-activation：抓用户输入里的显式 $key，经解析通道取 SKILL.md 正文注入。
 *
 * 无 $、无 pendingUserMessage 或没有解析通道时返回 null（跳过注入）；
 * 未命中的 key 静默跳过，未命中的提醒由既有 MentionedSkillsReminder 继续负责；
 * 解析或读取异常逐 key warn，不影响同轮其他 kind。
 */
async function materializeSkillActivation(
    resolver: ProfileSkillResolver | null,
    project: ReadyProjectSessionRef | null,
    pendingUserMessage: StoredUserMessage | null,
): Promise<string | null> {
    if (!resolver || !pendingUserMessage) {
        return null;
    }
    const userText = messageText(pendingUserMessage);
    const keys = [...new Set(
        [...userText.matchAll(EXPLICIT_SKILL_PATTERN)].map((match) => match[1]).filter((key): key is string => Boolean(key)),
    )].slice(0, SKILL_ACTIVATION_MAX_ITEMS);
    if (keys.length === 0) {
        return null;
    }
    const projectRoot = project?.workspace.root ?? null;
    const entries: Array<{key: string; path: string; body: string}> = [];
    for (const key of keys) {
        try {
            const resolved = await resolver.resolve(key, projectRoot ?? undefined);
            if (!resolved) {
                continue;
            }
            entries.push({key, path: resolved.skillPath, body: resolved.body});
        } catch (error) {
            await appLogger.warn("agent.profileTurnContext.skillActivationSkipped", {
                skillKey: key,
                reason: error instanceof Error ? error.message : String(error),
            }, "skill 正文解析失败，跳过该 key 的注入。");
        }
    }
    if (entries.length === 0) {
        return null;
    }
    return renderSkillActivation(entries);
}

/**
 * 渲染显式唤起的技能包正文；逐条标注来源路径，超出预算的正文截断并显式标注。
 */
export function renderSkillActivation(entries: Array<{key: string; path: string; body: string}>): string {
    const lines = ["<skill-activation>", SKILL_ACTIVATION_PREAMBLE];
    for (const entry of entries) {
        lines.push("## $" + entry.key);
        lines.push("来源：" + entry.path);
        const body = compactBody(entry.body);
        if (!body) {
            lines.push("（本条技能包暂无可读正文。）");
            continue;
        }
        lines.push(charCount(body) > SKILL_ACTIVATION_MAX_CHARS
            ? truncate(body, SKILL_ACTIVATION_MAX_CHARS) + "…（正文已截断）"
            : body);
    }
    lines.push("</skill-activation>");
    return lines.join("\n");
}

/**
 * 物化 promise-ledger：经 Plot 模块句柄取未决伏笔。
 *
 * 零 open、取数失败或 Plot 模块不可用时返回 null（跳过注入）；异常只记 warn，不影响本轮对话。
 */
async function materializePromiseLedger(project: ReadyProjectSessionRef): Promise<string | null> {
    try {
        const plotWorld = await activateReadyProjectModule(project, PROJECT_PLOT_WORLD_MODULE_TOKEN);
        const promises = await plotWorld.plot.listStoryPromises();
        const open = promises.filter((promise) => promise.status === "open");
        if (open.length === 0) {
            return null;
        }
        return renderPromiseLedger(open);
    } catch (error) {
        await appLogger.warn("agent.profileTurnContext.promiseLedgerSkipped", {
            reason: error instanceof Error ? error.message : String(error),
        }, "promise-ledger 物化失败，跳过本轮注入。");
        return null;
    }
}

/**
 * 渲染伏笔账本正文；超出条数或字符预算时截断并标注剩余条数。
 */
export function renderPromiseLedger(promises: StoryPromiseDto[]): string {
    const header = ["<promise-ledger>", PROMISE_LEDGER_PREAMBLE];
    const footer = ["</promise-ledger>"];
    const lines: string[] = [];
    let omitted = promises.length;
    for (const promise of promises.slice(0, PROMISE_LEDGER_MAX_ITEMS)) {
        const rendered = renderPromiseEntry(promise);
        const rest = omitted - 1;
        const candidate = rest > 0 ? [...lines, ...rendered, omittedPromiseLine(rest)] : [...lines, ...rendered];
        if (charCount([...header, ...candidate, ...footer].join("\n")) > PROMISE_LEDGER_MAX_CHARS) {
            break;
        }
        lines.push(...rendered);
        omitted = rest;
    }
    if (omitted > 0) {
        lines.push(omittedPromiseLine(omitted));
    }
    return [...header, ...lines, ...footer].join("\n");
}

/** 单条伏笔：结构化字段 + 来源 id，便于模型与人回溯账本。 */
function renderPromiseEntry(promise: StoryPromiseDto): string[] {
    const title = promise.title ? promise.title.trim() : "";
    const label = title && title !== promise.name ? promise.name + "（" + title + "）" : promise.name;
    const lines = ["- " + label + " [id=" + promise.id + "] importance=" + promise.importance];
    const summary = compactLine(promise.summary);
    if (summary) {
        lines.push("  summary: " + summary);
    }
    if (promise.deadlineChapter) {
        lines.push("  deadline: " + promise.deadlineChapter.title + "（" + promise.deadlineChapter.name + "）");
    }
    return lines;
}

/** 被预算截掉、未展开的伏笔数量。 */
function omittedPromiseLine(count: number): string {
    return "- 还有 " + String(count) + " 条未注入。";
}

/**
 * 物化 mentioned-entities：扫描 lorebook 内容节点，按用户输入 + 当前章节正文命中。
 *
 * 零命中、扫描失败或模块不可用时返回 null（跳过注入）；异常只记 warn。
 */
async function materializeMentionedEntities(
    project: ReadyProjectSessionRef,
    input: {pendingUserMessage: StoredUserMessage | null; selectedFilePath: string | null},
): Promise<string | null> {
    const userText = input.pendingUserMessage ? messageText(input.pendingUserMessage).trim() : "";
    if (!userText && !input.selectedFilePath) {
        return null;
    }
    try {
        const trigger = await resolveChapterTrigger(project, input.selectedFilePath);
        if (!userText && !trigger.chapterBody) {
            // 触发源为空时不做整棵 workspace 扫描。
            return null;
        }
        const nodes = await scanWorkspaceTree({
            root: absoluteFsPath(project.workspace.root),
            pathPredicate: (entry) => trigger.chapterPath === null || entry.relativePath !== trigger.chapterPath,
        });
        const matches = matchLorebookEntries(nodes, [userText, trigger.chapterBody]);
        if (matches.length === 0) {
            return null;
        }
        const entries: Array<{path: string; title: string; body: string}> = [];
        for (const match of matches) {
            entries.push({
                path: match.path,
                title: match.title,
                body: await readEntryBody(project.workspace.root, match.path),
            });
        }
        return renderMentionedEntities(entries, trigger.chapterName);
    } catch (error) {
        await appLogger.warn("agent.profileTurnContext.mentionedEntitiesSkipped", {
            reason: error instanceof Error ? error.message : String(error),
        }, "mentioned-entities 物化失败，跳过本轮注入。");
        return null;
    }
}

/** 当前章节触发源；拿不到章节时只有用户输入参与匹配。 */
type ChapterTrigger = {
    chapterPath: string | null;
    chapterName: string | null;
    chapterBody: string | null;
};

const NO_CHAPTER_TRIGGER: ChapterTrigger = {chapterPath: null, chapterName: null, chapterBody: null};

/**
 * 解析当前章节触发源。
 *
 * 口径：selectedFilePath 必须指向 manuscript 章节 index.md，且该章能经 Plot 关联到 StoryChapter；
 * 任一步拿不到就降级为只用用户输入，不抛错。
 */
async function resolveChapterTrigger(
    project: ReadyProjectSessionRef,
    selectedFilePath: string | null,
): Promise<ChapterTrigger> {
    const parsed = parseManuscriptChapterPath(selectedFilePath);
    if (!parsed) {
        return NO_CHAPTER_TRIGGER;
    }
    try {
        const chapter = await resolveCurrentChapter(selectedFilePath, {project});
        if (!chapter) {
            return NO_CHAPTER_TRIGGER;
        }
        return {
            chapterPath: parsed.manuscriptPath,
            chapterName: chapter.chapterName,
            chapterBody: await readChapterContent(parsed.manuscriptPath, {project}),
        };
    } catch {
        return NO_CHAPTER_TRIGGER;
    }
}

/** lorebook 内容节点匹配结果。 */
type LorebookMatch = {
    path: string;
    title: string;
    aliases: string[];
    score: number;
};

/**
 * 扫描 lorebook 内容节点目录，按 title / aliases / 目录 slug 命中排序。
 *
 * 匹配口径：中文直接子串包含；纯 ASCII 词按词边界匹配，避免 "art" 命中 "start"。
 */
export function matchLorebookEntries(nodes: WorkspaceFileNode[], triggerTexts: Array<string | null>): LorebookMatch[] {
    const haystack = triggerTexts
        .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
        .join("\n");
    if (!haystack) {
        return [];
    }
    const matches: LorebookMatch[] = [];
    for (const node of nodes) {
        if (!node.isDirectory || !node.contentNode || !node.path.startsWith("lorebook/")) {
            continue;
        }
        const directory = node.path.replace(/\/+$/u, "");
        const title = typeof node.frontmatter.title === "string" ? node.frontmatter.title.trim() : node.title.trim();
        const aliases = Array.isArray(node.frontmatter.aliases)
            ? node.frontmatter.aliases.filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0)
            : [];
        const slug = directory.slice(directory.lastIndexOf("/") + 1);
        let score = 0;
        if (title && containsTrigger(haystack, title)) {
            score += 100 + charCount(title);
        }
        for (const alias of aliases) {
            if (containsTrigger(haystack, alias)) {
                score += 60 + charCount(alias);
            }
        }
        if (containsTrigger(haystack, slug)) {
            score += 20 + charCount(slug);
        }
        if (score > 0) {
            matches.push({path: directory, title: title || slug, aliases, score});
        }
    }
    return matches
        .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
        .slice(0, MENTIONED_ENTITIES_MAX_ITEMS);
}

/** 中文按子串包含；纯 ASCII 词按词边界匹配。 */
export function containsTrigger(haystack: string, needle: string): boolean {
    const value = needle.trim();
    if (!value) {
        return false;
    }
    if (!/^[\x20-\x7e]+$/u.test(value)) {
        return haystack.includes(value);
    }
    const lowerHaystack = haystack.toLowerCase();
    const lowerValue = value.toLowerCase();
    let index = lowerHaystack.indexOf(lowerValue);
    while (index >= 0) {
        const before = lowerHaystack.slice(index - 1, index);
        const after = lowerHaystack.slice(index + lowerValue.length, index + lowerValue.length + 1);
        if (!isAsciiWordChar(before) && !isAsciiWordChar(after)) {
            return true;
        }
        index = lowerHaystack.indexOf(lowerValue, index + 1);
    }
    return false;
}

/** ASCII 词字符判定；英文触发词只在这些字符之外才算独立命中。 */
function isAsciiWordChar(value: string): boolean {
    return /[0-9a-z]/u.test(value);
}

/** 读取条目正文；失败时按空正文处理，不影响其余条目。 */
async function readEntryBody(workspaceRoot: string, directory: string): Promise<string> {
    try {
        const content = await readWorkspaceTextFile(absoluteFsPath(workspaceRoot), directory + "/index.md");
        return parseLorebookBody(content);
    } catch (error) {
        await appLogger.warn("agent.profileTurnContext.entityBodyUnreadable", {
            path: directory,
            reason: error instanceof Error ? error.message : String(error),
        }, "lorebook 条目正文读取失败，按空正文注入。");
        return "";
    }
}

/** 去掉 frontmatter，只保留条目正文。 */
export function parseLorebookBody(content: string): string {
    const matched = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u.exec(content);
    return (matched ? content.slice(matched[0].length) : content).trim();
}

/** 渲染提及实体正文；逐条标注 lorebook 来源路径，单条正文超预算时截断。 */
export function renderMentionedEntities(
    entries: Array<{path: string; title: string; body: string}>,
    chapterName: string | null = null,
): string {
    const trigger = chapterName ? "用户本轮输入与当前章节正文" : "用户本轮输入";
    const lines = ["<mentioned-entities>", MENTIONED_ENTITIES_PREAMBLE, "触发来源：" + trigger + "。"];
    for (const entry of entries) {
        lines.push("## " + entry.title);
        lines.push("来源：" + entry.path + "/index.md");
        const body = compactBody(entry.body);
        if (!body) {
            lines.push("（本条暂无正文。）");
            continue;
        }
        const truncated = charCount(body) > MENTIONED_ENTITIES_MAX_BODY_CHARS;
        lines.push(truncated ? truncate(body, MENTIONED_ENTITIES_MAX_BODY_CHARS) + "…（本条正文已截断）" : body);
    }
    lines.push("</mentioned-entities>");
    return lines.join("\n");
}

/** 按字符预算截断。 */
function truncate(value: string, maxChars: number): string {
    const characters = Array.from(value);
    return characters.length <= maxChars ? value : characters.slice(0, maxChars).join("");
}

/** 单行化 optional 字段，避免注入文本出现空行噪声。 */
function compactLine(value: string | null | undefined): string {
    return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

/** 正文保留原有换行，只压缩超长连续空行。 */
function compactBody(value: string): string {
    return value.replace(/\n{3,}/gu, "\n\n").trim();
}

/** Agent 字符预算按 Unicode code point 计数，与既有提醒保持一致。 */
function charCount(value: string): number {
    return Array.from(value).length;
}


/**
 * 把动态 AppendingSet 消息插回 profile 声明的位置。
 */
export function mergeProfileTurnContextMessages(
    messages: StoredAgentMessage[],
    insertions: MaterializedProfileTurnContext["insertions"],
): StoredAgentMessage[] {
    const sorted = [...insertions].sort((left, right) => left.appendingIndex - right.appendingIndex);
    const result: StoredAgentMessage[] = [];
    let insertionIndex = 0;
    for (let messageIndex = 0; messageIndex <= messages.length; messageIndex += 1) {
        while (sorted[insertionIndex]?.appendingIndex === messageIndex) {
            result.push(sorted[insertionIndex]!.message);
            insertionIndex += 1;
        }
        if (messageIndex < messages.length) {
            result.push(messages[messageIndex]!);
        }
    }
    if (insertionIndex !== sorted.length) {
        throw new Error(`Profile turn context 插入位置越界：index=${sorted[insertionIndex]!.appendingIndex}, messages=${messages.length}`);
    }
    return result;
}

/**
 * provider turn 成功 ingest 后结算动态上下文交付。
 */
export async function settleProfileTurnContexts(settlements: ProfileTurnContextSettlement[]): Promise<void> {
    for (const settlement of settlements) {
        await advanceAgentCursor(
            settlement.history,
            settlement.sessionId,
            settlement.entryId,
        );
    }
}

/**
 * 构造 `<file-change-notice>` 提醒正文。
 * 安全小 diff 直接内联；逐文件只陈述事实，操作指导在 footer 按整批文件汇总一次。
 */
export function buildFileChangeReminder(
    groups: UnseenGroup[],
    mode: "minimal" | "full",
    diffDetails: ReadonlyMap<string, AgentChangeDiffDetail> = new Map(),
    diffMaxChars = DEFAULT_AGENT_DIFF_MAX_CHARS,
): string {
    const header = [
        "<file-change-notice>",
        groups.length === 1
            ? "The following project file changed since you last viewed it:"
            : `The following ${groups.length} project files changed since you last viewed them:`,
    ];
    const hasSensitivePath = groups.some((group) => isSensitiveHistoryDiffPath(group.path));
    const hasReadableNonSensitivePath = groups.some((group) => group.endHash !== null && !isSensitiveHistoryDiffPath(group.path));
    const hasDeletedPath = groups.some((group) => group.endHash === null);
    const footerClauses: string[] = [];
    if (hasReadableNonSensitivePath) {
        footerClauses.push(mode === "full"
            ? "Non-sensitive current files may no longer match versions you read earlier. Inline diffs show changed fragments only; read complete current content only from non-sensitive paths when relevant."
            : "Inline diffs show changed fragments only; read complete current content only from non-sensitive paths when relevant.");
    }
    if (hasSensitivePath) {
        footerClauses.push("Sensitive file contents and diffs are excluded from this notice. Do not read or reproduce them solely because they changed; ask the user before inspecting them when the current task requires it.");
    }
    if (hasDeletedPath) {
        footerClauses.push("Deleted paths have no current file. Ask the user whether history review or recovery is needed before taking further action.");
    }
    const footer = [...footerClauses, "</file-change-notice>"];
    const lines: string[] = [];
    let listedCount = 0;
    for (const group of groups.slice(0, MAX_AGENT_CHANGE_LISTED_FILES)) {
        const detail = diffDetails.get(group.path);
        let rendered = renderFileChange(group, mode, detail, diffMaxChars);
        if (!noticeFits(header, lines, rendered, groups.length - listedCount - 1, footer) && detail?.kind === "inline") {
            const {diff: _discardedDiff, ...reference} = detail;
            rendered = renderFileChange(group, mode, {...reference, kind: "reference"}, diffMaxChars);
        }
        if (!noticeFits(header, lines, rendered, groups.length - listedCount - 1, footer)) {
            break;
        }
        lines.push(...rendered);
        listedCount += 1;
    }
    const omittedCount = groups.length - listedCount;
    if (omittedCount > 0) {
        lines.push(omittedFileSummary(omittedCount));
    }
    const notice = [...header, ...lines, ...footer].join("\n");
    if (noticeCharCount(notice) > MAX_AGENT_CHANGE_NOTICE_CHARS) {
        throw new Error(`file-change-notice 超过硬上限：${noticeCharCount(notice)} > ${MAX_AGENT_CHANGE_NOTICE_CHARS}`);
    }
    return notice;
}

/** 渲染单个文件的引用、摘要与可选小型 diff。 */
function renderFileChange(group: UnseenGroup, mode: "minimal" | "full", detail: AgentChangeDiffDetail | undefined, diffMaxChars: number): string[] {
    const metadata = mode === "minimal"
        ? changeCount(group.entries.length)
        : `${changeCount(group.entries.length)}; ${describeActors(group)}; ${describeOperations(group)}`;
    const deleted = group.endHash === null;
    const sensitive = isSensitiveHistoryDiffPath(group.path);
    const status = primaryOperationLabel(group);
    const target = deleted || sensitive ? escapeMarkdownLabel(group.path) : workspaceReference(group.path);
    const lines = [`- ${status}: ${target} — ${metadata}`];
    if (sensitive) {
        lines.push(deleted
            ? "  Sensitive path: file content and diff are excluded from the prompt; the current file is deleted."
            : "  Sensitive path: file content and diff are excluded from the prompt.");
        return lines;
    }
    if (!detail) {
        return lines;
    }
    if (detail.kind === "inline") {
        lines.push(
            `  Location: ${detail.locations.map(translateLocation).join("; ")}`,
            `  Diff: ${detail.charCount} characters, ${detail.changedLineCount} changed lines.`,
            renderDiffFence(detail.diff),
        );
        return lines;
    }
    if (detail.kind === "reference") {
        lines.push(
            `  Location: ${detail.locations.map(translateLocation).join("; ")}`,
            deleted
                ? `  Diff size: ${detail.charCount} characters, ${detail.changedLineCount} changed lines; above the inline limit of ${diffMaxChars} characters / ${detail.lineLimit} lines. The current file is deleted.`
                : `  Diff size: ${detail.charCount} characters, ${detail.changedLineCount} changed lines; above the inline limit of ${diffMaxChars} characters / ${detail.lineLimit} lines.`,
        );
        return lines;
    }
    if (detail.kind === "blocked") {
        lines.push("  File content and diff are excluded from the prompt.");
        return lines;
    }
    if (detail.kind === "unchanged") {
        lines.push("  File content is unchanged; this group may contain only a rename or an equivalent write.");
        return lines;
    }
    lines.push(deleted
        ? `  Diff unavailable (${detail.reason}); the current file is deleted.`
        : `  Diff unavailable (${detail.reason}).`);
    return lines;
}

/** 判断追加一个文件后，连同遗漏摘要与 footer 是否仍在 notice 硬上限内。 */
function noticeFits(header: string[], current: string[], candidate: string[], omittedAfterCandidate: number, footer: string[]): boolean {
    const omitted = omittedAfterCandidate > 0 ? [omittedFileSummary(omittedAfterCandidate)] : [];
    return noticeCharCount([...header, ...current, ...candidate, ...omitted, ...footer].join("\n")) <= MAX_AGENT_CHANGE_NOTICE_CHARS;
}

/** 大批量变更只保留准确数量，避免 prompt 与预处理成本无界增长。 */
function omittedFileSummary(count: number): string {
    return `- ${count} additional changed file${count === 1 ? " was" : "s were"} not expanded; this notice still accounts for them.`;
}

/** Agent 字符预算按 Unicode code point 计数，与单文件 diff 策略保持一致。 */
function noticeCharCount(value: string): number {
    return Array.from(value).length;
}

/** 生成 Agent UI 可点击、模型也能直接看到的 Project Workspace 相对引用。 */
function workspaceReference(path: string): string {
    const label = escapeMarkdownLabel(path);
    const target = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
    return `[${label}](${target})`;
}

/** 转义 Markdown link label 与删除路径提示中的结构字符。 */
function escapeMarkdownLabel(path: string): string {
    return path.replace(/([\\\[\]])/gu, "\\$1");
}

/** 选择不会被 diff 正文中的反引号提前闭合的 Markdown fence。 */
function renderDiffFence(diff: string): string {
    const longestRun = Math.max(0, ...[...diff.matchAll(/`+/gu)].map((match) => match[0].length));
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    return `${fence}diff\n${diff}\n${fence}`;
}

/** 归因摘要：组内出现过的操作者去重列举。 */
function describeActors(group: UnseenGroup): string {
    const labels = new Set<string>();
    for (const entry of group.entries) {
        labels.add(actorLabel(entry.actor));
    }
    return `by ${[...labels].join(", ")}`;
}

function actorLabel(actor: OperationActor): string {
    switch (actor.kind) {
        case "user":
            return "the user";
        case "external":
            return "an external tool";
        case "agent":
            return `agent#${actor.sessionId}`;
        case "system":
            return `the system (${actor.source})`;
    }
}

/** 操作类型计数摘要，如「修改×2、删除×1」。 */
function describeOperations(group: UnseenGroup): string {
    const counts = new Map<string, number>();
    for (const entry of group.entries) {
        const label = operationLabel(entry.operation.type);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => count > 1 ? `${label} x${count}` : label).join(", ");
}

function operationLabel(type: string): string {
    switch (type) {
        case "file.create":
            return "added";
        case "file.edit":
            return "modified";
        case "file.delete":
            return "deleted";
        case "file.rename":
            return "renamed";
        case "file.revert":
            return "reverted";
        case "file.restore":
            return "restored";
        default:
            return type;
    }
}

/**
 * 按文件的净状态和本组操作历史选择 Git 风格主状态。
 * 后续 edit 不应抹掉 create / rename / restore / revert 的用户可见语义。
 */
function primaryOperationLabel(group: UnseenGroup): string {
    const operations = new Set(group.entries.map((entry) => entry.operation.type));
    if (group.endHash === null) {
        return "deleted";
    }
    if (group.baseHash === null) {
        if (operations.has("file.restore")) {
            return "restored";
        }
        if (operations.has("file.revert")) {
            return "reverted";
        }
        return "added";
    }
    if (operations.has("file.rename")) {
        return "renamed";
    }
    if (operations.has("file.revert")) {
        return "reverted";
    }
    if (operations.has("file.restore")) {
        return "restored";
    }
    return "modified";
}

/** 英文变化计数。 */
function changeCount(count: number): string {
    return `${count} change${count === 1 ? "" : "s"}`;
}

/** nb-history hunk 位置当前使用中文标记，在提示层转换为英文。 */
function translateLocation(location: string): string {
    return location
        .replace(/^新 /u, "new ")
        .replace(/ \/ 旧 /u, " / old ")
        .replace(/^旧 /u, "old ");
}
