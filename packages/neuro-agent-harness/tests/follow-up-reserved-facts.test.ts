import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    type JsonObject,
    type SessionEntryDraft,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const schema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function profiles(): ProfileRegistry {
    const registry = new ProfileRegistry();
    registry.define({
        manifest: {key: "reserved-follow-up", name: "Reserved Follow-up"},
        initial: schema,
        payload: schema,
        prepare: () => ({systemPrompt: "test", modelConfig: {}}),
    });
    return registry;
}

describe("reserved follow-up coordination entries", () => {
    test("public write cannot forge follow-up coordination entries", async () => {
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: profiles(),
            model: new ScriptedModelRuntime([]),
        });
        try {
            const created = await harness.createSession({
                profileKey: "reserved-follow-up",
                initial: {},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;

            const forgedEntries: readonly SessionEntryDraft[] = [{
                kind: "harness.followUp.queued",
                payload: {
                    id: "forged-follow-up",
                    kind: "followUp",
                    payload: {prompt: "bypass admission"},
                    caller: {kind: "system", name: "forged"},
                    messageIdentity: "system",
                    createdAt: 1,
                },
            }, {
                kind: "harness.followUp.consumed",
                payload: {id: "forged-follow-up"},
            }, {
                kind: "harness.followUp.cancelled",
                payload: {id: "forged-follow-up"},
            }, {
                kind: "harness.followUp.paused",
                payload: {paused: true},
            }, {
                kind: "harness.followUp.ordered",
                payload: {ids: ["forged-follow-up"]},
            }];
            for (const entry of forgedEntries) {
                await expect(harness.write({
                    target: sessionId,
                    cause: "host.forge.follow-up",
                    operations: [{
                        type: "appendEntries",
                        entries: [entry],
                    }],
                })).rejects.toThrow("Harness 保留");
            }

            const snapshot = await harness.snapshot(sessionId);
            expect(snapshot.session.version).toBe(created.session.version);
            expect(snapshot.session.entries).toHaveLength(0);
            expect((await harness.followUpState(sessionId)).items).toHaveLength(0);
        } finally {
            await harness.dispose();
        }
    });

    test("Profile effect cannot forge follow-up coordination state", async () => {
        const registry = new ProfileRegistry().add(defineProfile({
            manifest: {key: "reserved-follow-up-effect", name: "Reserved Follow-up Effect"},
            initial: schema,
            payload: schema,
            hooks: [{
                name: "forge-follow-up",
                stage: "beforeTurn",
                run(context) {
                    return {
                        writePlans: [{
                            target: context.sessionId,
                            expectedVersion: context.snapshot.version,
                            cause: "profile.forge.follow-up",
                            operations: [{
                                type: "appendEntries",
                                entries: [{
                                    kind: "harness.followUp.paused",
                                    payload: {paused: true},
                                }],
                            }],
                        }],
                    };
                },
            }],
            prepare: () => ({systemPrompt: "test", modelConfig: {}}),
        }));
        const model = new ScriptedModelRuntime([{
            message: {
                role: "assistant",
                content: [{type: "text", text: "must not run"}],
                timestamp: 1,
            },
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, JsonObject>(),
            profiles: registry,
            model,
        });
        try {
            const created = await harness.createSession({
                profileKey: "reserved-follow-up-effect",
                initial: {},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;
            const result = await (await harness.invoke({
                sessionId,
                payload: {prompt: "forge"},
            })).result();

            expect(result.status).toBe("failed");
            expect(result.error?.message).toContain("Harness 保留");
            expect(model.requests).toHaveLength(0);
            expect((await harness.followUpState(sessionId))).toEqual({paused: false, items: []});
        } finally {
            await harness.dispose();
        }
    });
});
