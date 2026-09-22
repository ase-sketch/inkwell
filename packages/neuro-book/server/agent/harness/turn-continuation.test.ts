import {describe, expect, it} from "vitest";
import {createAssistantTextMessage, createUserMessage} from "nbook/server/agent/messages/message-utils";
import type {RuntimeTurn, TurnSnapshot} from "nbook/server/agent/harness/run-kernel-types";
import {
    resolveTurnContinuation,
    shouldSendInterviewReminder,
    shouldSendReportResultReminder,
} from "nbook/server/agent/harness/turn-continuation";

describe("turn continuation reducer", () => {
    it("tool continuation 会继续同一个 run", () => {
        const decision = resolveTurnContinuation({
            turn: fakeTurn({shouldContinue: true}),
            steeredMessages: [],
            hasReportResult: false,
            reportResultReminderSent: false,
            reportResultAllowed: false,
        });

        expect(decision).toEqual({
            continue: true,
            reasons: ["tool"],
            steeredMessages: [],
            needsReportResultReminder: false,
            needsInterviewReminder: false,
        });
    });

    it("steer 会压过 report_result reminder，避免同轮混入提醒", () => {
        const steeredMessages = [createUserMessage({text: "steer"})];

        const decision = resolveTurnContinuation({
            turn: fakeTurn({shouldContinue: false}),
            steeredMessages,
            hasReportResult: false,
            reportResultReminderSent: false,
            reportResultAllowed: true,
        });

        expect(decision.continue).toBe(true);
        expect(decision.reasons).toEqual(["steer"]);
        expect(decision.needsReportResultReminder).toBe(false);
        expect(decision.steeredMessages).toBe(steeredMessages);
    });

    it("缺少必需 report_result 时只触发一次 reminder continuation", () => {
        const input = {
            turn: fakeTurn({shouldContinue: false}),
            steeredMessages: [],
            hasReportResult: false,
            reportResultAllowed: true,
        };

        expect(shouldSendReportResultReminder({
            ...input,
            reportResultReminderSent: false,
        })).toBe(true);
        expect(resolveTurnContinuation({
            ...input,
            reportResultReminderSent: false,
        }).reasons).toEqual(["report_result"]);
        expect(shouldSendReportResultReminder({
            ...input,
            reportResultReminderSent: true,
        })).toBe(false);
    });

    it("已有 report_result 或未开放 report_result 工具时不提醒", () => {
        expect(shouldSendReportResultReminder({
            turn: fakeTurn({shouldContinue: false}),
            steeredMessages: [],
            hasReportResult: true,
            reportResultReminderSent: false,
            reportResultAllowed: true,
        })).toBe(false);
        expect(shouldSendReportResultReminder({
            turn: fakeTurn({shouldContinue: false}),
            steeredMessages: [],
            hasReportResult: false,
            reportResultReminderSent: false,
            reportResultAllowed: false,
        })).toBe(false);
    });

    it("访谈会话一轮无工具调用且无 waiting 时打回重跑并标记 needsInterviewReminder", () => {
        const input = {
            turn: fakeTurn({
                shouldContinue: false,
                profileKey: "interview.new-book",
            }),
            steeredMessages: [],
            hasReportResult: false,
            reportResultReminderSent: false,
            reportResultAllowed: false,
        };

        expect(shouldSendInterviewReminder(input)).toBe(true);
        const decision = resolveTurnContinuation(input);
        expect(decision.continue).toBe(true);
        expect(decision.reasons).toEqual(["interview_reminder"]);
        expect(decision.needsInterviewReminder).toBe(true);
    });

    it("访谈会话调了 request_user_input 时放行", () => {
        const inputWithToolCall = {
            turn: fakeTurn({
                shouldContinue: false,
                profileKey: "interview.new-book",
                toolCalls: [{
                    id: "call_req_input",
                    name: "request_user_input",
                    arguments: "{}",
                }] as unknown as RuntimeTurn["toolCalls"],
            }),
            steeredMessages: [],
            hasReportResult: false,
            reportResultReminderSent: false,
            reportResultAllowed: false,
        };

        expect(shouldSendInterviewReminder(inputWithToolCall)).toBe(false);
        const decisionWithToolCall = resolveTurnContinuation(inputWithToolCall);
        expect(decisionWithToolCall.needsInterviewReminder).toBe(false);
        expect(decisionWithToolCall.reasons).not.toContain("interview_reminder");

        const inputWithWaiting = {
            turn: fakeTurn({
                shouldContinue: false,
                profileKey: "interview.new-book",
                waiting: {kind: "user_input"} as never,
            }),
            steeredMessages: [],
            hasReportResult: false,
            reportResultReminderSent: false,
            reportResultAllowed: false,
        };

        expect(shouldSendInterviewReminder(inputWithWaiting)).toBe(false);
        const decisionWithWaiting = resolveTurnContinuation(inputWithWaiting);
        expect(decisionWithWaiting.needsInterviewReminder).toBe(false);
        expect(decisionWithWaiting.reasons).not.toContain("interview_reminder");
    });

    it("访谈会话调了写文件类工具（收尾轮）时放行", () => {
        const input = {
            turn: fakeTurn({
                shouldContinue: false,
                profileKey: "interview.new-book",
                toolCalls: [{
                    id: "call_write",
                    name: "write_file",
                    arguments: "{}",
                }] as unknown as RuntimeTurn["toolCalls"],
            }),
            steeredMessages: [],
            hasReportResult: false,
            reportResultReminderSent: false,
            reportResultAllowed: false,
        };

        expect(shouldSendInterviewReminder(input)).toBe(false);
        const decision = resolveTurnContinuation(input);
        expect(decision.needsInterviewReminder).toBe(false);
        expect(decision.reasons).not.toContain("interview_reminder");
    });

    it("interview.stuck 同属 interview. 前缀：无工具轮打回，调了 request_user_input 放行", () => {
        const idleInput = {
            turn: fakeTurn({
                shouldContinue: false,
                profileKey: "interview.stuck",
            }),
            steeredMessages: [],
            hasReportResult: false,
            reportResultReminderSent: false,
            reportResultAllowed: false,
        };

        expect(shouldSendInterviewReminder(idleInput)).toBe(true);
        const idleDecision = resolveTurnContinuation(idleInput);
        expect(idleDecision.continue).toBe(true);
        expect(idleDecision.reasons).toEqual(["interview_reminder"]);
        expect(idleDecision.needsInterviewReminder).toBe(true);

        const waitingInput = {
            ...idleInput,
            turn: fakeTurn({
                shouldContinue: false,
                profileKey: "interview.stuck",
                waiting: {kind: "user_input"} as never,
            }),
        };

        expect(shouldSendInterviewReminder(waitingInput)).toBe(false);
        expect(resolveTurnContinuation(waitingInput).needsInterviewReminder).toBe(false);
    });

    it("非访谈会话（如 leader.default）同样无工具轮保持原有行为不打回", () => {
        const input = {
            turn: fakeTurn({
                shouldContinue: false,
                profileKey: "leader.default",
            }),
            steeredMessages: [],
            hasReportResult: false,
            reportResultReminderSent: false,
            reportResultAllowed: false,
        };

        expect(shouldSendInterviewReminder(input)).toBe(false);
        const decision = resolveTurnContinuation(input);
        expect(decision.continue).toBe(false);
        expect(decision.needsInterviewReminder).toBe(false);
        expect(decision.reasons).toEqual([]);
    });
});

function fakeTurn(input: {
    shouldContinue: boolean;
    profileKey?: string;
    toolCalls?: RuntimeTurn["toolCalls"];
    toolResults?: RuntimeTurn["toolResults"];
    waiting?: RuntimeTurn["waiting"];
}): RuntimeTurn {
    return {
        index: 1,
        snapshot: {
            sessionContext: input.profileKey ? {profileKey: input.profileKey} : undefined,
        } as unknown as TurnSnapshot,
        assistant: createAssistantTextMessage({text: "ok"}),
        toolCalls: input.toolCalls ?? [],
        toolResults: input.toolResults ?? [],
        waiting: input.waiting,
        shouldContinue: input.shouldContinue,
    };
}
