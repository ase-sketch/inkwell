import { describe, expect, test } from "bun:test";

import {
    MemoryChildWorkflowStore,
    MemoryDefinitionRegistry,
    MemorySignalStore,
    MemoryTimerStore,
    MemoryWorkflowBackend,
    WorkflowRunner,
} from "../src/index";
import type {
    ChildWorkflowStartInput,
    ChildWorkflowStartResult,
    Clock,
    WorkflowDefinition,
} from "../src/index";

describe("recoverable Workflow waits", () => {
    test("a signal resumes a waiting Run from a different Runner instance", async () => {
        const backend = new MemoryWorkflowBackend();
        const definitions = new MemoryDefinitionRegistry();
        const signals = new MemorySignalStore();
        const definition: WorkflowDefinition = {
            key: "signal-resume",
            manifestHash: "sha256:signal-resume-v1",
            run: async (wf) => {
                const approval = await wf.waitForSignal<{
                    approved: boolean;
                }>("approval");
                return approval;
            },
        };
        const firstRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, signals },
        );
        const waiting = await firstRunner.start(definition, null);

        expect(waiting).toMatchObject({
            status: "waiting",
            pendingWaits: [{
                kind: "signal",
                reference: "approval",
                path: "root",
                seq: 0,
            }],
        });

        const secondRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, signals },
        );
        const completed = await secondRunner.signal(
            waiting.runId,
            "approval",
            { approved: true },
            { idempotencyKey: "approval:1" },
        );

        expect(completed).toMatchObject({
            status: "completed",
            result: { approved: true },
            pendingWaits: [],
            journal: [{
                kind: "signal",
                result: {
                    kind: "inline",
                    value: { approved: true },
                },
            }],
        });
        expect(signals.list()).toHaveLength(1);
        expect(signals.list()[0]).toMatchObject({
            runId: waiting.runId,
            reference: "approval",
            idempotencyKey: "approval:1",
            consumedBy: expect.stringMatching(
                new RegExp(`^${waiting.runId}:root#0:[0-9a-f]{64}$`),
            ),
        });
    });

    test("timer replay keeps the original due time and completes only after it", async () => {
        const backend = new MemoryWorkflowBackend();
        const definitions = new MemoryDefinitionRegistry();
        const timers = new MemoryTimerStore();
        const clock = new MutableClock("2026-08-11T00:00:00.000Z");
        const definition: WorkflowDefinition = {
            key: "durable-timer",
            manifestHash: "sha256:durable-timer-v1",
            run: async (wf) => {
                await wf.sleep(1_000);
                return "awake";
            },
        };
        const firstRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, timers, clock },
        );
        const waiting = await firstRunner.start(definition, null);
        expect(waiting).toMatchObject({
            status: "waiting",
            pendingWaits: [{
                kind: "timer",
                reference: "2026-08-11T00:00:01.000Z",
            }],
        });

        clock.set("2026-08-11T00:00:00.500Z");
        const earlyRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, timers, clock },
        );
        const early = await earlyRunner.rerun(waiting.runId);
        expect(early).toMatchObject({
            status: "waiting",
            pendingWaits: [{
                reference: "2026-08-11T00:00:01.000Z",
            }],
        });

        clock.set("2026-08-11T00:00:01.000Z");
        const dueRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, timers, clock },
        );
        const completed = await dueRunner.rerun(waiting.runId);
        expect(completed).toMatchObject({
            status: "completed",
            result: "awake",
            pendingWaits: [],
            journal: [{ kind: "timer" }],
        });
        expect(timers.list()).toEqual([expect.objectContaining({
            runId: waiting.runId,
            dueAt: "2026-08-11T00:00:01.000Z",
        })]);
    });

    test("a waiting Child Workflow binds one child Run and replays its result", async () => {
        const backend = new MemoryWorkflowBackend();
        const definitions = new MemoryDefinitionRegistry();
        const children = new MemoryChildWorkflowStore();
        const definition: WorkflowDefinition = {
            key: "parent-research",
            manifestHash: "sha256:parent-research-v1",
            run: async (wf) => {
                const child = await wf.startChildWorkflow<{
                    findings: number;
                }>(
                    "research.deep@1",
                    { topic: "DeepSeek outage" },
                    { key: "outage-research", wait: true },
                );
                return child;
            },
        };
        const firstRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, children },
        );
        const waiting = await firstRunner.start(definition, null);
        const child = children.list()[0]!;
        expect(waiting).toMatchObject({
            status: "waiting",
            pendingWaits: [{
                kind: "child",
                reference: child.runId,
            }],
        });
        expect(children.list()).toHaveLength(1);

        await children.complete(child.runId, { findings: 3 });
        const secondRunner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, children },
        );
        const completed = await secondRunner.rerun(waiting.runId);

        expect(completed).toMatchObject({
            status: "completed",
            result: {
                runId: child.runId,
                status: "completed",
                result: { findings: 3 },
            },
            pendingWaits: [],
            journal: [{ kind: "child" }],
        });
        expect(children.list()).toHaveLength(1);
    });

    test("cancelling a parent propagates to a waiting Child Workflow", async () => {
        const backend = new MemoryWorkflowBackend();
        const definitions = new MemoryDefinitionRegistry();
        const children = new MemoryChildWorkflowStore();
        const definition: WorkflowDefinition = {
            key: "parent-cancel",
            manifestHash: "sha256:parent-cancel-v1",
            run: async (wf) => await wf.startChildWorkflow(
                "child.long@1",
                {},
                { wait: true, cancelPolicy: "propagate" },
            ),
        };
        const first = new WorkflowRunner(
            {},
            {},
            { backend, definitions, children },
        );
        const waiting = await first.start(definition, null);
        const childRunId = children.list()[0]!.runId;
        const second = new WorkflowRunner(
            {},
            {},
            { backend, definitions, children },
        );

        const cancelled = await second.cancel(waiting.runId);

        expect(cancelled.status).toBe("cancelled");
        expect(children.list()).toContainEqual(expect.objectContaining({
            runId: childRunId,
            status: "cancelled",
            error: "parent workflow cancelled",
        }));
    });

    test("cancelling while a Child Workflow start is in flight does not leave an orphan", async () => {
        const backend = new MemoryWorkflowBackend();
        const definitions = new MemoryDefinitionRegistry();
        const children = new GatedChildWorkflowStore();
        const definition: WorkflowDefinition = {
            key: "parent-start-cancel",
            manifestHash: "sha256:parent-start-cancel-v1",
            run: async (workflow) => {
                await workflow.startChildWorkflow(
                    "research.deep@1",
                    { topic: "outage" },
                    { wait: true },
                );
                return null;
            },
        };
        const runner = new WorkflowRunner(
            {},
            {},
            { backend, definitions, children },
        );

        const { runId, done } = runner.begin(definition, null);
        await children.startStarted;
        const cancellation = runner.cancel(runId);
        await Promise.resolve();
        children.releaseStart();

        await expect(cancellation).resolves.toMatchObject({
            cancelRequestedAt: expect.any(String),
        });
        await expect(done).resolves.toMatchObject({
            status: "cancelled",
        });
        expect(children.list()).toHaveLength(1);
        expect(children.list()[0]).toMatchObject({
            status: "cancelled",
            cancelPolicy: "propagate",
        });
    });
});

class GatedChildWorkflowStore extends MemoryChildWorkflowStore {
    private markStarted!: () => void;
    private release!: () => void;
    readonly startStarted = new Promise<void>((resolve) => {
        this.markStarted = resolve;
    });
    private readonly startGate = new Promise<void>((resolve) => {
        this.release = resolve;
    });

    releaseStart(): void {
        this.release();
    }

    override async start(
        input: ChildWorkflowStartInput,
    ): Promise<ChildWorkflowStartResult> {
        this.markStarted();
        await this.startGate;
        return await super.start(input);
    }
}

class MutableClock implements Clock {
    private value: Date;

    constructor(value: string) {
        this.value = new Date(value);
    }

    set(value: string): void {
        this.value = new Date(value);
    }

    now(): Date {
        return new Date(this.value);
    }
}
