import {describe, expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionInvariantError,
    activeSessionPath,
    defineProfile,
    defineSchema,
    reduceSessionWritePlan,
    type JsonObject,
    type SessionSnapshot,
    type SessionStore,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

function emptySnapshot(activeLeafId: string | null): SessionSnapshot<number, JsonObject> {
    return {
        metadata: {
            sessionId: 1,
            profileKey: "entry-parent-admission",
            initial: {},
            hostContext: {},
            createdAt: 1,
        },
        version: 0,
        status: "idle",
        activeLeafId,
        activeInvocationId: null,
        entries: [],
        invocations: [],
    };
}

function createHarness(): NeuroAgentHarness {
    const profiles = new ProfileRegistry();
    profiles.define({
        manifest: {key: "entry-parent-admission", name: "Entry parent admission"},
        initial: objectSchema,
        payload: objectSchema,
        prepare: () => ({systemPrompt: "test", modelConfig: {}}),
    });
    return new NeuroAgentHarness({
        store: new MemorySessionStore(),
        profiles,
        model: new ScriptedModelRuntime([]),
    });
}

async function verifyStoreParentAdmission(store: SessionStore<number, JsonObject>): Promise<number> {
    const created = await store.create({
        profileKey: "entry-parent-admission",
        initial: {},
        hostContext: {},
    });

    await expect(store.commit({
        target: created.metadata.sessionId,
        expectedVersion: created.version,
        cause: "test.store-dangling-parent",
        operations: [{
            type: "appendEntries",
            entries: [{
                kind: "test.store.invalid",
                parentId: "missing-parent",
                payload: {},
            }],
        }],
    })).rejects.toBeInstanceOf(SessionInvariantError);

    const untouched = await store.read(created.metadata.sessionId);
    expect(untouched.version).toBe(created.version);
    expect(untouched.entries).toHaveLength(0);

    const root = await store.commit({
        target: created.metadata.sessionId,
        expectedVersion: untouched.version,
        cause: "test.store-root",
        operations: [{
            type: "appendEntries",
            entries: [{kind: "test.store.root", parentId: null, payload: {}}],
        }],
    });
    const appended = await store.commit({
        target: created.metadata.sessionId,
        expectedVersion: root.snapshot.version,
        cause: "test.store-active-leaf",
        operations: [{
            type: "appendEntries",
            entries: [{kind: "test.store.child", payload: {}}],
        }],
    });

    expect(appended.entries[0]?.parentId).toBe(root.snapshot.activeLeafId);
    return created.metadata.sessionId;
}

describe("Session Entry parent reference admission", () => {
    test("public write rejects a dangling parent before changing the Session", async () => {
        const harness = createHarness();
        try {
            const created = await harness.createSession({
                profileKey: "entry-parent-admission",
                initial: {},
                hostContext: {},
            });
            const sessionId = created.session.metadata.sessionId;

            await expect(harness.write({
                target: sessionId,
                expectedVersion: created.session.version,
                cause: "test.dangling-parent",
                operations: [{
                    type: "appendEntries",
                    entries: [{
                        kind: "test.entry",
                        parentId: "missing-parent",
                        payload: {},
                    }],
                }],
            })).rejects.toThrow("parent missing-parent 不存在");

            const after = await harness.snapshot(sessionId);
            expect(after.session.version).toBe(created.session.version);
            expect(after.session.entries).toHaveLength(0);
            expect(after.session.activeLeafId).toBeNull();
        } finally {
            await harness.dispose();
        }
    });

    test("an existing parent creates a new selected branch", async () => {
        const harness = createHarness();
        try {
            const created = await harness.createSession({
                profileKey: "entry-parent-admission",
                initial: {},
                hostContext: {},
            });
            const first = await harness.write({
                target: created.session.metadata.sessionId,
                expectedVersion: created.session.version,
                cause: "test.first-entry",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.first", payload: {}}],
                }],
            });
            const firstEntry = first.session.entries[0]!;

            const branched = await harness.write({
                target: created.session.metadata.sessionId,
                expectedVersion: first.session.version,
                cause: "test.explicit-existing-parent",
                operations: [{
                    type: "appendEntries",
                    entries: [{
                        kind: "test.branch",
                        parentId: firstEntry.id,
                        payload: {},
                    }],
                }],
            });

            expect(branched.session.activeLeafId).toBe(branched.session.entries[1]!.id);
            expect(branched.session.entries[1]?.parentId).toBe(firstEntry.id);
        } finally {
            await harness.dispose();
        }
    });

    test("an inactive branch entry can serve as an explicit parent", async () => {
        const harness = createHarness();
        try {
            const created = await harness.createSession({
                profileKey: "entry-parent-admission",
                initial: {},
                hostContext: {},
            });
            const first = await harness.write({
                target: created.session.metadata.sessionId,
                expectedVersion: created.session.version,
                cause: "test.first-entry",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.first", payload: {}}],
                }],
            });
            const firstEntry = first.session.entries[0]!;
            await harness.write({
                target: created.session.metadata.sessionId,
                expectedVersion: first.session.version,
                cause: "test.other-branch",
                operations: [{
                    type: "appendEntries",
                    entries: [{
                        kind: "test.other",
                        parentId: null,
                        payload: {},
                    }],
                }],
            });

            const inactiveParent = await harness.write({
                target: created.session.metadata.sessionId,
                expectedVersion: 2,
                cause: "test.inactive-parent",
                operations: [{
                    type: "appendEntries",
                    entries: [{
                        kind: "test.inactive",
                        parentId: firstEntry.id,
                        payload: {},
                    }],
                }],
            });

            expect(inactiveParent.session.entries[2]?.parentId).toBe(firstEntry.id);
        } finally {
            await harness.dispose();
        }
    });

    test("an explicit null parent starts a root branch", async () => {
        const harness = createHarness();
        try {
            const created = await harness.createSession({
                profileKey: "entry-parent-admission",
                initial: {},
                hostContext: {},
            });
            const first = await harness.write({
                target: created.session.metadata.sessionId,
                expectedVersion: created.session.version,
                cause: "test.first-entry",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.first", payload: {}}],
                }],
            });

            const root = await harness.write({
                target: created.session.metadata.sessionId,
                expectedVersion: first.session.version,
                cause: "test.root-branch",
                operations: [{
                    type: "appendEntries",
                    entries: [{
                        kind: "test.root",
                        parentId: null,
                        payload: {},
                    }],
                }],
            });

            expect(root.session.entries[1]?.parentId).toBeNull();
            expect(root.session.activeLeafId).toBe(root.session.entries[1]!.id);
        } finally {
            await harness.dispose();
        }
    });

    test("an omitted parent follows the current active leaf", async () => {
        const harness = createHarness();
        try {
            const created = await harness.createSession({
                profileKey: "entry-parent-admission",
                initial: {},
                hostContext: {},
            });
            const first = await harness.write({
                target: created.session.metadata.sessionId,
                expectedVersion: created.session.version,
                cause: "test.first-entry",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.first", payload: {}}],
                }],
            });

            const second = await harness.write({
                target: created.session.metadata.sessionId,
                expectedVersion: first.session.version,
                cause: "test.follow-active-leaf",
                operations: [{
                    type: "appendEntries",
                    entries: [{kind: "test.second", payload: {}}],
                }],
            });

            expect(second.session.entries[1]?.parentId).toBe(first.session.activeLeafId);
        } finally {
            await harness.dispose();
        }
    });

    test("a dangling current active leaf is rejected before append admission", () => {
        expect(() => reduceSessionWritePlan(emptySnapshot("missing-active-leaf"), {
            target: 1,
            cause: "test.invalid-active-leaf",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.entry", payload: {}}],
            }],
        }, {
            now: () => 1,
            entryId: () => "new-entry",
        })).toThrow("active leaf missing-active-leaf 不存在");
    });

    test("blank parent and blank generated Entry IDs are rejected", () => {
        expect(() => reduceSessionWritePlan(emptySnapshot(null), {
            target: 1,
            cause: "test.blank-parent",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.entry", parentId: "   ", payload: {}}],
            }],
        }, {
            now: () => 1,
            entryId: () => "new-entry",
        })).toThrow("Entry parent 不能为空");

        expect(() => reduceSessionWritePlan(emptySnapshot(null), {
            target: 1,
            cause: "test.blank-entry-id",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "test.entry", payload: {}}],
            }],
        }, {
            now: () => 1,
            entryId: () => "",
        })).toThrow("Entry ID 不能为空");
    });

    test("an invalid parent in prepareWrites produces no earlier durable append", async () => {
        const profile = defineProfile({
            manifest: {key: "entry-parent-batch", name: "Entry parent batch"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: (context) => ({
                systemPrompt: "test",
                modelConfig: {},
                prepareWrites: [
                    {
                        target: context.sessionId,
                        cause: "test.parent-batch.first",
                        operations: [{
                            type: "appendEntries",
                            entries: [{kind: "test.parent-batch.first", payload: {}}],
                        }],
                    },
                    {
                        target: context.sessionId,
                        cause: "test.parent-batch.invalid",
                        operations: [{
                            type: "appendEntries",
                            entries: [{
                                kind: "test.parent-batch.invalid",
                                parentId: "missing-parent",
                                payload: {},
                            }],
                        }],
                    },
                ],
            }),
        });
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model: new ScriptedModelRuntime([{
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "should not run"}],
                    timestamp: 1,
                },
            }]),
        });

        try {
            const created = await harness.createSession({
                profileKey: profile.manifest.key,
                initial: {},
                hostContext: {},
            });
            const result = await (await harness.invoke({
                sessionId: created.session.metadata.sessionId,
                payload: {},
            })).result();
            const snapshot = await harness.snapshot(created.session.metadata.sessionId);

            expect({
                status: result.status,
                errorName: result.error?.name,
                version: snapshot.session.version,
                entries: snapshot.session.entries.map((entry) => entry.kind),
            }).toEqual({
                status: "failed",
                errorName: SessionInvariantError.name,
                version: 2,
                entries: [],
            });
        } finally {
            await harness.dispose();
        }
    });

    test("Memory Store and JSONL Store share parent admission and recovery behavior", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-agent-harness-parent-"));
        const memory = new MemorySessionStore<number, JsonObject>();
        const jsonl = new JsonlSessionStore<JsonObject>({directory});
        try {
            await verifyStoreParentAdmission(memory);
            const jsonlSessionId = await verifyStoreParentAdmission(jsonl);

            const restored = new JsonlSessionStore<JsonObject>({directory});
            const snapshot = await restored.read(jsonlSessionId);
            expect(snapshot.entries.map((entry) => entry.kind)).toEqual([
                "test.store.root",
                "test.store.child",
            ]);
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("active path rejects cycles and duplicate historical Entry IDs", () => {
        const cycle = emptySnapshot("entry-a");
        const cyclicSnapshot: SessionSnapshot<number, JsonObject> = {
            ...cycle,
            entries: [
                {id: "entry-a", kind: "test.a", parentId: "entry-b", payload: {}, timestamp: 1},
                {id: "entry-b", kind: "test.b", parentId: "entry-a", payload: {}, timestamp: 2},
            ],
        };
        expect(() => activeSessionPath(cyclicSnapshot)).toThrow("Entry parent cycle detected");

        const duplicateSnapshot: SessionSnapshot<number, JsonObject> = {
            ...emptySnapshot(null),
            entries: [
                {id: "entry-a", kind: "test.a", parentId: null, payload: {}, timestamp: 1},
                {id: "entry-a", kind: "test.duplicate", parentId: null, payload: {}, timestamp: 2},
            ],
        };
        expect(() => activeSessionPath(duplicateSnapshot)).toThrow("Entry ID entry-a 重复");
    });

    test("JSONL read fails closed for a historical malformed parent graph", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-agent-harness-parent-invalid-"));
        const sessionsDirectory = join(directory, "sessions");
        await mkdir(sessionsDirectory, {recursive: true});
        await writeFile(join(sessionsDirectory, "1.jsonl"), `${JSON.stringify({
            kind: "snapshot",
            cause: "test.malformed-parent-graph",
            snapshot: {
                ...emptySnapshot("entry-a"),
                entries: [
                    {id: "entry-a", kind: "test.a", parentId: "missing-parent", payload: {}, timestamp: 1},
                ],
            },
            appendedEntryIds: ["entry-a"],
        })}\n`, "utf8");
        const store = new JsonlSessionStore<JsonObject>({directory});
        try {
            await expect(store.read(1)).rejects.toThrow("Entry parent missing-parent 不存在");
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    });

    test("same-batch generated Entry IDs remain unique", () => {
        expect(() => reduceSessionWritePlan(emptySnapshot(null), {
            target: 1,
            cause: "test.duplicate-generated-id",
            operations: [{
                type: "appendEntries",
                entries: [
                    {kind: "test.first", payload: {}},
                    {kind: "test.second", payload: {}},
                ],
            }],
        }, {
            now: () => 1,
            entryId: () => "same-entry-id",
        })).toThrow("Entry ID same-entry-id 已存在");
    });
});
