import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
    NeuroAgentHarness,
    ProfileRegistry,
    SessionConflictError,
    defineProfile,
    defineSchema,
    defineSessionEntryCodec,
    type JsonObject,
    type SessionStore,
} from "../src/index.js";
import {JsonlSessionStore} from "../src/storage/jsonl.js";
import {MemorySessionStore} from "../src/storage/memory.js";
import {ScriptedModelRuntime} from "../src/testing/index.js";

interface WorkflowResultPayload extends JsonObject {
    readonly sourceSessionId: number;
    readonly sourceInvocationId: string;
    readonly output: string;
}

const resultCodec = defineSessionEntryCodec("workflow.result", defineSchema<WorkflowResultPayload>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)
        || typeof value.sourceSessionId !== "number"
        || typeof value.sourceInvocationId !== "string"
        || typeof value.output !== "string") {
        throw new Error("workflow result payload 无效");
    }
    return value as WorkflowResultPayload;
}));

const objectSchema = defineSchema<JsonObject>((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("必须是 object");
    }
    return value;
});

const profile = defineProfile({
    manifest: {key: "workflow-writeback", name: "Workflow Writeback"},
    initial: objectSchema,
    payload: objectSchema,
    prepare: () => ({systemPrompt: "workflow writeback", modelConfig: {}}),
});

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "neuro-harness-workflow-writeback-"));
    directories.push(directory);
    return directory;
}

function createHarness(store: SessionStore<number, JsonObject>, messages: string[] = ["sidecar result"]): NeuroAgentHarness {
    return new NeuroAgentHarness({
        store,
        profiles: new ProfileRegistry<number>().add(profile),
        model: new ScriptedModelRuntime(messages.map((text, index) => ({
            message: {
                role: "assistant" as const,
                content: [{type: "text" as const, text}],
                timestamp: index + 1,
            },
        }))),
    });
}

async function createTargetAndRunSidecar(harness: NeuroAgentHarness) {
    const target = await harness.createSession({
        profileKey: profile.manifest.key,
        initial: {},
        hostContext: {kind: "target"},
    });
    const targetAnchor = await harness.snapshot(target.session.metadata.sessionId);
    const sidecar = await harness.createSession({
        profileKey: profile.manifest.key,
        initial: {},
        hostContext: {kind: "sidecar"},
        parentSessionId: target.session.metadata.sessionId,
    });
    const sidecarAnchor = await harness.snapshot(sidecar.session.metadata.sessionId);
    const handle = await harness.invokeAt({
        sessionId: sidecar.session.metadata.sessionId,
        payload: {task: "summarize"},
        anchor: {
            version: sidecarAnchor.session.version,
            activeLeafId: sidecarAnchor.session.activeLeafId,
        },
    });
    const result = await handle.result();
    expect(result.status).toBe("completed");
    return {target, targetAnchor, sidecar, handle, result};
}

async function appendWorkflowResult(
    harness: NeuroAgentHarness,
    targetSessionId: number,
    anchor: {readonly version: number; readonly activeLeafId: string | null},
    sourceSessionId: number,
    sourceInvocationId: string,
    output: string,
): Promise<void> {
    await harness.write({
        target: targetSessionId,
        expectedVersion: anchor.version,
        expectedActiveLeafId: anchor.activeLeafId,
        cause: "workflow.result.writeback",
        operations: [{
            type: "appendEntries",
            entries: [resultCodec.draft({sourceSessionId, sourceInvocationId, output})],
        }],
    });
}

describe("Workflow result writeback", () => {
    test("Memory Store：现有 snapshot + createSession + invokeAt + write 足以完成旁路结果回写", async () => {
        const harness = createHarness(new MemorySessionStore());
        const {target, targetAnchor, sidecar, handle, result} = await createTargetAndRunSidecar(harness);

        await appendWorkflowResult(
            harness,
            target.session.metadata.sessionId,
            {
                version: targetAnchor.session.version,
                activeLeafId: targetAnchor.session.activeLeafId,
            },
            sidecar.session.metadata.sessionId,
            handle.invocationId,
            result.output as string,
        );

        const snapshot = await harness.snapshot(target.session.metadata.sessionId);
        const resultEntries = snapshot.session.entries.filter((entry) => entry.kind === resultCodec.kind);
        expect(resultEntries).toHaveLength(1);
        expect(resultCodec.parse(resultEntries[0]!)).toEqual({
            sourceSessionId: sidecar.session.metadata.sessionId,
            sourceInvocationId: handle.invocationId,
            output: "sidecar result",
        });
        await harness.dispose();
    });

    test("JSONL Store：旁路结果回写在新 Harness 实例中可恢复", async () => {
        const directory = await tempDirectory();
        const store = new JsonlSessionStore({directory});
        const harness = createHarness(store);
        const {target, targetAnchor, sidecar, handle, result} = await createTargetAndRunSidecar(harness);

        await appendWorkflowResult(
            harness,
            target.session.metadata.sessionId,
            {
                version: targetAnchor.session.version,
                activeLeafId: targetAnchor.session.activeLeafId,
            },
            sidecar.session.metadata.sessionId,
            handle.invocationId,
            result.output as string,
        );
        await harness.dispose();

        const restored = new JsonlSessionStore({directory});
        const restoredSnapshot = await restored.read(target.session.metadata.sessionId);
        const resultEntries = restoredSnapshot.entries.filter((entry) => entry.kind === resultCodec.kind);
        expect(resultEntries).toHaveLength(1);
        expect(resultCodec.parse(resultEntries[0]!)).toEqual({
            sourceSessionId: sidecar.session.metadata.sessionId,
            sourceInvocationId: handle.invocationId,
            output: "sidecar result",
        });
    });

    test("目标 Session 在回写前变化时，stale anchor 只失败 CAS 且不产生部分结果", async () => {
        const harness = createHarness(new MemorySessionStore());
        const {target, targetAnchor, sidecar, handle, result} = await createTargetAndRunSidecar(harness);
        await harness.write({
            target: target.session.metadata.sessionId,
            expectedVersion: targetAnchor.session.version,
            expectedActiveLeafId: targetAnchor.session.activeLeafId,
            cause: "workflow.target.changed",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "workflow.target.changed", payload: {value: "newer"}}],
            }],
        });

        await expect(appendWorkflowResult(
            harness,
            target.session.metadata.sessionId,
            {
                version: targetAnchor.session.version,
                activeLeafId: targetAnchor.session.activeLeafId,
            },
            sidecar.session.metadata.sessionId,
            handle.invocationId,
            result.output as string,
        )).rejects.toBeInstanceOf(SessionConflictError);

        const snapshot = await harness.snapshot(target.session.metadata.sessionId);
        expect(snapshot.session.entries.filter((entry) => entry.kind === resultCodec.kind)).toHaveLength(0);
        expect(snapshot.session.entries.filter((entry) => entry.kind === "workflow.target.changed")).toHaveLength(1);
        await harness.dispose();
    });

    test("JSONL Store：目标 active leaf 变化时保留 stale anchor 的冲突诊断", async () => {
        const directory = await tempDirectory();
        const harness = createHarness(new JsonlSessionStore({directory}));
        const {target, targetAnchor, sidecar, handle, result} = await createTargetAndRunSidecar(harness);
        await harness.write({
            target: target.session.metadata.sessionId,
            expectedVersion: targetAnchor.session.version,
            expectedActiveLeafId: targetAnchor.session.activeLeafId,
            cause: "workflow.target.changed",
            operations: [{
                type: "appendEntries",
                entries: [{kind: "workflow.target.changed", payload: {value: "newer"}}],
            }],
        });

        let conflict: unknown;
        try {
            await appendWorkflowResult(
                harness,
                target.session.metadata.sessionId,
                {
                    version: targetAnchor.session.version,
                    activeLeafId: targetAnchor.session.activeLeafId,
                },
                sidecar.session.metadata.sessionId,
                handle.invocationId,
                result.output as string,
            );
        } catch (error) {
            conflict = error;
        }
        expect(conflict).toBeInstanceOf(SessionConflictError);
        const sessionConflict = conflict as SessionConflictError;
        expect(sessionConflict.expectedActiveLeafId).toBe(targetAnchor.session.activeLeafId);
        expect(sessionConflict.actualActiveLeafId).not.toBe(targetAnchor.session.activeLeafId);
        const snapshot = await harness.snapshot(target.session.metadata.sessionId);
        expect(snapshot.session.entries.filter((entry) => entry.kind === resultCodec.kind)).toHaveLength(0);
        await harness.dispose();
    });

    test("结果 entry 没有 exactly-once 语义，重复提交由 Workflow 宿主按 source identity 去重", async () => {
        const harness = createHarness(new MemorySessionStore(), ["sidecar result"]);
        const {target, targetAnchor, sidecar, handle, result} = await createTargetAndRunSidecar(harness);
        const payload = {
            sourceSessionId: sidecar.session.metadata.sessionId,
            sourceInvocationId: handle.invocationId,
            output: result.output as string,
        };

        await appendWorkflowResult(
            harness,
            target.session.metadata.sessionId,
            targetAnchor.session,
            payload.sourceSessionId,
            payload.sourceInvocationId,
            payload.output,
        );
        const afterFirst = await harness.snapshot(target.session.metadata.sessionId);
        await appendWorkflowResult(
            harness,
            target.session.metadata.sessionId,
            {
                version: afterFirst.session.version,
                activeLeafId: afterFirst.session.activeLeafId,
            },
            payload.sourceSessionId,
            payload.sourceInvocationId,
            payload.output,
        );

        const snapshot = await harness.snapshot(target.session.metadata.sessionId);
        expect(snapshot.session.entries.filter((entry) => entry.kind === resultCodec.kind)).toHaveLength(2);
        await harness.dispose();
    });
});
