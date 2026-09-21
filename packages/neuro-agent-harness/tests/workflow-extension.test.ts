import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    activeSessionPath,
    defineProfile,
    defineSchema,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

describe("Workflow extension primitives", () => {
    test("公开 snapshot/create/write/invoke 足以组合 rewind、branch 与 fork", async () => {
        const profile = defineProfile({
            manifest: {key: "workflow", name: "Workflow"},
            initial: objectSchema,
            payload: objectSchema,
            prepare: () => ({systemPrompt: "workflow", modelConfig: {}}),
        });
        const model = new ScriptedModelRuntime([
            {message: {role: "assistant", content: [{type: "text", text: "first branch"}], timestamp: 1}},
            (request) => {
                const transcript = JSON.stringify(request.messages);
                expect(transcript).not.toContain("first branch");
                expect(transcript).toContain("second prompt");
                return {message: {role: "assistant", content: [{type: "text", text: "second branch"}], timestamp: 2}};
            },
            (request) => {
                expect(JSON.stringify(request.messages)).toContain("second branch");
                return {message: {role: "assistant", content: [{type: "text", text: "fork continued"}], timestamp: 3}};
            },
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles: new ProfileRegistry().add(profile),
            model,
        });
        const created = await harness.createSession({profileKey: "workflow", initial: {}, hostContext: {project: "book"}});
        await (await harness.invoke({sessionId: created.session.metadata.sessionId, payload: {instruction: "first prompt"}})).result();
        const firstSnapshot = await harness.snapshot(created.session.metadata.sessionId);
        const firstUserEntry = activeSessionPath(firstSnapshot.session).find((entry) => {
            if (entry.kind !== "agent.message" || entry.payload === null || typeof entry.payload !== "object" || Array.isArray(entry.payload)) return false;
            const message = entry.payload.message;
            return message !== null && typeof message === "object" && !Array.isArray(message) && message.role === "user";
        });
        expect(firstUserEntry).toBeDefined();

        const rewound = await harness.write({
            target: created.session.metadata.sessionId,
            expectedVersion: firstSnapshot.session.version,
            cause: "workflow.rewind",
            operations: [{type: "moveLeaf", leafId: firstUserEntry?.id ?? null}],
        });
        await (await harness.invoke({sessionId: rewound.session.metadata.sessionId, payload: {instruction: "second prompt"}})).result();
        const branched = await harness.snapshot(created.session.metadata.sessionId);
        expect(activeSessionPath(branched.session).some((entry) => JSON.stringify(entry.payload).includes("second branch"))).toBe(true);
        expect(activeSessionPath(branched.session).some((entry) => JSON.stringify(entry.payload).includes("first branch"))).toBe(false);

        const fork = await harness.createSession({
            profileKey: branched.session.metadata.profileKey,
            initial: branched.session.metadata.initial,
            hostContext: branched.session.metadata.hostContext,
            parentSessionId: branched.session.metadata.sessionId,
        });
        const forkEntries = activeSessionPath(branched.session).map((entry) => ({kind: entry.kind, payload: entry.payload}));
        await harness.write({
            target: fork.session.metadata.sessionId,
            expectedVersion: fork.session.version,
            cause: "workflow.fork.copyActivePath",
            operations: [{type: "appendEntries", entries: forkEntries}],
        });
        const forkResult = await (await harness.invoke({sessionId: fork.session.metadata.sessionId, payload: {instruction: "continue fork"}})).result();
        expect(forkResult.output).toBe("fork continued");
        const forkSnapshot = await harness.snapshot(fork.session.metadata.sessionId);
        expect(forkSnapshot.session.metadata.parentSessionId).toBe(branched.session.metadata.sessionId);
    });
});
