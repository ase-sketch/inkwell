import type { InvokeOptions, JsonValue, SessionEntry, SessionId } from "./types";
import type { AgentInvokeOutcome, AgentPort, SessionPort } from "./ports";

/**
 * mock 模型应答：拿到路径 transcript 与本轮输入，返回 message/data。
 * waiting: true 模拟子代理反问（invoke 返回 status:"waiting"，是普通返回值不是失败）。
 */
export type MockResponder = (turn: {
    sessionId: SessionId;
    history: SessionEntry[];
    mode: InvokeOptions["mode"];
    message?: string;
    input?: JsonValue;
}) => Promise<{ message: string; data?: JsonValue; waiting?: boolean }> | { message: string; data?: JsonValue; waiting?: boolean };

/**
 * mock 版 AgentPort：确定性 responder 顶替真实模型调用，entry 写入走 SessionPort。
 * 对应 NeuroBook 的 harness invokeCore 适配器。
 */
export class MockAgentPort implements AgentPort {
    private responders = new Map<string, MockResponder>();
    private infos = new Map<string, JsonValue>();

    constructor(private sessions: SessionPort) {}

    register(profileKey: string, responder: MockResponder, info?: JsonValue): void {
        this.responders.set(profileKey, responder);
        if (info !== undefined) this.infos.set(profileKey, info);
    }

    async profileInfo(profileKey: string): Promise<JsonValue> {
        if (!this.responders.has(profileKey)) throw new Error(`profile ${profileKey} 未注册`);
        return this.infos.get(profileKey) ?? { profileKey };
    }

    /** 在 fromLeaf 处追加用户输入 → responder 应答 → 追加助手回复；waiting 时游标停在用户 entry */
    async invoke(sessionId: SessionId, fromLeaf: string | null, opts: InvokeOptions): Promise<AgentInvokeOutcome> {
        const userLeaf = await this.sessions.append(sessionId, fromLeaf, {
            role: "user", message: opts.message ?? undefined, input: opts.input, origin: "workflow",
        });
        const resp = await this.respondAt(sessionId, userLeaf, opts);
        if (resp.waiting) {
            return { status: "waiting", message: resp.message, data: null, newLeaf: userLeaf };
        }
        const asstLeaf = await this.sessions.append(sessionId, userLeaf, {
            role: "assistant", message: resp.message, data: resp.data, origin: "workflow",
        });
        return { status: "completed", message: resp.message, data: resp.data ?? null, newLeaf: asstLeaf };
    }

    /** 仅执行 responder（不写 entry）；供测试 helpers 模拟用户直接对话复用 */
    async respondAt(sessionId: SessionId, historyLeaf: string | null, opts: InvokeOptions) {
        const profileKey = (await this.sessions.meta(sessionId)).profileKey;
        const responder = this.responders.get(profileKey);
        if (!responder) throw new Error(`profile ${profileKey} 未注册 responder`);
        return await responder({
            sessionId,
            history: await this.sessions.transcript(sessionId, historyLeaf),
            mode: opts.mode ?? "prompt",
            message: opts.message ?? undefined,
            input: opts.input,
        });
    }
}
