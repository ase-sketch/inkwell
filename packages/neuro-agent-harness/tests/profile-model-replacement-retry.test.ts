import {describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    defineProfile,
    defineSchema,
    type JsonObject,
    type JsonValue,
    type ModelTurnResult,
} from "../src/index.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

const PROFILE_KEY = "replacement-retry";

interface ReplacementModelConfig extends JsonObject {
    readonly provider: "fake";
    readonly model: string;
    readonly configurationVersion: "A" | "B";
}

interface PreparedObservation {
    readonly profile: "A" | "B";
    readonly payload: JsonObject;
}

type ReplacementProfiles = ProfileRegistry<number, JsonObject, ReplacementModelConfig>;
type ReplacementHarness = NeuroAgentHarness<number, JsonObject, ReplacementModelConfig>;

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("payload 必须是 object");
    }
    return value;
});

function assistant(text: string, timestamp: number): ModelTurnResult {
    return {
        message: {
            role: "assistant",
            content: [{type: "text", text}],
            timestamp,
        },
    };
}

function replacementProfile(
    profile: "A" | "B",
    prepared: PreparedObservation[],
) {
    return defineProfile<
        JsonObject,
        JsonObject,
        JsonValue,
        number,
        JsonObject,
        ReplacementModelConfig
    >({
        manifest: {
            key: PROFILE_KEY,
            name: "Replacement " + profile,
            version: profile === "A" ? 1 : 2,
        },
        initial: objectSchema,
        payload: objectSchema,
        prepare(context) {
            prepared.push({profile, payload: context.payload});
            return {
                systemPrompt: "system-" + profile,
                modelConfig: {
                    provider: "fake",
                    model: "model-" + profile,
                    configurationVersion: profile,
                },
            };
        },
    });
}

function projectDurableInvocations(
    snapshot: Awaited<ReturnType<ReplacementHarness["snapshot"]>>,
    invocationIds: readonly string[],
) {
    return invocationIds.map((invocationId) => {
        const invocation = snapshot.session.invocations.find((item) => item.id === invocationId);
        if (!invocation) throw new Error("Invocation " + invocationId + " missing");
        return {
            id: invocation.id,
            profileKey: invocation.profileKey,
            profileVersion: invocation.profileVersion,
            input: invocation.input,
            ...(invocation.retryOf !== undefined ? {retryOf: invocation.retryOf} : {}),
        };
    });
}

describe("Profile/Model replacement 与 public retry", () => {
    test("Memory consumer contract：retry 绑定 replacement 时的 Profile/Model 语义", async () => {
        const prepared: PreparedObservation[] = [];
        const profiles = new ProfileRegistry<number, JsonObject, ReplacementModelConfig>();
        profiles.add(replacementProfile("A", prepared));
        const model = new ScriptedModelRuntime<ReplacementModelConfig>([
            assistant("result-A", 1),
            assistant("result-B", 2),
        ]);
        const harness = new NeuroAgentHarness({
            store: new MemorySessionStore(),
            profiles,
            model,
        });

        try {
            const created = await harness.createSession({profileKey: PROFILE_KEY, initial: {}, hostContext: {}});
            const sessionId = created.session.metadata.sessionId;
            const first = await harness.invoke({sessionId, payload: {instruction: "run once"}});
            expect((await first.result()).status).toBe("completed");

            profiles.replace(replacementProfile("B", prepared));
            const retried = await harness.retry(sessionId, first.invocationId);
            expect((await retried.result()).status).toBe("completed");

            const snapshot = await harness.snapshot(sessionId);
            expect({
                modelRequests: model.requests.map((request) => ({
                    profileKey: request.profileKey,
                    systemPrompt: request.systemPrompt,
                    modelConfig: request.modelConfig,
                })),
                prepared,
                invocations: projectDurableInvocations(snapshot, [first.invocationId, retried.invocationId]),
                retryOutput: (await retried.result()).output,
                recordsExposeModelConfig: snapshot.session.invocations.some((invocation) => "modelConfig" in invocation),
            }).toEqual({
                modelRequests: [
                    {
                        profileKey: PROFILE_KEY,
                        systemPrompt: "system-A",
                        modelConfig: {provider: "fake", model: "model-A", configurationVersion: "A"},
                    },
                    {
                        profileKey: PROFILE_KEY,
                        systemPrompt: "system-B",
                        modelConfig: {provider: "fake", model: "model-B", configurationVersion: "B"},
                    },
                ],
                prepared: [
                    {profile: "A", payload: {instruction: "run once"}},
                    {profile: "B", payload: {instruction: "run once"}},
                ],
                invocations: [
                    {
                        id: first.invocationId,
                        profileKey: PROFILE_KEY,
                        profileVersion: 1,
                        input: {instruction: "run once"},
                    },
                    {
                        id: retried.invocationId,
                        profileKey: PROFILE_KEY,
                        profileVersion: 2,
                        input: {instruction: "run once"},
                        retryOf: first.invocationId,
                    },
                ],
                retryOutput: "result-B",
                recordsExposeModelConfig: false,
            });
        } finally {
            await harness.dispose();
        }
    });

    test("JSONL restart contract：retry 绑定 replacement 时的 Profile/Model 语义", async () => {
        const directory = await mkdtemp(join(tmpdir(), "neuro-harness-replacement-retry-"));
        const prepared: PreparedObservation[] = [];
        const profiles: ReplacementProfiles = new ProfileRegistry();
        profiles.add(replacementProfile("A", prepared));
        let firstHarness: ReplacementHarness | undefined;
        let restartedHarness: ReplacementHarness | undefined;

        try {
            const firstModel = new ScriptedModelRuntime<ReplacementModelConfig>([assistant("result-A", 1)]);
            firstHarness = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles,
                model: firstModel,
            });
            const created = await firstHarness.createSession({profileKey: PROFILE_KEY, initial: {}, hostContext: {}});
            const sessionId = created.session.metadata.sessionId;
            const first = await firstHarness.invoke({sessionId, payload: {instruction: "run once"}});
            expect((await first.result()).status).toBe("completed");
            await firstHarness.dispose();
            firstHarness = undefined;

            profiles.replace(replacementProfile("B", prepared));
            const restartedModel = new ScriptedModelRuntime<ReplacementModelConfig>([assistant("result-B", 2)]);
            restartedHarness = new NeuroAgentHarness({
                store: new JsonlSessionStore<JsonObject>({directory}),
                profiles,
                model: restartedModel,
            });
            const retried = await restartedHarness.retry(sessionId, first.invocationId);
            expect((await retried.result()).status).toBe("completed");

            const snapshot = await restartedHarness.snapshot(sessionId);
            expect({
                modelRequests: restartedModel.requests.map((request) => ({
                    profileKey: request.profileKey,
                    systemPrompt: request.systemPrompt,
                    modelConfig: request.modelConfig,
                })),
                prepared,
                invocations: projectDurableInvocations(snapshot, [first.invocationId, retried.invocationId]),
                retryOutput: (await retried.result()).output,
                recordsExposeModelConfig: snapshot.session.invocations.some((invocation) => "modelConfig" in invocation),
            }).toEqual({
                modelRequests: [{
                    profileKey: PROFILE_KEY,
                    systemPrompt: "system-B",
                    modelConfig: {provider: "fake", model: "model-B", configurationVersion: "B"},
                }],
                prepared: [
                    {profile: "A", payload: {instruction: "run once"}},
                    {profile: "B", payload: {instruction: "run once"}},
                ],
                invocations: [
                    {
                        id: first.invocationId,
                        profileKey: PROFILE_KEY,
                        profileVersion: 1,
                        input: {instruction: "run once"},
                    },
                    {
                        id: retried.invocationId,
                        profileKey: PROFILE_KEY,
                        profileVersion: 2,
                        input: {instruction: "run once"},
                        retryOf: first.invocationId,
                    },
                ],
                retryOutput: "result-B",
                recordsExposeModelConfig: false,
            });
        } finally {
            await firstHarness?.dispose();
            await restartedHarness?.dispose();
            await rm(directory, {recursive: true, force: true});
        }
    });
});
