import {describe, expect, it} from "vitest";
import {
    previewProfileTurnContexts,
    materializeProfileTurnContexts,
    mergeProfileTurnContextMessages,
    type ProfileTurnContextPlan,
} from "./profile-turn-context";
import {createStoredUserMessage, messageText} from "nbook/server/agent/messages/message-utils";

describe("profile-turn-context 基础设施", () => {
    describe("previewProfileTurnContexts", () => {
        it("支持预览三种 kind 的动态上下文节点", () => {
            const plans: ProfileTurnContextPlan[] = [
                {kind: "file-change-notice", mode: "minimal", appendingIndex: 0},
                {kind: "promise-ledger", appendingIndex: 1},
                {kind: "mentioned-entities", appendingIndex: 2},
            ];

            const previews = previewProfileTurnContexts(plans);
            expect(previews).toHaveLength(3);
            const [p0, p1, p2] = previews;

            expect(p0?.appendingIndex).toBe(0);
            expect(p0?.message.content[0]).toMatchObject({
                type: "text",
                text: expect.stringContaining("<file-change-notice"),
            });

            expect(p1?.appendingIndex).toBe(1);
            expect(p1?.message.content[0]).toMatchObject({
                type: "text",
                text: expect.stringContaining("<promise-ledger"),
            });

            expect(p2?.appendingIndex).toBe(2);
            expect(p2?.message.content[0]).toMatchObject({
                type: "text",
                text: expect.stringContaining("<mentioned-entities"),
            });
        });
    });

    describe("materializeProfileTurnContexts", () => {
        it("批 1 下对 promise-ledger 和 mentioned-entities 占位分支安全跳过物化", async () => {
            const plans: ProfileTurnContextPlan[] = [
                {kind: "promise-ledger", appendingIndex: 0},
                {kind: "mentioned-entities", appendingIndex: 1},
            ];

            const result = await materializeProfileTurnContexts({
                plans,
                project: {workspace: {ref: {projectRoot: "test"}, root: "/test"}, generation: 1} as any,
                sessionId: 1,
                diffMaxChars: 512,
            });

            expect(result.insertions).toEqual([]);
            expect(result.settlements).toEqual([]);
        });
    });

    describe("mergeProfileTurnContextMessages", () => {
        it("正确将动态消息按 appendingIndex 插入静态消息中", () => {
            const staticMessages = [
                createStoredUserMessage("M0"),
                createStoredUserMessage("M1"),
            ];
            const insertions = [
                {appendingIndex: 1, message: createStoredUserMessage("INSERT_AT_1")},
                {appendingIndex: 2, message: createStoredUserMessage("INSERT_AT_2")},
            ];

            const merged = mergeProfileTurnContextMessages(staticMessages, insertions);
            expect(merged.map(messageText)).toEqual(["M0", "INSERT_AT_1", "M1", "INSERT_AT_2"]);
        });
    });
});
