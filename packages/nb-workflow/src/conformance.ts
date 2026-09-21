import type { WorkflowBackend } from "./backend";
import { MemoryActivityExecutor } from "./activities";
import { MemoryDefinitionRegistry } from "./definitions";
import type { ValueStore } from "./ports";
import { WorkflowRunner } from "./runner";
import type {
    JsonValue,
    WorkflowDefinition,
    WorkflowRunState,
} from "./types";

export type WorkflowBackendFactory = () => Promise<WorkflowBackend> | WorkflowBackend;

export type WorkflowBackendConformanceCase = {
    name: string;
    run(factory: WorkflowBackendFactory): Promise<void>;
};

export type ValueStoreFactory = () => Promise<ValueStore> | ValueStore;

export type ValueStoreConformanceCase = {
    name: string;
    run(factory: ValueStoreFactory): Promise<void>;
};

/**
 * 可被宿主 Backend 直接复用的最小一致性套件。
 *
 * 它不依赖 Bun/Vitest；测试框架只需逐个运行 case 并报告异常。
 */
export const workflowBackendConformanceCases:
readonly WorkflowBackendConformanceCase[] = [
    {
        name: "create/load returns isolated snapshots",
        async run(factory) {
            const backend = await factory();
            const initial = sampleRun("run_create");
            await backend.createRun(initial);

            initial.logs.push("mutated outside backend");
            const loaded = requireRun(await backend.loadRun(initial.runId));
            equal(loaded.logs, []);

            loaded.logs.push("mutated loaded clone");
            equal(
                requireRun(await backend.loadRun(initial.runId)).logs,
                [],
            );
        },
    },
    {
        name: "duplicate run creation is rejected",
        async run(factory) {
            const backend = await factory();
            const initial = sampleRun("run_duplicate");
            await backend.createRun(initial);
            await rejects(() => backend.createRun(initial));
        },
    },
    {
        name: "compare-and-swap increments revision",
        async run(factory) {
            const backend = await factory();
            const initial = await backend.createRun(sampleRun("run_cas"));
            const saved = await backend.saveRun({
                ...initial,
                status: "completed",
                result: {
                    kind: "inline",
                    value: { ok: true },
                },
                updatedAt: "2026-08-11T00:00:01.000Z",
            }, 0);

            equal(saved.revision, 1);
            equal(saved.status, "completed");
            equal(saved.result, {
                kind: "inline",
                value: { ok: true },
            });
        },
    },
    {
        name: "stale compare-and-swap is rejected",
        async run(factory) {
            const backend = await factory();
            const initial = await backend.createRun(sampleRun("run_stale"));
            await backend.saveRun({
                ...initial,
                logs: ["first"],
                updatedAt: "2026-08-11T00:00:01.000Z",
            }, 0);

            await rejects(() => backend.saveRun({
                ...initial,
                logs: ["stale"],
                updatedAt: "2026-08-11T00:00:02.000Z",
            }, 0));
            equal(
                requireRun(await backend.loadRun(initial.runId)).logs,
                ["first"],
            );
        },
    },
    {
        name: "immutable identity fields cannot change",
        async run(factory) {
            const backend = await factory();
            const initial = await backend.createRun(sampleRun("run_identity"));
            await rejects(() => backend.saveRun({
                ...initial,
                input: {
                    kind: "inline",
                    value: { changed: true },
                },
                updatedAt: "2026-08-11T00:00:01.000Z",
            }, 0));
        },
    },
    {
        name: "extension start context is immutable",
        async run(factory) {
            const backend = await factory();
            const initial = await backend.createRun(
                sampleRun("run_extension_context"),
            );
            await rejects(() => backend.saveRun({
                ...initial,
                extensionContext: {
                    "conformance.example@1": {
                        changed: true,
                    },
                },
                updatedAt: "2026-08-11T00:00:01.000Z",
            }, 0));
        },
    },
    {
        name: "list returns creation order and isolated snapshots",
        async run(factory) {
            const backend = await factory();
            await backend.createRun(sampleRun(
                "run_second",
                "2026-08-11T00:00:02.000Z",
            ));
            await backend.createRun(sampleRun(
                "run_first",
                "2026-08-11T00:00:01.000Z",
            ));

            const listed = await backend.listRuns();
            equal(listed.map((run) => run.runId), ["run_first", "run_second"]);
            listed[0]!.logs.push("outside");
            equal(
                requireRun(await backend.loadRun("run_first")).logs,
                [],
            );
        },
    },
];

/**
 * Backend 与 Kernel 的组合门禁。Cosmos Prisma Backend 可以直接传入自己的
 * factory；Activity/Definition 使用 Memory 实现，宿主需要为 durable 重放与
 * manifest 解析自带测试。
 */
export const workflowRunnerBackendConformanceCases:
readonly WorkflowBackendConformanceCase[] = [
    {
        name: "runner replays completed activity across instances",
        async run(factory) {
            const backend = await factory();
            const definitions = new MemoryDefinitionRegistry();
            const activities = new MemoryActivityExecutor();
            let calls = 0;
            activities.registerAction("conformance.echo@1", (input) => {
                calls += 1;
                return input;
            });
            let crashOnce = true;
            const definition: WorkflowDefinition = {
                key: "conformance-action-replay",
                manifestHash: "sha256:conformance-action-replay-v1",
                run: async (workflow) => {
                    const output = await workflow.callAction(
                        "conformance.echo@1",
                        { value: 7 },
                    );
                    if (crashOnce) {
                        crashOnce = false;
                        throw new Error("conformance crash");
                    }
                    return output;
                },
            };
            const first = new WorkflowRunner(
                {},
                {},
                { backend, definitions, activities },
            );
            const failed = await first.start(definition, null);
            equal(failed.status, "failed");
            equal(calls, 1);

            const second = new WorkflowRunner(
                {},
                {},
                { backend, definitions, activities },
            );
            const recovered = await second.rerun(failed.runId);
            equal(recovered.status, "completed");
            equal(recovered.result, { value: 7 });
            equal(calls, 1);
        },
    },
    {
        name: "runner resumes persisted wait across instances",
        async run(factory) {
            const backend = await factory();
            const definitions = new MemoryDefinitionRegistry();
            const definition: WorkflowDefinition = {
                key: "conformance-wait-resume",
                manifestHash: "sha256:conformance-wait-resume-v1",
                run: async (workflow) => ({
                    answer: await workflow.ask({
                        kind: "text",
                        title: "answer",
                    }),
                }),
            };
            const first = new WorkflowRunner(
                {},
                {},
                { backend, definitions },
            );
            const waiting = await first.start(definition, null);
            equal(waiting.status, "waiting");
            equal(waiting.pendingAsks.length, 1);

            const second = new WorkflowRunner(
                {},
                {},
                { backend, definitions },
            );
            const completed = await second.resume(waiting.runId, {
                [waiting.pendingAsks[0]!.key]: "persisted",
            });
            equal(completed.status, "completed");
            equal(completed.result, { answer: "persisted" });
        },
    },
];

export const valueStoreConformanceCases:
readonly ValueStoreConformanceCase[] = [
    {
        name: "content addressing deduplicates equal JSON",
        async run(factory) {
            const store = await factory();
            const first = await store.put({
                nested: { b: 2, a: 1 },
            });
            const second = await store.put({
                nested: { a: 1, b: 2 },
            });
            equal(first, second);
        },
    },
    {
        name: "get returns isolated values",
        async run(factory) {
            const store = await factory();
            const reference = await store.put({
                items: [1, 2],
            });
            const first = await store.get(reference) as {
                items: JsonValue[];
            };
            first.items.push(3);
            equal(await store.get(reference), { items: [1, 2] });
        },
    },
    {
        name: "tampered reference is rejected",
        async run(factory) {
            const store = await factory();
            const reference = await store.put({ value: "safe" });
            await rejects(() => store.get({
                ...reference,
                hash: "sha256:tampered",
            }));
        },
    },
];

function sampleRun(
    runId: string,
    createdAt = "2026-08-11T00:00:00.000Z",
): WorkflowRunState {
    return {
        runId,
        definition: {
            key: "conformance",
            version: "1",
            manifestHash: "sha256:conformance",
        },
        input: {
            kind: "inline",
            value: {
                case: runId,
            },
        },
        extensionContext: {},
        status: "running",
        cancelRequestedAt: null,
        budget: null,
        checkpoint: null,
        pendingAsks: [],
        pendingWaits: [],
        logs: [],
        progress: null,
        journal: [],
        revision: 0,
        createdAt,
        updatedAt: createdAt,
    };
}

function requireRun(run: WorkflowRunState | null): WorkflowRunState {
    if (!run) {
        throw new Error("Expected workflow run to exist.");
    }
    return run;
}

function equal(actual: unknown, expected: unknown): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            `Conformance assertion failed: ${JSON.stringify(actual)} `
            + `!== ${JSON.stringify(expected)}`,
        );
    }
}

async function rejects(operation: () => Promise<unknown>): Promise<void> {
    try {
        await operation();
    } catch {
        return;
    }
    throw new Error("Expected operation to reject.");
}
