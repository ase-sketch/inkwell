import { createAgentExtension } from "./agent-extension";
import type { Runtime } from "./runtime";
import { SuspendSignal } from "./runtime";
import { emitWorkflowEvent } from "./runtime-events";
import type {
    ChartOp,
    JsonValue,
    Wf,
} from "./types";
import { createWorkflowActivityOperations } from "./workflow-activities";

export function createWorkflowContext(
    runtime: Runtime,
    args: JsonValue,
): Wf {
    const core: Omit<
        Wf,
        "agents" | "sessions" | "workspace" | "caller"
    > = {
        args,
        ...createWorkflowActivityOperations(runtime),
        all: async (thunks, options = {}) => {
            const parent = runtime.path();
            const branchSequence = runtime.peekSequence(parent);
            await runtime.activity(
                "kernel.all",
                { count: thunks.length },
                async () => null,
            );
            return await collectBranches(
                thunks.map((thunk, index) => () => runtime.runBranch(
                    `${parent}/${branchSequence}:${index}`,
                    thunk,
                )),
                resolveConcurrency(
                    options.concurrency,
                    thunks.length,
                    runtime.defaultConcurrency,
                    runtime.maxConcurrency,
                ),
            );
        },
        map: async (items, fn, options = {}) => {
            const parent = runtime.path();
            const branchSequence = runtime.peekSequence(parent);
            await runtime.activity(
                "kernel.map",
                { count: items.length },
                async () => null,
            );
            const thunks = items.map((item, index) => () =>
                runtime.runBranch(
                    `${parent}/${branchSequence}:${index}`,
                    () => fn(item, index),
                )
            );
            return await collectBranches(
                thunks,
                resolveConcurrency(
                    options.concurrency,
                    items.length,
                    runtime.defaultConcurrency,
                    runtime.maxConcurrency,
                ),
            );
        },
        ask: (spec) => runtime.askActivity(spec),
        log: (message) => {
            runtime.run.logs.push(message);
            emitWorkflowEvent(runtime.env, {
                type: "log",
                runId: runtime.run.runId,
                message,
            });
        },
        progress: (state) => {
            runtime.run.progress = {
                ...runtime.run.progress,
                ...state,
            };
            emitWorkflowEvent(runtime.env, {
                type: "progress",
                runId: runtime.run.runId,
                state: runtime.run.progress,
            });
        },
        chart: createChart(runtime),
    };
    return {
        ...core,
        ...createAgentExtension(runtime),
    };
}

function createChart(runtime: Runtime): Wf["chart"] {
    const emit = (op: ChartOp) => emitWorkflowEvent(runtime.env, {
        type: "chart",
        runId: runtime.run.runId,
        op,
    });
    return {
        node: (key, title) => emit({ op: "node", key, title }),
        edge: (from, to, label) => emit({
            op: "edge",
            from,
            to,
            label,
        }),
        enter: (key, options = {}) => emit({
            op: "enter",
            key,
            token: options.token ?? "main",
            sessionId: options.sessionId,
        }),
        leave: (key, options = {}) => emit({
            op: "leave",
            key,
            token: options.token ?? "main",
        }),
        move: (from, to, options = {}) => emit({
            op: "move",
            from,
            to,
            token: options.token ?? "main",
            sessionId: options.sessionId,
            label: options.label,
        }),
    };
}

async function collectBranches<T>(
    thunks: (() => Promise<T>)[],
    concurrency: number,
): Promise<T[]> {
    const results = new Array<T>(thunks.length);
    const errors: { index: number; error: unknown }[] = [];
    let suspended = false;
    let next = 0;
    const worker = async () => {
        while (errors.length === 0) {
            const index = next++;
            const thunk = thunks[index];
            if (!thunk) {
                return;
            }
            try {
                results[index] = await thunk();
            } catch (error) {
                if (error instanceof SuspendSignal) {
                    suspended = true;
                } else {
                    errors.push({ index, error });
                }
            }
        }
    };
    await Promise.all(Array.from(
        {
            length: Math.max(
                1,
                Math.min(concurrency, thunks.length),
            ),
        },
        worker,
    ));
    if (errors.length > 0) {
        errors.sort((left, right) => left.index - right.index);
        throw errors[0]!.error;
    }
    if (suspended) {
        throw new SuspendSignal();
    }
    return results;
}

function resolveConcurrency(
    requested: number | undefined,
    itemCount: number,
    defaultConcurrency: number,
    maxConcurrency: number,
): number {
    const concurrency = requested ?? defaultConcurrency;
    if (
        !Number.isSafeInteger(concurrency)
        || concurrency <= 0
        || concurrency > maxConcurrency
    ) {
        throw new Error(
            `Workflow concurrency must be an integer between 1 and `
            + `${maxConcurrency}; received ${concurrency}.`,
        );
    }
    return Math.max(1, Math.min(concurrency, itemCount || 1));
}
