import fs from "node:fs/promises";
import path from "node:path";
import {parseMarkdownDocument} from "nbook/server/workspace-files/workspace-files";
import {activateReadyProjectModule} from "nbook/server/workspace-files/project-session";
import type {ReadyProjectSessionRef} from "nbook/server/workspace-files/project-session-types";
import {PROJECT_PLOT_WORLD_MODULE_TOKEN} from "nbook/server/plot";
import type {PlotFacade} from "nbook/server/plot/facade/plot.facade";
import type {ChapterRepository} from "nbook/server/plot/contracts/plot-repositories";
import type {StoryChapterDto} from "nbook/shared/dto/plot.dto";

/** 当前章节口径解析结果。 */
export type CurrentChapterInfo = {
    /** 匹配到的 StoryChapter name。 */
    chapterName: string;
    /** 章在卷/作品内的排序。 */
    sortOrder: number;
    /** manuscript 标准相对路径（如 manuscript/{volume}/{chapter}/index.md）。 */
    manuscriptPath: string;
};

/** 解析 manuscript 路径元信息。 */
export type ParsedManuscriptPath = {
    volume: string;
    chapter: string;
    manuscriptPath: string;
};

/** 章节关联依赖注入接口（窄化以方便测试）。 */
export type CurrentChapterDeps = {
    /** 故事 ID（配合 chapterRepository 使用）。 */
    storyId?: number;
    /** 直接传入的已查出章节列表（最优先）。 */
    chapters?: Array<Pick<StoryChapterDto, "name" | "sortOrder">>;
    /** PlotFacade 门面实例。 */
    plotFacade?: Pick<PlotFacade, "getPlotTree">;
    /** ChapterRepository 仓储实例。 */
    chapterRepository?: Pick<ChapterRepository, "findChapterByName"> & {storyId?: number};
    /** 当前打开的 ProjectSession 引用。 */
    project?: ReadyProjectSessionRef | null;
    /** Project 根目录路径（文件读取 fallback）。 */
    projectRoot?: string;
    /** 自定义文本读取函数（单元测试与模拟）。 */
    readText?: (manuscriptPath: string) => Promise<string | null> | string | null;
};

/**
 * 校验并解析 selectedFilePath 是否指向 manuscript/{volume}/{chapter}/index.md。
 * 若不匹配或路径非法返回 null。
 */
export function parseManuscriptChapterPath(selectedFilePath: string | null | undefined): ParsedManuscriptPath | null {
    if (!selectedFilePath || typeof selectedFilePath !== "string") {
        return null;
    }
    const trimmed = selectedFilePath.trim().replace(/\\/g, "/");
    if (!trimmed) {
        return null;
    }

    // 规范化路径：去掉首尾斜杠，并处理可能的 workspace/{project}/ 相对前缀
    const stripped = trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
    const manuscriptIdx = stripped.indexOf("manuscript/");
    if (manuscriptIdx === -1) {
        return null;
    }

    const candidate = stripped.slice(manuscriptIdx);
    const match = candidate.match(/^manuscript\/([^/]+)\/([^/]+)\/index\.md$/);
    if (!match) {
        return null;
    }

    const volume = match[1];
    const chapter = match[2];
    if (!volume || !chapter) {
        return null;
    }

    return {
        volume,
        chapter,
        manuscriptPath: `manuscript/${volume}/${chapter}/index.md`,
    };
}

/**
 * 输入 clientState.studio.selectedFilePath，解析并经 Plot 模块关联 StoryChapter。
 *
 * 解析口径：
 * 1. 必须指向 manuscript/{volume}/{chapter}/index.md；
 * 2. 若可读，优先提取 frontmatter.chapter 作为指针名；
 * 3. 若无 frontmatter 或未匹配，以目录名 chapter 兜底匹配 StoryChapter.name；
 * 4. 均未匹配返回 null，不抛错。
 */
export async function resolveCurrentChapter(
    selectedFilePath: string | null | undefined,
    deps: CurrentChapterDeps = {},
): Promise<CurrentChapterInfo | null> {
    const parsedPath = parseManuscriptChapterPath(selectedFilePath);
    if (!parsedPath) {
        return null;
    }

    // 1. 尝试读取文件 frontmatter.chapter
    let frontmatterChapter: string | null = null;
    const content = await readFileContent(parsedPath.manuscriptPath, deps);
    if (content) {
        const parsedDoc = parseMarkdownDocument(content);
        if (typeof parsedDoc.frontmatter?.chapter === "string" && parsedDoc.frontmatter.chapter.trim()) {
            frontmatterChapter = parsedDoc.frontmatter.chapter.trim();
        }
    }

    // 候选匹配列表：frontmatter 优先，目录名兜底
    const candidates: string[] = [];
    if (frontmatterChapter) {
        candidates.push(frontmatterChapter);
    }
    if (parsedPath.chapter && !candidates.includes(parsedPath.chapter)) {
        candidates.push(parsedPath.chapter);
    }

    // 2. 匹配 Plot 中的 StoryChapter
    const chapterList = await loadStoryChapters(deps);

    for (const candidate of candidates) {
        if (chapterList) {
            const matched = chapterList.find((ch) => ch.name === candidate);
            if (matched) {
                return {
                    chapterName: matched.name,
                    sortOrder: matched.sortOrder,
                    manuscriptPath: parsedPath.manuscriptPath,
                };
            }
        } else if (deps.chapterRepository) {
            const storyId = deps.chapterRepository.storyId ?? deps.storyId ?? 0;
            const matched = await deps.chapterRepository.findChapterByName(storyId, candidate);
            if (matched) {
                return {
                    chapterName: matched.name,
                    sortOrder: matched.sortOrder,
                    manuscriptPath: parsedPath.manuscriptPath,
                };
            }
        }
    }

    return null;
}

/**
 * 预留能力：读取当前章节正文内容（除去 frontmatter 后的正文 body）。
 */
export async function readChapterContent(
    manuscriptPath: string,
    deps: Pick<CurrentChapterDeps, "readText" | "project" | "projectRoot"> = {},
): Promise<string | null> {
    const rawContent = await readFileContent(manuscriptPath, deps);
    if (rawContent === null) {
        return null;
    }
    const parsed = parseMarkdownDocument(rawContent);
    return parsed.body;
}

/** 内部辅助：加载 StoryChapter 集合。 */
async function loadStoryChapters(
    deps: CurrentChapterDeps,
): Promise<Array<Pick<StoryChapterDto, "name" | "sortOrder">> | null> {
    if (deps.chapters) {
        return deps.chapters;
    }

    if (deps.plotFacade) {
        const tree = await deps.plotFacade.getPlotTree();
        const chapters: Array<Pick<StoryChapterDto, "name" | "sortOrder">> = [];
        for (const act of tree.acts ?? []) {
            for (const ch of act.chapters ?? []) {
                chapters.push({name: ch.name, sortOrder: ch.sortOrder});
            }
        }
        for (const ch of tree.ungroupedChapters ?? []) {
            chapters.push({name: ch.name, sortOrder: ch.sortOrder});
        }
        return chapters;
    }

    if (deps.project) {
        try {
            const {plot} = await activateReadyProjectModule(deps.project, PROJECT_PLOT_WORLD_MODULE_TOKEN);
            const tree = await plot.getPlotTree();
            const chapters: Array<Pick<StoryChapterDto, "name" | "sortOrder">> = [];
            for (const act of tree.acts ?? []) {
                for (const ch of act.chapters ?? []) {
                    chapters.push({name: ch.name, sortOrder: ch.sortOrder});
                }
            }
            for (const ch of tree.ungroupedChapters ?? []) {
                chapters.push({name: ch.name, sortOrder: ch.sortOrder});
            }
            return chapters;
        } catch {
            return null;
        }
    }

    return null;
}

/** 内部辅助：读取文件文本内容。 */
async function readFileContent(
    manuscriptPath: string,
    deps: Pick<CurrentChapterDeps, "readText" | "project" | "projectRoot">,
): Promise<string | null> {
    if (deps.readText) {
        try {
            const res = await deps.readText(manuscriptPath);
            return typeof res === "string" ? res : null;
        } catch {
            return null;
        }
    }

    const rootDir = deps.project?.workspace?.root ?? deps.projectRoot;
    if (rootDir) {
        try {
            const resolvedPath = path.resolve(rootDir, manuscriptPath);
            return await fs.readFile(resolvedPath, "utf-8");
        } catch {
            return null;
        }
    }

    return null;
}
