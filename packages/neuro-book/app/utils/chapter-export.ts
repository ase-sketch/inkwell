import {triggerBrowserDownload} from "nbook/app/utils/browser-download";
import {resolveWritingNodeDisplayLabel} from "nbook/app/utils/writing-assets";
import {splitMarkdownFrontmatter} from "nbook/shared/editor-workbench";
import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";

export type ChapterExportScope = "chapter" | "volume" | "book";

/**
 * 归一化路径：统一斜杠、去掉首尾多余斜杠。
 */
export function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/**
 * 清除字符串首部所有全角和半角空白字符。
 */
export function stripLeadingWhitespace(text: string): string {
    return text.replace(/^[\s\u3000]+/, "");
}

/**
 * 清除字符串尾部所有全角和半角空白字符。
 */
export function stripTrailingWhitespace(text: string): string {
    return text.replace(/[\s\u3000]+$/, "");
}

/**
 * 清洗单章正文：
 * 1. 拆分自然段，过滤空行；
 * 2. 清洗段首可能残留的旧缩进（全角或半角空白）；
 * 3. 统一补齐两个全角空格（\u3000\u3000）；
 * 4. 段落之间保持单空行清洗（以 \n\n 分隔）。
 */
export function formatChapterBody(body: string): string {
    const normalized = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rawLines = normalized.split("\n");
    const paragraphs: string[] = [];
    let currentParagraphLines: string[] = [];

    const flushParagraph = (): void => {
        if (currentParagraphLines.length === 0) {
            return;
        }
        const combined = currentParagraphLines.join(" ");
        const cleaned = stripTrailingWhitespace(stripLeadingWhitespace(combined));
        if (cleaned) {
            paragraphs.push(`\u3000\u3000${cleaned}`);
        }
        currentParagraphLines = [];
    };

    for (const line of rawLines) {
        const trimmed = line.trim();
        if (!trimmed) {
            flushParagraph();
        } else {
            currentParagraphLines.push(trimmed);
        }
    }
    flushParagraph();

    return paragraphs.join("\n\n");
}

/**
 * 格式化单个章节为 TXT 格式：
 * 章节标题行 + 正文段落首行两全角空格 + 段间单空行清洗。
 * 剥除 frontmatter，并避免正文首行的 Markdown 标题与章节标题重复。
 */
export function formatChapterTxt(title: string, rawMarkdown: string): string {
    const {body} = splitMarkdownFrontmatter(rawMarkdown);
    let bodyText = body.trim();

    const cleanTitle = title.trim();
    if (cleanTitle) {
        // 如果正文首行是与标题相同的 Markdown 标题（例如 "# 第一章"），将其剥离避免重复
        const lines = bodyText.split("\n");
        const firstLine = lines[0]?.trim() ?? "";
        if (firstLine.startsWith("#")) {
            const headingContent = firstLine.replace(/^#+\s*/, "").trim();
            if (headingContent === cleanTitle || cleanTitle.includes(headingContent)) {
                bodyText = lines.slice(1).join("\n").trim();
            }
        }
    }

    const formattedBody = formatChapterBody(bodyText);
    if (!cleanTitle) {
        return formattedBody;
    }
    if (!formattedBody) {
        return cleanTitle;
    }
    return `${cleanTitle}\n\n${formattedBody}`;
}

/**
 * 拼装多个章节 TXT。
 * 多章之间使用统一三空行（\n\n\n\n）隔开，形成清晰的跨章视觉间距。
 */
export function assembleChaptersTxt(chapters: ReadonlyArray<{title: string; content: string}>): string {
    return chapters
        .map((ch) => formatChapterTxt(ch.title, ch.content))
        .filter((text) => text.length > 0)
        .join("\n\n\n\n");
}

/**
 * 判断节点是否为可导出的正文章节文档：
 * 1. 非目录；
 * 2. 属于 Markdown 或文本文件；
 * 3. 排除根级 manuscript/index.md 以及分卷规划 manuscript/00X-volume/index.md。
 */
export function isExportableChapterNode(node: Pick<WorkspaceFileNode, "path" | "isDirectory" | "entryType">): boolean {
    if (node.isDirectory) {
        return false;
    }
    const normalized = normalizePath(node.path);
    if (!/\.(md|txt|markdown)$/i.test(normalized)) {
        return false;
    }
    // 排除全书说明
    if (/^manuscript\/index\.md$/i.test(normalized)) {
        return false;
    }
    // 排除分卷说明
    if (/^manuscript\/\d{3}-volume\/index\.md$/i.test(normalized) || node.entryType === "volume") {
        return false;
    }
    return true;
}

/**
 * 解析路径所属的卷目录前缀（例如 manuscript/001-volume/）。
 */
export function resolveVolumePrefix(filePath: string): string | null {
    const normalized = normalizePath(filePath);
    const match = normalized.match(/^(manuscript\/[^/]+)\/.*$/);
    if (match && match[1]) {
        return `${match[1]}/`;
    }
    // 若在子目录下，取其直接父目录
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash > 0) {
        return normalized.slice(0, lastSlash + 1);
    }
    return null;
}

/**
 * 根据导出范围筛选并按字典序排序章节节点。
 */
export function filterChapterNodes(
    allNodes: readonly WorkspaceFileNode[],
    activePath: string,
    scope: ChapterExportScope,
): WorkspaceFileNode[] {
    const normalizedActive = normalizePath(activePath);

    if (scope === "chapter") {
        const found = allNodes.find((n) => normalizePath(n.path) === normalizedActive);
        if (found) {
            return [found];
        }
        // 如果不在节点列表中（可能未加载全），退化返回临时节点
        return [{
            mode: "content",
            entryType: "chapter",
            icon: null,
            status: null,
            words: 0,
            refs: [],
            path: activePath,
            absolutePath: activePath,
            isDirectory: false,
            hasIndex: false,
            contentNode: true,
            summary: "",
            title: activePath,
            frontmatter: {},
            frontmatterError: null,
            state: null,
            size: 0,
            mtimeMs: 0,
            editable: true,
        }];
    }

    if (scope === "volume") {
        const volumePrefix = resolveVolumePrefix(activePath);
        const candidates = allNodes.filter((n) => {
            if (!isExportableChapterNode(n)) {
                return false;
            }
            if (volumePrefix) {
                return normalizePath(n.path).startsWith(volumePrefix);
            }
            return true;
        });
        return candidates.slice().sort((a, b) => a.path.localeCompare(b.path));
    }

    // scope === "book"
    const inManuscript = normalizedActive.startsWith("manuscript/");
    const candidates = allNodes.filter((n) => {
        if (!isExportableChapterNode(n)) {
            return false;
        }
        if (inManuscript) {
            return normalizePath(n.path).startsWith("manuscript/");
        }
        return true;
    });
    return candidates.slice().sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 清理文件名中不适合作为系统文件名的特殊字符。
 */
export function sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|\r\n]/g, "_").trim() || "export";
}

/**
 * 根据范围生成导出文件名。
 */
export function resolveExportFilename(options: {
    activeNode?: WorkspaceFileNode;
    activePath: string;
    scope: ChapterExportScope;
    novelTitle?: string;
    volumeTitle?: string;
}): string {
    const {activeNode, activePath, scope, novelTitle, volumeTitle} = options;
    if (scope === "chapter") {
        const title = activeNode ? resolveWritingNodeDisplayLabel(activeNode) : activePath.split("/").pop() ?? "chapter";
        return `${sanitizeFilename(title)}.txt`;
    }
    if (scope === "volume") {
        const vTitle = volumeTitle || "分卷";
        const prefix = novelTitle ? `${novelTitle}_` : "";
        return `${sanitizeFilename(`${prefix}${vTitle}`)}.txt`;
    }
    const bTitle = novelTitle || "全书";
    return `${sanitizeFilename(bTitle)}.txt`;
}

/**
 * 完整导出流程：获取正文、拼装 TXT 并触发浏览器下载。
 */
export async function exportChaptersToTxt(options: {
    scope: ChapterExportScope;
    activePath: string;
    allNodes: readonly WorkspaceFileNode[];
    readContent: (path: string) => Promise<string> | string;
    novelTitle?: string;
    volumeTitle?: string;
}): Promise<{filename: string; text: string; chapterCount: number}> {
    const {scope, activePath, allNodes, readContent, novelTitle, volumeTitle} = options;
    const targetNodes = filterChapterNodes(allNodes, activePath, scope);
    const activeNode = allNodes.find((n) => normalizePath(n.path) === normalizePath(activePath));

    const chapters: Array<{title: string; content: string}> = [];
    for (const node of targetNodes) {
        const content = await readContent(node.path);
        const title = resolveWritingNodeDisplayLabel(node);
        chapters.push({title, content});
    }

    const text = assembleChaptersTxt(chapters);
    const filename = resolveExportFilename({
        activeNode,
        activePath,
        scope,
        novelTitle,
        volumeTitle,
    });

    if (typeof Blob !== "undefined" && typeof document !== "undefined") {
        const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
        triggerBrowserDownload(blob, filename);
    }

    return {filename, text, chapterCount: chapters.length};
}
