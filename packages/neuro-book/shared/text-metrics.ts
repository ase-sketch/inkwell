/**
 * 统一字数口径工具：
 * 去除空白、去除 Markdown 语法标记后的字符数。
 * 中文、英文、数字、中英文标点均按 1 字符计数（接近国内网文平台统计口径）。
 */

const FRONTMATTER_REGEX = /^---[\r\n]+[\s\S]*?[\r\n]+---(?:[\r\n]+|$)/;
const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;
const HTML_TAG_REGEX = /<[^>]+>/g;
const CODE_BLOCK_REGEX = /```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```/g;
const INLINE_CODE_REGEX = /`([^`]+)`/g;
const IMAGE_REGEX = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK_REGEX = /\[([^\]]*)\]\([^)]*\)/g;
const HEADING_REGEX = /^[ \t]*#{1,6}[ \t]+(.*)$/gm;
const BLOCKQUOTE_REGEX = /^[ \t]*>[ \t]?/gm;
const LIST_ITEM_REGEX = /^[ \t]*(?:[*+-]|\d+\.)[ \t]+/gm;
const HORIZONTAL_RULE_REGEX = /^[ \t]*(?:[-*_]){3,}[ \t]*$/gm;
const BOLD_ITALIC_STRIKE_REGEX = /(\*\*|__|\*|_|~~)(.*?)\1/g;
const WHITESPACE_REGEX = /[\s\u3000]/gu;
const MULTIPLE_NEWLINES_REGEX = /\n{3,}/g;

/**
 * 去除 Markdown 格式标记及 frontmatter，保留主要正文文本。
 */
export function stripMarkdown(markdown: string): string {
    if (!markdown) {
        return "";
    }

    let text = markdown.replace(FRONTMATTER_REGEX, "");

    // 去除 HTML 注释
    text = text.replace(HTML_COMMENT_REGEX, "");

    // 提取代码块中的内容（保留代码文本，去除围栏语法）
    text = text.replace(CODE_BLOCK_REGEX, "$1");
    text = text.replace(INLINE_CODE_REGEX, "$1");

    // 图片与链接：保留 alt 文本与链接文本
    text = text.replace(IMAGE_REGEX, "$1");
    text = text.replace(LINK_REGEX, "$1");

    // 标题、引用、列表前缀
    text = text.replace(HEADING_REGEX, "$1");
    text = text.replace(BLOCKQUOTE_REGEX, "");
    text = text.replace(LIST_ITEM_REGEX, "");

    // 分割线
    text = text.replace(HORIZONTAL_RULE_REGEX, "");

    // 加粗、斜体、删除线（重复替换以支持嵌套，如 **_text_**）
    let prev = "";
    while (prev !== text) {
        prev = text;
        text = text.replace(BOLD_ITALIC_STRIKE_REGEX, "$2");
    }

    // 去除 HTML 标签
    text = text.replace(HTML_TAG_REGEX, "");

    // 规范化空行并清理首尾空白
    text = text.replace(MULTIPLE_NEWLINES_REGEX, "\n\n").trim();

    return text;
}

/**
 * 统计正文字符数（去除空白与 Markdown 标记后）。
 * 中文、英文、数字、中英文标点均计为 1 字符。
 */
export function countWords(markdown: string): number {
    if (!markdown || typeof markdown !== "string") {
        return 0;
    }

    const stripped = stripMarkdown(markdown);
    const nonWhitespace = stripped.replace(WHITESPACE_REGEX, "");

    if (!nonWhitespace) {
        return 0;
    }

    // 使用 Array.from 展开，正确统计 Unicode 代理对（如 emoji 算 1 个字符）
    return Array.from(nonWhitespace).length;
}

/**
 * 统计选区文本字数。
 */
export function countSelectionWords(selectedText: string): number {
    return countWords(selectedText);
}
