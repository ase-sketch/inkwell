/**
 * 「提取为设定」双入口的纯逻辑层。
 *
 * 两个入口（AI 消息底栏按钮 = 整条消息，划词菜单 = 选段）做同一件事：
 * 把一条携带被提取内容与出处的指令消息发进**当前会话**，由会话里的 AI
 * 起草设定卡并调用 submit_lorebook_draft 提交草稿。
 *
 * 这里只负责把作者的动作翻译成一条给模型看的指令文本；发起会话、插入
 * 输入框、发送都归调用方（AgentChatSurface / 宿主页面）。视图组件不写逻辑，
 * vitest 直测本模块（仓内 vitest 没有 plugin-vue，.vue 不进测试）。
 *
 * 三条已定口径（改这里等于改契约，务必同步测试）：
 * - 整条消息与选段走两个构造函数，共用同一套指令要素，不各写一份措辞。
 * - 只起草、不落盘：指令里必须写明「未经确认不要写入任何文件」，
 *   落盘要等确认卡由作者点头（红线见 M6 决策笔记）。
 * - 出处（文件路径与行号）随内容一起交给模型，作者回看时认得出
 *   「这条设定是从哪段讨论里提出来的」。
 */

/** 提交设定卡草稿的工具名；由并行任务实现，这里只引用名字不依赖实现。 */
export const SUBMIT_LOREBOOK_DRAFT_TOOL_NAME = "submit_lorebook_draft";

/** 草稿卡片的来源标注口径；不经 AI 推断，一律标人工确认。 */
export const EXTRACT_DRAFT_SOURCE = "manual";

/** 面向模型的固定指令正文；两种粒度共用，保证要素齐全且口径一致。 */
export const EXTRACT_INSTRUCTION_BODY = [
    `请把上面的内容整理成一张设定卡草稿，然后用 ${SUBMIT_LOREBOOK_DRAFT_TOOL_NAME} 工具提交给我确认。`,
    "",
    "草稿要包含：标题、别名（同一个人、物、地可能被叫成什么，一并列上）、一句话摘要、完整正文，以及你判断合适的设定类目。",
    "原文里没有明说的信息不要编造；拿不准的地方在草稿里标出来问我。",
    `在我确认之前，不要写入或修改任何文件；我确认后落盘时，来源标 source: "${EXTRACT_DRAFT_SOURCE}"。`,
].join("\n");

export interface ExtractInstructionInput {
    /** 被提取的原文。 */
    content: string;
    /** 出处，如 manuscript/001-volume/002-dawn/index.md#L12-L20；没有就省略。 */
    sourceRef?: string;
    /** 出处的人话说明，如「第三章 清晨」；没有就省略。 */
    sourceLabel?: string;
}

/** 出处行：既给模型看结构，也给作者回看时认出是哪一段。 */
function renderSourceLine(input: ExtractInstructionInput): string {
    const sourceRef = readText(input.sourceRef);
    const sourceLabel = readText(input.sourceLabel);
    if (!sourceRef && !sourceLabel) {
        return "";
    }
    if (sourceRef && sourceLabel) {
        return `出处：${sourceLabel}（${sourceRef}）`;
    }
    return `出处：${sourceRef || sourceLabel}`;
}

/**
 * 组装「出处 + 原文 + 指令」三段式。
 *
 * 原文原本整段放进引用块（每行前缀 >）：模型能分清哪段是作者的内容、
 * 哪段是要它执行的指令，长文也不会和指令糊在一起。
 */
function renderExtractInstruction(headline: string, input: ExtractInstructionInput): string {
    const content = readText(input.content);
    if (!content) {
        throw new Error("提取为设定需要先有内容");
    }
    const blocks = [headline];
    const sourceLine = renderSourceLine(input);
    if (sourceLine) {
        blocks.push(sourceLine);
    }
    blocks.push("", quote(content), "", EXTRACT_INSTRUCTION_BODY);
    return blocks.join("\n");
}

/**
 * 构造整条 AI 消息的提取指令。
 *
 * 出处默认省略：消息本身就在这场对话里，模型不需要靠路径找回它；
 * 只有调用方给了才带上。
 */
export function buildMessageExtractInstruction(input: ExtractInstructionInput): string {
    return renderExtractInstruction("请把下面这条消息里的内容提取为设定卡。", input);
}

export interface BuildSelectionExtractInstructionInput {
    /** 选区 chip，形如 [[manuscript/001-volume/002-dawn/index.md#L12-L20]]。 */
    ref: string;
    /** 选段所属文件路径。 */
    path: string;
    /** 选段原文。 */
    text: string;
    /** 文件的人话名字，如「第三章 清晨」；没有就只报路径。 */
    sourceLabel?: string;
}

/**
 * 构造划词选段的提取指令。
 *
 * 选段必须带出处：这段文字不在对话里，模型只能靠路径与 chip 知道
 * 它写在哪个文件的哪几行，确认卡上的出处也靠它。
 */
export function buildSelectionExtractInstruction(input: BuildSelectionExtractInstructionInput): string {
    const ref = readText(input.ref);
    const path = readText(input.path);
    if (!ref || !path) {
        throw new Error("提取为设定需要先选中正文");
    }
    return renderExtractInstruction("请把下面这段选中内容提取为设定卡。", {
        content: input.text,
        sourceRef: ref,
        sourceLabel: input.sourceLabel,
    });
}

/** 防御式读取文本字段：非字符串或全空白一律当没有。 */
function readText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/** 把原文转成 Markdown 引用块，保留原有换行结构。 */
function quote(content: string): string {
    return content.split("\n").map((line) => `> ${line}`).join("\n");
}
