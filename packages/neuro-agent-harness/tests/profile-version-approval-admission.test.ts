import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    ProfileVersionConflictError,
    SessionInvariantError,
    defineCapability,
    defineSchema,
    defineTool,
    reduceSessionWritePlan,
    type AssistantContent,
    type JsonObject,
    type SessionCommitResult,
    type SessionWritePlan,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const directories: string[] = [];
const fallbackHarnesses: {dispose(): Promise<void>}[] = [];
afterEach(async () => {
    await Promise.allSettled(fallbackHarnesses.splice(0).map((harness) => harness.dispose()));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

function trackFallbackDispose<THarness extends {dispose(): Promise<void>}>(harness: THarness): THarness {
    fallbackHarnesses.push(harness);
    return harness;
}

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-profile-version-"));
    directories.push(directory);
    return directory;
}

type JsonlRecordWithInvocations =
    | {
        readonly kind: "snapshot";
        readonly snapshot: Record<string, unknown> & {readonly invocations: readonly Record<string, unknown>[]};
    }
    | {
        readonly kind: "commit";
        readonly invocations: readonly Record<string, unknown>[];
    };

async function readJsonlRecords(directory: string, sessionId: number): Promise<JsonlRecordWithInvocations[]> {
    const path = join(directory, "sessions", `${sessionId}.jsonl`);
    return (await readFile(path, "utf8")).trimEnd().split(/\r?\n/u).map((line) => JSON.parse(line) as JsonlRecordWithInvocations);
}

async function writeJsonlRecords(directory: string, sessionId: number, records: readonly JsonlRecordWithInvocations[]): Promise<void> {
    const path = join(directory, "sessions", `${sessionId}.jsonl`);
    await writeFile(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

async function removeProfileVersionFromJsonl(directory: string, sessionId: number): Promise<void> {
    const records = await readJsonlRecords(directory, sessionId);
    const legacy = records.map((record) => {
        const invocations = (record.kind === "snapshot" ? record.snapshot.invocations : record.invocations).map((invocation) => {
            const {profileVersion: _profileVersion, ...rest} = invocation;
            return rest;
        });
        return record.kind === "snapshot"
            ? {...record, snapshot: {...record.snapshot, invocations}}
            : {...record, invocations};
    });
    await writeJsonlRecords(directory, sessionId, legacy);
}

async function setProfileVersionInJsonl(directory: string, sessionId: number, profileVersion: unknown): Promise<void> {
    const records = await readJsonlRecords(directory, sessionId);
    const invalid = records.map((record) => {
        const invocations = (record.kind === "snapshot" ? record.snapshot.invocations : record.invocations)
            .map((invocation) => ({...invocation, profileVersion}));
        return record.kind === "snapshot"
            ? {...record, snapshot: {...record.snapshot, invocations}}
            : {...record, invocations};
    });
    await writeJsonlRecords(directory, sessionId, invalid);
}

class DelayedResumeStore extends MemorySessionStore<number, JsonObject> {
    private markResumeEntered!: () => void;
    private releaseResumeCommit!: () => void;
    readonly resumeEntered = new Promise<void>((resolve) => {
        this.markResumeEntered = resolve;
    });
    private readonly resumeReleased = new Promise<void>((resolve) => {
        this.releaseResumeCommit = resolve;
    });

    releaseResume(): void {
        this.releaseResumeCommit();
    }

    override async commit(plan: SessionWritePlan<number, JsonObject>): Promise<SessionCommitResult<number, JsonObject>> {
        if (plan.cause === "harness.invocation.resumeApproval.admit") {
            this.markResumeEntered();
            await this.resumeReleased;
        }
        return super.commit(plan);
    }
}

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
}, {type: "object"});

function assistant(content: string | readonly AssistantContent[], timestamp: number) {
    return {
        message: {
            role: "assistant" as const,
            content: typeof content === "string" ? [{type: "text" as const, text: content}] : content,
            timestamp,
        },
    };
}

describe("durable Profile Version approval admission", () => {
    test("旧 Profile 的 approval 不应在 replacement 后执行新版 Tool", async () => {
        let modelCalls = 0;
        let versionOnePrepares = 0;
        let versionTwoCapabilityOpens = 0;
        let versionTwoPrepares = 0;
        let versionTwoExecutions = 0;
        const versionTwoCapability = defineCapability<"version-two", Record<string, never>>("version-two");

        const versionOneTool = defineTool({
            name: "danger",
            description: "version one",
            parameters: schema,
            approval: {request: () => ({prompt: "允许执行 v1？"})},
            execute: () => ({content: "v1"}),
        });
        const versionTwoTool = defineTool({
            name: "danger",
            description: "version two",
            parameters: schema,
            execute: () => {
                versionTwoExecutions += 1;
                return {content: "v2"};
            },
        });

        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "profile-version", name: "Profile Version", version: 1},
            initial: schema,
            payload: schema,
            prepare: () => {
                versionOnePrepares += 1;
                return {systemPrompt: "v1", modelConfig: {}, tools: [versionOneTool]};
            },
        });
        const model = new ScriptedModelRuntime([
            () => {
                modelCalls += 1;
                return assistant([{type: "toolCall", call: {id: "danger-1", name: "danger", arguments: {}}}], 1);
            },
            () => {
                modelCalls += 1;
                return assistant("v2 completed", 2);
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model,
            capabilities: [{
                capability: versionTwoCapability,
                open: () => {
                    versionTwoCapabilityOpens += 1;
                    return {};
                },
            }],
        });

        try {
            const session = await harness.createSession({profileKey: "profile-version", initial: {}, hostContext: {}});
            const waitingHandle = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
            expect((await waitingHandle.result()).status).toBe("waiting");
            expect(versionOnePrepares).toBe(1);
            expect(modelCalls).toBe(1);

            registry.replace({
                manifest: {key: "profile-version", name: "Profile Version", version: 2},
                initial: schema,
                payload: schema,
                requiredCapabilities: [versionTwoCapability],
                prepare: () => {
                    versionTwoPrepares += 1;
                    return {systemPrompt: "v2", modelConfig: {}, tools: [versionTwoTool]};
                },
            });

            const beforeResume = await harness.snapshot(session.session.metadata.sessionId);
            const outcome = await harness.resume(
                session.session.metadata.sessionId,
                waitingHandle.invocationId,
                [{toolCallId: "danger-1", approved: true}],
            ).then(
                async (handle) => ({kind: "accepted" as const, result: await handle.result()}),
                (error: unknown) => ({kind: "rejected" as const, error}),
            );
            const afterResume = await harness.snapshot(session.session.metadata.sessionId);

            expect({
                outcome: outcome.kind,
                conflict: outcome.kind === "rejected" && outcome.error instanceof ProfileVersionConflictError
                    ? {
                        profileKey: outcome.error.profileKey,
                        invocationId: outcome.error.invocationId,
                        expectedVersion: outcome.error.expectedVersion,
                        actualVersion: outcome.error.actualVersion,
                    }
                    : undefined,
                resultStatus: outcome.kind === "accepted" ? outcome.result.status : undefined,
                versionTwoCapabilityOpens,
                versionTwoPrepares,
                versionTwoExecutions,
                modelCalls,
                invocationStatus: afterResume.session.invocations[0]?.status,
            }).toEqual({
                outcome: "rejected",
                conflict: {
                    profileKey: "profile-version",
                    invocationId: waitingHandle.invocationId,
                    expectedVersion: 1,
                    actualVersion: 2,
                },
                resultStatus: undefined,
                versionTwoCapabilityOpens: 0,
                versionTwoPrepares: 0,
                versionTwoExecutions: 0,
                modelCalls: 1,
                invocationStatus: "waiting",
            });
            expect(afterResume.session).toEqual(beforeResume.session);
        } finally {
            await harness.dispose();
        }
    });

    test("JSONL restart 后用持久化版本拒绝新版 Profile", async () => {
        const directory = await tempDirectory();
        const versionOneTool = defineTool({
            name: "durable-danger",
            description: "version one",
            parameters: schema,
            approval: {request: () => ({prompt: "允许持久操作 v1？"})},
            execute: () => ({content: "v1"}),
        });
        const firstRegistry = new ProfileRegistry();
        firstRegistry.define({
            manifest: {key: "jsonl-profile-version", name: "JSONL Profile Version", version: 7},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "v1", modelConfig: {}, tools: [versionOneTool]}),
        });
        const firstHarness = trackFallbackDispose(new NeuroAgentHarness({
            store: new JsonlSessionStore({directory, checkpointEvery: 2}),
            profiles: firstRegistry,
            model: new ScriptedModelRuntime([
                assistant([{type: "toolCall", call: {id: "durable-danger-1", name: "durable-danger", arguments: {}}}], 1),
            ]),
        }));
        const session = await firstHarness.createSession({profileKey: "jsonl-profile-version", initial: {}, hostContext: {}});
        const waitingHandle = await firstHarness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
        expect((await waitingHandle.result()).status).toBe("waiting");
        await firstHarness.dispose();
        const durableRecords = await readJsonlRecords(directory, session.session.metadata.sessionId);
        const recordsWithInvocations = durableRecords
            .map((record) => ({
                kind: record.kind,
                invocations: record.kind === "snapshot" ? record.snapshot.invocations : record.invocations,
            }))
            .filter((record) => record.invocations.length > 0);
        expect({
            commitProfileVersions: [...new Set(recordsWithInvocations.filter((record) => record.kind === "commit").flatMap((record) => {
                return record.invocations.map((invocation) => invocation.profileVersion);
            }))],
            snapshotProfileVersions: [...new Set(recordsWithInvocations.filter((record) => record.kind === "snapshot").flatMap((record) => {
                return record.invocations.map((invocation) => invocation.profileVersion);
            }))],
        }).toEqual({
            commitProfileVersions: [7],
            snapshotProfileVersions: [7],
        });

        let versionTwoPrepares = 0;
        let versionTwoExecutions = 0;
        let versionTwoModelCalls = 0;
        const versionTwoTool = defineTool({
            name: "durable-danger",
            description: "version two",
            parameters: schema,
            execute: () => {
                versionTwoExecutions += 1;
                return {content: "v2"};
            },
        });
        const secondRegistry = new ProfileRegistry();
        secondRegistry.define({
            manifest: {key: "jsonl-profile-version", name: "JSONL Profile Version", version: 8},
            initial: schema,
            payload: schema,
            prepare: () => {
                versionTwoPrepares += 1;
                return {systemPrompt: "v2", modelConfig: {}, tools: [versionTwoTool]};
            },
        });
        const secondHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory, checkpointEvery: 2}),
            profiles: secondRegistry,
            model: new ScriptedModelRuntime([
                () => {
                    versionTwoModelCalls += 1;
                    return assistant("v2 completed", 2);
                },
            ]),
        });

        try {
            const beforeResume = await secondHarness.snapshot(session.session.metadata.sessionId);
            const outcome = await secondHarness.resume(
                session.session.metadata.sessionId,
                waitingHandle.invocationId,
                [{toolCallId: "durable-danger-1", approved: true}],
            ).then(
                async (handle) => ({kind: "accepted" as const, result: await handle.result()}),
                (error: unknown) => ({kind: "rejected" as const, error}),
            );
            const afterResume = await secondHarness.snapshot(session.session.metadata.sessionId);

            expect({
                durableProfileVersion: beforeResume.session.invocations[0]?.profileVersion,
                outcome: outcome.kind,
                conflict: outcome.kind === "rejected" && outcome.error instanceof ProfileVersionConflictError
                    ? {
                        profileKey: outcome.error.profileKey,
                        invocationId: outcome.error.invocationId,
                        expectedVersion: outcome.error.expectedVersion,
                        actualVersion: outcome.error.actualVersion,
                    }
                    : undefined,
                versionTwoPrepares,
                versionTwoExecutions,
                versionTwoModelCalls,
                invocationStatus: afterResume.session.invocations[0]?.status,
                sessionVersionChanged: afterResume.session.version !== beforeResume.session.version,
            }).toEqual({
                durableProfileVersion: 7,
                outcome: "rejected",
                conflict: {
                    profileKey: "jsonl-profile-version",
                    invocationId: waitingHandle.invocationId,
                    expectedVersion: 7,
                    actualVersion: 8,
                },
                versionTwoPrepares: 0,
                versionTwoExecutions: 0,
                versionTwoModelCalls: 0,
                invocationStatus: "waiting",
                sessionVersionChanged: false,
            });
            expect(afterResume.session).toEqual(beforeResume.session);
        } finally {
            await secondHarness.dispose();
        }
    });

    test("legacy JSONL waiting approval 按版本 1 恢复，只拒绝当前版本 2", async () => {
        const directory = await tempDirectory();
        const legacyTool = defineTool({
            name: "legacy-danger",
            description: "legacy",
            parameters: schema,
            approval: {request: () => ({prompt: "允许 legacy 操作？"})},
            execute: () => ({content: "legacy"}),
        });
        const firstRegistry = new ProfileRegistry();
        for (const key of ["legacy-compatible", "legacy-mismatch"]) {
            firstRegistry.define({
                manifest: {key, name: key, version: 1},
                initial: schema,
                payload: schema,
                prepare: () => ({systemPrompt: key, modelConfig: {}, tools: [legacyTool]}),
            });
        }
        const firstHarness = trackFallbackDispose(new NeuroAgentHarness({
            store: new JsonlSessionStore({directory, checkpointEvery: 2}),
            profiles: firstRegistry,
            model: new ScriptedModelRuntime([
                assistant([{type: "toolCall", call: {id: "legacy-compatible-1", name: "legacy-danger", arguments: {}}}], 1),
                assistant([{type: "toolCall", call: {id: "legacy-mismatch-1", name: "legacy-danger", arguments: {}}}], 2),
            ]),
        }));
        const compatibleSession = await firstHarness.createSession({profileKey: "legacy-compatible", initial: {}, hostContext: {}});
        const compatibleWaiting = await firstHarness.invoke({sessionId: compatibleSession.session.metadata.sessionId, payload: {}});
        expect((await compatibleWaiting.result()).status).toBe("waiting");
        const mismatchSession = await firstHarness.createSession({profileKey: "legacy-mismatch", initial: {}, hostContext: {}});
        const mismatchWaiting = await firstHarness.invoke({sessionId: mismatchSession.session.metadata.sessionId, payload: {}});
        expect((await mismatchWaiting.result()).status).toBe("waiting");
        await firstHarness.dispose();
        await removeProfileVersionFromJsonl(directory, compatibleSession.session.metadata.sessionId);
        await removeProfileVersionFromJsonl(directory, mismatchSession.session.metadata.sessionId);

        let compatibleExecutions = 0;
        let mismatchPrepares = 0;
        let mismatchExecutions = 0;
        const compatibleTool = defineTool({
            name: "legacy-danger",
            description: "compatible",
            parameters: schema,
            execute: () => {
                compatibleExecutions += 1;
                return {content: "compatible"};
            },
        });
        const mismatchTool = defineTool({
            name: "legacy-danger",
            description: "mismatch",
            parameters: schema,
            execute: () => {
                mismatchExecutions += 1;
                return {content: "mismatch"};
            },
        });
        const secondRegistry = new ProfileRegistry();
        secondRegistry.define({
            manifest: {key: "legacy-compatible", name: "Legacy Compatible"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "compatible", modelConfig: {}, tools: [compatibleTool]}),
        });
        secondRegistry.define({
            manifest: {key: "legacy-mismatch", name: "Legacy Mismatch", version: 2},
            initial: schema,
            payload: schema,
            prepare: () => {
                mismatchPrepares += 1;
                return {systemPrompt: "mismatch", modelConfig: {}, tools: [mismatchTool]};
            },
        });
        const secondHarness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory, checkpointEvery: 2}),
            profiles: secondRegistry,
            model: new ScriptedModelRuntime([assistant("legacy completed", 3)]),
        });

        try {
            const compatibleBefore = await secondHarness.snapshot(compatibleSession.session.metadata.sessionId);
            const mismatchBefore = await secondHarness.snapshot(mismatchSession.session.metadata.sessionId);
            const compatibleResult = await (await secondHarness.resume(
                compatibleSession.session.metadata.sessionId,
                compatibleWaiting.invocationId,
                [{toolCallId: "legacy-compatible-1", approved: true}],
            )).result();
            const mismatchOutcome = await secondHarness.resume(
                mismatchSession.session.metadata.sessionId,
                mismatchWaiting.invocationId,
                [{toolCallId: "legacy-mismatch-1", approved: true}],
            ).then(
                async (handle) => ({kind: "accepted" as const, result: await handle.result()}),
                (error: unknown) => ({kind: "rejected" as const, error}),
            );
            const mismatchAfter = await secondHarness.snapshot(mismatchSession.session.metadata.sessionId);

            expect({
                compatibleLegacyVersion: compatibleBefore.session.invocations[0]?.profileVersion,
                compatibleStatus: compatibleResult.status,
                compatibleExecutions,
                mismatchLegacyVersion: mismatchBefore.session.invocations[0]?.profileVersion,
                mismatchOutcome: mismatchOutcome.kind,
                mismatchConflict: mismatchOutcome.kind === "rejected" && mismatchOutcome.error instanceof ProfileVersionConflictError
                    ? {
                        profileKey: mismatchOutcome.error.profileKey,
                        invocationId: mismatchOutcome.error.invocationId,
                        expectedVersion: mismatchOutcome.error.expectedVersion,
                        actualVersion: mismatchOutcome.error.actualVersion,
                    }
                    : undefined,
                mismatchPrepares,
                mismatchExecutions,
                mismatchStatus: mismatchAfter.session.invocations[0]?.status,
                mismatchSessionVersionChanged: mismatchAfter.session.version !== mismatchBefore.session.version,
            }).toEqual({
                compatibleLegacyVersion: 1,
                compatibleStatus: "completed",
                compatibleExecutions: 1,
                mismatchLegacyVersion: 1,
                mismatchOutcome: "rejected",
                mismatchConflict: {
                    profileKey: "legacy-mismatch",
                    invocationId: mismatchWaiting.invocationId,
                    expectedVersion: 1,
                    actualVersion: 2,
                },
                mismatchPrepares: 0,
                mismatchExecutions: 0,
                mismatchStatus: "waiting",
                mismatchSessionVersionChanged: false,
            });
            expect(mismatchAfter.session).toEqual(mismatchBefore.session);
        } finally {
            await secondHarness.dispose();
        }
    });

    test("same-version replacement 明确接管 waiting approval", async () => {
        let replacementPrepares = 0;
        let replacementExecutions = 0;
        const initialTool = defineTool({
            name: "compatible-danger",
            description: "compatible",
            parameters: schema,
            approval: {request: () => ({prompt: "允许 compatible 操作？"})},
            execute: () => ({content: "compatible"}),
        });
        const replacementTool = defineTool({
            name: "compatible-danger",
            description: "compatible",
            parameters: schema,
            execute: () => {
                replacementExecutions += 1;
                return {content: "compatible"};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "same-version", name: "Same Version"},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "initial", modelConfig: {}, tools: [initialTool]}),
        });
        const model = new ScriptedModelRuntime([
            assistant([{type: "toolCall", call: {id: "compatible-danger-1", name: "compatible-danger", arguments: {}}}], 1),
            assistant("compatible completed", 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model,
        });

        try {
            const session = await harness.createSession({profileKey: "same-version", initial: {}, hostContext: {}});
            const waiting = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
            expect((await waiting.result()).status).toBe("waiting");
            registry.replace({
                manifest: {key: "same-version", name: "Same Version", version: 1},
                initial: schema,
                payload: schema,
                prepare: () => {
                    replacementPrepares += 1;
                    return {systemPrompt: "compatible", modelConfig: {}, tools: [replacementTool]};
                },
            });

            const result = await (await harness.resume(
                session.session.metadata.sessionId,
                waiting.invocationId,
                [{toolCallId: "compatible-danger-1", approved: true}],
            )).result();
            const snapshot = await harness.snapshot(session.session.metadata.sessionId);

            expect({
                status: result.status,
                profileVersion: snapshot.session.invocations[0]?.profileVersion,
                replacementPrepares,
                replacementExecutions,
                modelCalls: model.requests.length,
            }).toEqual({
                status: "completed",
                profileVersion: 1,
                replacementPrepares: 1,
                replacementExecutions: 1,
                modelCalls: 2,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("版本校验后发生 replacement 时，本次 resume 使用已校验的 Profile", async () => {
        const store = new DelayedResumeStore();
        let versionOneExecutions = 0;
        let versionTwoPrepares = 0;
        let versionTwoExecutions = 0;
        const versionOneTool = defineTool({
            name: "claim-race-danger",
            description: "version one",
            parameters: schema,
            approval: {request: () => ({prompt: "允许 claim race v1？"})},
            execute: () => {
                versionOneExecutions += 1;
                return {content: "v1"};
            },
        });
        const versionTwoTool = defineTool({
            name: "claim-race-danger",
            description: "version two",
            parameters: schema,
            execute: () => {
                versionTwoExecutions += 1;
                return {content: "v2"};
            },
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "claim-race-profile-version", name: "Claim Race Profile Version", version: 1},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "v1", modelConfig: {}, tools: [versionOneTool]}),
        });
        const harness = new NeuroAgentHarness({
            store,
            profiles: registry,
            model: new ScriptedModelRuntime([
                assistant([{type: "toolCall", call: {id: "claim-race-1", name: "claim-race-danger", arguments: {}}}], 1),
                assistant("claim race completed", 2),
            ]),
        });

        try {
            const session = await harness.createSession({profileKey: "claim-race-profile-version", initial: {}, hostContext: {}});
            const waiting = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
            expect((await waiting.result()).status).toBe("waiting");
            const resumePromise = harness.resume(
                session.session.metadata.sessionId,
                waiting.invocationId,
                [{toolCallId: "claim-race-1", approved: true}],
            );
            await store.resumeEntered;
            registry.replace({
                manifest: {key: "claim-race-profile-version", name: "Claim Race Profile Version", version: 2},
                initial: schema,
                payload: schema,
                prepare: () => {
                    versionTwoPrepares += 1;
                    return {systemPrompt: "v2", modelConfig: {}, tools: [versionTwoTool]};
                },
            });
            store.releaseResume();

            const result = await (await resumePromise).result();
            const snapshot = await harness.snapshot(session.session.metadata.sessionId);

            expect({
                status: result.status,
                durableProfileVersion: snapshot.session.invocations[0]?.profileVersion,
                versionOneExecutions,
                versionTwoPrepares,
                versionTwoExecutions,
            }).toEqual({
                status: "completed",
                durableProfileVersion: 1,
                versionOneExecutions: 1,
                versionTwoPrepares: 0,
                versionTwoExecutions: 0,
            });
        } finally {
            store.releaseResume();
            await harness.dispose();
        }
    });

    test("retry 创建新 Invocation 并绑定当前 Profile Version", async () => {
        let versionTwoPrepares = 0;
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "profile-version-retry", name: "Profile Version Retry", version: 1},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "v1", modelConfig: {}}),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: registry,
            model: new ScriptedModelRuntime([
                new Error("v1 provider failed"),
                assistant("v2 retried", 2),
            ]),
        });

        try {
            const session = await harness.createSession({profileKey: "profile-version-retry", initial: {}, hostContext: {}});
            const first = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
            expect((await first.result()).status).toBe("failed");
            registry.replace({
                manifest: {key: "profile-version-retry", name: "Profile Version Retry", version: 2},
                initial: schema,
                payload: schema,
                prepare: () => {
                    versionTwoPrepares += 1;
                    return {systemPrompt: "v2", modelConfig: {}};
                },
            });

            const retried = await harness.retry(session.session.metadata.sessionId, first.invocationId);
            const retryResult = await retried.result();
            const snapshot = await harness.snapshot(session.session.metadata.sessionId);

            expect({
                retryStatus: retryResult.status,
                versions: snapshot.session.invocations.map((invocation) => invocation.profileVersion),
                retryOf: snapshot.session.invocations[1]?.retryOf,
                versionTwoPrepares,
            }).toEqual({
                retryStatus: "completed",
                versions: [1, 2],
                retryOf: first.invocationId,
                versionTwoPrepares: 1,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("非法 manifest 与 durable Profile Version 都 fail closed", async () => {
        const invalidRegistry = new ProfileRegistry();
        expect(() => invalidRegistry.define({
            manifest: {key: "invalid-profile-version", name: "Invalid Profile Version", version: 0},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "invalid", modelConfig: {}}),
        })).toThrow("manifest.version 必须是正整数");

        const directory = await tempDirectory();
        const tool = defineTool({
            name: "invalid-durable-danger",
            description: "invalid durable",
            parameters: schema,
            approval: {request: () => ({prompt: "等待篡改"})},
            execute: () => ({content: "must not execute"}),
        });
        const registry = new ProfileRegistry();
        registry.define({
            manifest: {key: "invalid-durable-profile-version", name: "Invalid Durable Profile Version", version: 1},
            initial: schema,
            payload: schema,
            prepare: () => ({systemPrompt: "valid", modelConfig: {}, tools: [tool]}),
        });
        const harness = new NeuroAgentHarness({
            store: new JsonlSessionStore({directory, checkpointEvery: 2}),
            profiles: registry,
            model: new ScriptedModelRuntime([
                assistant([{type: "toolCall", call: {id: "invalid-durable-1", name: "invalid-durable-danger", arguments: {}}}], 1),
            ]),
        });
        try {
            const session = await harness.createSession({profileKey: "invalid-durable-profile-version", initial: {}, hostContext: {}});
            const waiting = await harness.invoke({sessionId: session.session.metadata.sessionId, payload: {}});
            expect((await waiting.result()).status).toBe("waiting");
            const validSnapshot = (await harness.snapshot(session.session.metadata.sessionId)).session;
            const invalidSnapshot = {
                ...structuredClone(validSnapshot),
                invocations: validSnapshot.invocations.map((invocation) => ({...invocation, profileVersion: null})),
            } as unknown as typeof validSnapshot;
            expect(() => reduceSessionWritePlan(invalidSnapshot, {
                target: session.session.metadata.sessionId,
                cause: "test.invalid-profile-version-existing-invocation",
                operations: [{type: "appendEntries", entries: [{kind: "test.probe", payload: true}]}],
            }, {
                now: () => 1,
                entryId: () => "probe-entry",
            })).toThrow(`Invocation ${waiting.invocationId} profileVersion 必须是正整数`);
            await setProfileVersionInJsonl(directory, session.session.metadata.sessionId, null);
            const nullOutcome = await new JsonlSessionStore({directory, checkpointEvery: 2})
                .read(session.session.metadata.sessionId)
                .then(
                    () => ({kind: "accepted" as const}),
                    (error: unknown) => ({kind: "rejected" as const, error}),
                );
            await setProfileVersionInJsonl(directory, session.session.metadata.sessionId, 0);
            const zeroOutcome = await new JsonlSessionStore({directory, checkpointEvery: 2})
                .read(session.session.metadata.sessionId)
                .then(
                    () => ({kind: "accepted" as const}),
                    (error: unknown) => ({kind: "rejected" as const, error}),
                );
            expect({
                nullOutcome: nullOutcome.kind,
                nullError: nullOutcome.kind === "rejected" && nullOutcome.error instanceof SessionInvariantError
                    ? nullOutcome.error.message
                    : undefined,
                zeroOutcome: zeroOutcome.kind,
                zeroError: zeroOutcome.kind === "rejected" && zeroOutcome.error instanceof SessionInvariantError
                    ? zeroOutcome.error.message
                    : undefined,
            }).toEqual({
                nullOutcome: "rejected",
                nullError: `Invocation ${waiting.invocationId} profileVersion 必须是正整数`,
                zeroOutcome: "rejected",
                zeroError: `Invocation ${waiting.invocationId} profileVersion 必须是正整数`,
            });
        } finally {
            await harness.dispose();
        }
    });
});
