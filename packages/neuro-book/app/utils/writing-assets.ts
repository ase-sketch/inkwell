import type {WorkspaceFileNode} from "nbook/app/stores/novel-ide";

/**
 * 作者视角的写作资产投影。
 *
 * 基座 workspace 是一棵混合树：正文（manuscript/）与大纲（outline/）之外的智能体上下文、
 * 世界引擎、schema、project.yaml、手册、reference 等内部文件并排。这些都「藏而不删」——
 * agent 仍然照常读写，只是不再出现在作者的码字界面里。这里只做投影，不改写任何输入。
 */

/** 作者可见的正文根目录。 */
const AUTHOR_VISIBLE_ROOTS = new Set(["manuscript"]);

/** 大纲资产根目录：大纲（总纲）与细纲都住在这里，是正文之外作者可见的第二个资产根。 */
export const OUTLINE_ROOT = "outline";

/** 大纲目录名：outline/001-outline。 */
const OUTLINE_DOCUMENT_DIRECTORY_PATTERN = /^\d{3}-outline$/;
/** 细纲卷目录名：outline/001-volume。 */
const OUTLINE_VOLUME_DIRECTORY_PATTERN = /^\d{3}-volume$/;
/** 细纲章目录名：001-chapter。 */
const OUTLINE_CHAPTER_DIRECTORY_PATTERN = /^\d{3}-chapter$/;

/** 作者写作资产的三个分区。 */
export type WritingAssetKind = "manuscript" | "outline" | "beat";

/** 判断路径是否在作者可见的正文根目录之下。 */
export function isAuthorVisibleWritingPath(filePath: string): boolean {
    return pathRoot(filePath) !== null;
}

/**
 * 取出路径的根目录名（已去掉 workspace/ 前缀），不在可见根下时返回 null。
 */
function pathRoot(filePath: string): string | null {
    const segments = normalize(filePath).split("/").filter(Boolean);
    const rootIndex = segments[0] === "workspace" ? 1 : 0;
    const root = segments[rootIndex];
    return root && AUTHOR_VISIBLE_ROOTS.has(root) ? root : null;
}

/**
 * 计算一条路径在可见树里的层级深度；根目录为 0，不在树里返回 -1。
 */
function visibleDepth(filePath: string): number {
    const segments = normalize(filePath).split("/").filter(Boolean);
    const rootIndex = segments[0] === "workspace" ? 1 : 0;
    if (!segments[rootIndex] || !AUTHOR_VISIBLE_ROOTS.has(segments[rootIndex])) {
        return -1;
    }
    return segments.length - rootIndex - 1;
}

/** 归一化路径：统一分隔符、去掉 ./ 与尾随斜杠。 */
function normalize(filePath: string): string {
    return filePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/** 路径属于某个资产根时，返回 {前缀, 根下相对段}；否则返回 null。 */
function splitUnderRoot(filePath: string, root: string): {prefix: string; segments: string[]} | null {
    const segments = normalize(filePath).split("/").filter(Boolean);
    const rootIndex = segments[0] === "workspace" ? 1 : 0;
    if (segments[rootIndex] !== root) {
        return null;
    }
    return {
        prefix: segments.slice(0, rootIndex + 1).join("/"),
        segments: segments.slice(rootIndex + 1),
    };
}

/** 判断文件名是否是 index.md（大小写不敏感）。 */
function isIndexFile(name: string | undefined): boolean {
    return (name ?? "").toLowerCase() === "index.md";
}

/** 解析父级目录路径。 */
export function resolveParentDirectory(filePath: string): string {
    const normalized = normalize(filePath);
    const lastSlash = normalized.lastIndexOf("/");
    return lastSlash > -1 ? normalized.slice(0, lastSlash) : "";
}

/**
 * 判断路径是否是卷目录：必须为 manuscript/ 下的直属目录且名称符合 volume 或 vol 格式。
 */
export function isVolumeDirectoryPath(filePath: string): boolean {
    const normalized = normalize(filePath);
    const parts = normalized.split("/").filter(Boolean);
    const rootIdx = parts[0] === "workspace" ? 1 : 0;
    if (parts[rootIdx] !== "manuscript") return false;
    if (parts.length !== rootIdx + 2) return false;
    const seg = parts[rootIdx + 1];
    if (!seg) return false;
    return /^(\d+)-(?:volume|vol)$/i.test(seg) || /^(?:volume|vol)-?(\d+)$/i.test(seg);
}

/**
 * 判断路径是否是章节（无论在卷内还是根层，排除了 manuscript 根目录与卷目录）。
 */
export function isChapterWritingPath(filePath: string): boolean {
    const normalized = normalize(filePath);
    if (normalized === "manuscript" || normalized === "workspace/manuscript") return false;
    return isAuthorVisibleWritingPath(filePath) && !isVolumeDirectoryPath(filePath);
}

/** 路径最后一段。 */
function lastSegment(filePath: string): string {
    const segments = normalize(filePath).split("/").filter(Boolean);
    return segments.at(-1) ?? "";
}

/**
 * 取路径在资产根下的目录段：index.md 由它所在的目录承载，
 * 所以 `outline/003-outline/index.md` 的目录段是 ["003-outline"]。
 */
function documentDirectorySegments(filePath: string): string[] {
    const split = splitUnderRoot(filePath, OUTLINE_ROOT);
    if (!split) {
        return [];
    }
    const segments = [...split.segments];
    if (isIndexFile(segments.at(-1))) {
        segments.pop();
    }
    return segments;
}

/**
 * 把 workspace 文件树投影成作者视角的正文树。
 *
 * 规则：
 * - 只保留 manuscript/ 之下的节点；
 * - 从第一个可见节点开始，逐级补齐它的祖先目录，保证树是连通的（后端返回的是扁平列表）；
 * - 保持输入顺序（后端已按路径排序），不改写节点内容。
 */
export function projectWritingTree(nodes: readonly WorkspaceFileNode[]): WorkspaceFileNode[] {
    const visible = nodes.filter((node) => isAuthorVisibleWritingPath(node.path));
    if (visible.length === 0) {
        return [];
    }

    const byPath = new Map<string, WorkspaceFileNode>();
    for (const node of nodes) {
        byPath.set(normalize(node.path), node);
    }

    const result: WorkspaceFileNode[] = [];
    const emitted = new Set<string>();
    for (const node of visible) {
        const segments = normalize(node.path).split("/").filter(Boolean);
        const rootIndex = segments[0] === "workspace" ? 1 : 0;
        // 逐级补齐祖先：只补真正在 workspace 里存在的目录节点，不凭空造节点。
        for (let end = rootIndex + 1; end < segments.length; end += 1) {
            const ancestorPath = segments.slice(0, end).join("/");
            if (emitted.has(ancestorPath)) {
                continue;
            }
            const ancestor = byPath.get(ancestorPath);
            if (!ancestor || !ancestor.isDirectory) {
                continue;
            }
            emitted.add(ancestorPath);
            result.push(ancestor);
        }
        const key = normalize(node.path);
        if (!emitted.has(key)) {
            emitted.add(key);
            result.push(node);
        }
    }
    return result;
}

/**
 * 统计正文节点数量，用于「还没有文稿」空态判定。
 * 只数正文文件本身，不把目录算进去——空目录不算有文稿。
 */
export function countWritingDocuments(nodes: readonly WorkspaceFileNode[]): number {
    return nodes.filter((node) => !node.isDirectory && visibleDepth(node.path) >= 0).length;
}

/**
 * 判断路径是否是细纲文档：outline/<NNN>-volume/<NNN>-chapter/index.md。
 * 与正文卷章编号同构，写到哪章看哪章。
 */
export function isBeatDocumentPath(filePath: string): boolean {
    const split = splitUnderRoot(filePath, OUTLINE_ROOT);
    if (!split || split.segments.length !== 3) {
        return false;
    }
    return OUTLINE_VOLUME_DIRECTORY_PATTERN.test(split.segments[0] ?? "")
        && OUTLINE_CHAPTER_DIRECTORY_PATTERN.test(split.segments[1] ?? "")
        && isIndexFile(split.segments[2]);
}

/**
 * 判断路径是否是大纲文档：outline/ 根层文档（outline/001-outline/index.md），
 * 排除细纲所在的 <NNN>-volume 子树。
 */
export function isOutlineDocumentPath(filePath: string): boolean {
    const split = splitUnderRoot(filePath, OUTLINE_ROOT);
    if (!split || split.segments.length < 2) {
        return false;
    }
    if (OUTLINE_VOLUME_DIRECTORY_PATTERN.test(split.segments[0] ?? "")) {
        return false;
    }
    return isIndexFile(split.segments.at(-1));
}

/**
 * 判定一份路径属于哪个写作分区；不属于作者可见写作资产时返回 null。
 * 纯路径判定：大纲与细纲的区别只在目录形状，不看 frontmatter。
 */
export function resolveWritingAssetKind(filePath: string): WritingAssetKind | null {
    if (pathRoot(filePath) !== null) {
        return "manuscript";
    }
    if (!splitUnderRoot(filePath, OUTLINE_ROOT)) {
        return null;
    }
    if (isBeatDocumentPath(filePath)) {
        return "beat";
    }
    if (isOutlineDocumentPath(filePath)) {
        return "outline";
    }
    return null;
}

/**
 * 投影 outline/ 下的一个子集：index.md 由它所在的目录承载，不再单列一行；
 * 逐级补齐中间目录（只补输入里真实存在的目录），保证树连通。
 * 不返回 outline/ 根节点本身——分区标题已经说明这里是哪一类资产。
 */
function projectOutlineScope(
    nodes: readonly WorkspaceFileNode[],
    isInScope: (directorySegments: string[]) => boolean,
): WorkspaceFileNode[] {
    const byPath = new Map<string, WorkspaceFileNode>();
    for (const node of nodes) {
        byPath.set(normalize(node.path), node);
    }

    const result: WorkspaceFileNode[] = [];
    const emitted = new Set<string>();
    for (const node of nodes) {
        const split = splitUnderRoot(node.path, OUTLINE_ROOT);
        if (!split || split.segments.length === 0) {
            continue;
        }
        // 分区按目录形状判定：index.md 由它所在的目录承载。
        const directorySegments = isIndexFile(split.segments.at(-1)) ? split.segments.slice(0, -1) : split.segments;
        if (directorySegments.length === 0 || !isInScope(directorySegments)) {
            continue;
        }
        // index.md 已经由目录行承载时不再单列一行；目录节点缺席时保留它，宁可多一行也不丢文档。
        if (directorySegments.length !== split.segments.length) {
            const directoryPath = `${split.prefix}/${directorySegments.join("/")}`;
            if (byPath.get(directoryPath)?.isDirectory) {
                continue;
            }
        }
        for (let end = 1; end < split.segments.length; end += 1) {
            const ancestorPath = `${split.prefix}/${split.segments.slice(0, end).join("/")}`;
            if (emitted.has(ancestorPath)) {
                continue;
            }
            const ancestor = byPath.get(ancestorPath);
            if (!ancestor?.isDirectory) {
                continue;
            }
            emitted.add(ancestorPath);
            result.push(ancestor);
        }
        const key = normalize(node.path);
        if (!emitted.has(key)) {
            emitted.add(key);
            result.push(node);
        }
    }
    return result;
}

/**
 * 把 workspace 文件树投影成作者视角的大纲树：outline/ 下的总纲文档，
 * 不含细纲的 <NNN>-volume 子树。
 */
export function projectOutlineTree(nodes: readonly WorkspaceFileNode[]): WorkspaceFileNode[] {
    return projectOutlineScope(nodes, (segments) => !OUTLINE_VOLUME_DIRECTORY_PATTERN.test(segments[0] ?? ""));
}

/**
 * 把 workspace 文件树投影成作者视角的细纲树：outline/<NNN>-volume/<NNN>-chapter/…，
 * 与正文卷章同构；卷目录与章目录都在，index.md 由所在目录承载。
 */
export function projectBeatTree(nodes: readonly WorkspaceFileNode[]): WorkspaceFileNode[] {
    return projectOutlineScope(nodes, (segments) => OUTLINE_VOLUME_DIRECTORY_PATTERN.test(segments[0] ?? ""));
}

/** 一个分卷细纲分组：卷目录 + 组内细纲文档。 */
export type OutlineVolumeGroup = Readonly<{
    /** 卷目录路径：outline/001-volume。 */
    path: string;
    entries: WorkspaceFileNode[];
}>;

/**
 * 细纲按卷分组：卷按路径升序，组内保持输入顺序（后端已按路径排序）。
 * 不在标准卷目录下的细纲不会静默丢失——它们本来就不满足细纲路径规则。
 */
export function groupBeatDocuments(entries: readonly WorkspaceFileNode[]): OutlineVolumeGroup[] {
    const groups = new Map<string, WorkspaceFileNode[]>();
    for (const entry of entries) {
        const split = splitUnderRoot(entry.path, OUTLINE_ROOT);
        const volume = split?.segments[0];
        if (!volume || !OUTLINE_VOLUME_DIRECTORY_PATTERN.test(volume)) {
            continue;
        }
        const path = `${OUTLINE_ROOT}/${volume}`;
        const bucket = groups.get(path);
        if (bucket) {
            bucket.push(entry);
        } else {
            groups.set(path, [entry]);
        }
    }
    return [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN"))
        .map(([path, groupEntries]) => ({path, entries: groupEntries}));
}

/**
 * 生成默认新章节路径：manuscript/001-volume/001-chapter/index.md。
 * 已有卷/章时顺延到下一个可用序号，避免覆盖。
 */
export function nextChapterPath(nodes: readonly WorkspaceFileNode[]): string {
    return nextChapterPathUnderRoot(nodes, "manuscript");
}

/**
 * 生成新细纲路径：outline/<最新卷>/<下一章>/index.md。
 * 与正文卷章编号同构，顺延到最新卷的下一章号。
 */
export function nextBeatPath(nodes: readonly WorkspaceFileNode[]): string {
    return nextChapterPathUnderRoot(nodes, OUTLINE_ROOT);
}

/**
 * 卷章结构的下一个可用路径；manuscript/ 与 outline/ 共用同一套编号规则。
 */
function nextChapterPathUnderRoot(nodes: readonly WorkspaceFileNode[], root: string): string {
    const existing = new Set(nodes.map((node) => normalize(node.path)));
    const volumePattern = new RegExp(`^${root}/\\d{3}-volume$`);
    const volumes = [...existing]
        .filter((path) => volumePattern.test(path))
        .map((path) => Number.parseInt(path.slice(root.length + 1, root.length + 4), 10))
        .filter((value) => Number.isInteger(value));
    const volume = volumes.length > 0 ? Math.max(...volumes) : 1;

    for (let volumeIndex = volume; volumeIndex < volume + 100; volumeIndex += 1) {
        const volumePath = `${root}/${pad(volumeIndex)}-volume`;
        const chapterPrefix = `${volumePath}/`;
        const chapters = [...existing]
            .filter((path) => path.startsWith(chapterPrefix) && /^\d{3}-chapter\/index\.md$/.test(path.slice(chapterPrefix.length)))
            .map((path) => Number.parseInt(path.slice(chapterPrefix.length, chapterPrefix.length + 3), 10))
            .filter((value) => Number.isInteger(value));
        const nextChapter = chapters.length > 0 ? Math.max(...chapters) + 1 : 1;
        const candidate = `${chapterPrefix}${pad(nextChapter)}-chapter/index.md`;
        if (!existing.has(candidate)) {
            return candidate;
        }
        // 该卷已排满，顺延到下一卷。
    }
    return `${root}/${pad(volume + 1)}-volume/001-chapter/index.md`;
}

/**
 * 生成新大纲路径：outline/001-outline/index.md。
 * 已有多份大纲时顺延到下一个可用序号（主线大纲 / 番外大纲各占一份）。
 */
export function nextOutlinePath(nodes: readonly WorkspaceFileNode[]): string {
    const existing = new Set(nodes.map((node) => normalize(node.path)));
    const indexes = [...existing]
        .filter((path) => /^outline\/\d{3}-outline$/.test(path))
        .map((path) => Number.parseInt(path.slice("outline/".length, "outline/".length + 3), 10))
        .filter((value) => Number.isInteger(value));
    const start = indexes.length > 0 ? Math.max(...indexes) + 1 : 1;

    for (let index = start; index < start + 100; index += 1) {
        const candidate = `outline/${pad(index)}-outline/index.md`;
        if (!existing.has(candidate)) {
            return candidate;
        }
    }
    return `outline/${pad(start + 100)}-outline/index.md`;
}
/**
 * 生成新卷目录路径：manuscript/001-vol。
 * 兼容扫描 \d{3}-vol 与 \d{3}-volume，顺延到下一个可用序号。
 * 卷是纯目录不含 index.md。
 */
export function nextVolumePath(nodes: readonly WorkspaceFileNode[], root = "manuscript"): string {
    const existing = new Set(nodes.map((node) => normalize(node.path)));
    const volumeDirs = new Set<string>();
    for (const node of nodes) {
        const norm = normalize(node.path);
        volumeDirs.add(norm);
        const parts = norm.split("/").filter(Boolean);
        const rootIdx = parts[0] === "workspace" ? 1 : 0;
        if (parts[rootIdx] === root && parts[rootIdx + 1]) {
            volumeDirs.add(`${root}/${parts[rootIdx + 1]}`);
        }
    }
    const volumePattern = new RegExp(`^${root}/(\\d{3})-(?:volume|vol)$`);
    const volumes = [...volumeDirs]
        .map((p) => p.match(volumePattern)?.[1])
        .filter((val): val is string => Boolean(val))
        .map((numStr) => Number.parseInt(numStr, 10))
        .filter((value) => Number.isInteger(value));
    const nextVolume = volumes.length > 0 ? Math.max(...volumes) + 1 : 1;
    for (let index = nextVolume; index < nextVolume + 100; index += 1) {
        const candidate = `${root}/${pad(index)}-vol`;
        if (!existing.has(candidate)) {
            return candidate;
        }
    }
    return `${root}/${pad(nextVolume + 100)}-vol`;
}

/**
 * 解析章节归卷/移出卷后的目标路径。
 * - 拖入某卷时：置于该卷下；
 * - 拖出卷时：置于 manuscript 根层；
 * - 维护 001- 数字前缀保证路径字典序=阅读序；
 * - 目标目录下若存在同名/同序号冲突，取目标位置下一可用序号顺延。
 */
export function resolveChapterMoveTarget(
    sourcePath: string,
    targetDir: string,
    nodes: readonly WorkspaceFileNode[],
): string {
    const normalizedSource = normalize(sourcePath);
    const normalizedTargetDir = normalize(targetDir);
    const sourceBase = lastSegment(normalizedSource);

    const match = sourceBase.match(/^(\d{3})-(.+)$/);
    const matchNumStr = match?.[1];
    const originalNum = matchNumStr ? Number.parseInt(matchNumStr, 10) : null;
    const slug = match?.[2] ?? sourceBase;

    const existing = new Set(nodes.map((node) => normalize(node.path)));
    const targetPrefix = `${normalizedTargetDir}/`;

    const siblingNames = new Set<string>();
    for (const p of existing) {
        if (p.startsWith(targetPrefix)) {
            const rel = p.slice(targetPrefix.length);
            const firstSeg = rel.split("/")[0];
            if (firstSeg) {
                siblingNames.add(firstSeg);
            }
        }
    }

    const usedIndices = new Set<number>();
    for (const name of siblingNames) {
        const m = name.match(/^(\d{3})(?:-.*)?$/);
        const mNumStr = m?.[1];
        if (mNumStr) {
            usedIndices.add(Number.parseInt(mNumStr, 10));
        }
    }

    let candidateIndex: number;
    if (originalNum !== null && !usedIndices.has(originalNum)) {
        candidateIndex = originalNum;
    } else {
        const maxUsed = usedIndices.size > 0 ? Math.max(...usedIndices) : 0;
        candidateIndex = maxUsed + 1;
    }

    for (let i = candidateIndex; i < candidateIndex + 200; i += 1) {
        const candidateName = `${pad(i)}-${slug}`;
        const candidatePath = `${normalizedTargetDir}/${candidateName}`;
        if (!siblingNames.has(candidateName) && !existing.has(candidatePath)) {
            return candidatePath;
        }
    }

    return `${normalizedTargetDir}/${pad(candidateIndex + 200)}-${slug}`;
}

/**
 * 重命名章节路径，维护 001- 序号前缀并处理冲突。
 */
export function resolveChapterRenameTarget(
    sourcePath: string,
    userInput: string,
    nodes: readonly WorkspaceFileNode[],
): string {
    const normalizedSource = normalize(sourcePath);
    const parentDir = normalizedSource.includes("/")
        ? normalizedSource.slice(0, normalizedSource.lastIndexOf("/"))
        : "";
    const sourceBase = lastSegment(normalizedSource);

    const sourceMatch = sourceBase.match(/^(\d{3})-(.+)$/);
    const sourceNumStr = sourceMatch?.[1];
    const sourceNum = sourceNumStr ? Number.parseInt(sourceNumStr, 10) : 1;

    const trimmed = userInput.trim();
    const inputMatch = trimmed.match(/^(\d{3})(?:-(.*))?$/);

    let targetNum: number;
    let targetSlug: string;
    if (inputMatch && inputMatch[1]) {
        targetNum = Number.parseInt(inputMatch[1], 10);
        targetSlug = inputMatch[2] ? inputMatch[2].trim() : (sourceMatch?.[2] ?? sourceBase);
    } else {
        targetNum = sourceNum;
        targetSlug = trimmed;
    }

    const existing = new Set(nodes.map((node) => normalize(node.path)));
    const targetPrefix = parentDir ? `${parentDir}/` : "";
    const siblingNames = new Set<string>();
    for (const p of existing) {
        if (p === normalizedSource) continue;
        if (targetPrefix && p.startsWith(targetPrefix)) {
            const rel = p.slice(targetPrefix.length);
            const firstSeg = rel.split("/")[0];
            if (firstSeg) {
                siblingNames.add(firstSeg);
            }
        }
    }

    const usedIndices = new Set<number>();
    for (const name of siblingNames) {
        const m = name.match(/^(\d{3})(?:-.*)?$/);
        const mNumStr = m?.[1];
        if (mNumStr) {
            usedIndices.add(Number.parseInt(mNumStr, 10));
        }
    }

    let candidateIndex = targetNum;
    if (usedIndices.has(candidateIndex)) {
        const maxUsed = usedIndices.size > 0 ? Math.max(...usedIndices) : 0;
        candidateIndex = maxUsed + 1;
    }

    for (let i = candidateIndex; i < candidateIndex + 200; i += 1) {
        const candidateName = `${pad(i)}-${targetSlug}`;
        const candidatePath = parentDir ? `${parentDir}/${candidateName}` : candidateName;
        if (!siblingNames.has(candidateName) && !existing.has(candidatePath)) {
            return candidatePath;
        }
    }

    const fallbackName = `${pad(candidateIndex + 200)}-${targetSlug}`;
    return parentDir ? `${parentDir}/${fallbackName}` : fallbackName;
}

export interface ManuscriptWordStats {
    totalWords: number;
    volumeStats: Array<{
        path: string;
        label: string;
        words: number;
    }>;
}

/**
 * 汇总文稿字数：全书总字数 + 各卷字数。
 * 遵循 WorkspaceFileDetailPanel.vue:172-175 范式，用树节点 words 字段按路径前缀过滤 reduce。
 */
export function calculateManuscriptWordStats(
    nodes: readonly WorkspaceFileNode[],
    root = "manuscript",
): ManuscriptWordStats {
    const normRoot = normalize(root);
    const manuscriptPrefix = `${normRoot}/`;

    const manuscriptNodes = nodes.filter((n) => {
        const p = normalize(n.path);
        return p === normRoot || p.startsWith(manuscriptPrefix);
    });
    const totalWords = manuscriptNodes.reduce((total, n) => total + (n.words || 0), 0);

    const volumeDirs = new Map<string, WorkspaceFileNode | null>();
    for (const node of manuscriptNodes) {
        const norm = normalize(node.path);
        const parts = norm.split("/").filter(Boolean);
        const rootIdx = parts[0] === "workspace" ? 1 : 0;
        const volSegment = parts[rootIdx + 1];
        // 严格过滤：只有第一级子目录名称符合 volume 或 vol 格式的才是卷；根层章节（如 003-ch）与 index.md 绝不混入徽章列表
        if (parts[rootIdx] === normRoot && volSegment && (/^(\d+)-(?:volume|vol)$/i.test(volSegment) || /^(?:volume|vol)-?(\d+)$/i.test(volSegment))) {
            const volPath = `${normRoot}/${volSegment}`;
            if (!volumeDirs.has(volPath)) {
                if (norm === volPath && node.isDirectory) {
                    volumeDirs.set(volPath, node);
                } else {
                    volumeDirs.set(volPath, null);
                }
            } else if (norm === volPath && node.isDirectory) {
                volumeDirs.set(volPath, node);
            }
        }
    }

    const sortedVolumePaths = [...volumeDirs.keys()].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    const volumeStats = sortedVolumePaths.map((volPath) => {
        const volNode = volumeDirs.get(volPath);
        const label = volNode ? resolveWritingNodeDisplayLabel(volNode) : resolveWritingAssetLabel(volPath);
        const volPrefix = `${volPath}/`;
        const volDescendantWords = nodes
            .filter((n) => normalize(n.path).startsWith(volPrefix))
            .reduce((total, n) => total + (n.words || 0), 0);
        const directWords = volNode?.words || 0;
        return {
            path: volPath,
            label,
            words: volDescendantWords + directWords,
        };
    });

    return {
        totalWords,
        volumeStats,
    };
}

/** 三位数补零。 */
function pad(value: number): string {
    return String(value).padStart(3, "0");
}

/**
 * 生成新章节的初始 Markdown：与基座示范章节同构的 frontmatter，作者可直接开写。
 */
export function buildChapterMarkdown(filePath: string): string {
    return buildWritingAssetMarkdown(resolveChapterTitle(filePath), "chapter");
}

/**
 * 生成新大纲的初始 Markdown：与正文同构的 frontmatter，但 type 是大纲、不参与 AI 自动检索。
 */
export function buildOutlineMarkdown(filePath: string): string {
    return buildWritingAssetMarkdown(resolveOutlineTitle(filePath), "outline");
}

/**
 * 生成新细纲的初始 Markdown：与正文同构的 frontmatter，但 type 是大纲、不参与 AI 自动检索。
 */
export function buildBeatMarkdown(filePath: string): string {
    return buildWritingAssetMarkdown(resolveBeatTitle(filePath), "outline");
}

/** 写作资产文档的初始 frontmatter：正文、大纲、细纲同构，只有标题与 type 不同。 */
function buildWritingAssetMarkdown(title: string, type: string): string {
    return [
        "---",
        `title: ${JSON.stringify(title)}`,
        `type: ${type}`,
        "status: draft",
        "aliases: []",
        "tags: []",
        'summary: ""',
        "refs: []",
        "retrieval:",
        "    enabled: false",
        "    trigger: null",
        "governance:",
        "    source: manual",
        "    review: proposed",
        "---",
        "",
        "",
    ].join("\n");
}

/** 从路径推导章节标题：001-chapter -> 第 1 章。 */
export function resolveChapterTitle(filePath: string): string {
    const normalized = normalize(filePath);
    const match = normalized.match(/(\d+)-chapter\/index\.md$/);
    if (match && match[1]) {
        const index = Number.parseInt(match[1], 10);
        if (Number.isInteger(index)) {
            return `第 ${index} 章`;
        }
    }
    const segments = normalized.replace(/\/index\.md$/i, "").split("/").filter(Boolean);
    return segments.at(-1) ?? "新章节";
}

/** 从路径推导大纲标题：outline/003-outline -> 大纲 3。 */
export function resolveOutlineTitle(filePath: string): string {
    const directory = documentDirectorySegments(filePath).at(-1) ?? "";
    const match = directory.match(/^(\d+)-outline$/);
    if (match?.[1]) {
        const index = Number.parseInt(match[1], 10);
        if (Number.isInteger(index)) {
            return `大纲 ${index}`;
        }
    }
    return directory || lastSegment(filePath) || "新大纲";
}

/** 从路径推导细纲标题：outline/001-volume/012-chapter -> 第 12 章细纲。 */
export function resolveBeatTitle(filePath: string): string {
    const directory = documentDirectorySegments(filePath).at(-1) ?? "";
    const match = directory.match(/^(\d+)-chapter$/);
    if (match?.[1]) {
        const index = Number.parseInt(match[1], 10);
        if (Number.isInteger(index)) {
            return `第 ${index} 章细纲`;
        }
    }
    return directory || lastSegment(filePath) || "新细纲";
}

/**
 * 面板行标签：节点没有自己的标题时（例如还没写 index.md 的卷目录）用它兜底，
 * 避免作者在界面里读 `001-volume` 这种机器名。
 */
export function resolveWritingAssetLabel(filePath: string): string {
    const normalized = normalize(filePath);
    const tail = lastSegment(normalized.replace(/\/index\.md$/i, ""));
    const outlineMatch = tail.match(/^(\d+)-(?:outline|out)$/i) || tail.match(/^(?:outline|out)-?(\d+)$/i);
    if (outlineMatch?.[1]) {
        return `大纲 ${Number.parseInt(outlineMatch[1], 10)}`;
    }
    const chapterMatch = tail.match(/^(\d+)-(?:chapter|ch|chap)$/i) || tail.match(/^(?:chapter|ch|chap)-?(\d+)$/i);
    if (chapterMatch?.[1]) {
        return `第 ${Number.parseInt(chapterMatch[1], 10)} 章`;
    }
    const volumeMatch = tail.match(/^(\d+)-(?:volume|vol)$/i) || tail.match(/^(?:volume|vol)-?(\d+)$/i);
    if (volumeMatch?.[1]) {
        return `第 ${Number.parseInt(volumeMatch[1], 10)} 卷`;
    }
    return lastSegment(normalized) || normalized;
}

/**
 * 判断名称是否是未命名的原始卷/章/大纲目录名（如 001-vol, 001-ch, 001-volume 等）。
 */
export function isRawWritingDirectoryName(name: string): boolean {
    const trimmed = name.trim();
    return /^(\d+)-(?:volume|vol|chapter|ch|chap|outline|out)$/i.test(trimmed)
        || /^(?:volume|vol|chapter|ch|chap|outline|out)-?(\d+)$/i.test(trimmed);
}

/**
 * 决定节点在作者界面上的展示标签：
 * - 优先作者显式设置的有效自定义标题；
 * - 若标题缺失、为 index.md、或只是 001-volume / 001-vol / 001-ch 等机器名，则用 resolveWritingAssetLabel 兜底；
 * - 兜底不了退回文件名。
 */
export function resolveWritingNodeDisplayLabel(node: Pick<WorkspaceFileNode, "path" | "title">): string {
    const title = node.title?.trim() ?? "";
    const tail = lastSegment(node.path.replace(/\/index\.md$/i, ""));
    const isRaw = !title || /^index\.md$/i.test(title) || title === tail || title === node.path || isRawWritingDirectoryName(title);
    if (!isRaw) {
        return title;
    }
    const assetLabel = resolveWritingAssetLabel(node.path);
    if (assetLabel && assetLabel !== node.path) {
        return assetLabel;
    }
    return title || tail || node.path;
}
