import type {InlineProposalEdit} from "nbook/shared/inline-proposal";
import type {ToolCallStatus} from "nbook/app/components/novel-ide/agent/agent-message";

export interface InlineProposalItemState extends InlineProposalEdit {
    index: number;
    status: "pending" | "accepted" | "rejected";
    applied: boolean;
    note?: string;
}

export interface InlineProposalState {
    toolCallId: string;
    toolCallStatus: ToolCallStatus;
    summary: string;
    targetPath: string;
    items: InlineProposalItemState[];
}
