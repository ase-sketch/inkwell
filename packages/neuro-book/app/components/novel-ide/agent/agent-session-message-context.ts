import type {InjectionKey} from "vue";

/**
 * 聊天流卡片 → 当前会话的消息通道（M6-T-B 引入）。
 *
 * 卡片动作（例如设定卡确认）要发一条消息进**当前会话**，但卡片挂在消息流的深处，
 * 拿不到 AgentChatSurface 的发送能力，也不该自己造一套 HTTP 调用。宿主在这里把
 * 自己已经有的发送入口（surface 的 sendMessage，与「提取为设定」入口同一条路径）
 * 注入下来；卡片只负责决定发什么。
 *
 * 不注入时卡片按「当前没有可用通道」处理：提示作者，不改任何状态、不写任何文件。
 */
export type AgentSessionMessageContext = {
    /**
     * 把一条消息发进当前会话。
     *
     * 与作者自己敲字发送同一条路径：会话没准备好时按既有行为提示或失败，
     * 调用方据此决定卡片要不要落到「已确认」。
     */
    sendMessage: (text: string) => Promise<void>;
};

export const AGENT_SESSION_MESSAGE_CONTEXT_KEY: InjectionKey<AgentSessionMessageContext> = Symbol("agent-session-message-context");
