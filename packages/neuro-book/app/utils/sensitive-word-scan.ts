import builtinWords from "nbook/app/assets/builtin-sensitive-words.json";

export interface SensitiveMatch {
    word: string;
    line: number;
    column: number;
    index: number;
    context: string;
}

export interface SensitiveScanOptions {
    contextRadius?: number;
}

export interface SensitiveWordMatcher {
    scan: (text: string, options?: SensitiveScanOptions) => SensitiveMatch[];
}

interface AcNode {
    children: Map<string, AcNode>;
    fail: AcNode | null;
    output: string[];
}

/**
 * 解析文本形式的敏感词表（一行一词，# 为注释）。
 */
export function parseSensitiveWords(raw: string): string[] {
    if (!raw || !raw.trim()) {
        return [];
    }
    const lines = raw.split(/\r?\n/);
    const words: string[] = [];

    for (const line of lines) {
        const commentIndex = line.indexOf("#");
        const cleanLine = (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trim();
        if (cleanLine.length > 0) {
            words.push(cleanLine);
        }
    }
    return words;
}

/**
 * 合并内置词表与自定义词表并去重。
 */
export function mergeSensitiveWordLists(
    builtin: string[],
    custom: string[] | string,
): string[] {
    const customList = typeof custom === "string" ? parseSensitiveWords(custom) : custom;
    const wordSet = new Set<string>();

    for (const word of builtin) {
        const trimmed = word.trim();
        if (trimmed) {
            wordSet.add(trimmed);
        }
    }
    for (const word of customList) {
        const trimmed = word.trim();
        if (trimmed) {
            wordSet.add(trimmed);
        }
    }
    return Array.from(wordSet);
}

/**
 * 获取随包内置的敏感词列表。
 */
export function getBuiltinSensitiveWords(): string[] {
    return [...builtinWords];
}

/**
 * 计算每一行的起始字符偏移量。
 */
function computeLineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text.charAt(i) === "\n") {
            starts.push(i + 1);
        }
    }
    return starts;
}

/**
 * 根据字符偏移量计算 1-based 行号和列号。
 */
function resolveLineAndColumn(lineStarts: number[], index: number): { line: number; column: number } {
    let low = 0;
    let high = lineStarts.length - 1;
    let lineIndex = 0;
    while (low <= high) {
        const mid = (low + high) >> 1;
        const start = lineStarts[mid] ?? 0;
        if (start <= index) {
            lineIndex = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    const currentLineStart = lineStarts[lineIndex] ?? 0;
    return {
        line: lineIndex + 1,
        column: index - currentLineStart + 1,
    };
}

/**
 * 截取敏感词命中的上下文片段。
 */
function extractContextSnippet(text: string, index: number, wordLength: number, radius: number): string {
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + wordLength + radius);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < text.length ? "..." : "";
    const rawSnippet = text.slice(start, end).replace(/\r?\n/g, " ");
    return `${prefix}${rawSnippet}${suffix}`;
}

/**
 * 构建 Aho-Corasick 多模式自动机匹配器。
 */
export function createSensitiveWordMatcher(words: string[]): SensitiveWordMatcher {
    const root: AcNode = { children: new Map(), fail: null, output: [] };

    for (const word of words) {
        const trimmed = word.trim();
        if (!trimmed) {
            continue;
        }
        let curr = root;
        for (const char of trimmed) {
            let next = curr.children.get(char);
            if (!next) {
                next = { children: new Map(), fail: null, output: [] };
                curr.children.set(char, next);
            }
            curr = next;
        }
        if (!curr.output.includes(trimmed)) {
            curr.output.push(trimmed);
        }
    }

    const queue: AcNode[] = [];
    for (const child of root.children.values()) {
        child.fail = root;
        queue.push(child);
    }

    while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const [char, child] of curr.children.entries()) {
            let f = curr.fail;
            while (f !== null && !f.children.has(char)) {
                f = f.fail;
            }
            child.fail = f ? (f.children.get(char) ?? root) : root;
            if (child.fail.output.length > 0) {
                for (const outWord of child.fail.output) {
                    if (!child.output.includes(outWord)) {
                        child.output.push(outWord);
                    }
                }
            }
            queue.push(child);
        }
    }

    return {
        scan(text: string, options?: SensitiveScanOptions): SensitiveMatch[] {
            if (!text || root.children.size === 0) {
                return [];
            }
            const radius = options?.contextRadius ?? 15;
            const lineStarts = computeLineStarts(text);
            const matches: SensitiveMatch[] = [];
            let curr = root;

            for (let i = 0; i < text.length; i++) {
                const char = text.charAt(i);
                while (curr !== root && !curr.children.has(char)) {
                    curr = curr.fail ?? root;
                }
                curr = curr.children.get(char) ?? root;
                if (curr.output.length > 0) {
                    for (const matchedWord of curr.output) {
                        const startIndex = i - matchedWord.length + 1;
                        const { line, column } = resolveLineAndColumn(lineStarts, startIndex);
                        const context = extractContextSnippet(text, startIndex, matchedWord.length, radius);
                        matches.push({
                            word: matchedWord,
                            line,
                            column,
                            index: startIndex,
                            context,
                        });
                    }
                }
            }

            matches.sort((a, b) => a.index - b.index || b.word.length - a.word.length);
            return matches;
        },
    };
}

/**
 * 直接对文本执行敏感词扫描。
 */
export function scanSensitiveWords(
    text: string,
    words: string[],
    options?: SensitiveScanOptions,
): SensitiveMatch[] {
    const matcher = createSensitiveWordMatcher(words);
    return matcher.scan(text, options);
}