import type {AgentSessionSummaryDto} from "nbook/shared/dto/agent-session.dto";

export const STUCK_INTERVIEW_PROFILE_KEY = "interview.stuck";
export const STUCK_INTERVIEW_SKILL_KEY = "$ka-wen";
export const STUCK_INTERVIEW_DEFAULT_GUIDANCE = "我在这段卡住了";

export interface BuildStuckInterviewMessageOptions {
    ref: string;
    guidance?: string;
}

/**
 * 构造卡文追问首条消息文本。
 * 格式：选段 chip 引用 + $ka-wen + 引导语。
 */
export function buildStuckInterviewMessage(options: BuildStuckInterviewMessageOptions): string {
    const ref = options.ref.trim();
    const guidance = (options.guidance ?? "").trim() || STUCK_INTERVIEW_DEFAULT_GUIDANCE;
    return `${ref} ${STUCK_INTERVIEW_SKILL_KEY}\n\n${guidance}`;
}

/**
 * 在已有 session 列表中查找可复用的卡文追问会话。
 * 约束：
 * 1. profileKey 匹配 interview.stuck
 * 2. 未归档（archived === false 且 status !== "archived"）
 * 3. 非运行中/等待中状态（status !== "running" && status !== "waiting"）
 * 4. 属于当前书（currentProjectRoot 匹配）
 */
export function findReusableStuckInterviewSession(
    sessions: readonly AgentSessionSummaryDto[],
    currentProjectRoot?: string | null,
): AgentSessionSummaryDto | undefined {
    const targetProjectRoot = currentProjectRoot?.trim() || undefined;
    return sessions.find((session) => {
        if (session.profileKey !== STUCK_INTERVIEW_PROFILE_KEY) {
            return false;
        }
        if (session.archived || session.status === "archived") {
            return false;
        }
        if (session.status === "running" || session.status === "waiting") {
            return false;
        }
        if (targetProjectRoot) {
            if (session.currentProjectRoot !== targetProjectRoot) {
                return false;
            }
        }
        return true;
    });
}
