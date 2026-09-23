import { describe, expect, it } from "vitest";
import {
    dispatchEditorJumpToLine,
    JUMP_TO_LINE_EVENT,
    lineToPos,
    type JumpToLinePayload,
} from "./editor-line-position";

describe("editor-line-position", () => {
    describe("lineToPos", () => {
        const text = "第一行内容\n第二行开始\n第三行末尾";

        it("1-based 第一行应返回 0 偏移", () => {
            expect(lineToPos(text, 1)).toBe(0);
        });

        it("1-based 第二行应返回第二行首字符索引", () => {
            // "第一行内容\n" 长度为 6 (5字符 + 1换行)
            expect(lineToPos(text, 2)).toBe(6);
            expect(text.slice(lineToPos(text, 2)).startsWith("第二行开始")).toBe(true);
        });

        it("1-based 第三行应返回第三行首字符索引", () => {
            // "第一行内容\n第二行开始\n" 长度为 6 + 6 = 12
            expect(lineToPos(text, 3)).toBe(12);
            expect(text.slice(lineToPos(text, 3))).toBe("第三行末尾");
        });

        it("小于等于 0 的行号应钳位到首行 (0)", () => {
            expect(lineToPos(text, 0)).toBe(0);
            expect(lineToPos(text, -5)).toBe(0);
        });

        it("超过总行数的行号应钳位到文本末尾", () => {
            expect(lineToPos(text, 999)).toBe(text.length);
        });

        it("支持 CRLF (\r\n) 换行符", () => {
            const crlfText = "Line 1\r\nLine 2\r\nLine 3";
            // "Line 1\r\n" 长度为 8
            expect(lineToPos(crlfText, 1)).toBe(0);
            expect(lineToPos(crlfText, 2)).toBe(8);
            expect(crlfText.slice(lineToPos(crlfText, 2)).startsWith("Line 2")).toBe(true);
        });

        it("空文本或单行文本处理", () => {
            expect(lineToPos("", 1)).toBe(0);
            expect(lineToPos("", 5)).toBe(0);
            expect(lineToPos("单行文本", 1)).toBe(0);
            expect(lineToPos("单行文本", 2)).toBe(4);
        });
    });

    describe("JUMP_TO_LINE_EVENT and dispatch helper", () => {
        it("常量与 payload 类型契约定义正确", () => {
            expect(JUMP_TO_LINE_EVENT).toBe("novel-ide:jump-to-line");
            const payload: JumpToLinePayload = { line: 5 };
            expect(payload.line).toBe(5);
        });
    });
});
