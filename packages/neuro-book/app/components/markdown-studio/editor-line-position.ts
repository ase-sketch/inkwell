/**
 * 编辑器行号定位与跳转事件辅助工具。
 */

export const JUMP_TO_LINE_EVENT = "novel-ide:jump-to-line";

export interface JumpToLinePayload {
    line: number;
}

/**
 * 派发跳转至特定行号的自定义事件。
 */
export function dispatchEditorJumpToLine(line: number): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent<JumpToLinePayload>(JUMP_TO_LINE_EVENT, {
                detail: { line },
            })
        );
    }
}

/**
 * 根据 1-based 行号计算在纯文本中的字符偏移量（0-based）。
 * 行号越界时严格执行双向钳位：
 * - line <= 1 钳位到第 1 行起点 (0)；
 * - line 超过总行数时钳位到文本末尾 (text.length)。
 */
export function lineToPos(text: string, line: number): number {
    if (!text || line <= 1) {
        return 0;
    }

    let currentLine = 1;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10 /* 
 */) {
            currentLine++;
            if (currentLine === line) {
                return i + 1;
            }
        }
    }

    return text.length;
}

/**
 * 将 1-based 行号映射到 TipTap ProseMirror document position。
 * 优先按块级节点匹配行号，若超出则钳制在合法的 doc 边界内。
 */
export function lineToDocPosition(
    doc: {
        descendants: (fn: (node: { isBlock: boolean; isTextblock: boolean }, pos: number) => boolean | void) => void;
        content: { size: number };
        textContent: string;
    },
    line: number
): number {
    if (line <= 1) {
        return 1;
    }

    let targetPos: number | null = null;
    let currentLine = 1;

    doc.descendants((node, pos) => {
        if (node.isBlock && node.isTextblock) {
            if (currentLine === line) {
                targetPos = pos + 1;
                return false;
            }
            currentLine++;
        }
        return true;
    });

    if (targetPos !== null) {
        return Math.min(Math.max(1, targetPos), doc.content.size);
    }

    // 若按块节点未找到足够行数（例如段落内软换行），兜底按纯文本 \n 偏移映射
    const charOffset = lineToPos(doc.textContent, line);
    return Math.min(Math.max(1, charOffset + 1), doc.content.size);
}
