/** @jsxImportSource nbook/profile-sdk */
/** @jsxRuntime automatic */
import {readFile} from "node:fs/promises";
import {isAbsolute, resolve} from "node:path";
import type {ProfileToolResult, Static} from "nbook/profile-sdk";
import {
    AppendingSet,
    If,
    INLINE_PROPOSAL_PENDING_MARKER,
    INLINE_PROPOSE_EDIT_TOOL,
    InlineEditorInitialSchema,
    InlineEditorOutputSchema,
    InlineEditorPayloadSchema,
    Message,
    ProfilePrompt,
    System,
    Type,
    builtin,
    defineAgentProfile,
    defineProfileTool,
    profileText,
    toolset,
} from "nbook/profile-sdk";
import type {ProfilePrepareContext} from "nbook/profile-sdk";

export const profileManifest = {
    key: "inline.editor",
    name: "Inline AI 编辑",
    description: "从编辑器选区触发的短程正文编辑 agent：根据 hidden payload 读取目标文件并通过 propose_edit 提交修改提案，等待作者在就地提案卡确认采纳。",
} as const;

export const InitialSchema = InlineEditorInitialSchema;
export const PayloadSchema = InlineEditorPayloadSchema;
export const OutputSchema = InlineEditorOutputSchema;
export type Initial = Static<typeof InitialSchema>;
export type Payload = Static<typeof PayloadSchema>;
export type Output = Static<typeof OutputSchema>;

interface ProposeEditInput {
    summary: string;
    targetPath: string;
    edits: Array<{
        original: string;
        replacement: string;
        rationale: string;
    }>;
}

function findOccurrences(content: string, needle: string): number[] {
    const occurrences: number[] = [];
    let start = 0;
    while (start <= content.length) {
        const found = content.indexOf(needle, start);
        if (found === -1) {
            break;
        }
        occurrences.push(found);
        start = found + Math.max(needle.length, 1);
    }
    return occurrences;
}

async function executeProposeEdit(input: ProposeEditInput, cwd: string): Promise<ProfileToolResult> {
    if (!input || typeof input !== "object") {
        throw new Error("提案参数无效：缺少输入对象。");
    }
    if (!input.targetPath || typeof input.targetPath !== "string") {
        throw new Error("提案参数无效：缺少目标文件路径 targetPath。");
    }
    if (!Array.isArray(input.edits) || input.edits.length === 0) {
        throw new Error("提案中未包含任何修改条目（edits 不能为空）。请提供至少一条修改提案。");
    }

    const resolvedPath = isAbsolute(input.targetPath)
        ? input.targetPath
        : resolve(cwd, input.targetPath);

    let content: string;
    try {
        content = await readFile(resolvedPath, "utf8");
    } catch {
        throw new Error(`目标文件 "${input.targetPath}" 不存在或无法读取。请先用 read 工具确认文件存在及路径正确。`);
    }

    for (let index = 0; index < input.edits.length; index++) {
        const edit = input.edits[index];
        const itemNumber = index + 1;
        if (!edit || typeof edit !== "object") {
            throw new Error(`第 ${itemNumber} 条修改提案格式无效。`);
        }
        if (!edit.original) {
            throw new Error(`第 ${itemNumber} 条修改提案的 original 不能为空。请提供待替换的精确原文片段后重新提案。`);
        }
        const occurrences = findOccurrences(content, edit.original);
        if (occurrences.length === 0) {
            throw new Error(`第 ${itemNumber} 条修改提案的 original 未在文件 "${input.targetPath}" 中匹配到任何内容。请重新读取目标文件，提供当前内容中精确存在的原文片段后重新提案。`);
        }
        if (occurrences.length > 1) {
            throw new Error(`第 ${itemNumber} 条修改提案的 original 在文件 "${input.targetPath}" 中匹配到 ${occurrences.length} 处。锚点必须唯一，请扩充周围上下文后重新提案。`);
        }
    }

    const echoLines = [
        INLINE_PROPOSAL_PENDING_MARKER,
        "",
        "已成功登记修改提案（等待作者审核确认，未写入文件）：",
        `- 目标文件: ${input.targetPath}`,
        `- 修改概述: ${input.summary}`,
        `- 条目数量: ${input.edits.length} 项`,
        "",
        ...input.edits.flatMap((edit, index) => [
            `### 提案 ${index + 1}`,
            `- 修改理由: ${edit.rationale}`,
            "- 原始锚点:",
            "```",
            edit.original,
            "```",
            "- 建议替换:",
            "```",
            edit.replacement,
            "```",
            "",
        ]),
    ];

    return {
        content: [{type: "text", text: echoLines.join("\n")}],
        details: {
            marker: INLINE_PROPOSAL_PENDING_MARKER,
            summary: input.summary,
            targetPath: input.targetPath,
            edits: input.edits,
        },
    };
}

export const proposeEditTool = defineProfileTool({
    key: INLINE_PROPOSE_EDIT_TOOL,
    name: INLINE_PROPOSE_EDIT_TOOL,
    label: "提交正文修改提案",
    description: "向作者提交正文修改提案。必须指定目标文件、简明修改意图，以及若干修改条目。每条修改的 original 必须精确且唯一匹配文件中的原文片段。本工具不写盘，等待作者在就地提案卡确认后采纳落盘。",
    parameters: Type.Object({
        summary: Type.String({
            description: "一句话说明本次修改意图（面向作者可读）。",
        }),
        targetPath: Type.String({
            description: "目标文件路径（相对作品根，通常 manuscript/...）。",
        }),
        edits: Type.Array(
            Type.Object({
                original: Type.String({
                    description: "待替换的原文精确片段（锚点，区分大小写与空白，必须在文件中精确且唯一出现）。",
                }),
                replacement: Type.String({
                    description: "建议替换后的文本。",
                }),
                rationale: Type.String({
                    description: "面向作者的修改理由（通俗口语，严禁泄漏内部类名、字段名或技术术语）。",
                }),
            }, {additionalProperties: false}),
            {description: "修改条目列表（逐条采纳粒度）。"},
        ),
    }, {additionalProperties: false}),
    async executeWithContext(context, _toolCallId, params: unknown) {
        const input = params as ProposeEditInput;
        const cwd = context?.currentProject?.workspace?.root ?? context?.workspaceRoot ?? process.cwd();
        return await executeProposeEdit(input, cwd);
    },
    async execute(_toolCallId, params: unknown) {
        const input = params as ProposeEditInput;
        return await executeProposeEdit(input, process.cwd());
    },
});

export default defineAgentProfile({
    manifest: profileManifest,
    initialSchema: InitialSchema,
    payloadSchema: PayloadSchema,
    outputSchema: OutputSchema,
    tools: toolset(
        builtin.file.read,
        proposeEditTool,
        builtin.result.main(),
    ),
    context(ctx) {
        const inputContext = renderInlineEditContext(ctx);
        return (
            <ProfilePrompt>
                <System>
                    {profileText`
                        <assistant_definition>
                            <role>Inline AI 编辑器</role>
                            <description>你负责根据编辑器里的选区引用和作者要求，通过 propose_edit 提交精准的修改提案，等待作者在就地提案卡确认后采纳落盘。</description>
                        </assistant_definition>

                        <inline_editor_contract>
                            - 本轮任务来自 hidden payload。可见 message 只是用户界面回执，不能从可见消息反解析选区正文。
                            - Current Project 存在时 cwd 是该 Project Workspace，文件工具直接使用 manuscript/...、lorebook/...。
                            - 所有文件操作路径必须使用 <inline_edit target> 与 <ref path> 的完整原值，不要自行添加 Project slug。
                            - 不要尝试截断或猜测路径；payload 已确保路径可直接传给 read/propose_edit 工具。
                            - 提出提案前必须先 read target 文件确认上下文；引用路径不同于 target 时，也必须先 read 引用文件。
                            - 核心机制（提案确认制）：你没有直接修改或写入文件的权限，只能通过 propose_edit 工具提出修改提案。提案在 server 校验通过后会呈现在前端就地提案卡上，作者确认采纳后才会真正落盘。
                            - 提案规则：
                              1. summary：简明扼要概括本次修改意图（供作者一览）。
                              2. edits[].original：必须是目标文件当前内容中精确匹配且唯一出现的一段原文（唯一锚点），区分大小写与空白，绝对不能凭记忆脑补。若有多处匹配或找不到，工具会报错，请根据提示扩充上下文或重新 read 后修正重提。
                              3. edits[].replacement：建议替换后的改后文本。
                              4. edits[].rationale：面向作者的修改理由，必须使用通俗自然的口语（如「调整了倒叙句式，让情绪更紧凑」「补充了环境描写」），严禁泄漏内部字段名、类名或技术术语（如 edits、original、regex、AST 等）。
                            - scope="selection" 时，优先只针对 refs 指向的范围及必要衔接文本提修改提案。
                            - scope="auto" 时，根据 instruction 判断最小必要修改范围。
                            - L12 | 这类行号只是定位标记，不是正文，绝对不能写进 original 或 replacement。
                            - task=chat 时，根据作者要求与上下文自然处理；如涉及正文修改，通过 propose_edit 提出提案。
                            - task=continue_after 时，在最后一个引用范围之后续写。
                            - task=bridge 时，补出承上启下的过渡；如果有两个引用，优先连接 r1 到 r2。
                            - 不要输出完整改后正文到聊天里；提交提案后调用 report_result，用 result 简短向作者说明提案内容。
                        </inline_editor_contract>

                        ${inputContext}
                    `}
                </System>
                <AppendingSet>
                    <If condition={!ctx.invocation?.message}>
                        <Message>本轮没有收到用户可见消息；请根据 hidden payload 执行，若 payload 也缺失则 report_result 说明无法编辑。</Message>
                    </If>
                </AppendingSet>
            </ProfilePrompt>
        );
    },
});

/**
 * 渲染当前 Project 上下文，只暴露单段 projectRoot。
 */
function renderProjectContext(ctx: ProfilePrepareContext<Initial, Payload>): string {
    const projectRoot = ctx.session.currentProject?.workspace.ref.projectRoot;
    if (!projectRoot) {
        return "projectRoot: (none - Workspace Root session)";
    }
    return `projectRoot: ${projectRoot}`;
}

/**
 * 渲染 inline editor payload。
 */
function renderInlineEditContext(ctx: ProfilePrepareContext<Initial, Payload>): string {
    const payload = ctx.invocation?.payload;
    if (!payload) {
        return [
            "<inline_editor_input>",
            `cwd: ${ctx.session.currentProject?.workspace.root ?? ctx.session.workspaceRoot}`,
            renderProjectContext(ctx),
            "<missing_payload>未收到 inline editor payload。不要提案修改文件，调用 report_result 说明缺少编辑输入。</missing_payload>",
            "</inline_editor_input>",
        ].join("\n");
    }

    return [
        "<inline_editor_input>",
        `cwd: ${ctx.session.currentProject?.workspace.root ?? ctx.session.workspaceRoot}`,
        renderProjectContext(ctx),
        renderInlineEditXml(payload),
        "</inline_editor_input>",
    ].join("\n");
}

function renderInlineEditXml(payload: Payload): string {
    const refs = payload.references.length > 0
        ? [
            "  <refs>",
            ...payload.references.map((reference, index) => renderReference(reference, index)),
            "  </refs>",
        ]
        : [];
    return [
        `<inline_edit v="1" task="${escapeXml(payload.task)}" op="${taskOp(payload.task)}" target="${escapeXml(payload.targetPath)}" scope="${payload.references.length > 0 ? "selection" : "auto"}">`,
        `  <instruction>${escapeXml(payload.instruction || defaultInstruction(payload.task))}</instruction>`,
        ...refs,
        "</inline_edit>",
    ].join("\n");
}

function renderReference(reference: Payload["references"][number], index: number): string {
    const lines = reference.range
        ? `${String(reference.range.startLine)}-${String(reference.range.endLine)}`
        : "";
    return [
        `    <ref id="r${String(index + 1)}" source="${escapeXml(reference.ref)}" path="${escapeXml(reference.path)}" lines="${escapeXml(lines)}" match="${escapeXml(reference.match)}"><![CDATA[`,
        formatReferenceText(reference),
        "]]></ref>",
    ].join("\n");
}

function formatReferenceText(reference: Payload["references"][number]): string {
    const text = escapeCdata(reference.text.replace(/\r\n/g, "\n"));
    if (!reference.range) {
        return text;
    }
    return text
        .split("\n")
        .map((line, index) => `L${String(reference.range!.startLine + index)} | ${line}`)
        .join("\n");
}

function taskOp(task: Payload["task"]): "replace" | "insert_after" | "bridge" {
    if (task === "continue_after") {
        return "insert_after";
    }
    if (task === "bridge") {
        return "bridge";
    }
    return "replace";
}

function defaultInstruction(task: Payload["task"]): string {
    switch (task) {
        case "chat": return "根据当前要求处理，如需修改正文请提交修改提案。";
        case "rewrite": return "改写引用文本，保留核心信息。";
        case "polish": return "润色引用文本，改善表达与节奏。";
        case "expand": return "扩写引用文本，增加必要细节。";
        case "condense": return "缩写引用文本，保留关键信息。";
        case "continue_after": return "在引用文本之后续写。";
        case "bridge": return "补出承上启下的过渡文本。";
    }
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escapeCdata(value: string): string {
    return value.replace(/\]\]>/g, "]]]]><![CDATA[>");
}
