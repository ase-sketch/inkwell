import { describe, expect, test } from "bun:test";

import {
    MemoryActivityExecutor,
    MemoryDefinitionRegistry,
    MemoryEventSink,
    MemoryValueStore,
    MemoryWorkflowBackend,
    WorkflowRunner,
} from "../src/index";
import type {
    ActivityCallOptions,
    ActivityExecutionContext,
    Clock,
    JsonValue,
    RandomSource,
    WorkflowDefinition,
} from "../src/index";

describe("generic Workflow activities", () => {
    test("callAction replays from the journal across Runner instances", async () => {
        const backend = new MemoryWorkflowBackend();
        const definitions = new MemoryDefinitionRegistry();
        const activities = new MemoryActivityExecutor();
        const observed: ActivityExecutionContext[] = [];
        let calls = 0;
        activities.registerAction("math.double@1", async (input, context) => {
            calls += 1;
            observed.push(context);
            return {
                value: (input as { value: number }).value * 2,
            };
        });
        let crashOnce = true;
        const definition: WorkflowDefinition = {
            key: "generic-action-replay",
            version: "1",
            manifestHash: "sha256:generic-action-replay-v1",
            run: async (wf) => {
                const result = await wf.callAction<{ value: number }>(
                    "math.double@1",
                    { value: 21 },
                );
                if (crashOnce) {
                    crashOnce = false;
                    throw new Error("simulate host restart");
                }
                return result as JsonValue;
            },
        };
        const firstRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, activities },
        );
        const failed = await firstRunner.start(definition, null);
        expect(failed.status).toBe("failed");
        expect(calls).toBe(1);
        expect(failed.journal[0]!.fingerprint).toMatch(
            /^sha256:[0-9a-f]{64}$/,
        );
        expect(failed.journal[0]!.fingerprint).not.toContain("21");

        const secondRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, activities },
        );
        const recovered = await secondRunner.rerun(failed.runId);

        expect(recovered).toMatchObject({
            status: "completed",
            result: { value: 42 },
            journal: [{
                kind: "action",
                path: "root",
                seq: 0,
            }],
        });
        expect(calls).toBe(1);
        expect(observed).toHaveLength(1);
        expect(observed[0]).toMatchObject({
            runId: failed.runId,
            activity: {
                key: "root#0",
                path: "root",
                seq: 0,
                kind: "action",
            },
        });
        expect(observed[0]!.signal).toBeInstanceOf(AbortSignal);
    });

    test("query is journaled and does not observe newer state during replay", async () => {
        const backend = new MemoryWorkflowBackend();
        const definitions = new MemoryDefinitionRegistry();
        const activities = new MemoryActivityExecutor();
        let sourceValue = 1;
        let queries = 0;
        activities.registerQuery("library.counter@1", () => {
            queries += 1;
            return { value: sourceValue };
        });
        let crashOnce = true;
        const definition: WorkflowDefinition = {
            key: "journaled-query",
            manifestHash: "sha256:journaled-query-v1",
            run: async (wf) => {
                const snapshot = await wf.query<{ value: number }>(
                    "library.counter@1",
                    {},
                );
                if (crashOnce) {
                    crashOnce = false;
                    throw new Error("retry later");
                }
                return snapshot;
            },
        };
        const firstRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, activities },
        );
        const failed = await firstRunner.start(definition, null);
        expect(failed.status).toBe("failed");
        expect(queries).toBe(1);

        sourceValue = 2;
        const secondRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, activities },
        );
        const recovered = await secondRunner.rerun(failed.runId);

        expect(recovered).toMatchObject({
            status: "completed",
            result: { value: 1 },
            journal: [{ kind: "query" }],
        });
        expect(queries).toBe(1);
    });

    test("time, random values, and budget remain stable during replay", async () => {
        const backend = new MemoryWorkflowBackend();
        const definitions = new MemoryDefinitionRegistry();
        let crashOnce = true;
        const definition: WorkflowDefinition = {
            key: "controlled-nondeterminism",
            manifestHash: "sha256:controlled-nondeterminism-v1",
            run: async (wf) => {
                const now = await wf.now();
                const random = await wf.random();
                const result = {
                    now,
                    random,
                    budget: wf.getBudget(),
                    cancelled: wf.isCancelled(),
                };
                if (crashOnce) {
                    crashOnce = false;
                    throw new Error("replay with different ports");
                }
                return result;
            },
        };
        const firstRunner = new WorkflowRunner(
            {},
            {},
            {
                backend,
                definitions,
                clock: new FixedClock("2026-08-11T01:02:03.000Z"),
                random: new FixedRandom(0.25),
            },
        );
        const failed = await firstRunner.start(
            definition,
            null,
            {
                budget: {
                    maxActivities: 10,
                    label: "initial",
                },
            },
        );
        expect(failed.status).toBe("failed");

        const secondRunner = new WorkflowRunner(
            {},
            {},
            {
                backend,
                definitions,
                clock: new FixedClock("2030-01-01T00:00:00.000Z"),
                random: new FixedRandom(0.75),
            },
        );
        const recovered = await secondRunner.rerun(failed.runId);

        expect(recovered).toMatchObject({
            status: "completed",
            result: {
                now: "2026-08-11T01:02:03.000Z",
                random: 0.25,
                budget: {
                    maxActivities: 10,
                    label: "initial",
                },
                cancelled: false,
            },
        });
        expect(
            recovered.journal.map((record) => record.kind),
        ).toEqual(["kernel.now", "kernel.random"]);
    });

    test("large activity output is content-addressed and replayed through ValueStore", async () => {
        const backend = new MemoryWorkflowBackend();
        const definitions = new MemoryDefinitionRegistry();
        const activities = new MemoryActivityExecutor();
        const values = new MemoryValueStore();
        const largeText = "value-store-payload-".repeat(20);
        let calls = 0;
        activities.registerAction("content.large@1", () => {
            calls += 1;
            return { text: largeText };
        });
        let crashOnce = true;
        const definition: WorkflowDefinition = {
            key: "value-reference-replay",
            manifestHash: "sha256:value-reference-replay-v1",
            run: async (wf) => {
                const output = await wf.callAction<{ text: string }>(
                    "content.large@1",
                    {},
                );
                if (crashOnce) {
                    crashOnce = false;
                    throw new Error("recover large output");
                }
                return output;
            },
        };
        const firstRunner = new WorkflowRunner(
            {},
            {},
            {
                backend,
                definitions,
                activities,
                values,
                inlineValueLimitBytes: 32,
            },
        );
        const failed = await firstRunner.start(definition, null);
        expect(failed.status).toBe("failed");
        expect(failed.journal[0]!.result).toMatchObject({
            kind: "ref",
            ref: {
                hash: expect.stringMatching(/^sha256:/),
                mediaType: "application/json",
            },
        });
        expect(JSON.stringify(await backend.loadRun(failed.runId)))
            .not.toContain(largeText);

        const secondRunner = new WorkflowRunner(
            {},
            {},
            {
                backend,
                definitions,
                activities,
                values,
                inlineValueLimitBytes: 32,
            },
        );
        const recovered = await secondRunner.rerun(failed.runId);

        expect(recovered).toMatchObject({
            status: "completed",
            result: { text: largeText },
        });
        expect(calls).toBe(1);
    });

    test("large activity output fails explicitly when ValueStore is absent", async () => {
        const activities = new MemoryActivityExecutor();
        const largeText = "unbounded-payload".repeat(20);
        activities.registerAction("content.unbounded@1", () => ({
            text: largeText,
        }));
        const definition: WorkflowDefinition = {
            key: "value-store-required",
            manifestHash: "sha256:value-store-required-v1",
            run: async (wf) => await wf.callAction(
                "content.unbounded@1",
                {},
            ),
        };
        const runner = new WorkflowRunner(
            {},
            {},
            {
                activities,
                inlineValueLimitBytes: 16,
            },
        );

        const failed = await runner.start(definition, null);

        expect(failed).toMatchObject({
            status: "failed",
            error: expect.stringContaining("no ValueStore"),
            journal: [],
        });
    });

    test("large Run input and terminal result are referenced in Backend state", async () => {
        const backend = new MemoryWorkflowBackend();
        const values = new MemoryValueStore();
        const largeText = "run-level-value-".repeat(30);
        const definition: WorkflowDefinition = {
            key: "run-value-reference",
            manifestHash: "sha256:run-value-reference-v1",
            run: async (_workflow, input) => input,
        };
        const runner = new WorkflowRunner(
            {},
            {},
            {
                backend,
                values,
                inlineValueLimitBytes: 32,
            },
        );

        const completed = await runner.start(
            definition,
            { text: largeText },
        );
        const stored = await backend.loadRun(completed.runId);

        expect(completed.result).toEqual({ text: largeText });
        expect(stored).toMatchObject({
            input: { kind: "ref" },
            result: { kind: "ref" },
        });
        expect(JSON.stringify(stored)).not.toContain(largeText);
    });

    test("checkpoint and emitted events survive waiting without duplicate publication", async () => {
        const backend = new MemoryWorkflowBackend();
        const definitions = new MemoryDefinitionRegistry();
        const events = new MemoryEventSink();
        const definition: WorkflowDefinition = {
            key: "checkpoint-event-wait",
            manifestHash: "sha256:checkpoint-event-wait-v1",
            run: async (wf) => {
                await wf.checkpoint({ cursor: "page-1" });
                await wf.emit({
                    type: "workflow.page.saved",
                    version: "1",
                    payload: { cursor: "page-1" },
                });
                const approved = await wf.ask({
                    kind: "approve",
                    title: "continue?",
                });
                return { approved };
            },
        };
        const firstRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, events },
        );
        const waiting = await firstRunner.start(definition, null);
        expect(waiting).toMatchObject({
            status: "waiting",
            checkpoint: {
                kind: "inline",
                value: { cursor: "page-1" },
            },
        });
        expect(events.list()).toHaveLength(1);

        const secondRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, events },
        );
        const completed = await secondRunner.resume(waiting.runId, {
            [waiting.pendingAsks[0]!.key]: true,
        });

        expect(completed).toMatchObject({
            status: "completed",
            result: { approved: true },
            checkpoint: {
                kind: "inline",
                value: { cursor: "page-1" },
            },
        });
        expect(events.list()).toHaveLength(1);
        expect(events.list()[0]).toMatchObject({
            event: {
                type: "workflow.page.saved",
                version: "1",
                payload: { cursor: "page-1" },
            },
            context: {
                runId: waiting.runId,
                activity: {
                    kind: "event",
                },
            },
        });
    });

    test("all uses a bounded concurrency policy and preserves input order", async () => {
        const activities = new MemoryActivityExecutor();
        let inFlight = 0;
        let peak = 0;
        activities.registerAction("work.delay@1", async (input) => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 2));
            inFlight -= 1;
            return input;
        });
        const definition: WorkflowDefinition = {
            key: "bounded-all",
            manifestHash: "sha256:bounded-all-v1",
            run: async (wf) => await wf.all(
                [0, 1, 2, 3, 4, 5].map(
                    (value) => () => wf.callAction(
                        "work.delay@1",
                        { value },
                    ),
                ),
                { concurrency: 2 },
            ) as JsonValue,
        };
        const runner = new WorkflowRunner(
            {},
            {},
            {
                activities,
                defaultConcurrency: 2,
                maxConcurrency: 3,
            },
        );

        const completed = await runner.start(definition, null);

        expect(completed).toMatchObject({
            status: "completed",
            result: [
                { value: 0 },
                { value: 1 },
                { value: 2 },
                { value: 3 },
                { value: 4 },
                { value: 5 },
            ],
        });
        expect(peak).toBe(2);
    });

    test("parallel failures select the lowest input index, not completion timing", async () => {
        const definition: WorkflowDefinition = {
            key: "deterministic-parallel-error",
            manifestHash: "sha256:deterministic-parallel-error-v1",
            run: async (wf) => await wf.all([
                async () => {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    throw new Error("index-zero");
                },
                async () => {
                    await new Promise((resolve) => setTimeout(resolve, 1));
                    throw new Error("index-one");
                },
            ], { concurrency: 2 }) as JsonValue,
        };
        const runner = new WorkflowRunner({});

        const failed = await runner.start(definition, null);

        expect(failed).toMatchObject({
            status: "failed",
            error: "index-zero",
        });
    });

    test("parallel concurrency above the Runner ceiling is rejected before branches run", async () => {
        const activities = new MemoryActivityExecutor();
        let calls = 0;
        activities.registerAction("work.never@1", () => {
            calls += 1;
            return null;
        });
        const definition: WorkflowDefinition = {
            key: "concurrency-ceiling",
            manifestHash: "sha256:concurrency-ceiling-v1",
            run: async (wf) => await wf.all([
                () => wf.callAction("work.never@1", {}),
            ], { concurrency: 3 }) as JsonValue,
        };
        const runner = new WorkflowRunner(
            {},
            {},
            {
                activities,
                defaultConcurrency: 2,
                maxConcurrency: 2,
            },
        );

        const failed = await runner.start(definition, null);

        expect(failed).toMatchObject({
            status: "failed",
            error: expect.stringContaining("between 1 and 2"),
        });
        expect(calls).toBe(0);
    });

    test("non-JSON activity input is rejected before reaching the executor", async () => {
        const activities = new MemoryActivityExecutor();
        let calls = 0;
        activities.registerAction("json.only@1", () => {
            calls += 1;
            return null;
        });
        const definition: WorkflowDefinition = {
            key: "reject-non-json",
            manifestHash: "sha256:reject-non-json-v1",
            run: async (wf) => await wf.callAction(
                "json.only@1",
                {
                    invalid: undefined,
                } as unknown as JsonValue,
            ),
        };
        const runner = new WorkflowRunner(
            {},
            {},
            { activities },
        );

        const failed = await runner.start(definition, null);

        expect(failed).toMatchObject({
            status: "failed",
            error: expect.stringContaining("JSON"),
        });
        expect(calls).toBe(0);
    });

    test("unknown activity options are rejected before reaching the executor", async () => {
        const activities = new MemoryActivityExecutor();
        let calls = 0;
        activities.registerAction("options.strict@1", () => {
            calls += 1;
            return null;
        });
        const definition: WorkflowDefinition = {
            key: "strict-activity-options",
            manifestHash: "sha256:strict-activity-options-v1",
            run: async (workflow) => await workflow.callAction(
                "options.strict@1",
                {},
                {
                    hidden: "not fingerprinted",
                } as unknown as ActivityCallOptions,
            ),
        };
        const runner = new WorkflowRunner(
            {},
            {},
            { activities },
        );

        const failed = await runner.start(definition, null);

        expect(failed).toMatchObject({
            status: "failed",
            error: expect.stringContaining("Unknown Activity option"),
        });
        expect(calls).toBe(0);
    });
});

class FixedClock implements Clock {
    constructor(private readonly value: string) {}

    now(): Date {
        return new Date(this.value);
    }
}

class FixedRandom implements RandomSource {
    constructor(private readonly value: number) {}

    next(): number {
        return this.value;
    }
}
