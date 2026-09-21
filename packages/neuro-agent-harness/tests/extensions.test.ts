import {describe, expect, test} from "bun:test";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineAgentInvokerCapability,
    defineCapability,
    defineProfileFacet,
    defineSchema,
    activeSessionPath,
    createCapabilityProviderFactory,
    type JsonObject,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface NeuroSessionContextFixture extends JsonObject {
    projectWorkspace: string;
    profileHome: string;
    activeDocument: string;
}

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("必须是 object");
    return value;
});

describe("NeuroBook extension fixture", () => {
    test("通过 Host Context、Capability、Facet、Caller 与 WritePlan 承载产品概念", async () => {
        const skillCatalog = defineCapability<"skillCatalog", {list(): readonly string[]}>("skillCatalog");
        const variables = defineCapability<"variables", {get(name: string): string}>("variables");
        const profileHome = defineCapability<"profileHome", {read(path: string): string}>("profileHome");
        const projectWorkspace = defineCapability<"projectWorkspace", {resolve(path: string): string}>("projectWorkspace");
        const neuroSessionContext = defineCapability<"neuroSessionContext", {profileKey: string; activeEntryCount: number}>("neuroSessionContext");
        const agentInvoker = defineAgentInvokerCapability<number>();
        const provide = createCapabilityProviderFactory<number, NeuroSessionContextFixture>();
        const observed: string[] = [];
        const registry = new ProfileRegistry<number, NeuroSessionContextFixture>();
        const profile = registry.define({
            manifest: {key: "neuro-fixture", name: "NeuroBook Fixture"},
            initial: objectSchema,
            payload: objectSchema,
            requiredCapabilities: [skillCatalog, variables, profileHome, projectWorkspace, neuroSessionContext, agentInvoker],
            facets: [
                defineProfileFacet("profileHome", {entry: "profiles/rewrite.ts"}),
                defineProfileFacet("lowCodeForm", {fields: [{key: "tone", control: "select"}]}),
            ],
            prepare(context) {
                observed.push(context.capabilities.require(skillCatalog).list().join(","));
                observed.push(context.capabilities.require(variables).get("tone"));
                observed.push(context.capabilities.require(profileHome).read("prompt.md"));
                observed.push(context.capabilities.require(projectWorkspace).resolve(context.hostContext.activeDocument));
                const projected = context.capabilities.require(neuroSessionContext);
                observed.push(`session:${projected.profileKey}:${projected.activeEntryCount}`);
                observed.push(context.capabilities.require(agentInvoker) ? "agent-invoker" : "missing");
                observed.push(`caller:${context.caller.kind}`);
                return {
                    systemPrompt: "fixture",
                    modelConfig: {},
                    prepareWrites: [{
                        target: context.sessionId,
                        expectedVersion: context.snapshot.version,
                        cause: "fixture.prepare",
                        operations: [{type: "appendEntries", entries: [{kind: "neuro.context", payload: context.hostContext}]}],
                    }],
                };
            },
        });
        const model = new ScriptedModelRuntime([{
            message: {role: "assistant", content: [{type: "text", text: "ok"}], timestamp: 2},
        }]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore<number, NeuroSessionContextFixture>(),
            profiles: registry,
            model,
            capabilities: [
                provide({capability: skillCatalog, open: () => ({list: () => ["rewrite", "llmlint"]})}),
                provide({capability: variables, open: () => ({get: () => "克制"})}),
                provide({capability: profileHome, open: () => ({read: (path: string) => `profile:${path}`})}),
                provide({capability: projectWorkspace, open: (context) => ({resolve: (path: string) => `${context.hostContext.projectWorkspace}/${path}`})}),
                provide({capability: neuroSessionContext, open: (context) => ({profileKey: context.snapshot.metadata.profileKey, activeEntryCount: activeSessionPath(context.snapshot).length})}),
                provide({capability: agentInvoker, open: () => ({invoke: async (request) => ({sessionId: request.sessionId, invocationId: "nested", status: "completed" as const, output: "nested"})})}),
            ],
        });
        const created = await harness.createSession({
            profileKey: "neuro-fixture",
            initial: {neuroSessionContextVersion: 1},
            hostContext: {projectWorkspace: "novels/book-a", profileHome: "profiles/neuro-fixture", activeDocument: "manuscript/1.md"},
        });
        const handle = await harness.invoke({
            sessionId: created.session.metadata.sessionId,
            payload: {instruction: "rewrite"},
            caller: {kind: "agent", sessionId: 99, profileKey: "orchestrator", toolCallId: "call-parent"},
        });
        expect((await handle.result()).status).toBe("completed");
        const snapshot = await harness.snapshot(created.session.metadata.sessionId);
        expect(snapshot.session.metadata.sessionId).toBeNumber();
        expect(snapshot.session.entries.some((entry) => entry.kind === "neuro.context")).toBe(true);
        expect(observed).toEqual([
            "rewrite,llmlint",
            "克制",
            "profile:prompt.md",
            "novels/book-a/manuscript/1.md",
            "session:neuro-fixture:0",
            "agent-invoker",
            "caller:agent",
        ]);
        expect(registry.facets("neuro-fixture").map((facet) => facet.name)).toEqual(["profileHome", "lowCodeForm"]);
    });
});
