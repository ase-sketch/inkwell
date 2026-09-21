import {describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    CommitWorkflowScheduler,
    NeuroAgentHarness,
    ProfileRegistry,
    defineCapability,
    defineProfile,
    defineSchema,
    invocationResultFromSnapshot,
    type JsonObject,
    type JsonValue,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface CosmosHostContext extends JsonObject {
    readonly flowId: string;
    readonly runId: string;
    readonly sessionRef: string;
    readonly workspaceKey: string;
}

interface ActionPayload extends JsonObject {
    readonly instruction: string;
}

interface ActionJob extends JsonObject {
    readonly actionId: string;
    readonly sessionId: number;
    readonly flowId: string;
    readonly runId: string;
    readonly sessionRef: string;
    readonly anchorVersion: number;
    readonly anchorLeafId: string | null;
    readonly instruction: string;
}

interface ActionCapability {
    readonly workspaceLabel: () => string;
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

const payloadSchema = defineSchema<ActionPayload>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.instruction !== "string") {
        throw new Error("Action payload 无效");
    }
    return value as ActionPayload;
});

const actionCapability = defineCapability<"cosmosAction", ActionCapability>("cosmosAction");

function completed(text: string, timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content: [{type: "text" as const, text}],
            timestamp,
            usage: {input: 3, output: 2, total: 5},
        },
    };
}

function actionRequestedEntry(actionId: string, instruction: string) {
    return {
        kind: "cosmos.action.requested",
        payload: {actionId, instruction},
    };
}

describe("Cosmos-style Agent Action conformance", () => {
    test("Workflow 组合旁路 Agent：host context、anchor、projection、回写与 JSONL restart 均保持可逆", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-harness-cosmos-action-conformance-"));
        let harness!: NeuroAgentHarness<number, CosmosHostContext, JsonObject>;
        let scheduler!: CommitWorkflowScheduler<ActionJob, number, CosmosHostContext>;
        const observedJobs: ActionJob[] = [];
        try {
            const profile = defineProfile<
                JsonObject,
                ActionPayload,
                JsonValue,
                number,
                CosmosHostContext,
                JsonObject
            >({
                manifest: {key: "cosmos-action-conformance", name: "Cosmos Action conformance"},
                initial: objectSchema,
                payload: payloadSchema,
                requiredCapabilities: [actionCapability],
                prepare(context) {
                    expect(context.hostContext.flowId).toBe("flow-42");
                    expect(context.hostContext.runId).toBe("run-7");
                    expect(context.hostContext.sessionRef).toBe("session-ref-7");
                    expect(context.hostContext.workspaceKey).toBe("workspace-a");
                    expect(context.capabilities.require(actionCapability).workspaceLabel()).toBe("workspace-a");
                    return {
                        systemPrompt: "Cosmos Action",
                        modelConfig: {provider: "fake", model: "deterministic"},
                        limits: {maxTurns: 1},
                    };
                },
            });
            const profiles = new ProfileRegistry<number, CosmosHostContext, JsonObject>().add(profile);
            const model = new ScriptedModelRuntime<JsonObject>([completed("agent answer", 100)]);
            let capabilityCloseCount = 0;

            scheduler = new CommitWorkflowScheduler<ActionJob, number, CosmosHostContext>({
                name: "cosmos.agent.invoke",
                select(notification) {
                    if (notification.plan.cause !== "cosmos.action.requested") return null;
                    const payload = notification.result.entries[0]?.payload;
                    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
                    const actionId = payload.actionId;
                    const instruction = payload.instruction;
                    const hostContext = notification.result.snapshot.metadata.hostContext;
                    if (typeof actionId !== "string" || typeof instruction !== "string") return null;
                    return {
                        key: actionId,
                        payload: {
                            actionId,
                            sessionId: notification.result.snapshot.metadata.sessionId,
                            flowId: hostContext.flowId,
                            runId: hostContext.runId,
                            sessionRef: hostContext.sessionRef,
                            anchorVersion: notification.result.snapshot.version,
                            anchorLeafId: notification.result.snapshot.activeLeafId,
                            instruction,
                        },
                    };
                },
                async run(job) {
                    observedJobs.push(job.payload);
                    const handle = await harness.invokeAt({
                        sessionId: job.payload.sessionId,
                        payload: {instruction: job.payload.instruction},
                        caller: {kind: "system", name: "cosmos.workflow.agent-action"},
                        anchor: {
                            version: job.payload.anchorVersion,
                            activeLeafId: job.payload.anchorLeafId,
                        },
                    });
                    const result = await handle.result();
                    expect(result.status).toBe("completed");
                    const projected = invocationResultFromSnapshot(
                        (await harness.snapshot(job.payload.sessionId)).session,
                        result.invocationId,
                    );
                    expect(projected?.status).toBe("completed");
                    expect(projected?.output).toBe("agent answer");
                    expect(projected?.usage).toEqual({input: 3, output: 2, total: 5});
                    const current = await harness.snapshot(job.payload.sessionId);
                    await harness.write({
                        target: job.payload.sessionId,
                        expectedVersion: current.session.version,
                        expectedActiveLeafId: current.session.activeLeafId,
                        cause: "cosmos.action.completed",
                        operations: [{
                            type: "appendEntries",
                            entries: [{
                                kind: "cosmos.action.completed",
                                payload: {
                                    actionId: job.payload.actionId,
                                    flowId: job.payload.flowId,
                                    runId: job.payload.runId,
                                    sessionRef: job.payload.sessionRef,
                                    invocationId: result.invocationId,
                                    status: result.status,
                                    output: projected?.output ?? null,
                                    usage: projected?.usage === undefined ? null : {
                                        input: projected.usage.input,
                                        output: projected.usage.output,
                                        total: projected.usage.total,
                                    },
                                },
                            }],
                        }],
                    });
                },
            });

            harness = new NeuroAgentHarness({
                store: new JsonlSessionStore<CosmosHostContext>({directory}),
                profiles,
                model,
                capabilities: [{
                    capability: actionCapability,
                    open(context) {
                        expect(context.hostContext.workspaceKey).toBe("workspace-a");
                        return {workspaceLabel: () => context.hostContext.workspaceKey};
                    },
                    close() {
                        capabilityCloseCount += 1;
                    },
                }],
                commitObservers: [scheduler],
            });
            const created = await harness.createSession({
                profileKey: profile.manifest.key,
                initial: {},
                hostContext: {
                    flowId: "flow-42",
                    runId: "run-7",
                    sessionRef: "session-ref-7",
                    workspaceKey: "workspace-a",
                },
            });
            const requested = await harness.write({
                target: created.session.metadata.sessionId,
                expectedVersion: created.session.version,
                expectedActiveLeafId: created.session.activeLeafId,
                cause: "cosmos.action.requested",
                operations: [{type: "appendEntries", entries: [actionRequestedEntry("action-7", "summarize")] }],
            });
            await scheduler.drain();

            expect(observedJobs).toEqual([{
                actionId: "action-7",
                sessionId: created.session.metadata.sessionId,
                flowId: "flow-42",
                runId: "run-7",
                sessionRef: "session-ref-7",
                anchorVersion: requested.session.version,
                anchorLeafId: requested.session.activeLeafId,
                instruction: "summarize",
            }]);

            const current = await harness.snapshot(created.session.metadata.sessionId);
            const invocation = current.session.invocations[0];
            expect(invocation?.caller).toEqual({kind: "system", name: "cosmos.workflow.agent-action"});
            expect(capabilityCloseCount).toBe(1);
            const completedEntry = current.session.entries.findLast((entry) => entry.kind === "cosmos.action.completed");
            expect(completedEntry?.payload).toMatchObject({
                actionId: "action-7",
                flowId: "flow-42",
                runId: "run-7",
                sessionRef: "session-ref-7",
                invocationId: invocation?.id,
                status: "completed",
                output: "agent answer",
                usage: {input: 3, output: 2, total: 5},
            });

            await scheduler.dispose();
            await harness.dispose();
            const restartedStore = new JsonlSessionStore<CosmosHostContext>({directory});
            const restored = await restartedStore.read(created.session.metadata.sessionId);
            const projected = invocationResultFromSnapshot(restored, invocation?.id ?? "missing");
            expect(restored.metadata.hostContext).toEqual({
                flowId: "flow-42",
                runId: "run-7",
                sessionRef: "session-ref-7",
                workspaceKey: "workspace-a",
            });
            expect(projected).toMatchObject({
                status: "completed",
                persistence: "confirmed",
                output: "agent answer",
                usage: {input: 3, output: 2, total: 5},
            });
            expect(restored.entries.some((entry) => entry.kind === "cosmos.action.requested")).toBe(true);
            expect(restored.entries.some((entry) => entry.kind === "cosmos.action.completed")).toBe(true);
        } finally {
            await scheduler?.dispose();
            await harness?.dispose();
            await rm(directory, {recursive: true, force: true});
        }
    });
});
