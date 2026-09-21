import { MemorySessionStore, MockAgentPort, WorkflowRunner, type RunEnv, type SessionId } from "../src/index";

/** 组装一套隔离的 spike 环境 */
export function makeEnv(env: RunEnv = {}) {
    const store = new MemorySessionStore();
    const agents = new MockAgentPort(store);
    const runner = new WorkflowRunner({ sessions: store, agents }, env);
    return { store, agents, runner };
}

/** 模拟用户在 run 之外与某 session 直接对话（普通聊天入口） */
export async function directChat(store: MemorySessionStore, agents: MockAgentPort, sessionId: SessionId, message: string) {
    await store.lock(sessionId, "direct");
    try {
        const userLeaf = await store.append(sessionId, await store.activeLeaf(sessionId), {
            role: "user", message, origin: "direct",
        });
        const resp = await agents.respondAt(sessionId, userLeaf, { mode: "prompt", message });
        await store.append(sessionId, userLeaf, {
            role: "assistant", message: resp.message, data: resp.data, origin: "direct",
        });
        return resp;
    } finally {
        await store.releaseAll("direct");
    }
}
