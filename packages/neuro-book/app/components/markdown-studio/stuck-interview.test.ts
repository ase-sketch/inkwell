import {describe, expect, it} from "vitest";
import type {AgentSessionSummaryDto} from "nbook/shared/dto/agent-session.dto";
import {
    buildStuckInterviewMessage,
    findReusableStuckInterviewSession,
    STUCK_INTERVIEW_DEFAULT_GUIDANCE,
    STUCK_INTERVIEW_PROFILE_KEY,
    STUCK_INTERVIEW_SKILL_KEY,
} from "nbook/app/utils/stuck-interview";

function createMockSession(overrides: Partial<AgentSessionSummaryDto> = {}): AgentSessionSummaryDto {
    return {
        sessionId: 1,
        sessionIdentity: "00000000-0000-0000-0000-000000000001",
        profileKey: STUCK_INTERVIEW_PROFILE_KEY,
        currentProjectRoot: "test-book",
        status: "idle",
        updatedAt: Date.now(),
        archived: false,
        ...overrides,
    };
}

describe("stuck-interview 工具函数与划词追问消息构造", () => {
    describe("buildStuckInterviewMessage", () => {
        it("构造包含选段 chip、技能标签与默认引导语的消息", () => {
            const result = buildStuckInterviewMessage({
                ref: "[[manuscript/chapter1.md#L10-L15]]",
            });
            expect(result).toBe(`[[manuscript/chapter1.md#L10-L15]] ${STUCK_INTERVIEW_SKILL_KEY}\n\n${STUCK_INTERVIEW_DEFAULT_GUIDANCE}`);
        });

        it("支持自定义引导语并清理空格", () => {
            const result = buildStuckInterviewMessage({
                ref: "[[manuscript/chapter2.md#L1-L5]]",
                guidance: "  这里主角的情绪转折不够自然，怎么调整？  ",
            });
            expect(result).toBe(`[[manuscript/chapter2.md#L1-L5]] ${STUCK_INTERVIEW_SKILL_KEY}\n\n这里主角的情绪转折不够自然，怎么调整？`);
        });

        it("引导语为空白时回退至默认引导语", () => {
            const result = buildStuckInterviewMessage({
                ref: "[[manuscript/chapter1.md]]",
                guidance: "   ",
            });
            expect(result).toBe(`[[manuscript/chapter1.md]] ${STUCK_INTERVIEW_SKILL_KEY}\n\n${STUCK_INTERVIEW_DEFAULT_GUIDANCE}`);
        });
    });

    describe("findReusableStuckInterviewSession", () => {
        it("命中同项目、未归档、空闲态的 interview.stuck 会话", () => {
            const session = createMockSession({sessionId: 101, currentProjectRoot: "book-a", status: "idle"});
            const found = findReusableStuckInterviewSession([session], "book-a");
            expect(found?.sessionId).toBe(101);
        });

        it("忽略其他 profile 的会话", () => {
            const session = createMockSession({profileKey: "leader.default", currentProjectRoot: "book-a"});
            const found = findReusableStuckInterviewSession([session], "book-a");
            expect(found).toBeUndefined();
        });

        it("忽略已归档会话（archived 属性或 status 为 archived）", () => {
            const archived1 = createMockSession({sessionId: 1, archived: true});
            const archived2 = createMockSession({sessionId: 2, status: "archived"});
            expect(findReusableStuckInterviewSession([archived1], "test-book")).toBeUndefined();
            expect(findReusableStuckInterviewSession([archived2], "test-book")).toBeUndefined();
        });

        it("忽略正在 running 或 waiting 的会话，避免冲突插队", () => {
            const runningSession = createMockSession({sessionId: 3, status: "running"});
            const waitingSession = createMockSession({sessionId: 4, status: "waiting"});
            expect(findReusableStuckInterviewSession([runningSession], "test-book")).toBeUndefined();
            expect(findReusableStuckInterviewSession([waitingSession], "test-book")).toBeUndefined();
        });

        it("忽略不同书/项目的会话", () => {
            const session = createMockSession({sessionId: 5, currentProjectRoot: "book-b"});
            expect(findReusableStuckInterviewSession([session], "book-a")).toBeUndefined();
        });
    });
});
