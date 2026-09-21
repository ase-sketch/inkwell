import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    serializeSseJsonEvent,
} from "../../src/index.js";
import {MemorySessionStore} from "../../src/storage/memory.js";
import {ScriptedModelRuntime} from "../../src/testing/index.js";

const objectSchema = defineSchema((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("bad");
    }
    return value;
}, {type: "object"});

function completed(text: string) {
    return {message: {role: "assistant" as const, content: [{type: "text" as const, text}], timestamp: 1}};
}

const harness = new NeuroAgentHarness({
    store: new MemorySessionStore(),
    profiles: new ProfileRegistry().add(defineProfile({
        manifest: {key: "sse-http-worker", name: "SSE HTTP Worker"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "sse", modelConfig: {}}),
    })),
    model: new ScriptedModelRuntime([completed("first"), completed("second")]),
});
const created = await harness.createSession({profileKey: "sse-http-worker", initial: {}, hostContext: {}});
const sessionId = created.session.metadata.sessionId;

async function latestSeq(): Promise<number> {
    const probe = harness.subscribe(sessionId, {});
    const latest = probe.connected.latestSeq;
    await probe.close();
    return latest;
}

const server = Bun.serve({
    port: 0,
    async fetch(request) {
        const url = new URL(request.url);
        if (request.method === "POST" && url.pathname === "/invoke") {
            const input = await request.json();
            const beforeSeq = await latestSeq();
            const handle = await harness.invoke({sessionId: input.sessionId, payload: input.payload});
            const result = await handle.result();
            const afterSeq = await latestSeq();
            return new Response(JSON.stringify({invocationId: handle.invocationId, status: result.status, beforeSeq, afterSeq}), {headers: {"content-type": "application/json"}});
        }
        if (url.pathname === "/events") {
            // 有限 SSE 响应：到首个 agent_end 即关闭（无限保持流在本机 Windows/Bun 组合下会挂起，
            // 见第 109 轮 walkthrough 的环境限制记录；帧格式与游标续传合同不变）。
            const lastEventId = request.headers.get("last-event-id");
            const subscription = lastEventId === null
                ? harness.subscribe(sessionId, {})
                : harness.subscribe(sessionId, {eventEpoch: request.headers.get("event-epoch") ?? "", after: Number(lastEventId)});
            if (subscription.connected.snapshotRequired) {
                await subscription.close();
                return new Response(JSON.stringify({snapshotRequired: true}), {status: 409, headers: {"content-type": "application/json"}});
            }
            const encoder = new TextEncoder();
            let closed = false;
            const stream = new ReadableStream<Uint8Array>({
                async start(controller) {
                    let failed = false;
                    try {
                        for await (const event of subscription) {
                            controller.enqueue(encoder.encode(serializeSseJsonEvent({
                                event: event.kind,
                                id: String(event.seq),
                                data: JSON.parse(JSON.stringify(event)),
                            })));
                            if (event.kind === "runtime" && event.event.type === "agent_end") {
                                break;
                            }
                        }
                    } catch (error) {
                        failed = true;
                        controller.error(error instanceof Error ? error : new Error(String(error)));
                    } finally {
                        if (!closed) {
                            closed = true;
                            await subscription.close();
                        }
                    }
                    if (!failed) {
                        controller.close();
                    }
                },
                cancel() {
                    if (!closed) {
                        closed = true;
                        return subscription.close();
                    }
                },
            });
            return new Response(stream, {
                headers: {
                    "content-type": "text/event-stream",
                    "cache-control": "no-cache",
                    "x-event-epoch": subscription.connected.eventEpoch,
                },
            });
        }
        return new Response("not found", {status: 404});
    },
});
console.log("READY " + server.port + " " + sessionId);
