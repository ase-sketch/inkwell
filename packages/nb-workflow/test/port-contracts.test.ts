import { describe, expect, test } from "bun:test";

import {
    MemoryDefinitionRegistry,
    MemorySignalStore,
    MemoryValueStore,
    MemoryWorkflowBackend,
    SignalConflictError,
    WorkflowBackendCapabilityError,
    WorkflowDefinitionConflictError,
    WorkflowRunner,
    definitionReference,
} from "../src/index";
import type {
    ActivityExecutionContext,
    BackendCapabilities,
    WorkflowContext,
    WorkflowDefinition,
} from "../src/index";

describe("stable Port contracts", () => {
    test("Signal publish is idempotent and conflicting reuse is rejected", async () => {
        const signals = new MemorySignalStore();
        const input = {
            runId: "run_signal",
            reference: "approval",
            value: { approved: true },
            idempotencyKey: "signal:1",
        };

        await signals.publish(input);
        await signals.publish(input);
        expect(signals.list()).toHaveLength(1);
        await expect(signals.publish({
            ...input,
            value: { approved: false },
        })).rejects.toBeInstanceOf(SignalConflictError);

        const context = activityContext("run_signal", "root#0");
        expect(await signals.consume({
            runId: "run_signal",
            reference: "approval",
            context,
        })).toEqual({
            status: "available",
            value: { approved: true },
        });
        expect(await signals.consume({
            runId: "run_signal",
            reference: "approval",
            context,
        })).toEqual({
            status: "available",
            value: { approved: true },
        });
    });

    test("same definition key/version cannot silently change manifest", () => {
        const registry = new MemoryDefinitionRegistry();
        registry.register(definition("sha256:first"));

        expect(() => registry.register(
            definition("sha256:changed"),
        )).toThrow(WorkflowDefinitionConflictError);
    });

    test("definition key and version tuples cannot collide", () => {
        const registry = new MemoryDefinitionRegistry();
        const first: WorkflowDefinition = {
            key: "knowledge@daily",
            version: "1",
            manifestHash: "sha256:shared-test-hash",
            run: async () => "first",
        };
        const second: WorkflowDefinition = {
            key: "knowledge",
            version: "daily@1",
            manifestHash: "sha256:shared-test-hash",
            run: async () => "second",
        };

        registry.register(first);
        registry.register(second);

        expect(registry.resolve(definitionReference(first))).toBe(first);
        expect(registry.resolve(definitionReference(second))).toBe(second);
    });

    test("valueReferences requirement needs both Backend support and ValueStore", async () => {
        const required: WorkflowDefinition = {
            key: "requires-values",
            manifestHash: "sha256:requires-values-v1",
            requires: { valueReferences: true },
            run: async () => null,
        };
        const backend = new MemoryWorkflowBackend();
        const withoutStore = new WorkflowRunner(
            {},
            {},
            { backend },
        );
        expect(() => withoutStore.begin(required, null)).toThrow(
            WorkflowBackendCapabilityError,
        );

        const withStore = new WorkflowRunner(
            {},
            {},
            {
                backend: new MemoryWorkflowBackend(),
                values: new MemoryValueStore(),
            },
        );
        await expect(withStore.start(required, null)).resolves.toMatchObject({
            status: "completed",
        });
    });

    test("durableSignals requirement also needs a configured SignalStore", () => {
        const backend = new MemoryWorkflowBackend();
        Object.defineProperty(backend, "capabilities", {
            value: {
                ...backend.capabilities,
                durability: "durable",
                processRestart: true,
                durableSignals: true,
            } satisfies BackendCapabilities,
        });
        const runner = new WorkflowRunner(
            {},
            {},
            { backend },
        );
        const required: WorkflowDefinition = {
            key: "requires-signal-store",
            manifestHash: "sha256:requires-signal-store-v1",
            requires: { durableSignals: true },
            run: async () => null,
        };

        expect(() => runner.begin(required, null)).toThrow(
            WorkflowBackendCapabilityError,
        );
    });

    test("every capability intersection rejects without its Port", () => {
        const backend = new MemoryWorkflowBackend();
        Object.defineProperty(backend, "capabilities", {
            value: {
                ...backend.capabilities,
                durability: "durable",
                processRestart: true,
                durableSignals: true,
                durableTimers: true,
                childWorkflows: true,
                externalReceipts: true,
                outbox: true,
            } satisfies BackendCapabilities,
        });
        const runner = new WorkflowRunner(
            {},
            {},
            { backend },
        );

        for (const requirement of [
            { durableTimers: true },
            { childWorkflows: true },
            { externalReceipts: true },
            { outbox: true },
        ] as const) {
            expect(() => runner.begin({
                key: "requires-port",
                manifestHash: "sha256:requires-port-v1",
                requires: requirement,
                run: async () => null,
            }, null)).toThrow(WorkflowBackendCapabilityError);
        }
    });

    test("ask specs are validated before entering the pending projection", async () => {
        const runner = new WorkflowRunner({});
        const failed = await runner.start({
            key: "invalid-ask-spec",
            manifestHash: "sha256:invalid-ask-spec-v1",
            run: async (workflow: WorkflowContext) => await workflow.ask({
                kind: "evil-kind",
                title: "question",
            } as never),
        }, null);

        expect(failed.status).toBe("failed");
        expect(failed.error).toContain("ask");
    });

    test("emit rejects non-envelope values with a structured error", async () => {
        const runner = new WorkflowRunner({});
        const failed = await runner.start({
            key: "invalid-emit",
            manifestHash: "sha256:invalid-emit-v1",
            run: async (workflow: WorkflowContext) => {
                await workflow.emit(null as never);
                return null;
            },
        }, null);

        expect(failed.status).toBe("failed");
        expect(failed.error).toContain("Workflow events");
    });
});

function definition(manifestHash: string): WorkflowDefinition {
    return {
        key: "manifest-conflict",
        version: "1",
        manifestHash,
        run: async () => null,
    };
}

function activityContext(
    runId: string,
    key: string,
): ActivityExecutionContext {
    return {
        runId,
        activity: {
            key,
            path: "root",
            seq: 0,
            kind: "signal",
            fingerprint: "sha256:signal",
        },
        idempotencyKey: `${runId}:${key}:signal`,
        signal: new AbortController().signal,
    };
}
