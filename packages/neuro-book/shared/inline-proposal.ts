/**
 * M2.5b 提案卡确认制：inline.editor 结构化提案契约（server 与前端共用的唯一事实源）。
 *
 * 机制：inline.editor 不再持有写文件工具；LLM 通过 profile 级自定义工具 propose_edit
 * 提交修改提案，server 校验锚点后原样登记（不写盘），前端渲染就地提案卡，
 * 作者逐条采纳后经作者保存通道（/api/workspace-files/write，USER_LOCAL_ACTOR）落盘。
 */

/** propose_edit 工具名（profile 级自定义工具，唯一注册名）。 */
export const INLINE_PROPOSE_EDIT_TOOL = "propose_edit";

/** 单条修改提案。original 必须精确匹配目标文件当前内容的唯一片段（锚点）。 */
export interface InlineProposalEdit {
    /** 原文片段（精确锚点，区分大小写与空白） */
    original: string;
    /** 改后文本 */
    replacement: string;
    /** 给作者看的修改理由（面向作者的口语，禁内部术语/字段名/类名） */
    rationale: string;
}

/** propose_edit 工具输入 payload。 */
export interface InlineEditProposalInput {
    /** 一句话说明本次修改意图（作者可读） */
    summary: string;
    /** 目标文件（相对作品根，通常 manuscript/...） */
    targetPath: string;
    /** 修改条目（逐条采纳粒度） */
    edits: InlineProposalEdit[];
}

/** 单条修改的采纳结果（前端逐条确认后回执给会话用）。 */
export interface InlineProposalEditOutcome {
    /** 对应提案条目的下标（0-based，对齐 edits 数组顺序） */
    index: number;
    accepted: boolean;
    /** 拒绝时作者附言（可空） */
    note?: string;
}

/** 提案落盘回执：作者确认后由前端发给会话的反馈消息构成要素。 */
export interface InlineProposalResolution {
    targetPath: string;
    outcomes: InlineProposalEditOutcome[];
}

/** server 侧工具结果标记：提案登记成功但未落盘，等待作者确认。 */
export const INLINE_PROPOSAL_PENDING_MARKER = "PROPOSAL_PENDING_AUTHOR_REVIEW";
