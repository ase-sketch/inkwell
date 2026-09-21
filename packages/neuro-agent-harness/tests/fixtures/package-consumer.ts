import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionEventHub,
    defineCapability,
    defineProfile,
    defineSchema,
    defineTool,
    invocationResultFromSnapshot,
    isJsonObject,
    type JsonObject,
    type JsonValue,
    type ReadRequest,
    type ReadResult,
} from "@notnotype/neuro-agent-harness";
import {JsonlSessionStore} from "@notnotype/neuro-agent-harness/storage/jsonl";
import {ScriptedModelRuntime} from "@notnotype/neuro-agent-harness/testing";

interface ConsumerHostContext extends JsonObject {
    readonly flowId: string;
    readonly sessionRef: string;
    readonly workspaceKey: string;
}

interface ConsumerInitial extends JsonObject {
    readonly profileVersion: number;
}

interface ConsumerPayload extends JsonObject {
    readonly instruction: string;
}

interface ConsumerOutput extends JsonObject {
    readonly answer: string;
    readonly provenance: string;
}

interface ReadArguments extends JsonObject {
    readonly reference: string;
}

interface WorkspaceReader {
    read(request: ReadRequest): ReadResult | Promise<ReadResult>;
}

const initialSchema = defineSchema<ConsumerInitial>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)
        || typeof value.profileVersion !== "number") {
        throw new Error("consumer initial 无效");
    }
    return {profileVersion: value.profileVersion};
});

const payloadSchema = defineSchema<ConsumerPayload>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)
        || typeof value.instruction !== "string") {
        throw new Error("consumer payload 无效");
    }
    return {instruction: value.instruction};
});

const outputSchema = defineSchema<ConsumerOutput>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)
        || typeof value.answer !== "string" || typeof value.provenance !== "string") {
        throw new Error("consumer output 无效");
    }
    return {answer: value.answer, provenance: value.provenance};
});

const readArgumentsSchema = defineSchema<ReadArguments>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)
        || typeof value.reference !== "string") {
        throw new Error("consumer read arguments 无效");
    }
    return {reference: value.reference};
}, {
    type: "object",
    properties: {reference: {type: "string"}},
    required: ["reference"],
});

const workspaceRead = defineCapability<"workspaceRead", WorkspaceReader>("workspaceRead");

const profile = defineProfile<
    ConsumerInitial,
    ConsumerPayload,
    ConsumerOutput,
    number,
    ConsumerHostContext,
    JsonObject
>({
    manifest: {key: "package-consumer", name: "Installed Package Consumer", version: 1},
    initial: initialSchema,
    payload: payloadSchema,
    output: outputSchema,
    requiredCapabilities: [workspaceRead],
    prepare(context) {
        const reader = context.capabilities.require(workspaceRead);
        if (context.hostContext.flowId !== "flow-package"
            || context.hostContext.sessionRef !== "session-package"
            || context.hostContext.workspaceKey !== "workspace-package") {
            throw new Error("consumer host context 未透传");
        }
        const readTool = defineTool<ReadArguments, number, ConsumerHostContext>({
            name: "read_workspace",
            description: "读取宿主授权的 workspace reference",
            parameters: readArgumentsSchema,
            execute: async (argumentsValue) => {
                const read = await reader.read({reference: argumentsValue.reference});
                return {
                    content: read.content,
                    details: {provenance: read.provenance ?? null},
                    output: {
                        answer: read.content,
                        provenance: read.provenance ?? "",
                    },
                    terminate: true,
                };
            },
        });
        return {
            systemPrompt: "Installed package consumer",
            modelConfig: {provider: "fixture", model: "deterministic"},
            tools: [readTool],
            limits: {maxTurns: 2},
        };
    },
});

const profiles = new ProfileRegistry<number, ConsumerHostContext, JsonObject>().add(profile);

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function asObject(value: JsonValue | undefined, message: string): JsonObject {
    if (value === undefined || !isJsonObject(value)) {
        throw new Error(message);
    }
    return value;
}

async function main(): Promise<void> {
    // The test runner gives Bun and Node separate isolated working directories;
    // keeping the fixture free of node:fs imports makes the same source compile
    // with a minimal external consumer tsconfig.
    const directory = "consumer-state";
    const eventEpoch = "package-consumer-epoch";
    const eventHub = new SessionEventHub<number>({eventEpoch});
    let capabilityCloseCount = 0;
    const model = new ScriptedModelRuntime<JsonObject>([{
        message: {
            role: "assistant",
            content: [{
                type: "toolCall",
                call: {
                    id: "read-1",
                    name: "read_workspace",
                    arguments: {reference: "workspace://input"},
                },
            }],
            timestamp: 1,
            usage: {input: 4, output: 2, total: 6},
        },
    }]);
    const harness = new NeuroAgentHarness<number, ConsumerHostContext, JsonObject>({
        store: new JsonlSessionStore<ConsumerHostContext>({directory}),
        profiles,
        model,
        events: eventHub,
        capabilities: [{
            capability: workspaceRead,
            open(context) {
                assert(context.hostContext.workspaceKey === "workspace-package", "capability host context 未透传");
                return {
                    read(request: ReadRequest) {
                        assert(request.reference === "workspace://input", "capability request 未透传");
                        return {content: "hello from installed package", provenance: "workspace://input"};
                    },
                };
            },
            close() {
                capabilityCloseCount += 1;
            },
        }],
    });

    try {
        const created = await harness.createSession({
            profileKey: profile.manifest.key,
            initial: {profileVersion: 1},
            hostContext: {
                flowId: "flow-package",
                sessionRef: "session-package",
                workspaceKey: "workspace-package",
            },
        });
        const handle = await harness.invokeAt({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "read the workspace input"},
            caller: {kind: "system", name: "package-consumer"},
            anchor: {
                version: created.session.version,
                activeLeafId: created.session.activeLeafId,
            },
        });
        const result = await handle.result();
        assert(result.status === "completed", "installed consumer Invocation 未完成");
        assert(result.persistence === "confirmed", "installed consumer result 未确认持久化");
        const resultOutput = asObject(result.output, "installed consumer output 缺失");
        assert(resultOutput.answer === "hello from installed package", "Tool output 未成为 Invocation output");
        assert(resultOutput.provenance === "workspace://input", "Tool provenance 未保留");
        assert(result.usage.total === 6, "Invocation usage 未保留");
        assert(model.requests.length === 1, "ModelRuntime 请求次数不正确");

        const afterInvocation = await harness.snapshot(created.session.metadata.sessionId);
        assert(afterInvocation.session.metadata.hostContext.flowId === "flow-package", "Snapshot host context flowId 不一致");
        assert(afterInvocation.session.metadata.hostContext.sessionRef === "session-package", "Snapshot host context sessionRef 不一致");
        assert(afterInvocation.session.metadata.hostContext.workspaceKey === "workspace-package", "Snapshot host context workspaceKey 不一致");
        assert(afterInvocation.session.invocations[0]?.caller.kind === "system", "Invocation caller kind 未持久化");
        assert(afterInvocation.session.invocations[0]?.caller.name === "package-consumer", "Invocation caller name 未持久化");
        const projected = invocationResultFromSnapshot(afterInvocation.session, result.invocationId);
        assert(projected?.status === "completed", "Snapshot projection 未恢复 completed");
        assert(projected.persistence === "confirmed", "Snapshot projection 未确认持久化");
        assert(asObject(projected.output, "Snapshot projection output 缺失").answer === "hello from installed package", "Snapshot projection output 不一致");

        const writeback = await harness.write({
            target: created.session.metadata.sessionId,
            expectedVersion: afterInvocation.session.version,
            expectedActiveLeafId: afterInvocation.session.activeLeafId,
            cause: "package-consumer.action.completed",
            operations: [{
                type: "appendEntries",
                entries: [{
                    kind: "package-consumer.action.completed",
                    payload: {
                        sessionRef: "session-package",
                        invocationId: result.invocationId,
                        status: result.status,
                        output: resultOutput,
                        usage: {
                            input: result.usage.input,
                            output: result.usage.output,
                            total: result.usage.total,
                        },
                    },
                }],
            }],
        });
        const replay = harness.subscribe(created.session.metadata.sessionId, afterInvocation.cursor);
        assert(!replay.connected.snapshotRequired, "安装后 consumer 的 cursor 不能 replay");
        const replayed: string[] = [];
        const expectedEvents = replay.connected.latestSeq - afterInvocation.cursor.after;
        const iterator = replay[Symbol.asyncIterator]();
        for (let index = 0; index < expectedEvents; index += 1) {
            const next = await iterator.next();
            assert(!next.done, "cursor replay 提前结束");
            replayed.push(next.value.kind + ":" + (next.value.event.type ?? ""));
        }
        await replay.close();
        assert(replayed.some((event) => event === "session:session_entry"), "cursor replay 缺少 host writeback entry");
        assert(replayed.some((event) => event === "session:session_status"), "cursor replay 缺少 status");
        assert(writeback.session.entries.some((entry) => entry.kind === "package-consumer.action.completed"), "host writeback 未落盘");

        await harness.dispose();
        eventHub.close();

        const restoredEvents = new SessionEventHub<number>({eventEpoch: "package-consumer-restart"});
        const restoredHarness = new NeuroAgentHarness<number, ConsumerHostContext, JsonObject>({
            store: new JsonlSessionStore<ConsumerHostContext>({directory}),
            profiles,
            model: new ScriptedModelRuntime<JsonObject>([]),
            events: restoredEvents,
            capabilities: [],
        });
        try {
            const restored = await restoredHarness.snapshot(created.session.metadata.sessionId);
            const restoredResult = invocationResultFromSnapshot(restored.session, result.invocationId);
            assert(restored.session.metadata.hostContext.flowId === "flow-package", "JSONL restart 丢失 host context flowId");
            assert(restored.session.metadata.hostContext.sessionRef === "session-package", "JSONL restart 丢失 host context sessionRef");
            assert(restored.session.metadata.hostContext.workspaceKey === "workspace-package", "JSONL restart 丢失 host context workspaceKey");
            assert(restored.session.invocations[0]?.caller.kind === "system", "JSONL restart 丢失 caller kind");
            assert(restored.session.invocations[0]?.caller.name === "package-consumer", "JSONL restart 丢失 caller name");
            assert(restoredResult?.status === "completed", "JSONL restart 丢失 Invocation status");
            assert(restoredResult.persistence === "confirmed", "JSONL restart 丢失 persistence");
            assert(asObject(restoredResult.output, "JSONL restart 丢失 output").answer === "hello from installed package", "JSONL restart output 不一致");
            assert(restored.session.entries.some((entry) => entry.kind === "package-consumer.action.completed"), "JSONL restart 丢失 host writeback");
            const staleCursor = restoredHarness.subscribe(created.session.metadata.sessionId, writeback.cursor);
            assert(staleCursor.connected.snapshotRequired, "restart 后旧 event cursor 应要求 Snapshot recovery");
            await staleCursor.close();
        } finally {
            await restoredHarness.dispose();
            restoredEvents.close();
        }
        assert(capabilityCloseCount === 1, "Invocation-scoped Capability 未关闭");
        console.log("PACKAGE_CONSUMER_OK", JSON.stringify({
            invocationId: result.invocationId,
            replayed,
            restoredVersion: (await new JsonlSessionStore<ConsumerHostContext>({directory}).read(created.session.metadata.sessionId)).version,
        }));
    } finally {
        await harness.dispose();
        // The process exits after this fixture; the parent test removes the
        // isolated consumer directory and its JSONL state.
        eventHub.close();
    }
}

await main();
