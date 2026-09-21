import type {StoredUserMessage} from "nbook/server/agent/messages/stored-types";
import type {RuntimeTurn, TurnContinuationDecision as KernelTurnContinuationDecision, TurnContinuationReason} from "nbook/server/agent/harness/run-kernel-types";

export type TurnContinuationDecision = KernelTurnContinuationDecision & {
    needsInterviewReminder?: boolean;
};

export type ResolveTurnContinuationInput = {
    turn: RuntimeTurn;
    steeredMessages: StoredUserMessage[];
    hasReportResult: boolean;
    reportResultReminderSent: boolean;
    reportResultAllowed: boolean;
};

/**
 * 归并本轮 turn 后是否继续同一个 run。
 *
 * 这里只做纯判定，不 drain queue、不写 reminder、不读 session。
 */
export function resolveTurnContinuation(input: ResolveTurnContinuationInput): TurnContinuationDecision {
    const needsReportResultReminder = shouldSendReportResultReminder(input);
    const needsInterviewReminder = shouldSendInterviewReminder(input);
    const reasons: (TurnContinuationReason | "interview_reminder")[] = [];
    if (input.turn.shouldContinue) {
        reasons.push("tool");
    }
    if (input.steeredMessages.length > 0) {
        reasons.push("steer");
    }
    if (needsReportResultReminder) {
        reasons.push("report_result");
    }
    if (needsInterviewReminder) {
        reasons.push("interview_reminder");
    }
    return {
        continue: reasons.length > 0,
        reasons: reasons as TurnContinuationReason[],
        steeredMessages: input.steeredMessages,
        needsReportResultReminder,
        needsInterviewReminder,
    };
}

/**
 * 判断缺少 report_result 时是否需要注入一次 harness reminder。
 */
export function shouldSendReportResultReminder(input: ResolveTurnContinuationInput): boolean {
    return !input.hasReportResult
        && !input.reportResultReminderSent
        && input.steeredMessages.length === 0
        && !input.turn.shouldContinue
        && input.reportResultAllowed;
}

/**
 * 判断访谈会话缺少追问或工具调用时是否需要注入追问兜底 reminder。
 */
export function shouldSendInterviewReminder(input: ResolveTurnContinuationInput): boolean {
    const profileKey = input.turn.snapshot?.sessionContext?.profileKey
        ?? input.turn.snapshot?.sessionSnapshot?.metadata?.profileKey;
    const isInterview = typeof profileKey === "string" && profileKey.startsWith("interview.");
    if (!isInterview) {
        return false;
    }
    const hasAnyTool = (input.turn.toolCalls?.length ?? 0) > 0
        || (input.turn.toolResults?.length ?? 0) > 0
        || Boolean(input.turn.waiting);
    if (hasAnyTool) {
        return false;
    }
    return input.steeredMessages.length === 0
        && !input.turn.shouldContinue;
}
