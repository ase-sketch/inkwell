import { assertVersionedReference } from "./activities";
import { validateWorkflowEvent } from "./events";
import { assertJsonValue } from "./fingerprint";
import type { Runtime } from "./runtime";
import type {
    ActivityCallOptions,
    ChildWorkflowCallResult,
    ChildWorkflowOptions,
    JsonValue,
    WorkflowContext,
} from "./types";

type WorkflowActivityOperations = Pick<
    WorkflowContext,
    | "callAction"
    | "query"
    | "now"
    | "random"
    | "isCancelled"
    | "getBudget"
    | "checkpoint"
    | "emit"
    | "waitForSignal"
    | "sleep"
    | "startChildWorkflow"
>;

export function createWorkflowActivityOperations(
    runtime: Runtime,
): WorkflowActivityOperations {
    return {
        callAction: createActionCaller(runtime),
        query: createQueryCaller(runtime),
        ...createKernelOperations(runtime),
        emit: createEventEmitter(runtime),
        ...createWaitOperations(runtime),
    };
}

function createActionCaller(
    runtime: Runtime,
): WorkflowContext["callAction"] {
    return async <
        TOutput extends JsonValue = JsonValue,
        TInput extends JsonValue = JsonValue,
    >(
        actionReference: string,
        input: TInput,
        options: ActivityCallOptions = {},
    ): Promise<TOutput> => {
        assertVersionedReference(actionReference);
        const normalized = normalizeActivityOptions(options);
        return await runtime.activity(
            "action",
            {
                reference: actionReference,
                input,
                options: activityOptionsFingerprint(normalized),
            },
            async (context) => await runtime.activities.callAction({
                reference: actionReference,
                input,
                options: normalized,
                context,
            }),
        ) as TOutput;
    };
}

function createQueryCaller(
    runtime: Runtime,
): WorkflowContext["query"] {
    return async <
        TOutput extends JsonValue = JsonValue,
        TInput extends JsonValue = JsonValue,
    >(
        queryReference: string,
        input: TInput,
        options: ActivityCallOptions = {},
    ): Promise<TOutput> => {
        assertVersionedReference(queryReference);
        const normalized = normalizeActivityOptions(options);
        return await runtime.activity(
            "query",
            {
                reference: queryReference,
                input,
                options: activityOptionsFingerprint(normalized),
            },
            async (context) => await runtime.activities.query({
                reference: queryReference,
                input,
                options: normalized,
                context,
            }),
        ) as TOutput;
    };
}

function createKernelOperations(
    runtime: Runtime,
): Pick<
    WorkflowContext,
    | "now"
    | "random"
    | "isCancelled"
    | "getBudget"
    | "checkpoint"
> {
    return {
        now: async () => await runtime.activity(
            "kernel.now",
            null,
            async () => runtime.clock.now().toISOString(),
        ),
        random: async () => await runtime.activity(
            "kernel.random",
            null,
            async () => {
                const value = runtime.random.next();
                if (
                    !Number.isFinite(value)
                    || value < 0
                    || value >= 1
                ) {
                    throw new Error(
                        "RandomSource.next() must return a number in [0, 1).",
                    );
                }
                return value;
            },
        ),
        isCancelled: () => (
            runtime.run.abortRequested === true
            || runtime.signal.aborted
        ),
        getBudget: () => (
            runtime.run.budget === null
                ? null
                : structuredClone(runtime.run.budget)
        ),
        checkpoint: async (value, options = {}) => {
            await runtime.activity(
                "checkpoint",
                {
                    key: options.key ?? null,
                    value,
                },
                async () => value,
                (stored) => {
                    runtime.run.checkpoint = stored;
                },
            );
        },
    };
}

function createEventEmitter(
    runtime: Runtime,
): WorkflowContext["emit"] {
    return async (event, options = {}) => {
        const validated = validateWorkflowEvent(event);
        const normalized = normalizeActivityOptions(options);
        await runtime.activity(
            "event",
            {
                event: validated,
                options: activityOptionsFingerprint(normalized),
            },
            async (context) => {
                await runtime.events.emit({
                    event: validated,
                    context,
                });
                return null;
            },
        );
    };
}

function createWaitOperations(
    runtime: Runtime,
): Pick<
    WorkflowContext,
    "waitForSignal" | "sleep" | "startChildWorkflow"
> {
    return {
        waitForSignal: async <
            TOutput extends JsonValue = JsonValue,
        >(reference: string): Promise<TOutput> => (
            await runtime.waitForSignalActivity(reference)
        ) as TOutput,
        sleep: async (durationMs) => {
            await runtime.waitForTimerActivity(durationMs);
        },
        startChildWorkflow: async <
            TOutput extends JsonValue = JsonValue,
        >(
            workflowReference: string,
            input: JsonValue,
            options: ChildWorkflowOptions = {},
        ): Promise<ChildWorkflowCallResult<TOutput>> => (
            await runtime.startChildWorkflowActivity(
                workflowReference,
                input,
                options,
            )
        ) as ChildWorkflowCallResult<TOutput>,
    };
}

function normalizeActivityOptions(
    options: ActivityCallOptions,
): ActivityCallOptions {
    if (
        options === null
        || typeof options !== "object"
        || (
            Object.getPrototypeOf(options) !== Object.prototype
            && Object.getPrototypeOf(options) !== null
        )
    ) {
        throw new Error("Activity options must be a plain object.");
    }
    if (Object.getOwnPropertySymbols(options).length > 0) {
        throw new Error("Activity options cannot contain symbol keys.");
    }
    const allowed = new Set(["key", "timeoutMs", "metadata"]);
    for (const property of Object.getOwnPropertyNames(options)) {
        const descriptor = Object.getOwnPropertyDescriptor(
            options,
            property,
        );
        if (
            !descriptor
            || !descriptor.enumerable
            || !("value" in descriptor)
        ) {
            throw new Error(
                `Activity option ${property} must be an enumerable `
                + "data property.",
            );
        }
        if (!allowed.has(property)) {
            throw new Error(`Unknown Activity option: ${property}.`);
        }
    }
    if (
        options.key !== undefined
        && (
            typeof options.key !== "string"
            || !options.key.trim()
            || options.key.trim() !== options.key
        )
    ) {
        throw new Error(
            "Activity option key must be a non-empty trimmed string.",
        );
    }
    if (
        options.timeoutMs !== undefined
        && (
            !Number.isSafeInteger(options.timeoutMs)
            || options.timeoutMs <= 0
        )
    ) {
        throw new Error("Activity timeoutMs must be a positive integer.");
    }
    if (options.metadata !== undefined) {
        assertJsonValue(options.metadata);
    }
    return {
        ...(options.key === undefined ? {} : { key: options.key }),
        ...(options.timeoutMs === undefined
            ? {}
            : { timeoutMs: options.timeoutMs }),
        ...(options.metadata === undefined
            ? {}
            : { metadata: structuredClone(options.metadata) }),
    };
}

function activityOptionsFingerprint(
    options: ActivityCallOptions,
): JsonValue {
    return {
        key: options.key ?? null,
        timeoutMs: options.timeoutMs ?? null,
        metadata: options.metadata ?? null,
    };
}
