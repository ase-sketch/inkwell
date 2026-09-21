import {describe, expect, test} from "bun:test";
import {
    serializeSseComment,
    serializeSseEvent,
    serializeSseJsonEvent,
} from "../src/index.js";

// 第一百零八轮（ADR-0041）：第一方 SSE 帧序列化（WHATWG event-stream；HTTP 服务留宿主）。
describe("SSE 帧序列化", () => {
    test("event/id/retry/data 字段顺序与多行 data 拆分", () => {
        expect(serializeSseEvent({
            data: "line1\nline2",
            event: "runtime",
            id: "42",
            retry: 1500,
        })).toBe("event: runtime\nid: 42\nretry: 1500\ndata: line1\ndata: line2\n\n");
    });

    test("仅 data 的最简帧与空 data 行", () => {
        expect(serializeSseEvent({data: "hello"})).toBe("data: hello\n\n");
        expect(serializeSseEvent({data: "a\n\nb"})).toBe("data: a\ndata: \ndata: b\n\n");
    });

    test("comment 帧与非法输入拒绝", () => {
        expect(serializeSseComment("keepalive")).toBe(": keepalive\n");
        expect(() => serializeSseEvent({data: "a\rb"})).toThrow("data 不能包含 CR");
        expect(() => serializeSseEvent({data: "ok", event: "a\nb"})).toThrow("event 必须是单行");
        expect(() => serializeSseEvent({data: "ok", event: "a\rb"})).toThrow("event 必须是单行");
        expect(() => serializeSseEvent({data: "ok", id: "a\rb"})).toThrow("id 必须是单行");
        expect(() => serializeSseEvent({data: "ok", id: "a\nb"})).toThrow("id 必须是单行");
        expect(() => serializeSseEvent({data: "ok", retry: -1})).toThrow("retry 必须是非负整数");
        expect(() => serializeSseEvent({data: "ok", retry: 1.5})).toThrow("retry 必须是非负整数");
        expect(() => serializeSseEvent({data: "ok", retry: 1e21})).toThrow("retry 必须是非负整数");
        expect(() => serializeSseComment("a\nb")).toThrow("comment 必须是单行");
    });

    test("JSON 便捷面往返：宿主可解析回原值", () => {
        const payload = {kind: "session", event: {type: "session_entry"}, seq: 7};
        const frame = serializeSseJsonEvent({data: payload, event: "session", id: "7"});
        expect(frame.startsWith("event: session\nid: 7\ndata: ")).toBe(true);
        const parsed = JSON.parse(frame.split("data: ")[1]!.trim());
        expect(parsed).toEqual(payload);
    });
});
